// The public website's news feeds.
//
//   GET /public/website/feeds?page=news.html
//       What the website asks for on each page load: the news blocks placed on
//       that page, each with its articles. No session; plain text and checked
//       links only. The website puts a block into the page's
//       <div data-feed-block="slug"> when it has one, and otherwise adds it as
//       its own section near the end of the page.
//
//   /platform/website/*
//       The Super Admin's controls (`platform.website`): add, test, refresh,
//       switch off and remove feeds; create news blocks, choose their feeds,
//       size and layout, and the pages they appear on. Every change is audited.
import { Router, type IRouter, type Request } from "express";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { FEED_BLOCK_LAYOUTS, websiteFeedBlocksTable, websiteFeedsTable, type Db } from "@workspace/db";
import { WEBSITE_PAGES, isWebsitePage } from "@workspace/features";
import { recordAudit } from "../lib/audit";
import type { AppConfig } from "../lib/config";
import { badRequest, conflict, notFound } from "../lib/errors";
import { FeedError, WebsiteFeeds, checkFeedUrl, type FeedFetcher } from "../lib/website-feeds";
import { requireAuthContext, requireMfaEnrolled, requirePlatformCapability, requireRole } from "../middlewares/auth";

const FeedUrl = z
  .string()
  .trim()
  .min(1, "Enter the feed's address.")
  .max(2000)
  .transform((raw, ctx) => {
    const checked = checkFeedUrl(raw);
    if ("problem" in checked) {
      ctx.addIssue({ code: "custom", message: checked.problem });
      return z.NEVER;
    }
    return checked.url;
  });

const FeedBody = z.object({
  name: z.string().trim().min(1, "Give the feed a name.").max(80),
  url: FeedUrl,
  enabled: z.boolean().optional(),
});
const FeedPatch = FeedBody.partial();

const Slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lower-case letters, numbers and hyphens.");

const BlockBody = z.object({
  slug: Slug,
  title: z.string().trim().min(1, "Give the block a heading.").max(120),
  intro: z.string().trim().max(400).nullable().optional(),
  feedIds: z.array(z.uuid()).max(20).default([]),
  maxItems: z.number().int().min(1).max(24).default(6),
  layout: z.enum(FEED_BLOCK_LAYOUTS).default("grid"),
  showImages: z.boolean().default(true),
  showSummaries: z.boolean().default(true),
  pages: z
    .array(z.string().refine(isWebsitePage, "Not a page on the website."))
    .max(WEBSITE_PAGES.length)
    .default([]),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().min(-1000).max(1000).default(0),
});
const BlockPatch = z.object({
  slug: Slug.optional(),
  title: z.string().trim().min(1).max(120).optional(),
  intro: z.string().trim().max(400).nullable().optional(),
  feedIds: z.array(z.uuid()).max(20).optional(),
  maxItems: z.number().int().min(1).max(24).optional(),
  layout: z.enum(FEED_BLOCK_LAYOUTS).optional(),
  showImages: z.boolean().optional(),
  showSummaries: z.boolean().optional(),
  pages: z.array(z.string().refine(isWebsitePage, "Not a page on the website.")).max(WEBSITE_PAGES.length).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().min(-1000).max(1000).optional(),
});

const PreviewBody = z.object({ url: FeedUrl });

type FeedRow = typeof websiteFeedsTable.$inferSelect;
type BlockRow = typeof websiteFeedBlocksTable.$inferSelect;

/** The constraint a Postgres 23505 names, whether thrown directly or wrapped as `cause`. */
function uniqueViolation(e: unknown): string | null {
  for (let cur: unknown = e; cur; cur = (cur as { cause?: unknown }).cause) {
    const { code, constraint } = cur as { code?: string; constraint?: string };
    if (code === "23505") return constraint ?? "";
  }
  return null;
}

/** "news.html", "/news", "/news.html", "/" → the page's file name. */
export function pageOf(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let p = raw.trim().split(/[?#]/)[0]!.split("/").filter(Boolean).pop() ?? "";
  if (p === "") p = "index.html";
  if (!/\.html$/.test(p)) p = `${p}.html`;
  return isWebsitePage(p) ? p : null;
}

function feedView(f: FeedRow) {
  return {
    id: f.id,
    name: f.name,
    url: f.url,
    enabled: f.enabled,
    lastFetchedAt: f.lastFetchedAt?.toISOString() ?? null,
    lastError: f.lastError,
    lastItemCount: f.lastItemCount,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

function blockView(b: BlockRow) {
  return {
    id: b.id,
    slug: b.slug,
    title: b.title,
    intro: b.intro,
    feedIds: b.feedIds,
    maxItems: b.maxItems,
    layout: b.layout,
    showImages: b.showImages,
    showSummaries: b.showSummaries,
    pages: b.pages,
    enabled: b.enabled,
    sortOrder: b.sortOrder,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

export function websiteRouter(db: Db, config: AppConfig, deps: { feedFetcher?: FeedFetcher }): IRouter {
  const router: IRouter = Router();
  const feeds = new WebsiteFeeds(db, { fetcher: deps.feedFetcher });

  async function feedMap(): Promise<Map<string, FeedRow>> {
    const rows = await db.select().from(websiteFeedsTable);
    return new Map(rows.map((r) => [r.id, r]));
  }

  // ── public ────────────────────────────────────────────────────────────
  router.get("/public/website/feeds", async (req, res) => {
    const page = pageOf(req.query.page);
    if (!page) {
      res.json({ page: null, blocks: [] });
      return;
    }
    const blocks = await db
      .select()
      .from(websiteFeedBlocksTable)
      .where(sql`${websiteFeedBlocksTable.enabled} and ${page} = any(${websiteFeedBlocksTable.pages})`)
      .orderBy(asc(websiteFeedBlocksTable.sortOrder), asc(websiteFeedBlocksTable.createdAt));
    const byId = blocks.length > 0 ? await feedMap() : new Map<string, FeedRow>();
    const built = await Promise.all(blocks.map((b) => feeds.build(b, byId)));
    // Shared caches may keep it briefly; the articles change every few minutes at most.
    res.setHeader("Cache-Control", "public, max-age=120");
    res.json({ page, blocks: built });
  });

  // ── Super Admin ───────────────────────────────────────────────────────
  router.use("/platform/website", requireRole("Super_Admin", "Platform_Support"), requireMfaEnrolled(config.requireMfaForPlatform));
  const canManage = requirePlatformCapability("platform.website");

  async function audit(req: Request, action: string, targetType: string, targetId: string, details: Record<string, unknown>) {
    const res = req.res!;
    const auth = requireAuthContext(res);
    await recordAudit(db, {
      orgId: null,
      actorUserId: auth.realUser.id,
      impersonatingUserId: auth.impersonating ? auth.effectiveUser.id : null,
      action,
      targetType,
      targetId,
      details,
      ip: req.ip ?? null,
    });
  }

  async function checkFeedIds(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const known = await feedMap();
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length > 0) throw badRequest("One of the chosen feeds no longer exists. Reload and try again.");
  }

  router.get("/platform/website", canManage, async (_req, res) => {
    const [feedRows, blockRows] = await Promise.all([
      db.select().from(websiteFeedsTable).orderBy(asc(websiteFeedsTable.name)),
      db.select().from(websiteFeedBlocksTable).orderBy(asc(websiteFeedBlocksTable.sortOrder), asc(websiteFeedBlocksTable.createdAt)),
    ]);
    res.json({ feeds: feedRows.map(feedView), blocks: blockRows.map(blockView), pages: WEBSITE_PAGES });
  });

  /** Read an address once and show what it holds, without saving anything. */
  router.post("/platform/website/feeds/preview", canManage, async (req, res) => {
    const { url } = PreviewBody.parse(req.body);
    try {
      const parsed = await feeds.preview(url);
      if (parsed.items.length === 0) throw badRequest("The feed was read but has no articles in it.");
      res.json({ url, title: parsed.title, items: parsed.items.slice(0, 5) });
    } catch (e) {
      if (e instanceof FeedError) throw badRequest(e.message);
      throw e;
    }
  });

  router.post("/platform/website/feeds", canManage, async (req, res) => {
    const body = FeedBody.parse(req.body);
    let row: FeedRow;
    try {
      [row] = (await db.insert(websiteFeedsTable).values({ name: body.name, url: body.url, enabled: body.enabled ?? true }).returning()) as [FeedRow];
    } catch (e) {
      if (uniqueViolation(e) !== null) throw conflict("FEED_EXISTS", "That feed has already been added.");
      throw e;
    }
    await audit(req, "website.feed_added", "website_feed", row.id, { name: row.name, url: row.url });
    // Read it straight away so the console shows whether it works.
    await feeds.items(row, { force: true });
    const [fresh] = await db.select().from(websiteFeedsTable).where(eq(websiteFeedsTable.id, row.id));
    res.status(201).json({ feed: feedView(fresh ?? row) });
  });

  router.patch("/platform/website/feeds/:id", canManage, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const patch = FeedPatch.parse(req.body);
    const [before] = await db.select().from(websiteFeedsTable).where(eq(websiteFeedsTable.id, id));
    if (!before) throw notFound("No such feed.");
    let row: FeedRow | undefined;
    try {
      [row] = await db
        .update(websiteFeedsTable)
        .set({
          ...patch,
          ...(patch.url && patch.url !== before.url ? { lastError: null, lastFetchedAt: null, lastItemCount: null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(websiteFeedsTable.id, id))
        .returning();
    } catch (e) {
      if (uniqueViolation(e) !== null) throw conflict("FEED_EXISTS", "That feed has already been added.");
      throw e;
    }
    if (!row) throw notFound("No such feed.");
    if (patch.url && patch.url !== before.url) feeds.forget(id);
    await audit(req, "website.feed_updated", "website_feed", id, { changes: patch });
    res.json({ feed: feedView(row) });
  });

  router.post("/platform/website/feeds/:id/refresh", canManage, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const [row] = await db.select().from(websiteFeedsTable).where(eq(websiteFeedsTable.id, id));
    if (!row) throw notFound("No such feed.");
    const items = await feeds.items(row, { force: true });
    const [fresh] = await db.select().from(websiteFeedsTable).where(eq(websiteFeedsTable.id, id));
    res.json({ feed: feedView(fresh ?? row), items: items.slice(0, 5) });
  });

  router.delete("/platform/website/feeds/:id", canManage, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const removed = await db.transaction(async (tx) => {
      const [row] = await tx.delete(websiteFeedsTable).where(eq(websiteFeedsTable.id, id)).returning();
      if (!row) return null;
      // A block keeps working with its other feeds.
      await tx
        .update(websiteFeedBlocksTable)
        .set({ feedIds: sql`array_remove(${websiteFeedBlocksTable.feedIds}, ${id}::uuid)`, updatedAt: new Date() })
        .where(sql`${id}::uuid = any(${websiteFeedBlocksTable.feedIds})`);
      return row;
    });
    if (!removed) throw notFound("No such feed.");
    feeds.forget(id);
    await audit(req, "website.feed_removed", "website_feed", id, { name: removed.name, url: removed.url });
    res.json({ ok: true });
  });

  router.post("/platform/website/blocks", canManage, async (req, res) => {
    const body = BlockBody.parse(req.body);
    await checkFeedIds(body.feedIds);
    let row: BlockRow;
    try {
      [row] = (await db
        .insert(websiteFeedBlocksTable)
        .values({ ...body, intro: body.intro || null, feedIds: [...new Set(body.feedIds)], pages: [...new Set(body.pages)] })
        .returning()) as [BlockRow];
    } catch (e) {
      if (uniqueViolation(e) !== null) throw conflict("SLUG_TAKEN", "Another block already uses that name.");
      throw e;
    }
    await audit(req, "website.block_added", "website_feed_block", row.id, { slug: row.slug, pages: row.pages, feedIds: row.feedIds });
    res.status(201).json({ block: blockView(row) });
  });

  router.patch("/platform/website/blocks/:id", canManage, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const patch = BlockPatch.parse(req.body);
    if (patch.feedIds) await checkFeedIds(patch.feedIds);
    let row: BlockRow | undefined;
    try {
      [row] = await db
        .update(websiteFeedBlocksTable)
        .set({
          ...patch,
          ...(patch.intro !== undefined ? { intro: patch.intro || null } : {}),
          ...(patch.feedIds ? { feedIds: [...new Set(patch.feedIds)] } : {}),
          ...(patch.pages ? { pages: [...new Set(patch.pages)] } : {}),
          updatedAt: new Date(),
        })
        .where(eq(websiteFeedBlocksTable.id, id))
        .returning();
    } catch (e) {
      if (uniqueViolation(e) !== null) throw conflict("SLUG_TAKEN", "Another block already uses that name.");
      throw e;
    }
    if (!row) throw notFound("No such block.");
    await audit(req, "website.block_updated", "website_feed_block", id, { slug: row.slug, changes: patch });
    res.json({ block: blockView(row) });
  });

  router.delete("/platform/website/blocks/:id", canManage, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const [row] = await db.delete(websiteFeedBlocksTable).where(eq(websiteFeedBlocksTable.id, id)).returning();
    if (!row) throw notFound("No such block.");
    await audit(req, "website.block_removed", "website_feed_block", id, { slug: row.slug });
    res.json({ ok: true });
  });

  return router;
}
