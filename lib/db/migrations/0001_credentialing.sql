CREATE TABLE "requirements" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"gating" boolean DEFAULT true NOT NULL,
	"automated" boolean DEFAULT false NOT NULL,
	"vendor" text,
	"applies_to" jsonb NOT NULL,
	"renews_months" integer,
	"source" jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"authority_citation" text,
	"authority_url" text,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"verified_on" date,
	"verified_by" text,
	"verification_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requirements_verification_status_check" CHECK ("requirements"."verification_status" in ('confirmed', 'reported', 'agency_policy', 'unverified')),
	CONSTRAINT "requirements_gating_requires_required" CHECK (not "requirements"."gating" or "requirements"."required"),
	CONSTRAINT "requirements_confirmed_needs_signoff" CHECK ("requirements"."verification_status" <> 'confirmed' or ("requirements"."verified_on" is not null and "requirements"."verified_by" is not null))
);
--> statement-breakpoint
CREATE TABLE "staff_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"requirement_id" text NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"completed_on" date,
	"expires_on" date,
	"note" text,
	"waived_by" uuid,
	"waive_reason" text,
	"waived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_staff_credential" UNIQUE("staff_id","requirement_id"),
	CONSTRAINT "staff_credentials_status_check" CHECK ("staff_credentials"."status" in ('verified', 'in_progress', 'not_started', 'failed', 'waived')),
	CONSTRAINT "staff_credentials_waiver_needs_reason" CHECK ("staff_credentials"."status" <> 'waived' or ("staff_credentials"."waived_by" is not null and btrim(coalesce("staff_credentials"."waive_reason", '')) <> ''))
);
--> statement-breakpoint
ALTER TABLE "staff_credentials" ADD CONSTRAINT "staff_credentials_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_requirements_sort" ON "requirements" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "idx_staff_credentials_staff" ON "staff_credentials" USING btree ("staff_id");