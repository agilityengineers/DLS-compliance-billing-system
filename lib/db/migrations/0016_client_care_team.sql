ALTER TABLE "client_contacts" DROP CONSTRAINT "client_contacts_kind_check";--> statement-breakpoint
ALTER TABLE "client_contacts" ADD COLUMN "phone_work" text;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD COLUMN "phone_cell" text;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_kind_check" CHECK ("client_contacts"."kind" in ('responsible_party', 'guardian', 'emergency', 'physician', 'case_manager', 'external_provider', 'other'));