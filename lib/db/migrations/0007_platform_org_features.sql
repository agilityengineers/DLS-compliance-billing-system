CREATE TABLE "platform_org_features" (
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_org_features_org_id_key_pk" PRIMARY KEY("org_id","key")
);
--> statement-breakpoint
ALTER TABLE "platform_org_features" ADD CONSTRAINT "platform_org_features_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;