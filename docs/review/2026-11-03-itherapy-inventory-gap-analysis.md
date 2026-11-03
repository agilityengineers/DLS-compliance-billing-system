# iTherapy feature inventory vs. the DLS Portal — Client and Billing gap analysis

**Date:** 2026-11-03. **Audience:** the DLS owner and Melissa. **Companions:** [roadmap](./2026-09-roadmap.md) · [work plan](./WORKPLAN.md) · [backlog](./BACKLOG.md) · [feature-opportunity review](./2026-09-feature-opportunity-review.md) · [inventory snapshot](../requirements/2026-11-03-itherapy-feature-inventory.csv) (the Google Sheet *iTherapy_Feature_Inventory_Durable_Life_Skills*, Feature Inventory tab, as of this date).

## What this is

Melissa's inventory lists every screen, field and button in the iTherapy account DLS uses today: 344 rows across 15 modules, with Keep / Drop / Maybe, Priority and notes columns for her to fill in (all still empty at the time of this snapshot). This document puts the portal next to each row for the two modules the build is focused on, **Client** (101 rows) and **Billing** (30 rows), so the conversation can be about decisions rather than discovery.

Think of iTherapy as the old house DLS is moving out of and the portal as the new one still being built. The inventory is the box list. This document walks each box to a room in the new house and says whether the room exists, is framed, or is still on the plans.

Status words used below:

- **Built** — works in the portal today.
- **Partial** — some of it exists; the note says what is there and what is not.
- **Missing** — nothing in the portal. The *Roadmap / ref* column points at the roadmap item, decision or review recommendation that already covers it, or says *ask* when Melissa's answer decides whether it is needed, or *drop?* when iTherapy itself showed no use.

## The headline

| Module | Rows | Built | Partial | Missing |
|---|---|---|---|---|
| Client | 101 | 3 | 22 | 76 |
| Billing | 30 | 1 | 8 | 21 |

Three things frame every row that follows.

1. **Nothing on the client can be opened.** The roster lists clients and the intake form creates them, but there is no client page: no edit, no status change, no files, no orders. Roadmap 2.1 is that page, and most of the Client module's 101 rows are tabs on it. Until it exists, every other client feature has nowhere to live.
2. **Billing runs on practice data.** Clients, leads, user accounts, feature switches and the credential rules are in the real database. Visits, progress notes, physician orders, the fee schedule and the claim ledger are still the in-browser demo dataset (see `replit.md`, *Architecture decisions*, and backlog BL-003). The Billing screen, the readiness blockers and the 837P export all work, but against synthetic notes. Moving those records to the database (roadmap 1.1 / 2.1) is the prerequisite for anything on the Billing tab being real.
3. **The existing plan already names most of the gaps.** The roadmap's Phase 1–3 items (client page, paperwork, notes oversight, profile and goals, billing hardening) and the feature-opportunity review's recommendations (authorizations as records, note approval, claim lifecycle status) line up with the inventory's biggest holes. Melissa's Keep / Drop decisions can be mapped straight onto those items rather than starting a new list.

## Client module (rows 41–141)

| # | iTherapy feature (screen) | What the portal has today | Status | Roadmap / ref |
|---|---|---|---|---|
| 41 | **Filters** (Client List)<br><small>Client, Site Name, Client Status, Payer, Program</small><br><small>*Observed: ~36 active / 71 total clients*</small> | Text search on name or Medicaid ID only. No status, site, payer or program filter; the portal has no site or program concept. | Partial | 2.1 |
| 42 | **Client Status values** (Client List)<br><small>Active, Deceased, Discharge, Imported, Inactive, Interim, Referral</small><br><small>*Observed: ~36 active / 71 total clients*</small> | Active / Inactive on real records (not shown on the roster). 'Referral' lives in the Leads funnel (New → Contacted → Consultation → Qualified → Converted / Closed). Deceased, Discharge, Interim, Imported: none. | Partial | 2.1 |
| 43 | **Columns** (Client List)<br><small>Photo, Last/First/Middle Name, Member ID (masked), Date of Birth, Actions</small><br><small>*Observed: ~36 active / 71 total clients*</small> | Name (last, first), Medicaid ID (not masked), age (not DOB), diagnosis count, authorization, case manager / CCB, plan window. No photo, no middle name, no actions column. | Partial | 2.1 |
| 44 | **Row actions** (Client List)<br><small>Client Profile, Client Files, Print, Print Excel</small><br><small>*Observed: ~36 active / 71 total clients*</small> | A client cannot be opened at all: there is no client detail page, no files view, no print, no Excel export. The roster is read-only. | Missing | 2.1 (the biggest single gap) |
| 45 | **Options menu** (Client List)<br><small>Contacts, Staff Messages, Protocol files, Preference files, Meaningful Day, Add Prior Auth, Edit Staff Mapping, Care Level, Delete, Site Mapping, Client Dynamic Forms, Training Forms</small><br><small>*Observed: ~36 active / 71 total clients*</small> | None of the twelve. Closest: staff assignment happens on the schedule board; the website-inquiry form editor is a small form builder that could grow into 'Client dynamic forms'. | Missing | 2.1, 2.2 |
| 46 | **Add Client button** (Client List)<br><small>Opens Client Intake Form</small><br><small>*Observed: ~36 active / 71 total clients*</small> | New client intake at /admin/clients/new; also opened from an inquiry (Leads → Convert), which pre-fills name, email and phone. | Built |  |
| 47 | **Admission Date** (Client Intake Form - Personal Information)<br><small>Required</small> | No admission date. Service plan start / end exist, which is a different thing. | Missing | 1.1 |
| 48 | **Account Code** (Client Intake Form - Personal Information) | No account code. | Missing |  |
| 49 | **First / Middle / Last Name** (Client Intake Form - Personal Information)<br><small>First & Last required</small> | First and last name; no middle name. | Partial | 1.1 |
| 50 | **Assist ID** (Client Intake Form - Personal Information) | No Assist ID (an Arizona-era iTherapy field; confirm it is unused). | Missing | drop? |
| 51 | **EIN** (Client Intake Form - Personal Information) | No EIN on the client. | Missing | drop? |
| 52 | **Pharmacy Integration ID** (Client Intake Form - Personal Information) | No pharmacy integration ID. | Missing | drop? |
| 53 | **Social Security #** (Client Intake Form - Personal Information) | No SSN. Storing one needs encryption at rest; Medicaid claims do not need it. | Missing | ask |
| 54 | **Guardianship Status** (Client Intake Form - Personal Information)<br><small>Not applicable, Guardian, Court appointed</small> | No guardianship status. | Missing | 1.1 (guardian) |
| 55 | **Date of Birth** (Client Intake Form - Personal Information)<br><small>Required</small> | Date of birth, required, with calculated age. | Built |  |
| 56 | **Gender** (Client Intake Form - Personal Information)<br><small>Male / Female; required</small> | No gender field. The 837P claim sends 'U' (unknown) in the DMG segment because of it. | Missing | 1.1 (needed for claims) |
| 57 | **Gender Identity** (Client Intake Form - Personal Information) | No gender identity. | Missing | ask |
| 58 | **Program** (Client Intake Form - Personal Information) | No program. The four visit types (SCC, Job Coaching, Day Habilitation, Early Intervention) act as the service list. | Missing | ask |
| 59 | **Client Status** (Client Intake Form - Personal Information)<br><small>Required</small> | Status defaults to Active and cannot be changed from any screen. | Partial | 2.1 |
| 60 | **Discharge Date** (Client Intake Form - Personal Information) | No discharge date. | Missing | 1.1 |
| 61 | **Marital Status** (Client Intake Form - Personal Information)<br><small>Divorced, Married, Other, Separated, Single, Widowed</small> | No marital status. | Missing | ask |
| 62 | **Ethnicity** (Client Intake Form - Personal Information) | No ethnicity. | Missing | ask (census reporting?) |
| 63 | **Tribe** (Client Intake Form - Personal Information) | No tribe. | Missing | ask |
| 64 | **Race** (Client Intake Form - Personal Information) | No race. | Missing | ask (census reporting?) |
| 65 | **Religion** (Client Intake Form - Personal Information) | No religion. | Missing | ask |
| 66 | **Email** (Client Intake Form - Personal Information) | Email on the record and the intake form. | Built |  |
| 67 | **Phone (Home / Cell / Work)** (Client Intake Form - Personal Information) | One phone number, no home / cell / work split. | Partial | 1.1 |
| 68 | **Food Textures** (Client Intake Form - Personal Information) | No food textures. | Missing | ask (day hab?) |
| 69 | **Fluid Consistencies** (Client Intake Form - Personal Information) | No fluid consistencies. | Missing | ask (day hab?) |
| 70 | **Eating Guideline** (Client Intake Form - Personal Information) | No eating guideline. | Missing | ask (day hab?) |
| 71 | **Behavior Management (BSP) + comment** (Client Intake Form - Personal Information) | No behavior support plan flag or comment. | Missing | 2.6? |
| 72 | **Client photo** (Client Intake Form - Personal Information) | No client photo. | Missing |  |
| 73 | **Name, Address, Phone, State, City, Zip** (Client Intake Form - Responsible Party) | No responsible party / guardian contact at all. | Missing | 1.1 (guardian, contact) |
| 74 | **Height (ft/in), Weight** (Client Intake Form - Physical Characteristics) | No height / weight. | Missing | ask |
| 75 | **Skin Integrity** (Client Intake Form - Physical Characteristics) | No skin integrity. | Missing | ask |
| 76 | **Hair Color** (Client Intake Form - Physical Characteristics)<br><small>Auburn, Bald, Black, Blond, Brown, Gray/White, Red, Mix</small> | No hair color. | Missing | drop? |
| 77 | **Eye Color** (Client Intake Form - Physical Characteristics)<br><small>Brown, Blue, Hazel, Amber, Gray, Green, Dark Brown</small> | No eye color. | Missing | drop? |
| 78 | **Pharmacy Name, Contact Phone, Contact Email, Address 1/2, State, City, Zip** (Client Intake Form - Pharmacy Information) | No pharmacy details. | Missing | ask (eMAR) |
| 79 | **Name, Phone, Cell, Relation, Address, Email, State, City, Zip** (Client Intake Form - FIT Referral Source)<br><small>Relation: Family, Father, Guardian, Mother, Relative</small> | No FIT referral source. Confirm whether DLS runs Family Infant Toddler; the portal has an Early Intervention visit type. | Missing | ask |
| 80 | **Release Code** (Client Intake Form - Consents)<br><small>Required (e.g., Y - provider has signed statement)</small> | No release code. The claim hard-codes release of information = Y. | Missing | 3.x (claim) |
| 81 | **Signature Source Code** (Client Intake Form - Consents)<br><small>Required</small> | No signature source code. The claim hard-codes assignment / signature indicators. | Missing | 3.x (claim) |
| 82 | **HIPAA Policy Date** (Client Intake Form - Consents) | No HIPAA policy date. | Missing | 2.2 |
| 83 | **Consents file upload** (Client Intake Form - Consents) | No consents upload on the client. Field photo / document uploads exist but are not categorized. | Missing | 2.2 |
| 84 | **Consents Policy Agreement** (Client Intake Form - Consents) | No consents agreement checkbox. | Missing | 2.2 |
| 85 | **Referring Physician First/Last/Phone/NPI** (Client Intake Form - Consents) | Physician orders exist as a record type (order number, ordering physician, type, dates, document) but no screen creates one, and there is no NPI field. | Partial | 2.1 / BL-001 |
| 86 | **Screening Date** (Client Intake Form - Consents) | No screening date. | Missing | ask |
| 87 | **Populate Address from Site** (Client Intake Form - Client Address) | No address fields at all. Only a GPS point for the EVV geofence, and the intake form never captures it. | Missing | 1.1 |
| 88 | **Address 1, State, County, City, Zip, Time Zone** (Client Intake Form - Client Address)<br><small>Required</small> | No address, county, city, zip or time zone. The 837P subscriber loop currently sends no address. | Missing | 1.1 (needed for claims) |
| 89 | **School District** (Client Intake Form - Client Address) | No school district. | Missing | ask |
| 90 | **Add County / Add City (inline)** (Client Intake Form - Client Address) | No reference lists for counties or cities. | Missing |  |
| 91 | **Policies table** (Client Intake Form - Insurance (Payer) tab)<br><small>Policy Type (Primary/Secondary), Payer, Member ID, Group #, PIMS ID, Alternate Medicaid ID, Status</small> | One free-text 'Insurance provider' plus the Medicaid ID. No primary / secondary policies, group number, PIMS ID or policy status. | Partial | 1.1 (waiver) |
| 92 | **Add/Edit/View/Delete Policy** (Client Intake Form - Insurance (Payer) tab)<br><small>Insurance phone, company name/address, consent date, policy holder name/SSN/relationship, plan frequency</small> | No policy add / edit modal. | Missing |  |
| 93 | **Linked billing codes / prior auth on policy** (Client Intake Form - Insurance (Payer) tab)<br><small>Billing code, Sites, Amount, Remaining, PA #, Start, End</small> | No billing codes or prior auth linked to a policy. | Missing | see Prior Authorizations |
| 94 | **SDS Billing Code** (Client Intake Form - Insurance (Payer) tab)<br><small>Self-directed services code</small> | No self-directed services code. iTherapy showed 0 SDS records. | Missing | drop? |
| 95 | **Staff Rates** (Client Intake Form - Insurance (Payer) tab) | No client-specific staff rates. Payroll works from hours only. | Missing | ask |
| 96 | **FIT Billing Code** (Client Intake Form - Insurance (Payer) tab) | No FIT billing code. | Missing | ask (FIT) |
| 97 | **Employer Name, Address 1/2, State, City, ZIP** (Client Intake Form - Employer tab) | The DVR employment notice form captures employer, position, wage, hours and supervisor per notice, but nothing is stored on the client record. | Partial | 2.1 |
| 98 | **Billing Diagnosis Codes** (Client Intake Form - Diagnosis Codes tab)<br><small>Code, Is Primary, Make Primary</small> | ICD-10 code + description list on intake. The first code is treated as principal on the claim; there is no explicit 'is primary' flag and no code validation. | Partial | 2.1 |
| 99 | **Census Diagnosis Codes** (Client Intake Form - Diagnosis Codes tab) | No census diagnosis codes. | Missing | ask |
| 100 | **Add New Diagnosis Code** (Client Intake Form - Diagnosis Codes tab)<br><small>Code, Description, Type</small> | Inline add (code + description). No type, no lookup against a code table. | Partial |  |
| 101 | **Takes Medications? + Current Medications** (Client Intake Form - General Information tab) | The eMAR module (preview, off by default) holds a medication list per client for the field app. Nothing on the intake form. | Partial | 4.2 |
| 102 | **Has Allergies? + Allergies** (Client Intake Form - General Information tab) | No allergies. | Missing | 1.1 / 2.6 |
| 103 | **Medical Concerns** (Client Intake Form - General Information tab) | No medical concerns. | Missing | 2.6 |
| 104 | **Supervision Requirements** (Client Intake Form - General Information tab) | No supervision requirements. | Missing | 2.6 |
| 105 | **General Information** (Client Intake Form - General Information tab) | No general information text. | Missing | 2.6 |
| 106 | **File upload with File Category** (Client Files)<br><small>Categories incl. Acknowledgement Forms, Birth Certificate, DVR Info, CSR Individualized Plan, etc.</small> | Documents screen lists field uploads, DVR notices and monthly reports by client. No categories (birth certificate, CSR plan, acknowledgements…), no per-client view. | Partial | 2.2 |
| 107 | **Start / End date** (Client Files) | No start / end (expiry) dates on files. | Missing | 2.2 (renewals with 30/14/3-day reminders) |
| 108 | **Files table** (Client Files)<br><small>File, Category, Size, Start, End, Action</small> | One agency-wide documents table (file, kind, client, uploader, date, sync status). | Partial | 2.2 |
| 109 | **Meaningful Day Definition** (Meaningful Day)<br><small>Per client</small> | No meaningful day definition. | Missing | 2.6? |
| 110 | **Care Level, Level Description** (Care Level) | No care level. | Missing | ask |
| 111 | **Client-to-site mappings** (Site Mapping)<br><small>Site, Start/End date-time, Custom Service, Missing Note Days, MN Start/End Time</small> | No sites, so no site mapping. Visits happen at the client's residence or in the community. | Missing | ask |
| 112 | **Add / Edit / Remove mapping** (Site Mapping) | — | Missing | ask |
| 113 | **Create Staff Message** (Client Staff Messages)<br><small>Title, Type (Information, Action Needed, Important, Urgent), Message</small> | No client staff messages. | Missing | ask |
| 114 | **New Dynamic Form (questionnaire)** (Client Dynamic Forms) | No dynamic forms for clients. The lead-form editor (short text, long text, email, phone, select, yes/no) is the seed of one. | Missing | later |
| 115 | **Forms list** (Client Dynamic Forms)<br><small>Date, Questionnaire</small> | No forms list per client. | Missing | later |
| 116 | **Add Client Training / Staff Requirements** (Client Training Forms) | No client-specific training requirements for staff. Staff credentials and Relias training are agency-level. | Missing | ask |
| 117 | **Filters** (Client Training Forms)<br><small>Training Status, Expiration (7/30/60/90 days/Expired), Presentation From/To</small> | — | Missing | ask |
| 118 | **Day / Week / Month views** (Calendar) | Week view only (staff × weekday grid). No day or month view. | Partial | 4.3 |
| 119 | **Appointment form** (Calendar)<br><small>Title, Appointment Type (Doctor appointment, Service), Staff, Site, Client, Medical Contact, Service, Payer, Description, Date, Time-in/out</small> | A visit has client, staff, service type, start / end and a physician order. No title, appointment type, site, medical contact or payer. | Partial | 4.3 |
| 120 | **Recurring appointments** (Calendar)<br><small>Repeats, Repeat every, Repeat on, End Date; edit this / following / all</small> | Weekly recurring templates generate the week's visits (preview, off by default). No end date, no 'edit this / following / all'. | Partial | 4.3 |
| 121 | **Assign Staff / Assign Payer / Assign staff to all recurring** (Calendar) | Reassign staff: yes. Assign payer: no. | Partial |  |
| 122 | **Filters** (Calendar)<br><small>Staff, Client, Appointment Type, Service, Note Status, Only my appointments, Only EVV appointments</small> | No filters on the schedule board. | Missing | 4.3 |
| 123 | **Note status legend** (Calendar)<br><small>In Progress, Assigned, Unapproved, Approved, Posted, Cancelled, Rejected, EVV Open, EVV Scheduled</small> | Visit statuses Scheduled / In progress / Completed / Cancelled / Billed. No approval states (the portal has no note-approval step; QA flags instead). | Partial | 2.4 |
| 124 | **Plan list + filters** (Outcome/Action Steps (Treatment Plans))<br><small>Client, Expiration, Service, Draft; cols Client, Start, End, Services, Description</small><br><small>*Observed: No current (non-expired) plans at review; only expired ones*</small> | No treatment plans. Notes carry free-text goals. iTherapy had only expired plans at review. | Missing | 2.6 |
| 125 | **Add Plan** (Outcome/Action Steps (Treatment Plans))<br><small>Client, Start Date, End Date, Services, Title; Save as Draft / Save</small><br><small>*Observed: No current (non-expired) plans at review; only expired ones*</small> | — | Missing | 2.6 |
| 126 | **Edit / Duplicate / Delete plan** (Outcome/Action Steps (Treatment Plans))<br><small>*Observed: No current (non-expired) plans at review; only expired ones*</small> | — | Missing | 2.6 |
| 127 | **Outcomes / Goals** (Outcome/Action Steps (Treatment Plans))<br><small>Add/Edit/Delete outcomes per plan</small><br><small>*Observed: No current (non-expired) plans at review; only expired ones*</small> | No outcomes / goals per plan. | Missing | 2.6 |
| 128 | **Objectives / Action Steps** (Outcome/Action Steps (Treatment Plans))<br><small>Description, Test Frequency, Is Active, Is Required, Global scales; View TSS, Scale, Print, Email TSS</small><br><small>*Observed: No current (non-expired) plans at review; only expired ones*</small> | No objectives / action steps. | Missing | 2.6 |
| 129 | **Objective - Action Definition** (Outcome/Action Steps (Treatment Plans))<br><small>Description, Is Active, Is Required, Frequency, Floating (no billing code needed), On Hold Reason, Billing Codes</small><br><small>*Observed: No current (non-expired) plans at review; only expired ones*</small> | — | Missing | 2.6 |
| 130 | **Objective - Teaching & Support Strategies (TSS)** (Outcome/Action Steps (Treatment Plans))<br><small>TSS State (Original/Modified/Discontinued/Met), dates, ISP meeting/effective dates, Life Area Vision, IDT members, target dates, teaching frequency, when to implement, assistive tech, therapies, task analysis, baseline, skills to develop</small><br><small>*Observed: No current (non-expired) plans at review; only expired ones*</small> | No teaching & support strategies. | Missing | later |
| 131 | **Filters** (Out of Service Logs)<br><small>Site, Client, Activity (Out of Service reason types), From/To, Manually Created, Open</small> | No out-of-service log. A visit can be cancelled with a reason from the field app, which feeds the monthly SLS billing note. | Missing | ask |
| 132 | **Log list** (Out of Service Logs)<br><small>Time Out/In, Client, Staff Out, Staff In, Activity, Remarks, Hours, Created By</small> | — | Missing | ask |
| 133 | **Add Log Entry** (Out of Service Logs) | — | Missing | ask |
| 134 | **Filters** (Prior Authorizations)<br><small>Site, Client, Billing Code, Payer, Expiration, Ratio Only, Client Status</small> | Authorizations are four weekly caps on the client row (SCC, Job Coaching, Day Hab, Early Intervention hours; NMT trips). No list screen, no filters. | Partial | 3.6 / opportunity review #3 |
| 135 | **PA list** (Prior Authorizations)<br><small>Client, Auth#, Payer, Code, Start, End, Imported Units/Qty, Units Left, Qty, Rate, Amount, Unit, Freq</small> | No auth number, payer, code, start / end, approved units, units left, rate or amount. The Reports screen shows units delivered vs authorized for the current week. | Partial | 3.6 / #3 |
| 136 | **View / Edit / Duplicate / Delete** (Prior Authorizations) | No view / edit / duplicate / delete of an authorization. | Missing | #3 |
| 137 | **Import Prior Authorization from file** (Prior Authorizations) | No import from file. | Missing | later |
| 138 | **Utilization Overview** (Prior Authorizations) | Reports: units delivered vs authorized this week, per client and service, with over-authorization highlighted. | Partial |  |
| 139 | **Ratio prior auth** (Prior Authorizations) | No ratio prior auth. | Missing | ask |
| 140 | **Add PA form** (Prior Authorizations)<br><small>Client, Sites, Billing Code, County Tax Rate, Diagnosis Codes, Start/End, Approved Qty, Rate, Amount, Init. Utilization Factor, PA #, Daily Billing Code/PA#/Qty, Plan Frequency</small> | No PA form. The authorization table (auth number, period, total units, weekly cap, unit basis) is designed but not built; open decision D-04 (hours vs units) gates it. | Missing | #3 / D-04 |
| 141 | **PA flags** (Prior Authorizations)<br><small>Permit Over-Budget Billing, Permit Time Overlaps on Notes, Pending, Exclude From Submission, Monthly Consumption</small> | No PA flags. Claims over the weekly cap are blocked; nothing can permit over-budget billing or exclude an auth from submission. | Missing | #3 |

## Billing module (rows 167–196)

| # | iTherapy feature (screen) | What the portal has today | Status | Roadmap / ref |
|---|---|---|---|---|
| 167 | **Filters** (Billing (Note Posting))<br><small>Month, Site, Client, Exclude services, Service, Billing Code, Status, Payer, Only Max Units, From/To</small> | The Billing screen lists every unbilled note with no filters. The readiness engine accepts a date range but the page does not expose it. | Missing | small |
| 168 | **Post / Post All** (Billing (Note Posting))<br><small>Progress bars for posting</small> | 'Select all ready' + 'Export 837P (n)'. Export is one two-phase step: reserve a control number, build the file, then mark notes billed, so a note is never billed without a stored file. Blocked notes come back with their reasons. No progress bar. | Partial | 3.2 (built) |
| 169 | **Columns** (Billing (Note Posting))<br><small>Note Date/Time, Service, Units</small> | Client, Medicaid ID, date, service type, units, charge, claim status with named blockers (missing signature, expired credential, over authorization, no physician order). | Built |  |
| 170 | **Code list** (Billing Codes)<br><small>Payer, Code, Description, Billing Unit, Rate, Freq (~60 codes)</small><br><small>*Observed: Steps 2-5 not visible without saving*</small> | A fee-schedule table exists (payer, visit type, procedure code, one modifier, rate per unit, effective / end date) with four demo rows: T2021, H2023, T2021-HQ, T1027. No screen; real Colorado Medicaid and DVR rates are go-live item R4.3. | Partial | R4.3 |
| 171 | **Filters** (Billing Codes)<br><small>Include Archived, Service, Payer</small><br><small>*Observed: Steps 2-5 not visible without saving*</small> | No filters (no screen). | Missing |  |
| 172 | **Add / Edit / Duplicate / Delete / Archive** (Billing Codes)<br><small>*Observed: Steps 2-5 not visible without saving*</small> | No add / edit / duplicate / delete / archive of a billing code. | Missing | needs a screen |
| 173 | **Duplicate or delete codes by payer** (Billing Codes)<br><small>*Observed: Steps 2-5 not visible without saving*</small> | No bulk actions by payer. | Missing |  |
| 174 | **Add Billing Code wizard (step 1 of 5)** (Billing Codes)<br><small>Code, EVV Code, Modifiers 1-4, Billing Unit, Billing Frequency, Payer, Payer Rate, Federal, State, Description, Service</small><br><small>*Observed: Steps 2-5 not visible without saving*</small> | No wizard. The model has one modifier, no EVV code, no billing frequency, no federal / state split, and the unit is hard-wired to 15 minutes with the 8-minute rounding rule. | Missing | D-04 / 3.6 |
| 175 | **Billing code options** (Billing Codes)<br><small>Allow 0 in submission, Shared billing, Payitems (OT, weekend diff), Management reimbursement, Date range billing, Hourly/Daily ratio & billing, Ratio index</small><br><small>*Observed: Steps 2-5 not visible without saving*</small> | None of the options (allow 0, shared billing, overtime / weekend pay items, management reimbursement, date-range billing, ratio billing). | Missing | ask which matter |
| 176 | **Linked documentation reports** (Billing Codes)<br><small>~30 note templates (Progress note, Sleep Log, DVR forms, ES case notes, Task Analysis, ABC, Seizures...)</small><br><small>*Observed: Steps 2-5 not visible without saving*</small> | One progress-note form (narrative, goals, dual signatures) plus a job-coaching log and an NMT trip log. No library of ~30 templates and no code-to-template link. | Partial | ask which templates DLS uses |
| 177 | **Facility Codes** (Billing Codes)<br><small>*Observed: Steps 2-5 not visible without saving*</small> | Place of service is hard-coded to 12 (home) on every claim line. | Partial | 3.x |
| 178 | **Documentation Requirements** (Billing Codes)<br><small>*Observed: Steps 2-5 not visible without saving*</small> | Readiness checks signatures, physician order, credentials and the weekly cap on every note. The credential rules are admin-configurable (Requirements screen); the rest are fixed, not per code. | Partial |  |
| 179 | **Self-directed services note posting** (SDS Billing)<br><small>Same filters as Billing; Post All</small><br><small>*Observed: 0 records seen*</small> | No self-directed services posting. iTherapy showed 0 records. | Missing | drop? |
| 180 | **Family-based calendar** (Calendar Billing)<br><small>Month, Site, Client, Service, Units (0/0.5/1.0), Prior Auth; Submit Units</small> | No family-based calendar billing (FIT). | Missing | ask (FIT) |
| 181 | **Invoice list** (Invoices (contractor invoices))<br><small>Invoice#, Staff, Invoice Date, Paid, Total, Status (Draft/Approved/Posted)</small><br><small>*Observed: Invoices are for paying contractor staff, not billing payers*</small> | No contractor invoices. Staff pay runs through the payroll transmittal (preview): hours, overtime and certification per employee per pay period. | Missing | ask: does DLS pay contractors? |
| 182 | **Approve / Post all or selected; Delete selected** (Invoices (contractor invoices))<br><small>*Observed: Invoices are for paying contractor staff, not billing payers*</small> | — | Missing | ask |
| 183 | **Edit Invoice** (Invoices (contractor invoices))<br><small>Invoice Date, Date Paid, Total, Not Exceed Amount</small><br><small>*Observed: Invoices are for paying contractor staff, not billing payers*</small> | — | Missing | ask |
| 184 | **Prepare Invoice** (Invoices (contractor invoices))<br><small>Month, Contractors, Client, Service, Billing Code, Staff Status, Only FIT Billing, Not Exceed Amount, Invoice Date; uninvoiced items list</small><br><small>*Observed: Invoices are for paying contractor staff, not billing payers*</small> | — | Missing | ask |
| 185 | **Report** (Invoice Details)<br><small>Invoice#, Staff, Staff Acct Code, DOS, Client, Client Acct Code, Billing Code, Calculation, Units, Hours, Rate, Amount</small> | No invoice-detail report. The payroll transmittal has per-employee lines, not per date-of-service / client / rate. | Missing | ask |
| 186 | **Balance by payer** (Payer Balances)<br><small>Payer, Paid, Denied, Unallocated, UnSubmitted</small> | No payer balances. The claim ledger records what went out and nothing about paid, denied or unallocated. | Missing | opportunity review #7 |
| 187 | **Create Submission / Add Payment** (Payer Balances) | — | Missing | #7 |
| 188 | **Payment list** (Payments)<br><small>Payer, Date, Deposit Date, Amount, Reconciled, Reversal, Net, Remittance #, Check #, Submissions</small> | No payments. | Missing | #7 or QuickBooks hand-off |
| 189 | **Add Payment** (Payments)<br><small>Payer, Payment Date, Amount, Remittance #, Check #, Date of Deposit</small> | No add payment. | Missing | #7 or QuickBooks hand-off |
| 190 | **Allocations** (Payments) | No allocations. | Missing | #7 or QuickBooks hand-off |
| 191 | **835 (ERA) file upload** (Reconcile)<br><small>RA Number, RA Date</small><br><small>*Observed: 0 files*</small> | No 835 remittance upload. iTherapy showed 0 files. A QuickBooks adapter stub exists as the seam for an accounting hand-off. | Missing | ask who reconciles today |
| 192 | **FIT reconcile file upload** (Reconcile FIT)<br><small>*Observed: 0 files*</small> | No FIT reconcile. iTherapy showed 0 files. | Missing | drop? |
| 193 | **Submission list** (Submissions (837P claims))<br><small>Submission #, Receiver, Payer, Client, Service, Start, Cut Off, Billed, Paid, PMPM</small><br><small>*Observed: 0 submissions in default view*</small> | Export history: timestamp, control number, note count, units, charge, payer. No receiver, client / service, cut-off, billed / paid status or PMPM. | Partial | #7 |
| 194 | **Add Submission** (Submissions (837P claims))<br><small>Payer, Test Mode, Client, Service, Start Date, Cut Off Date; Preview</small><br><small>*Observed: 0 submissions in default view*</small> | Export = select ready notes → file downloads. Colorado Medicaid adapter only (no payer choice), no test mode (ISA15 is always P), no date range, no on-screen preview (a pretty-printer exists but has no screen). | Partial | 3.5 |
| 195 | **Excluded Claims** (Submissions (837P claims))<br><small>*Observed: 0 submissions in default view*</small> | Blocked notes are listed with reasons on the same screen; there is no manual 'exclude from submission' flag. | Partial |  |
| 196 | **Voided and Corrected Claims** (Submissions (837P claims))<br><small>*Observed: 0 submissions in default view*</small> | No voided or corrected claims (no claim frequency code 7 / 8, no resubmission path). | Missing | #7 |

Billing-adjacent rows that iTherapy files elsewhere: the Budget Report module (18 reports on PA units, denials, payments and reconciliation) and the dashboard tiles for unbilled invoices and billable notes. The portal has the weekly utilization report and a "claim-ready notes" card; everything else in that module depends on the authorization and payment records that are missing above.

## Questions that change what gets built

Each of these is a decision only DLS can make, and each one moves whole blocks of rows between *build* and *drop*.

1. **Client statuses.** iTherapy offers seven (Active, Deceased, Discharge, Imported, Inactive, Interim, Referral). Which ones does DLS actually use, and does 'Referral' belong in the Leads funnel or on the client? (rows 42, 59, 60)
2. **Sites and programs.** iTherapy lists 9 sites and a Programs list. Are these physical locations DLS still needs, or payer programs? The portal has no site concept because visits happen at the client's home or in the community. (rows 41, 58, 87, 111–112)
3. **Family Infant Toddler.** Does DLS deliver FIT / early intervention? If not, every FIT row can be dropped (79, 96, 180, 192 and the whole FIT module).
4. **Self-directed services.** iTherapy showed zero SDS records. Drop rows 94 and 179?
5. **Contractors.** Does DLS pay 1099 contractors through invoices (rows 181–185), or are all staff on payroll? Payroll transmittal covers employees already.
6. **Payments and remittances.** Who reconciles 835 remittance advice today? iTherapy had zero uploaded files. The choice is between building accounts receivable in the portal (rows 186–191) and handing claims to QuickBooks through the existing adapter seam.
7. **Which intake fields matter.** Assist ID, AHCCCS ID and EIN look like Arizona-era vestiges; SSN raises an encryption question; race, ethnicity, tribe and religion only matter if a census report needs them. Which of rows 47–78 are filled in today?
8. **Treatment plans and goals.** iTherapy had only expired plans. Where do ISP goals live today, and should notes draw their goals from the client's plan? This sets the scope of roadmap 2.6 (person-centered profile and goals).
9. **Prior authorizations.** Are authorizations issued in hours or units, weekly or per period, and with a PA number? A sample PA letter would settle open decision D-04 and the authorization table design.
10. **Note approval.** Does a supervisor approve notes before they are posted (iTherapy's Unapproved / Approved / Rejected)? The portal has no approval step today, only QA flags; adding one changes when billing can run.
11. **Billing codes.** Can Melissa export iTherapy's ~60 billing codes (Export to Excel) so the fee schedule is seeded from real codes, modifiers and rates? (rows 170–176)
12. **Client files.** Which file categories and expiry intervals does DLS track (row 106: acknowledgement forms, birth certificate, DVR info, CSR plan…)? This is the intake / renewal checklist in roadmap 2.2 and decision D-03.

## A starting proposal for priority

This is a proposal to react to, not a plan. Row numbers point back at the tables above.

### Client tab

- **P1 — unblock the record.** Open, edit and deactivate a client (detail page, status set). Add the fields a claim and a chart need: address with county and zip, gender, responsible party / guardian, phone types, admission and discharge dates. Roadmap 1.1 + 2.1; rows 43–44, 47, 49, 54, 56, 59–60, 67, 73, 87–88.
- **P1 — authorizations as records.** Replace the four weekly caps with prior-authorization records (auth number, payer, code, period, approved and remaining units, weekly cap) and a utilization overview. Opportunity review #3, decision D-04; rows 93, 134–141.
- **P2 — paperwork and orders.** Per-client files with categories, start / end dates and renewal reminders (roadmap 2.2, decision D-03); a physician-order screen (BL-001); primary / secondary insurance policies; an 'is primary' flag on diagnoses. Rows 80–85, 91–92, 98, 106–108.
- **P2 — health and support details.** Medications (reuse eMAR), allergies, medical concerns, supervision requirements, behavior support flag on the record. Rows 71, 101–105.
- **P3 — plans and extras.** Treatment plans / goals (roadmap 2.6), client dynamic forms (grow the lead-form builder), staff messages, meaningful day, care level, calendar day / month views and filters. Rows 109–130, 113–115, 118–123.
- **Confirm or drop.** Site mapping, FIT referral source, SDS code, Arizona-era IDs, physical characteristics, pharmacy, food textures / fluids, employer tab, out-of-service logs, client training forms. Rows 50–52, 68–70, 74–79, 94–96, 111–112, 116–117, 131–133.

### Billing tab

- **P0 — make billing real.** Visits, notes, physician orders, the fee schedule and the claim ledger still live in the in-browser practice dataset; only clients, leads, accounts and credential rules are in the database. Until roadmap 1.1 / 2.1 moves them (backlog BL-003), everything on the Billing tab runs on demo data.
- **P1 — billing codes screen.** An admin screen for the fee schedule (payer, code, modifiers, unit, rate, effective dates) seeded from the real Colorado Medicaid and DVR codes (R4.3). Rows 170–175.
- **P1 — submissions with status.** A submissions list that carries receiver, payer, date range / cut-off, test mode and a status that moves submitted → accepted → paid / denied; on-screen preview before export; a manual exclude flag. Opportunity review #7, roadmap 3.1–3.5; rows 193–195.
- **P1 — posting filters.** Month, client, service, status and payer filters on the note-posting screen. Small. Row 167.
- **P2 — approval and corrections.** A supervisor approval step before posting if DLS wants one (opportunity review #4, roadmap 2.4); voided / corrected claims with frequency codes 7 and 8. Rows 123, 196.
- **P3 — money in.** Payments, allocations, payer balances and 835 upload, or hand claims to QuickBooks through the adapter stub. Decide with the remittance question above. Rows 186–191.
- **Confirm or drop.** SDS billing, calendar (FIT) billing, FIT reconcile, contractor invoices. Rows 179–185, 192.

## The other thirteen modules, in one line each

| Module (rows) | What the portal has |
|---|---|
| Dashboard (27 tiles) | Five stat cards: active clients, open leads, visits today, open QA flags, claim-ready notes; today's visits. iTherapy's note-approval, missing-note, mail and training tiles have no counterpart yet. |
| Global / Top Bar (13) | Login, role-based landing, Settings & users, feature switchboard. No internal mail, notifications bell, help buttons or 'export to Excel' on lists. |
| Notes (25) | Offline-first progress notes with live unit math and dual signatures on the field app; QA flags; no management note viewer, no approval / reject / transfer workflow, no missing-period reports (roadmap 2.4). |
| FIT (8) | Nothing. Confirm whether DLS runs Family Infant Toddler at all. |
| EVV (7) | GPS clock-in / out with geofence and an EVV review screen (preview); Sandata aggregator submission is in development. |
| Agency Management (11) | Incident reporting from the field (review workflow is roadmap 2.3); hash-chained audit trail; no task lists, agency files or acknowledgement records. |
| Reporting (12) | Units delivered vs authorized (weekly) and monthly SLS / DVR report documents (preview). No census, training or dynamic-form reports. |
| Budget Report (18) | Only the weekly utilization view. PA budgets, denials, payments and reconciliation reports depend on the authorization and payment records above. |
| Staff (14) | Staff & credentials with the configurable requirements registry, invitations, Relias course matrix. No contractor type, pay rate, demographics or hiring fields. |
| Time Keeping (2) | Weekly timesheets (route record) and payroll transmittal, both preview. |
| Mail (3) | No internal mail. |
| Security & Roles (10) | Three agency roles (Admin, Scheduler, Field Staff) plus provider roles, with per-role feature grants, versus iTherapy's 13 roles and 775 permissions. |
| Advanced Settings (63) | Reference lists exist only where a feature needed one (lead funnel stages, form questions, credential requirements). No general reference-list editor. |

## How this was produced

- The spreadsheet was exported through Google Drive on 2026-11-03 and filed as `docs/requirements/2026-11-03-itherapy-feature-inventory.csv` (backlog BL-002 asks for exactly this filing). Rows 1–340 came through intact; rows 341–344 (Advanced Settings › Training reference lists) were reconstructed from the export's string table and should be checked against the sheet.
- The Decision, Priority and Melissa's-notes columns were empty for every row at the time of the snapshot (the Summary tab showed 0 % decided).
- "What the portal has today" was read from the code on branch `main` at this date: the client roster, intake form and API (`artifacts/dls-cms/src/app/admin/clients`, `artifacts/api-server/src/routes/clients.ts`, `lib/db/src/schema/clients.ts`), the billing screen, readiness engine, payer adapter and 837P writer (`artifacts/dls-cms/src/app/admin/billing`, `artifacts/dls-cms/src/lib/billing`), the feature catalog (`lib/features/src/catalog.ts`) and the review documents linked above.
- Feature switches change what a given role sees; the table describes what exists in the code, not what is switched on for DLS today.
