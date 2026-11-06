// artifacts/api-server/src/__tests__/website-feeds.test.ts — the public
// website's news feeds.
//
// The first half needs nothing: the parser turns RSS and Atom into plain
// articles (no markup, checked links, https images only) and the address
// checks refuse anything that would reach a private network. The second half
// runs over HTTP against a real PostgreSQL (TEST_DATABASE_URL), with a fake
// fetcher so nothing leaves the machine: the first boot puts the DLS Media
// feed and its two blocks in place, the website gets the blocks placed on the
// page it asks about, only the Super Admin may change them, every change is
// audited, and a restart never brings back what the Super Admin removed.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { bootstrapPlatform } from "../lib/bootstrap";
import { loadConfig } from "../lib/config";
import { Mailer, MemoryTransport } from "../lib/mail";
import { DEFAULT_WEBSITE_FEED, FeedError, checkFeedUrl, isPublicAddress, parseFeed, plainText, type FeedFetcher } from "../lib/website-feeds";
import { pageOf } from "../routes/website";
import { createIsolatedDb, refuseUnsafeTestUrl, type IsolatedDb } from "./helpers/isolated-db";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>DLS Media</title>
  <link>https://durablelifeskills.com/dls-media</link>
  <item>
    <title><![CDATA[Medicaid &amp; You: <b>What changes</b>]]></title>
    <link>https://durablelifeskills.com/dls-media/medicaid-and-you</link>
    <pubDate>Tue, 13 Oct 2026 15:00:00 GMT</pubDate>
    <description>&lt;p&gt;States are rolling out &lt;em&gt;eligibility&lt;/em&gt; changes.&lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;</description>
    <media:content url="https://durablelifeskills.com/img/medicaid-thumb.jpg" medium="image"/>
  </item>
  <item>
    <title>Older article</title>
    <link>/dls-media/older</link>
    <pubDate>Mon, 10 Aug 2026 12:00:00 GMT</pubDate>
    <content:encoded><![CDATA[<p>Body with <a href="x"><link>not a link</link></a> <img src="http://insecure.example/a.jpg"></p>]]></content:encoded>
  </item>
  <item>
    <title>Script link</title>
    <link>javascript:alert(1)</link>
  </item>
</channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Partner news</title>
  <entry>
    <title type="html">Partner &amp;amp; community update</title>
    <link rel="self" href="https://partner.example/self"/>
    <link rel="alternate" href="https://partner.example/posts/1"/>
    <updated>2026-11-01T09:00:00Z</updated>
    <summary>Short summary.</summary>
    <content type="html">&lt;img src="https://partner.example/pic.png"&gt;</content>
  </entry>
</feed>`;

describe("feed parsing", () => {
  it("reads RSS into plain articles with checked links", () => {
    const parsed = parseFeed(RSS, "https://durablelifeskills.com/dls-media/feed/rss");
    expect(parsed.title).toBe("DLS Media");
    expect(parsed.items).toHaveLength(2); // the javascript: link is dropped
    const [first, second] = parsed.items;
    expect(first).toMatchObject({
      title: "Medicaid & You: What changes",
      link: "https://durablelifeskills.com/dls-media/medicaid-and-you",
      date: "2026-10-13T15:00:00.000Z",
      summary: "States are rolling out eligibility changes.",
      // DLS Media gallery thumbnails are swapped for the full-size image.
      image: "https://durablelifeskills.com/img/medicaid.jpg",
    });
    expect(second!.link).toBe("https://durablelifeskills.com/dls-media/older");
    expect(second!.summary).toBe("Body with not a link");
    expect(second!.image).toBeNull(); // http images would be mixed content
  });

  it("reads Atom, preferring the alternate link", () => {
    const parsed = parseFeed(ATOM, "https://partner.example/feed.atom");
    expect(parsed.title).toBe("Partner news");
    expect(parsed.items[0]).toMatchObject({
      title: "Partner & community update",
      link: "https://partner.example/posts/1",
      date: "2026-11-01T09:00:00.000Z",
      summary: "Short summary.",
      image: "https://partner.example/pic.png",
    });
  });

  it("refuses a web page that is not a feed", () => {
    expect(() => parseFeed("<!doctype html><html><body>Hi</body></html>", "https://x.example/")).toThrow(FeedError);
  });

  it("stays fast on a hostile feed full of unclosed tags", () => {
    const junk = "<rss>" + "<item><title><![CDATA[<script".repeat(60_000) + "<!--".repeat(60_000);
    const started = Date.now();
    expect(parseFeed(junk, "https://x.example/").items).toEqual([]);
    expect(plainText("<b".repeat(200_000))).toBe("");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("strips markup and decodes entities", () => {
    expect(plainText("<p>A&nbsp;&amp;&#160;B&#x2019;s <script>x()</script>day</p>")).toBe("A & B’s day");
  });
});

describe("feed addresses", () => {
  it("refuses private and odd addresses", () => {
    for (const bad of [
      "ftp://example.com/feed",
      "https://localhost/feed",
      "http://127.0.0.1/feed",
      "http://10.1.2.3/feed",
      "http://169.254.169.254/latest",
      "http://[::1]/feed",
      "https://example.com:8443/feed",
      "https://user:pw@example.com/feed",
      "not a url",
    ]) {
      expect(checkFeedUrl(bad), bad).toHaveProperty("problem");
    }
    expect(checkFeedUrl("https://durablelifeskills.com/dls-media/feed/rss#x")).toEqual({
      url: "https://durablelifeskills.com/dls-media/feed/rss",
    });
  });

  it("judges resolved addresses", () => {
    expect(isPublicAddress("93.184.216.34")).toBe(true);
    expect(isPublicAddress("192.168.1.1")).toBe(false);
    expect(isPublicAddress("::ffff:10.0.0.1")).toBe(false);
    expect(isPublicAddress("fd00::1")).toBe(false);
    expect(isPublicAddress("2606:4700::1111")).toBe(true);
  });

  it("maps the website's paths to its pages", () => {
    expect(pageOf("/")).toBe("index.html");
    expect(pageOf("/news")).toBe("news.html");
    expect(pageOf("news.html")).toBe("news.html");
    expect(pageOf("/login")).toBeNull();
    expect(pageOf(undefined)).toBeNull();
  });
});

const TEST_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_URL)("website feeds over HTTP", () => {
  let handle: IsolatedDb;
  let base = "";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let superCookie: string;
  let adminCookie: string;
  const config = loadConfig({
    NODE_ENV: "test",
    SUPER_ADMIN_PASSWORD: "Setup-Owner-2026",
    APP_BASE_URL: "https://portal.example.test",
    CRON_SECRET: "cron-secret-for-tests",
  });

  const served: Record<string, string> = {
    [DEFAULT_WEBSITE_FEED.url]: RSS,
    "https://partner.example/feed.atom": ATOM,
  };
  const reads: string[] = [];
  const fetcher: FeedFetcher = async (url) => {
    reads.push(url);
    const body = served[url];
    if (!body) throw new FeedError("The feed's website answered 404.");
    return body;
  };

  async function api<T = any>(method: string, path: string, body?: unknown, cookie?: string | null) {
    const res = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const setCookie = res.headers.get("set-cookie");
    return { status: res.status, body: (text ? JSON.parse(text) : null) as T, cookie: setCookie ? setCookie.split(";")[0]! : null };
  }

  beforeAll(async () => {
    refuseUnsafeTestUrl(TEST_URL!);
    handle = await createIsolatedDb(TEST_URL!, "dls_feeds");
    const boot = await bootstrapPlatform(handle.db, config);
    expect(boot.websiteFeedsSeeded).toBe(true);
    const app = createApp({ db: handle.db, config, quiet: true, mailer: new Mailer(handle.db, config, new MemoryTransport()), feedFetcher: fetcher });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

    const login = await api("POST", "/api/auth/login", { email: config.superAdminEmail, password: "Setup-Owner-2026" });
    const rotated = await api("POST", "/api/auth/change-password", { currentPassword: "Setup-Owner-2026", newPassword: "Owner-Feeds-2026!" }, login.cookie);
    expect(rotated.status).toBe(200);
    superCookie = rotated.cookie!;

    const orgs = await api("GET", "/api/platform/organizations", undefined, superCookie);
    const created = await api(
      "POST",
      "/api/platform/users",
      { orgId: orgs.body.organizations[0].id, email: "admin@example.test", fullName: "An Admin", role: "Admin" },
      superCookie
    );
    const first = await api("POST", "/api/auth/login", { email: "admin@example.test", password: created.body.temporaryPassword });
    const changed = await api("POST", "/api/auth/change-password", { currentPassword: created.body.temporaryPassword, newPassword: "Admin-2026-ok!" }, first.cookie);
    adminCookie = changed.cookie ?? first.cookie!;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await handle.destroy();
  });

  it("serves the blocks placed on a page, with their articles", async () => {
    const news = await api("GET", "/api/public/website/feeds?page=/news");
    expect(news.status).toBe(200);
    expect(news.body.page).toBe("news.html");
    expect(news.body.blocks).toHaveLength(1);
    expect(news.body.blocks[0]).toMatchObject({ slug: "news-insights", title: "News & Insights", layout: "grid" });
    expect(news.body.blocks[0].items[0]).toMatchObject({ source: "DLS Media", title: "Medicaid & You: What changes" });

    const home = await api("GET", "/api/public/website/feeds?page=/");
    expect(home.body.blocks.map((b: any) => b.slug)).toEqual(["home-latest"]);

    const about = await api("GET", "/api/public/website/feeds?page=about.html");
    expect(about.body.blocks).toEqual([]);
    const unknown = await api("GET", "/api/public/website/feeds?page=/admin");
    expect(unknown.body).toEqual({ page: null, blocks: [] });
  });

  it("reads each feed once and serves the copy afterwards", async () => {
    const before = reads.length;
    await api("GET", "/api/public/website/feeds?page=news.html");
    await api("GET", "/api/public/website/feeds?page=index.html");
    expect(reads.length).toBe(before);
  });

  it("keeps the controls to the Super Admin", async () => {
    expect((await api("GET", "/api/platform/website")).status).toBe(401);
    expect((await api("GET", "/api/platform/website", undefined, adminCookie)).status).toBe(403);
    expect((await api("POST", "/api/platform/website/feeds", { name: "X", url: "https://partner.example/feed.atom" }, adminCookie)).status).toBe(403);
    const state = await api("GET", "/api/platform/website", undefined, superCookie);
    expect(state.status).toBe(200);
    expect(state.body.feeds).toHaveLength(1);
    expect(state.body.feeds[0]).toMatchObject({ name: "DLS Media", lastError: null, lastItemCount: 2 });
    expect(state.body.blocks.map((b: any) => b.slug).sort()).toEqual(["home-latest", "news-insights"]);
  });

  it("tests, adds and places a second feed on any page", async () => {
    const bad = await api("POST", "/api/platform/website/feeds/preview", { url: "http://10.0.0.5/feed" }, superCookie);
    expect(bad.status).toBe(400);
    const missing = await api("POST", "/api/platform/website/feeds/preview", { url: "https://partner.example/missing" }, superCookie);
    expect(missing.status).toBe(400);
    expect(missing.body.error.message).toMatch(/404/);
    const preview = await api("POST", "/api/platform/website/feeds/preview", { url: "https://partner.example/feed.atom" }, superCookie);
    expect(preview.status).toBe(200);
    expect(preview.body.title).toBe("Partner news");

    const added = await api("POST", "/api/platform/website/feeds", { name: "Partner", url: "https://partner.example/feed.atom" }, superCookie);
    expect(added.status).toBe(201);
    expect(added.body.feed).toMatchObject({ lastError: null, lastItemCount: 1 });
    const dup = await api("POST", "/api/platform/website/feeds", { name: "Again", url: "https://partner.example/feed.atom" }, superCookie);
    expect(dup.status).toBe(409);

    const block = await api(
      "POST",
      "/api/platform/website/blocks",
      { slug: "services-reading", title: "Further reading", feedIds: [added.body.feed.id], maxItems: 2, layout: "list", pages: ["services.html"] },
      superCookie
    );
    expect(block.status).toBe(201);
    const badPage = await api("POST", "/api/platform/website/blocks", { slug: "nowhere", title: "X", pages: ["secret.html"] }, superCookie);
    expect(badPage.status).toBe(400);

    const services = await api("GET", "/api/public/website/feeds?page=services.html");
    expect(services.body.blocks[0]).toMatchObject({ slug: "services-reading", layout: "list" });
    expect(services.body.blocks[0].items[0]).toMatchObject({ source: "Partner", link: "https://partner.example/posts/1" });

    // Merge the partner feed into the news page: newest first across both feeds.
    const state = await api("GET", "/api/platform/website", undefined, superCookie);
    const newsBlock = state.body.blocks.find((b: any) => b.slug === "news-insights");
    const patched = await api(
      "PATCH",
      `/api/platform/website/blocks/${newsBlock.id}`,
      { feedIds: [...newsBlock.feedIds, added.body.feed.id], showImages: false },
      superCookie
    );
    expect(patched.status).toBe(200);
    const news = await api("GET", "/api/public/website/feeds?page=news.html");
    expect(news.body.blocks[0].items.map((i: any) => i.source)).toEqual(["Partner", "DLS Media", "DLS Media"]);
    expect(news.body.blocks[0].items.every((i: any) => i.image === null)).toBe(true);
  });

  it("takes a removed feed out of every block and audits each change", async () => {
    const state = await api("GET", "/api/platform/website", undefined, superCookie);
    const partner = state.body.feeds.find((f: any) => f.name === "Partner");
    const removed = await api("DELETE", `/api/platform/website/feeds/${partner.id}`, undefined, superCookie);
    expect(removed.status).toBe(200);
    const after = await api("GET", "/api/platform/website", undefined, superCookie);
    for (const b of after.body.blocks) expect(b.feedIds).not.toContain(partner.id);
    const services = await api("GET", "/api/public/website/feeds?page=services.html");
    expect(services.body.blocks[0].items).toEqual([]);

    const audit = await api("GET", "/api/platform/audit?category=website", undefined, superCookie);
    expect(audit.status).toBe(200);
    const actions = (audit.body.entries as any[]).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["website.feed_added", "website.block_added", "website.block_updated", "website.feed_removed"]));
  });

  it("switching a block off takes it off the website, and a restart does not bring back what was removed", async () => {
    const state = await api("GET", "/api/platform/website", undefined, superCookie);
    const home = state.body.blocks.find((b: any) => b.slug === "home-latest");
    await api("PATCH", `/api/platform/website/blocks/${home.id}`, { enabled: false }, superCookie);
    expect((await api("GET", "/api/public/website/feeds?page=index.html")).body.blocks).toEqual([]);

    for (const b of state.body.blocks) await api("DELETE", `/api/platform/website/blocks/${b.id}`, undefined, superCookie);
    for (const f of state.body.feeds) await api("DELETE", `/api/platform/website/feeds/${f.id}`, undefined, superCookie);
    const again = await bootstrapPlatform(handle.db, config);
    expect(again.websiteFeedsSeeded).toBe(false);
    const empty = await api("GET", "/api/platform/website", undefined, superCookie);
    expect(empty.body.feeds).toEqual([]);
    expect(empty.body.blocks).toEqual([]);
  });
});
