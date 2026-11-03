CREATE TABLE "client_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"auth_number" text,
	"payer_name" text,
	"service" text NOT NULL,
	"billing_code" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"approved_units" double precision NOT NULL,
	"unit_basis" text DEFAULT 'unit' NOT NULL,
	"weekly_cap_units" double precision,
	"rate_per_unit" double precision,
	"status" text DEFAULT 'active' NOT NULL,
	"permit_over_budget" boolean DEFAULT false NOT NULL,
	"exclude_from_submission" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_authorizations_service_check" CHECK ("client_authorizations"."service" in ('SCC', 'Job_Coaching', 'Day_Habilitation', 'Early_Intervention', 'NMT', 'Other')),
	CONSTRAINT "client_authorizations_basis_check" CHECK ("client_authorizations"."unit_basis" in ('unit', 'hour', 'trip', 'dollar')),
	CONSTRAINT "client_authorizations_status_check" CHECK ("client_authorizations"."status" in ('active', 'pending', 'void')),
	CONSTRAINT "client_authorizations_dates_check" CHECK ("client_authorizations"."end_date" >= "client_authorizations"."start_date"),
	CONSTRAINT "client_authorizations_units_check" CHECK ("client_authorizations"."approved_units" >= 0 and ("client_authorizations"."weekly_cap_units" is null or "client_authorizations"."weekly_cap_units" >= 0))
);
--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"relationship" text,
	"phone" text,
	"email" text,
	"address1" text,
	"city" text,
	"state" text,
	"zip" text,
	"npi" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_contacts_kind_check" CHECK ("client_contacts"."kind" in ('responsible_party', 'guardian', 'emergency', 'physician', 'case_manager', 'other'))
);
--> statement-breakpoint
CREATE TABLE "client_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"category" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content" "bytea" NOT NULL,
	"start_date" date,
	"end_date" date,
	"notes" text,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_files_size_check" CHECK ("client_files"."size_bytes" > 0 and "client_files"."size_bytes" <= 10485760),
	CONSTRAINT "client_files_dates_check" CHECK ("client_files"."end_date" is null or "client_files"."start_date" is null or "client_files"."end_date" >= "client_files"."start_date")
);
--> statement-breakpoint
CREATE TABLE "client_insurance_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"policy_type" text DEFAULT 'primary' NOT NULL,
	"payer_name" text NOT NULL,
	"member_id" text,
	"group_number" text,
	"status" text DEFAULT 'active' NOT NULL,
	"start_date" date,
	"end_date" date,
	"policy_holder_name" text,
	"policy_holder_relationship" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_insurance_policies_type_check" CHECK ("client_insurance_policies"."policy_type" in ('primary', 'secondary', 'tertiary')),
	CONSTRAINT "client_insurance_policies_status_check" CHECK ("client_insurance_policies"."status" in ('active', 'inactive')),
	CONSTRAINT "client_insurance_policies_dates_check" CHECK ("client_insurance_policies"."end_date" is null or "client_insurance_policies"."start_date" is null or "client_insurance_policies"."end_date" >= "client_insurance_policies"."start_date")
);
--> statement-breakpoint
ALTER TABLE "clients" DROP CONSTRAINT "clients_status_check";--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "middle_name" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "phone_cell" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "phone_work" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "gender_identity" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "marital_status" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "ethnicity" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "race" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "guardianship_status" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "account_code" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "admission_date" date;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "discharge_date" date;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "address1" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "address2" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "county" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "zip" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "allergies" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "medical_concerns" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "supervision_requirements" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "general_information" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "has_behavior_support_plan" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "behavior_support_plan_notes" text;--> statement-breakpoint
ALTER TABLE "client_authorizations" ADD CONSTRAINT "client_authorizations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_authorizations" ADD CONSTRAINT "client_authorizations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_files" ADD CONSTRAINT "client_files_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_files" ADD CONSTRAINT "client_files_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_files" ADD CONSTRAINT "client_files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_insurance_policies" ADD CONSTRAINT "client_insurance_policies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_insurance_policies" ADD CONSTRAINT "client_insurance_policies_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_client_authorizations_client" ON "client_authorizations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_client_authorizations_org_end" ON "client_authorizations" USING btree ("org_id","end_date");--> statement-breakpoint
CREATE INDEX "idx_client_contacts_client" ON "client_contacts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_client_files_client" ON "client_files" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_client_insurance_policies_client" ON "client_insurance_policies" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_gender_check" CHECK ("clients"."gender" is null or "clients"."gender" in ('Male', 'Female', 'Other', 'Unknown'));--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_guardianship_check" CHECK ("clients"."guardianship_status" is null or "clients"."guardianship_status" in ('Not applicable', 'Guardian', 'Court appointed'));--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_marital_check" CHECK ("clients"."marital_status" is null or "clients"."marital_status" in ('Single', 'Married', 'Divorced', 'Separated', 'Widowed', 'Other'));--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_status_check" CHECK ("clients"."status" in ('Active', 'Inactive', 'Interim', 'Discharged', 'Deceased'));