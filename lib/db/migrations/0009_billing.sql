CREATE TABLE "billing_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"payer_id" uuid,
	"code" text NOT NULL,
	"modifier1" text,
	"modifier2" text,
	"modifier3" text,
	"modifier4" text,
	"description" text NOT NULL,
	"service" text NOT NULL,
	"billing_unit" text DEFAULT '15_min' NOT NULL,
	"rate_per_unit" double precision NOT NULL,
	"effective_date" date NOT NULL,
	"end_date" date,
	"evv_code" text,
	"allow_zero_units" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_codes_service_check" CHECK ("billing_codes"."service" in ('SCC', 'Job_Coaching', 'Day_Habilitation', 'Early_Intervention', 'NMT', 'Other')),
	CONSTRAINT "billing_codes_unit_check" CHECK ("billing_codes"."billing_unit" in ('15_min', 'hour', 'day', 'trip', 'each')),
	CONSTRAINT "billing_codes_rate_check" CHECK ("billing_codes"."rate_per_unit" >= 0),
	CONSTRAINT "billing_codes_dates_check" CHECK ("billing_codes"."end_date" is null or "billing_codes"."end_date" >= "billing_codes"."effective_date")
);
--> statement-breakpoint
CREATE TABLE "claim_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"control_number" bigserial NOT NULL,
	"payer_id" uuid,
	"payer_key" text NOT NULL,
	"format" text DEFAULT '837P' NOT NULL,
	"test_mode" boolean DEFAULT false NOT NULL,
	"period_start" date,
	"period_end" date,
	"note_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note_count" integer DEFAULT 0 NOT NULL,
	"total_units" double precision DEFAULT 0 NOT NULL,
	"total_charge" double precision DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"status_note" text,
	"file_name" text,
	"file_content" text,
	"submitted_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_submissions_status_check" CHECK ("claim_submissions"."status" in ('open', 'submitted', 'accepted', 'rejected', 'paid', 'denied', 'voided')),
	CONSTRAINT "claim_submissions_file_check" CHECK (("claim_submissions"."status" = 'open') = ("claim_submissions"."file_content" is null))
);
--> statement-breakpoint
CREATE TABLE "payers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'medicaid' NOT NULL,
	"payer_id" text,
	"claim_filing_code" text DEFAULT 'MC' NOT NULL,
	"address1" text,
	"city" text,
	"state" text,
	"zip" text,
	"phone" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_payers_org_name" UNIQUE("org_id","name"),
	CONSTRAINT "payers_kind_check" CHECK ("payers"."kind" in ('medicaid', 'dvr', 'private', 'other')),
	CONSTRAINT "payers_filing_check" CHECK ("payers"."claim_filing_code" in ('MC', 'CI', 'OF', '11'))
);
--> statement-breakpoint
ALTER TABLE "billing_codes" ADD CONSTRAINT "billing_codes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_codes" ADD CONSTRAINT "billing_codes_payer_id_payers_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."payers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_submissions" ADD CONSTRAINT "claim_submissions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_submissions" ADD CONSTRAINT "claim_submissions_payer_id_payers_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."payers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_submissions" ADD CONSTRAINT "claim_submissions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payers" ADD CONSTRAINT "payers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_billing_codes_org_code" ON "billing_codes" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "idx_billing_codes_org_service" ON "billing_codes" USING btree ("org_id","service");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_claim_submissions_control" ON "claim_submissions" USING btree ("control_number");--> statement-breakpoint
CREATE INDEX "idx_claim_submissions_org_created" ON "claim_submissions" USING btree ("org_id","created_at");