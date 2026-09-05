# DLS Compliance & Billing System — Launch Roadmap

**Audience:** the DLS owner and team. **Date:** 2026-09-05. Technical detail and code references live in the companion [launch-readiness review](./2026-09-launch-readiness-review.md).

## Where things stand

Think of the system today as a house whose show-home has been staged beautifully, but whose plumbing has only ever been tested with the water turned off. Every screen you saw in the demo works against a built-in practice dataset. Connected to the real database, several core actions fail quietly: adding an employee, recording time from a completed visit, scheduling a visit at the right hour, and telling a new client's story from intake to a billable note. None of those failures show an error; they simply do nothing or record the wrong value. That is why the first phase below is about making the real system behave like the demo before any new features are added.

The good news is that the foundations are sound: the field app captures notes offline with signatures and correct unit math, the database enforces the business rules (physician orders, geofence, weekly caps) rather than trusting the app, the audit trail records who did what, and the design is the one you approved.

### What you asked for at launch, and its current state

| Launch feature | State today | What launch needs |
|---|---|---|
| Core client data | Partial: you can add a client but never open, edit or deactivate one; new clients cannot be scheduled | Client record page with edit, status, physician orders, contact and guardian details |
| Intake paperwork | Missing | A checklist of required intake documents per client, with upload and status |
| Renewal paperwork (yearly) | Missing: the system shows when a plan has expired but does nothing before that | Yearly renewal items with 30/14/3-day reminders and one place to complete them |
| Incident report (management review) | Partial: staff can file a short report; nobody can review, close or get notified | Full report form, review workflow, notification to management, works offline |
| Billing | Partial: claim readiness works; the claim file itself would be rejected by the clearinghouse | Valid 837P file, real fee schedule, safeguards so no note is marked billed without a file |
| Notes | Capture works well; management cannot view, lock or amend a note | Note viewer, lock after billing, addenda, goals that come from each client's plan |
| Staff data | Partial: adding a user is broken against the real database; any Google account can sign itself up | Invite-based onboarding, password reset, credential documents, automated expiry reminders |
| Relias training | Built but running on a stand-in; nothing syncs nightly | Confirmed Relias API contract, nightly sync, correct "training overdue" blocking |
| Client attendance records | Missing (sample pending from DLS) | A per-client attendance record that fills itself from completed visits and can be corrected and exported |
| Person-centered profile | Missing (sample pending from DLS) | A profile per client that field staff can read at the door and that feeds each note's goals |

### Roles and the on/off switches

You asked for three tiers: a Super Admin (us) who decides which capabilities your account has, an Admin/Owner (you) who runs the company and decides what employees see, and employees. Today the system has one top role and a menu-visibility setting that hides links without actually blocking access. Phase 0 adds the Super Admin tier and a real two-tier switchboard: features we have not turned on for your account cannot be used, and features you have not turned on for employees cannot be used by them. Everything built beyond the launch list (EVV/GPS clock-in, medication administration, payroll transmittal, recurring schedules, QA flags, monthly reports, DVR notices) starts **off** and can be switched on later without new development.

One dependency to be aware of: notes attach to visits, and visits require a physician order. So the schedule board and physician-order management ship **on** at launch even though "scheduling" was not on your diagram. Recurring schedules stay off.

---

## The plan

Effort is in developer-days and is an estimate. Phases 0 to 3 are the **must-fix-before-launch** tier. Phase 4 is post-launch. Phase 0 is one person's work; Phases 2 and 3 can run with two developers in parallel.

### Phase 0 — Make the real system truthful (about 4 weeks)

| Item | What it is | Why it matters to DLS | Depends on | Effort |
|---|---|---|---|---|
| 0.1 Time zone handling | One agency-time helper used everywhere dates and times are written or compared; the demo data adjusted so demo and real mode agree | Visits are currently stored 6–7 hours off and evening visits post zero hours; every date-based rule (weekly caps, order validity) misfires across the day boundary | — | 3 days |
| 0.2 Super Admin role | New top-tier role recognised throughout the app and database | Required for the switchboard and for vendor support without standing access to client records | — | 2 days |
| 0.3 Feature switchboard (database side) | A feature table with two switches per feature (ours and yours), enforced in the database so it cannot be bypassed | Every non-launch feature becomes a switch instead of hard-wired code | 0.2 | 5 days |
| 0.4 Feature switchboard (app side) | Every screen, action and sync path checks the switch; new Settings page with the two-tier toggles; a Super Admin console | Turns the switch into real enforcement, not hidden menu links | 0.3 | 5 days |
| 0.5 Employee onboarding | Invite-based "Add user" that creates the login; only invited people can sign in with Google; password reset | Today you cannot add an employee at all, and any Google account can create itself an active staff login | — | 2 days |
| 0.6 Real-database breakers | Fix the timesheet append that fails silently, the billing-cap check that stops working after 300 notes, and the medication "missed" record | Silent failures that would surface weeks after launch as missing hours or over-authorization claims | — | 2 days |
| 0.7 Deployment guard | The app refuses to start in demo mode when production credentials are present; deployment notes for Replit/Vercel | Prevents an accidental "production" that runs on practice data with no passwords | — | 0.5 day |
| 0.8 Privacy blockers | Stop the offline cache from storing client pages; wipe the device on idle timeout; audit every "view as user" session; remove client names from web addresses; restrict which client fields office staff can change; map database errors to safe messages; add security headers | HIPAA exposure on a lost phone, unaudited access to charts, PHI in logs | — | 3 days |
| 0.9 Field data safety | Notes are never discarded when the server is briefly unreachable; failed items are shown to staff until resolved; an expired login no longer erases unsynced work; the server validates every field it receives | A signed progress note must never be lost on a phone | 0.1 | 3 days |

### Phase 1 — Launch data model, one database change (about 3 days)

| Item | What it is | Depends on | Effort |
|---|---|---|---|
| 1.1 Launch tables | Client contact/guardian/waiver/status fields; intake and renewal requirement tables; incident review fields; attendance; person-centered profile and goals; note addenda; note lock after billing; document types for client paperwork and staff credentials | Phase 0 | 3 days |

Shipping all of it in one migration means a single production maintenance window.

### Phase 2 — Complete the launch features (about 6 weeks; two developers in parallel)

| Item | What it is | Why it matters to DLS | Depends on | Effort |
|---|---|---|---|---|
| 2.1 Client records | A client page with demographics, authorizations, physician orders, paperwork, attendance, profile and notes tabs; edit and deactivate; capture the residence location | The system cannot run a caseload if a client can never be opened or corrected | 1.1 | 6 days |
| 2.2 Intake and yearly renewal paperwork | Required-document checklist per client; each item has a due date, status and attached file; completing a yearly item automatically schedules next year's; reminders to management at 30/14/3 days; badges on the roster and dashboard | Replaces the spreadsheet chase; renewals stop being discovered after they lapse. Your actual forms plug in as configuration, not code | 2.1 | 5 days |
| 2.3 Incident reporting for management review | Full report (when, where, who, injuries, witnesses, supervisor notified, external reporting); review and close with a written resolution; management notified on submission; works with no signal and syncs later | Abuse/neglect and critical incidents are a regulatory obligation; a report must not depend on cell coverage | 1.1, 0.9 | 5 days |
| 2.4 Notes oversight | Management can open any note (narrative, goals, signatures, units); billed notes are locked; corrections are added as dated addenda; goals come from each client's plan | Audit-ready documentation and no silent edits after billing | 1.1, 2.6 | 3 days |
| 2.5 Attendance records (v1) | Attendance fills itself from completed visits; management can mark absences and reasons; monthly per-client record and export | Gives you the attendance record now; refined once DLS supplies its sample | 1.1 | 3 days |
| 2.6 Person-centered profile (v1) | Profile sections (about me, likes/dislikes, strengths, communication, support needs) and a goals list per client; field staff read it on the visit screen | Staff walk in knowing the person; notes track real goals instead of a generic list. Refined once DLS supplies its sample | 1.1 | 3 days |
| 2.7 Staff credential documents and automation | Attach certificates to credentials; nightly automated reminders for expiring licenses and trainings | Expiry reminders currently never run because nothing schedules them | 0.5 | 2 days |
| 2.8 Relias | Nightly completion sync with a visible "last synced"; training-overdue blocking that also catches staff who never took a required course; single sign-on stays off until Relias provides real settings | Training compliance status flows in automatically | 0.4, plus Relias API access and BAA from DLS | 3 days |

### Phase 3 — Billing hardening before the first real claim (about 1.5 weeks)

| Item | What it is | Why it matters | Effort |
|---|---|---|---|
| 3.1 Valid claim file | Correct the 837P file format and make the test prove it | Today's file would be rejected outright by the clearinghouse | 1 day |
| 3.2 Safe export order | Build the file first, then mark notes billed, in one step; fail loudly if the file cannot be saved | Prevents notes disappearing from the billing queue with no claim | 2 days |
| 3.3 Attendance evidence | When EVV is on, a note without clock-in evidence is not claim-ready; when off, it is flagged | Aligns claims with the EVV mandate as it applies to DLS | 1 day |
| 3.4 Configuration checks | Refuse to export with placeholder NPI, address or tax ID | A misconfigured server must not produce a plausible-looking claim | 1 day |
| 3.5 Real fee schedule and test run | Load Colorado Medicaid and DVR rates; run one batch through the clearinghouse validator; one parallel billing cycle against your current process | Confirms the numbers before real money moves | 1 day plus DLS input |
| 3.6 Authorization units | Enforce weekly caps in the unit your authorizations actually use, once confirmed | Avoids caps that are too loose or too tight | 1 day |

### Phase 4 — After launch (switched on per need)

- EVV/GPS: clock-out checks, telephony verification, Sandata certification and a durable submission queue.
- Medication administration (eMAR): QMAP credential check before administering.
- Scheduling: double-booking prevention, weekend view, recurring-template corrections.
- Payroll transmittal: "all notes in?" should check notes, documented rounding policy, manual corrections flowing to timesheets.
- QA flags accuracy; document download and upload safeguards; monthly report formats against the state templates (templates needed from DLS).
- Lost-device protocol completion: PIN/biometric lock and remote wipe (required before the real-PHI pilot, as previously agreed).
- Automated test coverage for billing readiness, payroll, QA and sync.

**Rough total for Phases 0–3: 60–70 developer-days.** One developer: about 13 weeks. Two developers: about 7–8 weeks.

---

## What we need from DLS

1. **Roles.** Confirm the three tiers: Super Admin (vendor), Admin/Owner, and two employee roles (office/scheduler and field staff), or a single employee role.
2. **Vendor access.** Confirm that the Super Admin has no standing access to client records, and can view them only during a support window you open, which is logged.
3. **Intake paperwork.** It is checked on the diagram but not in the written list. Include it at launch? Which documents make up the intake packet and the yearly renewal packet?
4. **Authorizations.** Are weekly authorizations issued in hours or units? Which rounding rule applies to the codes you bill? Is your authorization week Sunday–Saturday?
5. **Samples.** The attendance record and person-centered profile samples. Should we build the generic version now and refine, or wait?
6. **Incident review.** Who reviews incidents, what statuses and timelines you need, and whether county/state reporting should be tracked in the system.
7. **Hosting.** Replit (current setup) or Vercel?
8. **Relias.** API credentials, the completion data format, and which single sign-on method Relias supports for DLS.
9. **Schedule at launch.** Confirm the schedule board ships on, since notes and billing depend on visits. Tracked as backlog item [BL-001](./BACKLOG.md#bl-001).
10. **Written feedback and samples.** Any owner feedback notes or requirement documents you have, plus the attendance-record and person-centered-profile samples, so we can file them in the project and re-check this plan against them. Tracked as backlog item [BL-002](./BACKLOG.md#bl-002).
