// lib/db/src/schema/website.ts — what the public website streams in.
//
//   website_feeds        RSS or Atom feeds the Super Admin has added: a name
//                        shown on each article ("DLS Media"), the address, and
//                        what happened the last time the server read it
//   website_feed_blocks  a "news block": a heading, the feeds it draws from,
//                        how many articles, how they are laid out, and the
//                        pages it appears on. A page shows a block either in a
//                        slot written into its HTML (<div data-feed-block="slug">)
//                        or, when the page has no such slot, as its own section
//                        near the end of the page.
//
// Both belong to the platform, not to an organization: the website is the
// provider's, and only a provider account with `platform.website` edits them.
// The articles themselves are never stored — the API reads each feed on demand
// and keeps a short-lived copy in memory.
import { boolean, check, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const FEED_BLOCK_LAYOUTS = ["grid", "list"] as const;
export type FeedBlockLayout = (typeof FEED_BLOCK_LAYOUTS)[number];

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const websiteFeedsTable = pgTable("website_feeds", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Shown on each article as its source, e.g. "DLS Media". */
  name: text("name").notNull(),
  url: text("url").notNull().unique(),
  enabled: boolean("enabled").notNull().default(true),
  /** The last time the server read the feed, successfully or not. */
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  /** Why the last read failed, in one sentence; null when it worked. */
  lastError: text("last_error"),
  lastItemCount: integer("last_item_count"),
  ...timestamps,
});

export const websiteFeedBlocksTable = pgTable(
  "website_feed_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The name a page uses to place the block: <div data-feed-block="slug">. */
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    intro: text("intro"),
    /** The feeds whose articles are merged, newest first. */
    feedIds: uuid("feed_ids").array().notNull().default(sql`'{}'::uuid[]`),
    maxItems: integer("max_items").notNull().default(6),
    layout: text("layout").$type<FeedBlockLayout>().notNull().default("grid"),
    showImages: boolean("show_images").notNull().default(true),
    showSummaries: boolean("show_summaries").notNull().default(true),
    /** Website pages (e.g. "news.html") the block appears on. */
    pages: text("pages").array().notNull().default(sql`'{}'::text[]`),
    enabled: boolean("enabled").notNull().default(true),
    /** Order among blocks placed automatically on the same page. */
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    check("website_feed_blocks_layout_check", sql`${t.layout} in ('grid', 'list')`),
    check("website_feed_blocks_max_items_check", sql`${t.maxItems} between 1 and 24`),
  ]
);
