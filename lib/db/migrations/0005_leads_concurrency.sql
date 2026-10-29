CREATE TABLE "lead_submission_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"ip" text,
	"submission_id" text,
	"outcome" text NOT NULL,
	"lead_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_submission_attempts_outcome_check" CHECK ("lead_submission_attempts"."outcome" in ('created', 'retry', 'invalid', 'rate_limited', 'ignored'))
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "source_lead_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "submission_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "submission_fingerprint" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "import_source" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "import_source_id" text;--> statement-breakpoint
ALTER TABLE "lead_submission_attempts" ADD CONSTRAINT "lead_submission_attempts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_submission_attempts" ADD CONSTRAINT "lead_submission_attempts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_lead_submission_attempts_org_ip_created" ON "lead_submission_attempts" USING btree ("org_id","ip","created_at");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_source_lead_id_leads_id_fk" FOREIGN KEY ("source_lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_clients_source_lead" ON "clients" USING btree ("source_lead_id") WHERE "clients"."source_lead_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_leads_org_submission" ON "leads" USING btree ("org_id","submission_id") WHERE "leads"."submission_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_leads_import_source" ON "leads" USING btree ("import_source","import_source_id") WHERE "leads"."import_source" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_leads_converted_client" ON "leads" USING btree ("converted_client_id") WHERE "leads"."converted_client_id" is not null;