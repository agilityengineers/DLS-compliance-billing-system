-- The two consultation tables below already exist on every database that ran
-- 0003_consultations (a hand-written migration with no schema snapshot), so
-- drizzle-kit, diffing against the 0002 snapshot, re-emitted them here. They are
-- created only if missing; the rest of this file is as generated.
CREATE TABLE IF NOT EXISTS "consultation_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"attempts" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consultation_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"role" text NOT NULL,
	"service" text NOT NULL,
	"message" text NOT NULL,
	"consent" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"medicaid_id" text,
	"date_of_birth" date,
	"active_diagnoses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"insurance_provider" text,
	"service_plan_start" date,
	"service_plan_end" date,
	"authorized_scc_hours_per_week" double precision DEFAULT 0 NOT NULL,
	"authorized_nmt_trips_per_week" integer DEFAULT 0 NOT NULL,
	"authorized_jc_hours_per_week" double precision DEFAULT 0 NOT NULL,
	"authorized_dh_hours_per_week" double precision DEFAULT 0 NOT NULL,
	"authorized_ei_hours_per_week" double precision DEFAULT 0 NOT NULL,
	"case_manager_name" text,
	"ccb_name" text,
	"residence_lat" double precision,
	"residence_lng" double precision,
	"status" text DEFAULT 'Active' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_status_check" CHECK ("clients"."status" in ('Active', 'Inactive'))
);
--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"type" text NOT NULL,
	"note" text,
	"details" jsonb,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_activities_type_check" CHECK ("lead_activities"."type" in ('submitted', 'stage_changed', 'assigned', 'note', 'converted'))
);
--> statement-breakpoint
CREATE TABLE "lead_form_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"help_text" text,
	"type" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_lead_form_questions_org_key" UNIQUE("org_id","key"),
	CONSTRAINT "lead_form_questions_type_check" CHECK ("lead_form_questions"."type" in ('short_text', 'long_text', 'email', 'phone', 'select', 'yes_no'))
);
--> statement-breakpoint
CREATE TABLE "lead_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"kind" text DEFAULT 'open' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_lead_stages_org_key" UNIQUE("org_id","key"),
	CONSTRAINT "lead_stages_kind_check" CHECK ("lead_stages"."kind" in ('open', 'won', 'lost'))
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"question_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'website' NOT NULL,
	"source_page" text,
	"consent_at" timestamp with time zone,
	"assigned_to_user_id" uuid,
	"closed_reason" text,
	"converted_client_id" uuid,
	"ip" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_source_check" CHECK ("leads"."source" in ('website', 'manual')),
	CONSTRAINT "leads_closed_reason_check" CHECK ("leads"."closed_reason" is null or "leads"."closed_reason" in ('not_a_fit', 'no_response', 'duplicate', 'other'))
);
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_form_questions" ADD CONSTRAINT "lead_form_questions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_stages" ADD CONSTRAINT "lead_stages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_stage_id_lead_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."lead_stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_converted_client_id_clients_id_fk" FOREIGN KEY ("converted_client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_clients_org_last_name" ON "clients" USING btree ("org_id","last_name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_clients_org_medicaid" ON "clients" USING btree ("org_id","medicaid_id") WHERE "clients"."medicaid_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_lead_activities_lead_created" ON "lead_activities" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_lead_form_questions_org_sort" ON "lead_form_questions" USING btree ("org_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_lead_stages_org_sort" ON "lead_stages" USING btree ("org_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_leads_org_stage" ON "leads" USING btree ("org_id","stage_id");--> statement-breakpoint
CREATE INDEX "idx_leads_org_created" ON "leads" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_leads_org_email" ON "leads" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "idx_leads_org_ip_created" ON "leads" USING btree ("org_id","ip","created_at");