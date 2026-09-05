# Backlog — open launch decisions and process items

This file tracks items that are neither code defects nor feature work: launch-scope decisions, requirements still to obtain, and process steps that must not be forgotten. Code defects are ranked in [Part A of the launch-readiness review](./2026-09-launch-readiness-review.md#part-a--critical-issues); feature work is sequenced in the [roadmap](./2026-09-roadmap.md); go-live prerequisites live in [`PRODUCTION-READINESS.md`](../../PRODUCTION-READINESS.md).

**Conventions.** IDs are `BL-nnn`. Status is `Open`, `In progress`, or `Done`. Every item names an owner, a next action, and a "done when". Close an item by setting its status to Done with the date; do not delete it.

| ID | Title | Type | Status | Owner | Next action |
|---|---|---|---|---|---|
| [BL-001](#bl-001) | Ship the schedule board and physician-order management ON at launch | Launch-scope decision | Open | DLS owner (decision) · architect (catalog) | Owner confirms; flag catalog seeds `schedule.board` on |
| [BL-002](#bl-002) | File the written owner feedback and requirement documents; re-check the review against them | Requirements / process | Open | Project manager · DLS owner | Collect the documents and samples; file under `docs/requirements/` |

---

### BL-001

**Ship the schedule board and physician-order management ON at launch**

| Field | Value |
|---|---|
| Type | Launch-scope decision |
| Status | Open — needs owner confirmation (roadmap "What we need from DLS", item 9) |
| Raised | 2026-09-05, launch-readiness review |
| Owner | DLS owner (decision); architect (feature catalog and Phase 0/2 work) |

**Why it matters.** "Scheduling" is not a checked box on the client's diagram, but the data model makes it a hard dependency of two launch features. Notes attach to visits, and visits require an active physician order. If the schedule is switched off for launch, field staff cannot write a progress note for anyone, and billing has nothing to export. Recurring schedules can stay off; the board and physician orders cannot.

**Evidence.**
- `progress_notes.visit_id` is NOT NULL — `supabase/migrations/0001_init.sql:102`.
- `fn_visit_requires_active_order` rejects any visit without an active order — `supabase/migrations/0003_scheduling_orders.sql:38-62`.
- No screen creates a physician order today: `createPhysicianOrder` has no caller — `lib/data/repo-core.ts:197-210`; intake hard-codes zero authorizations and no residence — `app/admin/clients/actions.ts:42-47`.

**Next actions.**
1. Owner confirms the decision (roadmap item 9); record the confirmation and date here.
2. In the feature catalog (roadmap Phase 0.3) seed `schedule.board` as launch-on with `admin_configurable = false`; keep `schedule.recurring` off.
3. Physician-order management UI lands with the client record page (roadmap Phase 2.1).
4. With `evv.clock` off, mark the visit `Completed` on note submit instead of on clock-out (roadmap Phase 0.4).

**Done when.** The confirmation is recorded here, the flag catalog seeds `schedule.board` on, and a client created through the UI can be given a physician order, scheduled, and documented end to end against the real database.

---

### BL-002

**File the written owner feedback and requirement documents; re-check the review against them**

| Field | Value |
|---|---|
| Type | Requirements / process |
| Status | Open |
| Raised | 2026-09-05, launch-readiness review |
| Owner | Project manager (collection and filing); DLS owner (supplies the material) |

**Why it matters.** The only client input received for the review was the architecture diagram. No written owner-feedback or requirements document exists in the repository or on GitHub `main`, so the review's statement of client intent rests on the diagram plus `docs/design/*` and `DECISIONS.md`. The attendance-record and person-centered-profile samples the diagram marks "need sample" are also outstanding. Any of these can change the gap analysis (review Part D) and the scope of roadmap Phase 2.

**Next actions.**
1. DLS supplies any owner feedback notes, requirement documents, the attendance-record sample, and the person-centered-profile sample.
2. File them under a new `docs/requirements/` folder with a dated index (`docs/requirements/INDEX.md`).
3. Re-run the gap analysis (review Part D) against the filed material; update roadmap Phase 2 items 2.2 (intake and renewal paperwork), 2.5 (attendance), 2.6 (person-centered profile), and the open-questions list.
4. Add a dated "re-checked against …" changelog line at the top of the review.

**Done when.** The documents are in the repository, the review carries the changelog entry, and any scope changes are reflected in the roadmap.
