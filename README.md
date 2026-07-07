# DLS-CMS — Durable Life Skills Care Management System

HIPAA-compliant I/DD care management: desktop admin panel (`/admin/*`) + offline-first mobile field PWA (`/field/*`) in a single Next.js 14 App Router monorepo.

## Stack

- Next.js 14 (App Router, TypeScript), Tailwind CSS, shadcn/ui-style primitives
- Supabase: PostgreSQL + Auth + Row Level Security + Storage
- Offline layer: Dexie.js (IndexedDB) + background `SyncEngine`
- PWA: `public/manifest.json` + hand-written service worker (`public/sw.js`). Capacitor-wrappable later — no native deps.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase keys
npm run dev
```

### Supabase bootstrap

1. Create a project at supabase.com → copy URL + anon key + service-role key into `.env.local`.
2. Install the CLI: `npm i -g supabase && supabase login`
3. Link and run migrations:
   ```bash
   supabase link --project-ref <ref>
   supabase db push                      # applies supabase/migrations/*
   ```
4. Apply RLS policies (kept separate from DDL on purpose):
   ```bash
   for f in supabase/policies/*.sql; do supabase db execute -f "$f"; done
   ```
5. Auth: enable **Email** provider only (Dashboard → Auth → Providers). Disable signups; staff accounts are provisioned by Admins.
6. After creating an auth user, insert the matching `public.users` row (same UUID) with the correct `role`.

### Tests

```bash
npm test        # vitest — billing units, 837P segment structure, guardrails
```

## HIPAA notes

- RLS is enabled on **every** table; policies in `supabase/policies/`.
- Every PHI-bearing table has an audit trigger (`fn_audit_row_change`) writing to `audit_trails`.
- The service worker never caches API/PHI responses — network-first with IndexedDB fallback handled in app code, not SW cache.
- EVV manual adjustments require a non-empty `manual_adjustment_reason` (enforced in DB CHECK + UI).

## Directory map

See the spec-matching layout under `app/`, `components/`, `lib/`, `supabase/`, `public/`.
