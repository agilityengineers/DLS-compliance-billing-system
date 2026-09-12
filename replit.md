# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm test` — unit and integration tests (vitest; DB suites run on in-process pglite)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema: `lib/db/src/schema/` (Drizzle) with SQL in `lib/db/migrations/`
- API contract: `lib/api-spec/openapi.yaml` — the source of truth. Edit it, then
  `pnpm --filter @workspace/api-spec run codegen` to regenerate the Zod schemas
  (`lib/api-zod`) and React Query hooks (`lib/api-client-react`). Never hand-edit
  anything under a `generated/` folder.
- Credentialing: `lib/credentialing/` holds the requirements registry types, the
  pure evaluation engine and the shipped default registry. It has no
  dependencies so the client, the API server and the tests share one definition.
  Claim readiness and the staff screen both read it — do not re-derive credential
  logic anywhere else.
- The app: `artifacts/dls-cms` (Vite + React + wouter, currently demo-mode only),
  `artifacts/api-server` (Express 5 on Drizzle).

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
