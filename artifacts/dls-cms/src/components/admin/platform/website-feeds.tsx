// components/admin/platform/website-feeds.tsx — the public website's news.
//
// Two parts. Feeds: the RSS or Atom addresses the website reads, each tested
// before it is added and showing how its last read went. News blocks: a
// heading, the feeds it merges, how many articles and how they are laid out,
// and the pages it appears on. A page shows a block where its HTML has
// <div data-feed-block="name">, and otherwise as its own section near the end.
"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Plus, RefreshCw } from "lucide-react";
import {
  websiteApi,
  type WebsiteFeedBlockInput,
  type WebsiteFeedBlockRow,
  type WebsiteFeedItem,
  type WebsiteFeedRow,
} from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { fmtDate, fmtDateTime, relativeTime } from "@/components/admin/platform/format";

const SELECT = "h-10 w-full rounded-btn border border-border bg-card px-3 text-sm";

type Page = { page: string; label: string };

/** The page's address on the website: the portal serves the site at "/". */
const pageHref = (page: string) => (page === "index.html" ? "/" : `/${page}`);

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function WebsiteFeedsPanel() {
  const [feeds, setFeeds] = useState<WebsiteFeedRow[] | null>(null);
  const [blocks, setBlocks] = useState<WebsiteFeedBlockRow[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const s = await websiteApi.state();
      setFeeds(s.feeds);
      setBlocks(s.blocks);
      setPages(s.pages);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  if (error && !feeds) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!feeds) return <p className="text-sm text-muted-foreground">Loading feeds…</p>;

  return (
    <div className="space-y-8">
      <FeedsSection feeds={feeds} onChanged={load} />
      <BlocksSection blocks={blocks} feeds={feeds} pages={pages} onChanged={load} />
    </div>
  );
}

// ── feeds ──────────────────────────────────────────────────────────────────

function FeedStatus({ feed }: { feed: WebsiteFeedRow }) {
  if (!feed.enabled) return <Badge variant="muted">Off</Badge>;
  if (feed.lastError) return <Badge variant="destructive" title={feed.lastError}>Not reading</Badge>;
  if (!feed.lastFetchedAt) return <Badge variant="muted">Not read yet</Badge>;
  return <Badge variant="success">Working</Badge>;
}

function FeedsSection({ feeds, onChanged }: { feeds: WebsiteFeedRow[]; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<string | null>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      setNotice(await fn());
      await onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3" aria-labelledby="feeds-title">
      <div>
        <h2 id="feeds-title" className="text-lg font-semibold">Feeds</h2>
        <p className="text-sm text-muted-foreground">
          The addresses the website reads. A feed that stops answering keeps showing the last articles it gave until it answers again.
        </p>
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {notice && <p className="text-sm text-muted-foreground" role="status">{notice}</p>}

      <div className="w-full overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 [&_th]:h-10 [&_th]:px-3 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground">
            <tr><th>Feed</th><th>Status</th><th>Last read</th><th>On</th><th className="text-right">Actions</th></tr>
          </thead>
          <tbody className="[&_td]:px-3 [&_td]:py-2.5 [&_tr]:border-t [&_tr]:border-border">
            {feeds.map((f) =>
              editing === f.id ? (
                <tr key={f.id}>
                  <td colSpan={5}>
                    <EditFeed
                      feed={f}
                      onCancel={() => setEditing(null)}
                      onSaved={async () => {
                        setEditing(null);
                        setNotice(`Saved ${f.name}.`);
                        await onChanged();
                      }}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={f.id}>
                  <td className="max-w-[28rem]">
                    <div className="font-medium">{f.name}</div>
                    <a className="block truncate text-xs text-muted-foreground underline-offset-2 hover:underline" href={f.url} target="_blank" rel="noopener noreferrer">
                      {f.url}
                    </a>
                    {f.lastError && <div className="mt-1 text-xs text-destructive">{f.lastError}</div>}
                  </td>
                  <td><FeedStatus feed={f} /></td>
                  <td className="whitespace-nowrap text-muted-foreground" title={fmtDateTime(f.lastFetchedAt)}>
                    {f.lastFetchedAt ? relativeTime(f.lastFetchedAt) : "—"}
                    {f.lastItemCount !== null && <div className="text-xs">{f.lastItemCount} article{f.lastItemCount === 1 ? "" : "s"}</div>}
                  </td>
                  <td>
                    <ToggleSwitch
                      label={`Website reads ${f.name}`}
                      checked={f.enabled}
                      disabled={busy === `on:${f.id}`}
                      onCheckedChange={(enabled) =>
                        void run(`on:${f.id}`, async () => {
                          await websiteApi.updateFeed(f.id, { enabled });
                          return enabled ? `${f.name} is back on the website.` : `${f.name} is off; its articles leave the website.`;
                        })
                      }
                    />
                  </td>
                  <td>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === `read:${f.id}`}
                        title="Read the feed again now rather than waiting for the next scheduled read."
                        onClick={() =>
                          void run(`read:${f.id}`, async () => {
                            const r = await websiteApi.refreshFeed(f.id);
                            return r.feed.lastError
                              ? `${f.name} could not be read: ${r.feed.lastError}`
                              : `Read ${f.name}: ${r.feed.lastItemCount ?? 0} articles.`;
                          })
                        }
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Read now
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(f.id)}>Edit</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === `rm:${f.id}`}
                        onClick={() => {
                          if (!window.confirm(`Remove ${f.name}? Its articles leave every block that uses it.`)) return;
                          void run(`rm:${f.id}`, async () => {
                            await websiteApi.removeFeed(f.id);
                            return `Removed ${f.name}.`;
                          });
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            )}
            {feeds.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No feeds yet. Add one below.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <AddFeed
        onAdded={async (feed) => {
          setNotice(
            feed.lastError ? `Added ${feed.name}, but it could not be read yet: ${feed.lastError}` : `Added ${feed.name}. Choose the news blocks that should show it below.`
          );
          await onChanged();
        }}
      />
    </section>
  );
}

function Preview({ title, items }: { title: string; items: WebsiteFeedItem[] }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
      <div className="font-medium">{title || "Untitled feed"} — the latest {items.length}:</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
        {items.map((it) => (
          <li key={it.link}>
            {it.title}
            {it.date && <span className="text-xs"> · {fmtDate(it.date)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AddFeed({ onAdded }: { onAdded: (feed: WebsiteFeedRow) => Promise<void> }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<{ url: string; title: string; items: WebsiteFeedItem[] } | null>(null);
  const [pending, setPending] = useState<"test" | "add" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function test() {
    setPending("test");
    setError(null);
    setPreview(null);
    try {
      const p = await websiteApi.preview(url);
      setPreview(p);
      if (!name.trim() && p.title) setName(p.title.slice(0, 80));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  return (
    <form
      className="space-y-3 rounded-card border border-border bg-card p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending("add");
        setError(null);
        try {
          const { feed } = await websiteApi.addFeed({ name, url });
          setName("");
          setUrl("");
          setPreview(null);
          await onAdded(feed);
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setPending(null);
        }
      }}
    >
      <div className="font-medium">Add a feed</div>
      <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
        <div className="space-y-1.5">
          <Label htmlFor="feed-name">Name shown on each article</Label>
          <Input id="feed-name" value={name} maxLength={80} placeholder="e.g. DLS Media" onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="feed-url">Feed address (RSS or Atom)</Label>
          <Input
            id="feed-url"
            type="url"
            inputMode="url"
            value={url}
            placeholder="https://example.com/feed"
            onChange={(e) => {
              setUrl(e.target.value);
              setPreview(null);
            }}
            required
          />
        </div>
      </div>
      {preview && preview.url === url.trim() && <Preview title={preview.title} items={preview.items} />}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!url || pending !== null} onClick={() => void test()}>
          {pending === "test" ? "Reading…" : "Test feed"}
        </Button>
        <Button type="submit" size="sm" disabled={!url || !name.trim() || pending !== null}>
          <Plus className="h-3.5 w-3.5" /> {pending === "add" ? "Adding…" : "Add feed"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Most blogs and news sites publish a feed; its address often ends in <code>/feed</code>, <code>/rss</code> or <code>.xml</code>.
        Only articles&rsquo; titles, dates, short summaries, pictures and links are shown, and each links back to the original.
      </p>
    </form>
  );
}

function EditFeed({ feed, onCancel, onSaved }: { feed: WebsiteFeedRow; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(feed.name);
  const [url, setUrl] = useState(feed.url);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-3 py-1"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          await websiteApi.updateFeed(feed.id, { name, ...(url !== feed.url ? { url } : {}) });
          await onSaved();
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
        <div className="space-y-1.5">
          <Label htmlFor={`name-${feed.id}`}>Name</Label>
          <Input id={`name-${feed.id}`} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`url-${feed.id}`}>Feed address</Label>
          <Input id={`url-${feed.id}`} type="url" value={url} onChange={(e) => setUrl(e.target.value)} required />
        </div>
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !name.trim() || !url}>{pending ? "Saving…" : "Save"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

// ── news blocks ────────────────────────────────────────────────────────────

const EMPTY_BLOCK: WebsiteFeedBlockInput = {
  slug: "",
  title: "",
  intro: null,
  feedIds: [],
  maxItems: 6,
  layout: "grid",
  showImages: true,
  showSummaries: true,
  pages: [],
  enabled: true,
  sortOrder: 0,
};

function BlocksSection({
  blocks,
  feeds,
  pages,
  onChanged,
}: {
  blocks: WebsiteFeedBlockRow[];
  feeds: WebsiteFeedRow[];
  pages: Page[];
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const feedName = useMemo(() => new Map(feeds.map((f) => [f.id, f.name])), [feeds]);
  const pageLabel = useMemo(() => new Map(pages.map((p) => [p.page, p.label])), [pages]);

  async function run(key: string, fn: () => Promise<string | null>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      setNotice(await fn());
      await onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3" aria-labelledby="blocks-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="blocks-title" className="text-lg font-semibold">News blocks</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            A block is a set of articles with a heading. Choose its feeds and the pages it appears on; the same block can sit on as many pages as you like.
          </p>
        </div>
        {editing !== "new" && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-3.5 w-3.5" /> New block
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {notice && <p className="text-sm text-muted-foreground" role="status">{notice}</p>}

      {editing === "new" && (
        <BlockEditor
          initial={{ ...EMPTY_BLOCK, feedIds: feeds.length === 1 ? [feeds[0]!.id] : [] }}
          isNew
          feeds={feeds}
          pages={pages}
          onCancel={() => setEditing(null)}
          onSave={async (input) => {
            await websiteApi.addBlock(input);
            setEditing(null);
            setNotice(`Created “${input.title}”.`);
            await onChanged();
          }}
        />
      )}

      <div className="space-y-3">
        {blocks.map((b) =>
          editing === b.id ? (
            <BlockEditor
              key={b.id}
              initial={b}
              feeds={feeds}
              pages={pages}
              onCancel={() => setEditing(null)}
              onSave={async (input) => {
                await websiteApi.updateBlock(b.id, input);
                setEditing(null);
                setNotice(`Saved “${input.title}”.`);
                await onChanged();
              }}
            />
          ) : (
            <div key={b.id} className="rounded-card border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{b.title}</span>
                    {!b.enabled && <Badge variant="muted">Off</Badge>}
                    {b.enabled && b.pages.length === 0 && <Badge variant="warning">On no pages</Badge>}
                    {b.enabled && b.feedIds.length === 0 && <Badge variant="warning">No feeds</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Name <code>{b.slug}</code> · {b.maxItems} article{b.maxItems === 1 ? "" : "s"} · {b.layout === "grid" ? "cards" : "list"}
                    {!b.showImages && " · no pictures"}
                    {!b.showSummaries && " · no summaries"}
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Feeds: </span>
                    {b.feedIds.length ? b.feedIds.map((id) => feedName.get(id) ?? "removed feed").join(", ") : "none"}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="text-muted-foreground">Pages:</span>
                    {b.pages.length === 0 && <span>none</span>}
                    {b.pages.map((p) => (
                      <a
                        key={p}
                        className="inline-flex items-center gap-1 rounded-pill bg-plum-soft px-2 py-0.5 text-xs text-plum hover:underline"
                        href={pageHref(p)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {pageLabel.get(p) ?? p} <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ToggleSwitch
                    label={`Show “${b.title}” on the website`}
                    checked={b.enabled}
                    disabled={busy === `on:${b.id}`}
                    onCheckedChange={(enabled) =>
                      void run(`on:${b.id}`, async () => {
                        await websiteApi.updateBlock(b.id, { enabled });
                        return enabled ? `“${b.title}” is back on the website.` : `“${b.title}” is off the website.`;
                      })
                    }
                  />
                  <Button size="sm" variant="outline" onClick={() => setEditing(b.id)}>Edit</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === `rm:${b.id}`}
                    onClick={() => {
                      if (!window.confirm(`Delete “${b.title}”? It leaves every page it is on.`)) return;
                      void run(`rm:${b.id}`, async () => {
                        await websiteApi.removeBlock(b.id);
                        return `Deleted “${b.title}”.`;
                      });
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          )
        )}
        {blocks.length === 0 && editing !== "new" && (
          <p className="rounded-card border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No news blocks yet. Create one to show a feed on the website.
          </p>
        )}
      </div>

      <details className="rounded-card border border-border bg-card p-4 text-sm">
        <summary className="cursor-pointer font-medium">Choosing exactly where a block sits on a page</summary>
        <div className="mt-2 space-y-2 text-muted-foreground">
          <p>
            A block on a page appears as its own section just before the page&rsquo;s closing call to action. To put it somewhere specific instead, a web
            developer adds this line to the page&rsquo;s HTML where it should go, using the block&rsquo;s name:
          </p>
          <pre className="overflow-auto rounded bg-muted p-2 text-xs text-foreground">{'<div data-feed-block="news-insights"></div>'}</pre>
          <p>
            The page still has to be ticked for the block here: switching a block off or unticking a page takes it off the website, wherever it sits. The
            News &amp; Insights page and the home page already have places for <code>news-insights</code> and <code>home-latest</code>.
          </p>
        </div>
      </details>
    </section>
  );
}

function BlockEditor({
  initial,
  isNew = false,
  feeds,
  pages,
  onCancel,
  onSave,
}: {
  initial: WebsiteFeedBlockInput;
  isNew?: boolean;
  feeds: WebsiteFeedRow[];
  pages: Page[];
  onCancel: () => void;
  onSave: (input: WebsiteFeedBlockInput) => Promise<void>;
}) {
  const [v, setV] = useState<WebsiteFeedBlockInput>({
    slug: initial.slug,
    title: initial.title,
    intro: initial.intro,
    feedIds: initial.feedIds,
    maxItems: initial.maxItems,
    layout: initial.layout,
    showImages: initial.showImages,
    showSummaries: initial.showSummaries,
    pages: initial.pages,
    enabled: initial.enabled,
    sortOrder: initial.sortOrder,
  });
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof WebsiteFeedBlockInput>(k: K, value: WebsiteFeedBlockInput[K]) => setV((cur) => ({ ...cur, [k]: value }));
  const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const id = isNew ? "new" : initial.slug;

  return (
    <form
      className="space-y-4 rounded-card border-2 border-primary/30 bg-card p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          await onSave({ ...v, intro: v.intro?.trim() ? v.intro.trim() : null });
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="font-medium">{isNew ? "New news block" : `Edit “${initial.title}”`}</div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`title-${id}`}>Heading</Label>
          <Input
            id={`title-${id}`}
            value={v.title}
            maxLength={120}
            placeholder="e.g. News & Insights"
            onChange={(e) => {
              const title = e.target.value;
              setV((cur) => ({ ...cur, title, ...(slugTouched ? {} : { slug: slugify(title) }) }));
            }}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`slug-${id}`}>Name (used in a page&rsquo;s HTML)</Label>
          <Input
            id={`slug-${id}`}
            value={v.slug}
            maxLength={60}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            title="Lower-case letters, numbers and hyphens."
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", e.target.value.toLowerCase());
            }}
            required
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`intro-${id}`}>Introduction <span className="font-normal text-muted-foreground">(optional, one or two sentences)</span></Label>
        <Textarea id={`intro-${id}`} rows={2} maxLength={400} value={v.intro ?? ""} onChange={(e) => set("intro", e.target.value)} />
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Feeds</legend>
        {feeds.length === 0 && <p className="text-sm text-muted-foreground">Add a feed above first.</p>}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {feeds.map((f) => (
            <label key={f.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={v.feedIds.includes(f.id)} onChange={() => set("feedIds", toggle(v.feedIds, f.id))} />
              {f.name}
              {!f.enabled && <span className="text-xs text-muted-foreground">(off)</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Show on these pages</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {pages.map((p) => (
            <label key={p.page} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={v.pages.includes(p.page)} onChange={() => set("pages", toggle(v.pages, p.page))} />
              {p.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`max-${id}`}>Number of articles</Label>
          <Input
            id={`max-${id}`}
            type="number"
            min={1}
            max={24}
            value={v.maxItems}
            onChange={(e) => set("maxItems", Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`layout-${id}`}>Layout</Label>
          <select id={`layout-${id}`} className={SELECT} value={v.layout} onChange={(e) => set("layout", e.target.value as "grid" | "list")}>
            <option value="grid">Cards with pictures</option>
            <option value="list">Compact list</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`order-${id}`}>Order on the page</Label>
          <Input
            id={`order-${id}`}
            type="number"
            min={-1000}
            max={1000}
            value={v.sortOrder}
            title="When several blocks share a page, lower numbers come first."
            onChange={(e) => set("sortOrder", Math.trunc(Number(e.target.value) || 0))}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={v.showImages} onChange={(e) => set("showImages", e.target.checked)} /> Show pictures
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={v.showSummaries} onChange={(e) => set("showSummaries", e.target.checked)} /> Show summaries
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={v.enabled} onChange={(e) => set("enabled", e.target.checked)} /> On the website
        </label>
      </div>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !v.title.trim() || !v.slug}>
          {pending ? "Saving…" : isNew ? "Create block" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
