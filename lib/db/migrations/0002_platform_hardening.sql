CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"trigger" text DEFAULT 'schedule' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"items_processed" integer DEFAULT 0 NOT NULL,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"outcome" text NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"sender" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"status" text NOT NULL,
	"provider_message_id" text,
	"error" text,
	"org_id" uuid,
	"user_id" uuid,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"granted_by_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "seq" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "prev_hash" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "hash" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "primary_contact_name" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "primary_contact_email" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "primary_contact_phone" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "time_zone" text DEFAULT 'America/Denver' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "baa_signed_on" date;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "baa_expires_on" date;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "contract_notes" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "decommissioned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "decommission_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_last_step" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_recovery_codes" jsonb;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_outbox" ADD CONSTRAINT "mail_outbox_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_outbox" ADD CONSTRAINT "mail_outbox_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_windows" ADD CONSTRAINT "support_windows_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_windows" ADD CONSTRAINT "support_windows_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_windows" ADD CONSTRAINT "support_windows_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_auth_tokens_user_purpose" ON "auth_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "idx_job_runs_name_started" ON "job_runs" USING btree ("name","started_at");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_email_created" ON "login_attempts" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_created" ON "login_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mail_outbox_dedupe" ON "mail_outbox" USING btree ("dedupe_key") WHERE "mail_outbox"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "idx_mail_outbox_created" ON "mail_outbox" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_support_windows_org_expires" ON "support_windows" USING btree ("org_id","expires_at");--> statement-breakpoint
CREATE INDEX "idx_audit_log_action_created" ON "audit_log" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_log_seq" ON "audit_log" USING btree ("seq");--> statement-breakpoint
-- ────────────────────────────────────────────────────────────────────────────
-- Tamper evidence for audit_log (hand-written: drizzle-kit models tables, not
-- functions or triggers, so this part of the migration is maintained here).
--
-- "Append-only" was previously a property of the application: nothing in the
-- API updates or deletes an audit row, but a privileged connection still
-- could, and nobody would know. Each row now carries the hash of the row
-- before it, so a changed, deleted or reordered entry breaks the chain from
-- that point on and audit_log_verify() says exactly where.
-- ────────────────────────────────────────────────────────────────────────────

-- The canonical digest of one row. Used by the insert trigger and by the
-- verifier, so the two can never disagree about what a row hashes to.
-- jsonb renders with sorted keys, which is what makes `details` stable.
CREATE OR REPLACE FUNCTION audit_log_digest(
  p_prev text,
  p_seq bigint,
  p_id uuid,
  p_created_at timestamptz,
  p_org_id uuid,
  p_actor uuid,
  p_impersonating uuid,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_details jsonb,
  p_ip text
) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(
    sha256(
      convert_to(
        concat_ws(
          E'\x1f',
          coalesce(p_prev, ''),
          p_seq::text,
          p_id::text,
          to_char(p_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
          coalesce(p_org_id::text, ''),
          coalesce(p_actor::text, ''),
          coalesce(p_impersonating::text, ''),
          p_action,
          p_target_type,
          coalesce(p_target_id, ''),
          coalesce(p_details::text, ''),
          coalesce(p_ip, '')
        ),
        'UTF8'
      )
    ),
    'hex'
  );
$$;--> statement-breakpoint

-- Link every new row to the current tip of the chain.
CREATE OR REPLACE FUNCTION audit_log_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_prev text;
BEGIN
  -- One writer at a time: two concurrent inserts must not both link to the
  -- same predecessor and leave a fork.
  PERFORM pg_advisory_xact_lock(hashtext('audit_log_chain')::bigint);
  -- Re-draw the sequence under the lock so chain order and seq order agree
  -- even when transactions commit out of the order they started in. Gaps in
  -- seq are expected and harmless.
  NEW.seq := nextval(pg_get_serial_sequence('audit_log', 'seq'));
  SELECT hash INTO v_prev FROM audit_log ORDER BY seq DESC LIMIT 1;
  NEW.prev_hash := v_prev;
  NEW.hash := audit_log_digest(
    v_prev, NEW.seq, NEW.id, NEW.created_at, NEW.org_id, NEW.actor_user_id,
    NEW.impersonating_user_id, NEW.action, NEW.target_type, NEW.target_id,
    NEW.details, NEW.ip
  );
  RETURN NEW;
END;
$$;--> statement-breakpoint

-- Chain the rows that already exist (bootstrap and anything logged so far).
DO $$
DECLARE
  r record;
  v_prev text := NULL;
  v_hash text;
BEGIN
  FOR r IN SELECT * FROM audit_log ORDER BY seq LOOP
    v_hash := audit_log_digest(
      v_prev, r.seq, r.id, r.created_at, r.org_id, r.actor_user_id,
      r.impersonating_user_id, r.action, r.target_type, r.target_id, r.details, r.ip
    );
    UPDATE audit_log SET prev_hash = v_prev, hash = v_hash WHERE id = r.id;
    v_prev := v_hash;
  END LOOP;
END $$;--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_audit_log_chain ON audit_log;--> statement-breakpoint
CREATE TRIGGER trg_audit_log_chain
  BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_chain();--> statement-breakpoint

-- Append-only, enforced by the database rather than by convention. A future
-- migration that genuinely must rewrite history has to drop this trigger,
-- which is itself a reviewable act — and the chain would still show the edit.
CREATE OR REPLACE FUNCTION audit_log_no_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (attempted %)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_audit_log_no_rewrite ON audit_log;--> statement-breakpoint
CREATE TRIGGER trg_audit_log_no_rewrite
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_no_rewrite();--> statement-breakpoint

-- Walk the chain and report the first break. `p_from_seq` verifies only the
-- tail, which is what the scheduled job does on a large log; the row it
-- starts from is trusted as given.
CREATE OR REPLACE FUNCTION audit_log_verify(p_from_seq bigint DEFAULT NULL)
RETURNS TABLE(
  checked bigint,
  ok boolean,
  first_bad_seq bigint,
  first_bad_id uuid,
  last_seq bigint,
  last_hash text
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  r record;
  v_prev text := NULL;
  v_expected text;
  v_started boolean := (p_from_seq IS NULL);
BEGIN
  checked := 0;
  ok := true;
  FOR r IN SELECT * FROM audit_log ORDER BY seq LOOP
    IF NOT v_started THEN
      IF r.seq >= p_from_seq THEN
        v_started := true;
        v_prev := r.prev_hash;  -- trust the starting point, check from here on
      ELSE
        CONTINUE;
      END IF;
    END IF;
    v_expected := audit_log_digest(
      v_prev, r.seq, r.id, r.created_at, r.org_id, r.actor_user_id,
      r.impersonating_user_id, r.action, r.target_type, r.target_id, r.details, r.ip
    );
    checked := checked + 1;
    IF ok AND (r.hash IS DISTINCT FROM v_expected OR r.prev_hash IS DISTINCT FROM v_prev) THEN
      ok := false;
      first_bad_seq := r.seq;
      first_bad_id := r.id;
    END IF;
    v_prev := r.hash;
    last_seq := r.seq;
    last_hash := r.hash;
  END LOOP;
  RETURN NEXT;
END;
$$;
