// The public website's news feeds: read an RSS or Atom feed on the server,
// turn it into plain articles, and keep a short-lived copy in memory.
//
// Why on the server and not in the visitor's browser: most feeds send no CORS
// headers, a server copy means one read per feed every few minutes rather
// than one per visitor, and what reaches the page is plain text and checked
// links — never the feed's own HTML.
//
// The addresses are typed in by the Super Admin, so the reader is careful
// about where it connects: http(s) on the standard ports only, never a
// private, loopback or link-local address (checked on the address actually
// connected to, so a name that resolves somewhere internal is refused too),
// at most three redirects, ten seconds and 2 MB.
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import { eq, sql } from "drizzle-orm";
import { websiteFeedBlocksTable, websiteFeedsTable, type Db } from "@workspace/db";
import { logger } from "./logger";

export interface FeedItem {
  title: string;
  link: string;
  /** ISO timestamp, or null when the feed gave no usable date. */
  date: string | null;
  summary: string;
  /** https only, or null. */
  image: string | null;
}

export interface ParsedFeed {
  title: string;
  items: FeedItem[];
}

/** Reads a feed address and returns its XML. Swapped for a fake in tests. */
export type FeedFetcher = (url: string) => Promise<string>;

export class FeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedError";
  }
}

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const MAX_ITEMS_PER_FEED = 50;
const SUMMARY_CHARS = 220;

// ── address checks ─────────────────────────────────────────────────────────

const blocked = new net.BlockList();
for (const [net4, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net4, prefix, "ipv4");
}
for (const [net6, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
] as const) {
  blocked.addSubnet(net6, prefix, "ipv6");
}

/** True when connecting to `address` would reach the public internet. */
export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family === 6) {
    const lower = address.toLowerCase();
    // IPv4-mapped and NAT64 addresses are judged by the IPv4 address inside.
    const mapped = /^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPublicAddress(mapped[1]!);
    return !blocked.check(lower, "ipv6");
  }
  return false;
}

/**
 * The address as the Super Admin may save it, or a sentence saying why not.
 * Only the shape is checked here; where it resolves is checked on connect.
 */
export function checkFeedUrl(raw: string): { url: string } | { problem: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { problem: "Enter the feed's full address, starting with https://." };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { problem: "Feed addresses must start with https:// or http://." };
  if (u.username || u.password) return { problem: "Leave the user name and password out of the feed address." };
  if (u.port && u.port !== "80" && u.port !== "443") return { problem: "Feeds are read on the standard web ports only." };
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && !isPublicAddress(host)) return { problem: "That address is on a private network." };
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { problem: "That address is on a private network." };
  }
  u.hash = "";
  return { url: u.toString() };
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** dns.lookup that refuses to hand back an address that is not public. */
function guardedLookup(hostname: string, options: { all?: boolean } | number, callback: LookupCallback): void {
  const wantAll = typeof options === "object" && options !== null && options.all === true;
  dnsLookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, wantAll ? [] : "");
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((a) => !isPublicAddress(a.address))) {
      const refused: NodeJS.ErrnoException = new FeedError("That address is on a private network.");
      refused.code = "EFEEDPRIVATE";
      return callback(refused, wantAll ? [] : "");
    }
    if (wantAll) return callback(null, list);
    return callback(null, list[0]!.address, list[0]!.family);
  });
}

function charsetOf(contentType: string | undefined, head: string): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1];
  const fromXml = /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head)?.[1];
  return (fromXml ?? fromHeader ?? "utf-8").toLowerCase();
}

function readOnce(url: string): Promise<{ status: number; location?: string; body?: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && !isPublicAddress(host)) return reject(new FeedError("That address is on a private network."));
    const client = u.protocol === "https:" ? https : http;
    const req = client.request(
      u,
      {
        method: "GET",
        lookup: guardedLookup as unknown as net.LookupFunction,
        headers: {
          accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5",
          "accept-encoding": "gzip, deflate, br",
          "user-agent": "DLS-Website-Feeds/1.0",
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, location: res.headers.location });
        }
        if (status !== 200) {
          res.resume();
          return resolve({ status });
        }
        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream =
          encoding === "gzip" ? res.pipe(zlib.createGunzip())
          : encoding === "deflate" ? res.pipe(zlib.createInflate())
          : encoding === "br" ? res.pipe(zlib.createBrotliDecompress())
          : res;
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy(new FeedError("The feed is larger than 2 MB."));
            return;
          }
          chunks.push(chunk);
        });
        stream.on("error", (e) => reject(e));
        stream.on("end", () => {
          const buf = Buffer.concat(chunks);
          let text: string;
          try {
            text = new TextDecoder(charsetOf(res.headers["content-type"], buf.subarray(0, 200).toString("latin1"))).decode(buf);
          } catch {
            text = buf.toString("utf8");
          }
          resolve({ status, body: text });
        });
      }
    );
    req.on("timeout", () => req.destroy(new FeedError("The feed did not answer within 10 seconds.")));
    req.on("error", reject);
    req.end();
  });
}

/** The real fetcher: guarded, size- and time-limited, follows a few redirects. */
export const fetchFeedXml: FeedFetcher = async (url) => {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let r: Awaited<ReturnType<typeof readOnce>>;
    try {
      r = await readOnce(current);
    } catch (e) {
      if (e instanceof FeedError) throw e;
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code === "EFEEDPRIVATE") throw new FeedError("That address is on a private network.");
      if (code === "ENOTFOUND" || code === "EAI_AGAIN") throw new FeedError("No website answers at that address.");
      throw new FeedError("The feed could not be reached.");
    }
    if (r.location) {
      const next = checkFeedUrl(new URL(r.location, current).toString());
      if ("problem" in next) throw new FeedError(`The feed redirects somewhere it cannot be read from: ${next.problem}`);
      current = next.url;
      continue;
    }
    if (r.status !== 200 || r.body === undefined) throw new FeedError(`The feed's website answered ${r.status}.`);
    return r.body;
  }
  throw new FeedError("The feed redirects too many times.");
};

// ── parsing ────────────────────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©", reg: "®", trade: "™", bull: "•", middot: "·",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
  });
}

// Every scan below walks the document with indexOf rather than a regular
// expression with a lazy `[\s\S]*?`: a feed is somebody else's content, and
// those expressions go quadratic on a 2 MB file full of unclosed tags.

/** Lower-cases ASCII letters only, so every index stays aligned with the original. */
function asciiLower(s: string): string {
  return s.replace(/[A-Z]+/g, (m) => m.toLowerCase());
}

const BLOCK_TAG = /^<\/?(?:br|p|div|li|ul|ol|h[1-6]|tr|td|th|blockquote|section|article|figure|figcaption)\b/i;

/** Text with the markup removed, entities decoded and whitespace collapsed. */
export function plainText(html: string): string {
  const lower = asciiLower(html);
  let out = "";
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    const skip = lower.startsWith("<script", lt) ? "</script" : lower.startsWith("<style", lt) ? "</style" : null;
    const closeAt = skip ? lower.indexOf(skip, lt) : lt;
    if (closeAt === -1) break;
    const gt = html.indexOf(">", closeAt);
    if (gt === -1) break; // an unclosed tag: nothing after it is text
    if (skip || BLOCK_TAG.test(html.slice(lt, Math.min(gt + 1, lt + 16)))) out += " ";
    i = gt + 1;
  }
  return decodeEntities(out).replace(/\s+/g, " ").trim();
}

function shorten(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:–—-]+$/, "") + "…";
}

/** An absolute http(s) address, or null. */
function absoluteUrl(raw: string | null | undefined, base: string, httpsOnly = false): string | null {
  if (!raw) return null;
  try {
    const u = new URL(decodeEntities(raw.trim()), base);
    if (u.protocol === "https:" || (!httpsOnly && u.protocol === "http:")) return u.toString();
  } catch {
    /* not an address */
  }
  return null;
}

/**
 * The feed with comments dropped and CDATA sections lifted out, so the
 * structural search never trips over markup inside an article body. `text()`
 * puts them back.
 */
class Skeleton {
  private readonly cdata: string[] = [];
  readonly xml: string;
  readonly lower: string;

  constructor(xml: string) {
    let out = "";
    let i = 0;
    let comment = xml.indexOf("<!--");
    let cdata = xml.indexOf("<![CDATA[");
    for (;;) {
      if (comment !== -1 && comment < i) comment = xml.indexOf("<!--", i);
      if (cdata !== -1 && cdata < i) cdata = xml.indexOf("<![CDATA[", i);
      const next = comment === -1 ? cdata : cdata === -1 ? comment : Math.min(comment, cdata);
      if (next === -1) {
        out += xml.slice(i);
        break;
      }
      out += xml.slice(i, next);
      if (next === comment) {
        const end = xml.indexOf("-->", next + 4);
        if (end === -1) break;
        i = end + 3;
      } else {
        const end = xml.indexOf("]]>", next + 9);
        this.cdata.push(xml.slice(next + 9, end === -1 ? xml.length : end));
        out += `\u0000${this.cdata.length - 1}\u0000`;
        if (end === -1) break;
        i = end + 3;
      }
    }
    this.xml = out;
    this.lower = asciiLower(out);
  }

  /** The element's content as HTML: CDATA verbatim, everything else entity-decoded. */
  text(raw: string): string {
    return raw
      .split(/\u0000(\d+)\u0000/)
      .map((part, i) => (i % 2 === 1 ? this.cdata[Number(part)] ?? "" : decodeEntities(part)))
      .join("");
  }
}

interface Tag {
  /** Where the tag's "<" is. */
  at: number;
  attrs: string;
  selfClosing: boolean;
  /** Just past the tag's ">". */
  after: number;
}

const NAME_END = new Set([">", "/", " ", "\t", "\n", "\r"]);

/** The next `<name …>` at or after `from`. `lower` is `src` through asciiLower; `name` is lower-case. */
function nextTag(src: string, lower: string, name: string, from: number): Tag | null {
  const needle = `<${name}`;
  for (let i = lower.indexOf(needle, from); i !== -1; i = lower.indexOf(needle, i + needle.length)) {
    if (!NAME_END.has(lower.charAt(i + needle.length))) continue;
    const gt = src.indexOf(">", i + needle.length);
    if (gt === -1) return null;
    const raw = src.slice(i + needle.length, gt);
    const selfClosing = raw.endsWith("/");
    return { at: i, attrs: selfClosing ? raw.slice(0, -1) : raw, selfClosing, after: gt + 1 };
  }
  return null;
}

/** The next `<name …>content</name>` at or after `from`; self-closing tags are passed over. */
function nextElement(src: string, lower: string, name: string, from: number): { attrs: string; content: string; after: number } | null {
  for (let t = nextTag(src, lower, name, from); t; t = nextTag(src, lower, name, t.after)) {
    if (t.selfClosing) continue;
    const close = lower.indexOf(`</${name}`, t.after);
    if (close === -1) return null;
    const gt = src.indexOf(">", close);
    if (gt === -1) return null;
    return { attrs: t.attrs, content: src.slice(t.after, close), after: gt + 1 };
  }
  return null;
}

/** Every `<name …>` in `src`, as its attribute string. */
function allTags(src: string, lower: string, name: string): string[] {
  const out: string[] = [];
  for (let t = nextTag(src, lower, name, 0); t; t = nextTag(src, lower, name, t.after)) out.push(t.attrs);
  return out;
}

const escRe = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${escRe(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(attrs);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

/** One article's markup, with helpers that search only inside it. */
class Block {
  readonly lower: string;
  constructor(readonly src: string) {
    this.lower = asciiLower(src);
  }
  inner(names: readonly string[]): string | null {
    for (const name of names) {
      const el = nextElement(this.src, this.lower, name, 0);
      if (el) return el.content;
    }
    return null;
  }
  element(name: string) {
    return nextElement(this.src, this.lower, name, 0);
  }
  tags(name: string): string[] {
    return allTags(this.src, this.lower, name);
  }
}

function firstImageIn(html: string): string | null {
  const lower = asciiLower(html);
  for (const a of allTags(html, lower, "img")) {
    const src = attr(a, "src");
    if (src) return src;
  }
  return null;
}

function itemImage(block: Block, bodyHtml: string, base: string): string | null {
  const candidates: (string | null)[] = [];
  for (const a of block.tags("media:content")) {
    const medium = attr(a, "medium");
    const type = attr(a, "type");
    if ((!medium || medium === "image") && (!type || type.startsWith("image/"))) candidates.push(attr(a, "url"));
  }
  for (const a of block.tags("media:thumbnail")) candidates.push(attr(a, "url"));
  for (const a of block.tags("enclosure")) if ((attr(a, "type") ?? "").startsWith("image/")) candidates.push(attr(a, "url"));
  for (const a of block.tags("itunes:image")) candidates.push(attr(a, "href"));
  candidates.push(firstImageIn(bodyHtml));
  for (const c of candidates) {
    const url = absoluteUrl(c, base, true);
    if (!url || /dummyImage/i.test(url)) continue;
    // DLS Media lists gallery thumbnails; the full-size image sits beside each.
    if (new URL(url).hostname.endsWith("durablelifeskills.com")) return url.replace(/-thumb(\.\w+)$/, "$1");
    return url;
  }
  return null;
}

function itemLink(sk: Skeleton, block: Block, base: string): string | null {
  // Atom: <link rel="alternate" href="…"/>, or a <link href> with no rel.
  for (const a of block.tags("link")) {
    const href = attr(a, "href");
    const rel = attr(a, "rel");
    if (href && (!rel || rel === "alternate")) return absoluteUrl(href, base);
  }
  // RSS: <link>…</link>, then a permalink guid.
  const rss = block.inner(["link"]);
  if (rss && rss.trim()) return absoluteUrl(sk.text(rss), base);
  const guid = block.element("guid");
  if (guid && attr(guid.attrs, "isPermaLink") !== "false") return absoluteUrl(sk.text(guid.content), base);
  return null;
}

function itemDate(sk: Skeleton, block: Block): string | null {
  const raw = block.inner(["pubdate", "published", "updated", "dc:date"]);
  if (!raw) return null;
  const t = new Date(sk.text(raw).trim());
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

/** An RSS 2.0, RSS 1.0 or Atom document as plain articles, in the feed's order. */
export function parseFeed(xml: string, feedUrl: string): ParsedFeed {
  const sk = new Skeleton(xml);
  const root = ["rss", "feed", "rdf:rdf"].some((name) => nextTag(sk.xml, sk.lower, name, 0));
  if (!root) throw new FeedError("That address is a web page, not an RSS or Atom feed.");

  const first = nextTag(sk.xml, sk.lower, "item", 0) ?? nextTag(sk.xml, sk.lower, "entry", 0);
  const kind = first && sk.lower.startsWith("<item", first.at) ? "item" : "entry";
  const firstAt = first?.at ?? -1;
  const blocks: Block[] = [];
  for (let from = 0; blocks.length < MAX_ITEMS_PER_FEED; ) {
    const el = nextElement(sk.xml, sk.lower, kind, from);
    if (!el) break;
    blocks.push(new Block(el.content));
    from = el.after;
  }

  // The feed's own title sits before the first article.
  const head = new Block(firstAt === -1 ? sk.xml : sk.xml.slice(0, firstAt));
  const feedTitle = plainText(sk.text(head.inner(["title"]) ?? ""));

  const items: FeedItem[] = [];
  for (const block of blocks) {
    const title = plainText(sk.text(block.inner(["title"]) ?? ""));
    const link = itemLink(sk, block, feedUrl);
    if (!title || !link) continue;
    const descHtml = sk.text(block.inner(["description", "summary"]) ?? "");
    const bodyHtml = sk.text(block.inner(["content:encoded", "content"]) ?? "");
    items.push({
      title: shorten(title, 200),
      link,
      date: itemDate(sk, block),
      summary: shorten(plainText(descHtml) || plainText(bodyHtml), SUMMARY_CHARS),
      image: itemImage(block, descHtml + bodyHtml, feedUrl),
    });
  }
  return { title: shorten(feedTitle, 120), items };
}

// ── the cache and the blocks built from it ─────────────────────────────────

type FeedRow = typeof websiteFeedsTable.$inferSelect;
type BlockRow = typeof websiteFeedBlocksTable.$inferSelect;

export interface PublicFeedItem extends FeedItem {
  source: string;
}

export interface PublicFeedBlock {
  slug: string;
  title: string;
  intro: string | null;
  layout: "grid" | "list";
  showImages: boolean;
  showSummaries: boolean;
  items: PublicFeedItem[];
}

interface CacheEntry {
  url: string;
  items: FeedItem[];
  /** When to read the feed again. */
  freshUntil: number;
  inflight?: Promise<FeedItem[]>;
}

export interface WebsiteFeedsOptions {
  fetcher?: FeedFetcher;
  /** How long a good read is kept. */
  ttlMs?: number;
  /** How long to wait before trying a feed that just failed. */
  retryMs?: number;
  now?: () => number;
}

export class WebsiteFeeds {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly fetcher: FeedFetcher;
  private readonly ttlMs: number;
  private readonly retryMs: number;
  private readonly now: () => number;

  constructor(
    private readonly db: Db,
    opts: WebsiteFeedsOptions = {}
  ) {
    this.fetcher = opts.fetcher ?? fetchFeedXml;
    this.ttlMs = opts.ttlMs ?? 15 * 60_000;
    this.retryMs = opts.retryMs ?? 2 * 60_000;
    this.now = opts.now ?? Date.now;
  }

  /** Read an address once, without caching or recording anything: the console's "Test" button. */
  async preview(url: string): Promise<ParsedFeed> {
    return parseFeed(await this.fetcher(url), url);
  }

  forget(feedId: string): void {
    this.cache.delete(feedId);
  }

  /**
   * The feed's articles: from memory while fresh, read again once stale. A
   * failed read keeps serving the last good copy and is not retried for a
   * couple of minutes. The outcome of every read is written to the feed's row
   * so the console can show it.
   */
  async items(feed: FeedRow, opts: { force?: boolean } = {}): Promise<FeedItem[]> {
    let entry = this.cache.get(feed.id);
    if (entry && entry.url !== feed.url) {
      this.cache.delete(feed.id);
      entry = undefined;
    }
    if (entry?.inflight) return entry.inflight;
    if (entry && !opts.force && entry.freshUntil > this.now()) return entry.items;

    const stale = entry?.items ?? [];
    const next: CacheEntry = entry ?? { url: feed.url, items: [], freshUntil: 0 };
    this.cache.set(feed.id, next);
    const read = (async () => {
      try {
        const parsed = parseFeed(await this.fetcher(feed.url), feed.url);
        next.items = parsed.items;
        next.freshUntil = this.now() + this.ttlMs;
        await this.record(feed.id, null, parsed.items.length);
        return parsed.items;
      } catch (e) {
        const message = e instanceof FeedError ? e.message : "The feed could not be read.";
        if (!(e instanceof FeedError)) logger.warn({ err: e, feedId: feed.id }, "Website feed read failed");
        next.items = stale;
        next.freshUntil = this.now() + this.retryMs;
        await this.record(feed.id, message, null);
        return stale;
      } finally {
        next.inflight = undefined;
      }
    })();
    next.inflight = read;
    return read;
  }

  private async record(feedId: string, error: string | null, count: number | null): Promise<void> {
    try {
      await this.db
        .update(websiteFeedsTable)
        .set({
          lastFetchedAt: new Date(this.now()),
          lastError: error,
          ...(count === null ? {} : { lastItemCount: count }),
        })
        .where(eq(websiteFeedsTable.id, feedId));
    } catch (e) {
      logger.warn({ err: e, feedId }, "Could not record a website feed read");
    }
  }

  /** One block with its articles: every enabled feed's, merged, newest first, one copy of each link. */
  async build(block: BlockRow, feeds: ReadonlyMap<string, FeedRow>): Promise<PublicFeedBlock> {
    const sources = block.feedIds.map((id) => feeds.get(id)).filter((f): f is FeedRow => !!f && f.enabled);
    const lists = await Promise.all(sources.map(async (f) => (await this.items(f)).map((it) => ({ ...it, source: f.name }))));
    const seen = new Set<string>();
    const merged = lists
      .flat()
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .filter((it) => (seen.has(it.link) ? false : (seen.add(it.link), true)))
      .slice(0, block.maxItems);
    return {
      slug: block.slug,
      title: block.title,
      intro: block.intro,
      layout: block.layout,
      showImages: block.showImages,
      showSummaries: block.showSummaries,
      items: merged.map((it) => ({
        ...it,
        image: block.showImages ? it.image : null,
        summary: block.showSummaries ? it.summary : "",
      })),
    };
  }
}

// ── first boot ─────────────────────────────────────────────────────────────

/** The feed the website has always shown, and the two places it shows it. */
export const DEFAULT_WEBSITE_FEED = { name: "DLS Media", url: "https://durablelifeskills.com/dls-media/feed/rss" } as const;

/**
 * Put the website's starting feed and blocks in place — once. Nothing is added
 * when any feed or block exists, or when the audit log shows the Super Admin
 * has ever changed the website's feeds: removing everything is a decision a
 * restart must not undo.
 */
export async function seedWebsiteFeeds(db: Db): Promise<boolean> {
  const result = await db.execute(sql`
    select
      (select count(*) from website_feeds)::int as feeds,
      (select count(*) from website_feed_blocks)::int as blocks,
      (select count(*) from audit_log where action like 'website.%')::int as changes
  `);
  const row = result.rows[0] as { feeds: number; blocks: number; changes: number } | undefined;
  if (!row || row.feeds > 0 || row.blocks > 0 || row.changes > 0) return false;
  return db.transaction(async (tx) => {
    const [feed] = await tx.insert(websiteFeedsTable).values(DEFAULT_WEBSITE_FEED).onConflictDoNothing().returning();
    if (!feed) return false;
    await tx
      .insert(websiteFeedBlocksTable)
      .values([
        {
          slug: "news-insights",
          title: "News & Insights",
          intro: "The latest articles, guidance and community news, streamed in from the feeds we follow.",
          feedIds: [feed.id],
          maxItems: 12,
          layout: "grid",
          pages: ["news.html"],
          sortOrder: 0,
        },
        {
          slug: "home-latest",
          title: "Latest from DLS Media",
          intro: null,
          feedIds: [feed.id],
          maxItems: 3,
          layout: "grid",
          pages: ["index.html"],
          sortOrder: 0,
        },
      ])
      .onConflictDoNothing();
    return true;
  });
}
