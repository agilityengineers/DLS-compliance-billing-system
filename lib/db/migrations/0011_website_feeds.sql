CREATE TABLE "website_feed_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"intro" text,
	"feed_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"max_items" integer DEFAULT 6 NOT NULL,
	"layout" text DEFAULT 'grid' NOT NULL,
	"show_images" boolean DEFAULT true NOT NULL,
	"show_summaries" boolean DEFAULT true NOT NULL,
	"pages" text[] DEFAULT '{}'::text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_feed_blocks_slug_unique" UNIQUE("slug"),
	CONSTRAINT "website_feed_blocks_layout_check" CHECK ("website_feed_blocks"."layout" in ('grid', 'list')),
	CONSTRAINT "website_feed_blocks_max_items_check" CHECK ("website_feed_blocks"."max_items" between 1 and 24)
);
--> statement-breakpoint
CREATE TABLE "website_feeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"last_error" text,
	"last_item_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_feeds_url_unique" UNIQUE("url")
);
