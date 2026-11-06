ALTER TABLE "clients" ADD COLUMN "rep_payee_status" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "rep_payee_name" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "rep_payee_address1" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "rep_payee_address2" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "rep_payee_city" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "rep_payee_state" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "rep_payee_zip" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "rep_payee_phone" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "rep_payee_email" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "rep_payee_number" text;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_rep_payee_check" CHECK ("clients"."rep_payee_status" is null or "clients"."rep_payee_status" in ('Not applicable', 'Rep payee'));