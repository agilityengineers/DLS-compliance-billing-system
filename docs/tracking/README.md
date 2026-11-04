# Feature tracker — the iTherapy inventory against the portal

This folder is the living status of the project against Melissa's iTherapy
feature inventory. It is what to open at the start of any session that asks
"where are we", and what to update whenever a pull request lands or Melissa
decides something. The repository is cloned fresh into every cloud session,
so this is the copy a new chat can always reach.

## What is here

| File | What it is | Who edits it |
|---|---|---|
| `feature-tracker.csv` | All 344 inventory rows (Melissa's seven columns as she wrote them) plus the portal's five columns and her three decision columns. **The source of truth.** | Engineering updates the portal columns; Melissa's decisions are copied in from her sheet |
| `questions.csv` | The decisions only DLS can make, each with the rows it affects and a column for her answer | Engineering adds; Melissa's answers are copied in |
| `shipped.csv` | Every pull request that changed the picture, what it delivered, and the switches to turn on | Engineering, when a PR merges |
| `other-modules.csv` | One line per module outside the Client and Billing focus | Engineering |
| `build_tracker.py` | Renders the four CSVs into the workbook | Nobody by hand; run it |
| `iTherapy_Feature_Tracker.xlsx` | The rendered workbook: Summary with self-updating counts, Feature Inventory with dropdowns and colours, the other three tabs. **This is what gets shared.** | Regenerated, never edited |

The original inventory as exported from Melissa's Google Sheet on 2026-11-03
is kept unchanged at `../requirements/2026-11-03-itherapy-feature-inventory.csv`.
The reasoning behind the first scoring is in
`../review/2026-11-03-itherapy-inventory-gap-analysis.md`.

## The columns engineering owns

| Column | Values | Meaning |
|---|---|---|
| Portal status | `Built`, `Partial`, `Missing`, `Not assessed` | What the portal in `main` has for this row today |
| What the portal has now | prose | What exists and what does not, in words Melissa can check against the screen |
| Switch (Super Admin → Admin) | a catalog key, e.g. `clients.contacts` | The feature switch that controls it: the Super Admin makes it available, the Admin turns it on and grants roles |
| Delivered in | `PR #36`, `Existing`, … | Where it came from |
| Roadmap / ref | `2.2`, `D-04`, `ask`, `drop?`, `claim follow-up` | What covers the gap, or whose answer decides it |

## The columns Melissa owns

`Decision` (Keep / Drop / Maybe), `Priority` (Must have / Should have / Nice to
have / Later) and `Melissa's notes`. They are yellow in the workbook with
dropdowns, and the Summary tab counts them per module.

## How to update it

1. **A pull request merged.** Edit `feature-tracker.csv`: move the rows it
   affects to their new status and rewrite "What the portal has now" to match
   the screen. Add a line to `shipped.csv`. Keep `Delivered in` honest.
2. **Melissa answered something.** Put her Decision / Priority / notes into
   the matching rows of `feature-tracker.csv`, and her answer into
   `questions.csv`. Questions she has settled can be noted as settled rather
   than removed, so the history stays readable.
3. **Re-render.** `python3 docs/tracking/build_tracker.py` (needs `openpyxl`:
   `pip install openpyxl` if it is missing). Commit the CSVs and the workbook
   together.
4. **Share.** Upload the workbook to Google Drive next to Melissa's original
   and open it with Google Sheets; the tabs, formulas, colours and dropdowns
   survive the conversion. When she works in that Google Sheet, read her
   yellow columns back into the CSVs at the next update rather than editing
   the workbook by hand.

A quick way to read her sheet from a cloud session is the Google Drive
connector (`read_file_content` on the sheet's id); the original inventory's
id is `1mC_xXyZ4dGFUZiZ7yn1-aVi-tGP2BU7lgJtUaAfMmao`. Record the shared
copy's id here once it exists:

- Shared Google Sheet (Melissa's working copy): _not yet created_

## Scoring rules, so the statuses stay comparable

- `Built` means a person can do the thing on the screen today, in real
  sign-in mode, with the switch on. A field that is stored but has no screen
  is `Partial`.
- `Partial` always says what is missing in "What the portal has now".
- `Missing` with `ask` in the reference column is a question for Melissa,
  not a backlog item; do not schedule it until she answers.
- `Not assessed` is for modules outside the current focus. When a module
  comes into focus, score every row of it in one pass and remove the label.
- Rows that describe data the claim must carry (gender, address, NPI,
  authorization flags) are marked `claim follow-up` until the 837P writer
  reads them; the data being on the record is not enough.
