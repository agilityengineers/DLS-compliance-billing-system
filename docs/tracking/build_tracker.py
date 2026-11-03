#!/usr/bin/env python3
"""Render the feature tracker workbook from the CSVs beside this script.

    python3 docs/tracking/build_tracker.py            # writes docs/tracking/iTherapy_Feature_Tracker.xlsx
    python3 docs/tracking/build_tracker.py out.xlsx   # or somewhere else

The CSVs are the source of truth (edit them, commit them); the workbook is
what gets shared. It needs openpyxl. See README.md in this folder.
"""
import csv, datetime, pathlib, sys
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

HERE = pathlib.Path(__file__).resolve().parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "iTherapy_Feature_Tracker.xlsx"
DATE = datetime.date.today().isoformat()

def read(name):
    with open(HERE / name, newline="") as f:
        return list(csv.DictReader(f))

tracker = read("feature-tracker.csv")
questions = read("questions.csv")
shipped = read("shipped.csv")
other = read("other-modules.csv")

STATUSES = ["Built", "Partial", "Missing", "Not assessed"]
DECISIONS = ["Keep", "Drop", "Maybe"]
PRIORITIES = ["Must have", "Should have", "Nice to have", "Later"]

FONT = "Arial"
base = Font(name=FONT, size=10)
bold = Font(name=FONT, size=10, bold=True)
title = Font(name=FONT, size=14, bold=True, color="5A2D5C")
hdr_fill = PatternFill("solid", fgColor="5A2D5C")
hdr_font = Font(name=FONT, size=10, bold=True, color="FFFFFF")
yellow = PatternFill("solid", fgColor="FFF2CC")
fills = {
    "Built": PatternFill("solid", fgColor="D9EAD3"),
    "Partial": PatternFill("solid", fgColor="FCE5CD"),
    "Missing": PatternFill("solid", fgColor="F4CCCC"),
    "Not assessed": PatternFill("solid", fgColor="EEEEEE"),
}
thin = Side(style="thin", color="CCCCCC")
border = Border(left=thin, right=thin, top=thin, bottom=thin)
wrap = Alignment(wrap_text=True, vertical="top")
center = Alignment(horizontal="center", vertical="top", wrap_text=True)

def header(ws, row, labels, widths=None):
    for i, label in enumerate(labels, start=1):
        c = ws.cell(row=row, column=i, value=label)
        c.font = hdr_font; c.fill = hdr_fill; c.alignment = center; c.border = border
    if widths:
        for i, w in enumerate(widths, start=1):
            ws.column_dimensions[get_column_letter(i)].width = w

def put(ws, row, values, fill_cols=()):
    for c_i, v in enumerate(values, start=1):
        c = ws.cell(row=row, column=c_i, value=v if v not in ("", None) else None)
        c.font = base; c.border = border; c.alignment = wrap
        if c_i in fill_cols: c.fill = yellow

wb = Workbook()

# ── Feature Inventory ────────────────────────────────────────────────────
inv = wb.active
inv.title = "Feature Inventory"
cols = list(tracker[0].keys())
assert cols[7] == "Portal status" and cols[12] == "Decision" and cols[13] == "Priority", cols
header(inv, 1, cols, [5, 16, 26, 34, 11, 40, 22, 14, 60, 22, 16, 18, 12, 14, 36])
inv.freeze_panes = "E2"
for r_i, r in enumerate(tracker, start=2):
    values = [int(r["#"])] + [r[c] for c in cols[1:]]
    put(inv, r_i, values, fill_cols=(13, 14, 15))
    status = r["Portal status"] if r["Portal status"] in fills else "Not assessed"
    inv.cell(row=r_i, column=8).fill = fills[status]
    inv.cell(row=r_i, column=8).alignment = center
    inv.cell(row=r_i, column=1).alignment = center
last = len(tracker) + 1
inv.auto_filter.ref = f"A1:O{last}"
dv_status = DataValidation(type="list", formula1='"' + ",".join(STATUSES) + '"', allow_blank=True)
dv_decision = DataValidation(type="list", formula1='"' + ",".join(DECISIONS) + '"', allow_blank=True, showErrorMessage=True, errorTitle="Decision", error="Choose Keep, Drop or Maybe.")
dv_priority = DataValidation(type="list", formula1='"' + ",".join(PRIORITIES) + '"', allow_blank=True, showErrorMessage=True, errorTitle="Priority", error="Choose Must have, Should have, Nice to have or Later.")
for dv in (dv_status, dv_decision, dv_priority): inv.add_data_validation(dv)
dv_status.add(f"H2:H{last}"); dv_decision.add(f"M2:M{last}"); dv_priority.add(f"N2:N{last}")
inv.row_dimensions[1].height = 30

# ── Summary ──────────────────────────────────────────────────────────────
summ = wb.create_sheet("Summary", 0)
summ.column_dimensions["A"].width = 30
for col, w in zip("BCDEFGHIJK", [10, 9, 9, 9, 13, 9, 9, 9, 11, 11]):
    summ.column_dimensions[col].width = w
summ["A1"] = "iTherapy Feature Inventory — Durable Life Skills, with portal status"; summ["A1"].font = title
summ["A2"] = f"Rendered {DATE} from docs/tracking in the DLS-compliance-billing-system repository. Every Client and Billing row is scored against what the portal has; the other modules are summarised on the 'Other modules' tab."; summ["A2"].font = base
summ["A3"] = "How to use: on the Feature Inventory tab, fill the three yellow columns — Decision (Keep / Drop / Maybe), Priority (Must have / Should have / Nice to have / Later) and your notes. This summary updates itself. Columns H–L are the portal's side: what exists, which switch controls it, and which pull request delivered it."; summ["A3"].font = base
for r in (2, 3):
    summ.merge_cells(start_row=r, start_column=1, end_row=r, end_column=11)
    summ.cell(row=r, column=1).alignment = wrap
summ.row_dimensions[2].height = 30; summ.row_dimensions[3].height = 44

summ["A5"] = "Portal status legend"; summ["A5"].font = bold
legend = [("Built", "works in the portal today"), ("Partial", "some of it exists; the row says what is there and what is not"),
          ("Missing", "nothing in the portal yet; the Roadmap / ref column says what covers it, or 'ask' when your answer decides"),
          ("Not assessed", "a module outside the current Client and Billing focus")]
for i, (label, text) in enumerate(legend):
    c = summ.cell(row=6 + i, column=1, value=label); c.fill = fills[label]; c.font = base; c.border = border; c.alignment = center
    t = summ.cell(row=6 + i, column=2, value=text); t.font = base
    summ.merge_cells(start_row=6 + i, start_column=2, end_row=6 + i, end_column=11)
summ["A10"] = "Yellow cells are yours to fill."; summ["A10"].fill = yellow; summ["A10"].font = base; summ["A10"].border = border

table_row = 12
header(summ, table_row, ["Module", "Features", "Built", "Partial", "Missing", "Not assessed", "Keep", "Drop", "Maybe", "Undecided", "% decided"])
modules = []
for r in tracker:
    if r["Module"] not in modules: modules.append(r["Module"])
rng = f"'Feature Inventory'!$B$2:$B${last}"
st = f"'Feature Inventory'!$H$2:$H${last}"
dec = f"'Feature Inventory'!$M$2:$M${last}"
for i, mod in enumerate(modules):
    r = table_row + 1 + i
    m = f"$A{r}"
    summ.cell(row=r, column=1, value=mod)
    summ.cell(row=r, column=2, value=f"=COUNTIF({rng},{m})")
    for c, label in ((3, "Built"), (4, "Partial"), (5, "Missing"), (6, "Not assessed")):
        summ.cell(row=r, column=c, value=f'=COUNTIFS({rng},{m},{st},"{label}")')
    for c, label in ((7, "Keep"), (8, "Drop"), (9, "Maybe")):
        summ.cell(row=r, column=c, value=f'=COUNTIFS({rng},{m},{dec},"{label}")')
    summ.cell(row=r, column=10, value=f"=B{r}-G{r}-H{r}-I{r}")
    summ.cell(row=r, column=11, value=f"=IF(B{r}=0,0,(G{r}+H{r}+I{r})/B{r})")
    for c in range(1, 12):
        cell = summ.cell(row=r, column=c); cell.font = base; cell.border = border
        if c > 1: cell.alignment = center
    summ.cell(row=r, column=11).number_format = "0%"
    if mod in ("Client", "Billing"): summ.cell(row=r, column=1).font = bold
total_r = table_row + 1 + len(modules)
summ.cell(row=total_r, column=1, value="Total")
for c in range(2, 11):
    L = get_column_letter(c)
    summ.cell(row=total_r, column=c, value=f"=SUM({L}{table_row + 1}:{L}{total_r - 1})")
summ.cell(row=total_r, column=11, value=f"=IF(B{total_r}=0,0,(G{total_r}+H{total_r}+I{total_r})/B{total_r})")
summ.cell(row=total_r, column=11).number_format = "0%"
for c in range(1, 12):
    cell = summ.cell(row=total_r, column=c); cell.font = bold; cell.border = border
    if c > 1: cell.alignment = center

note_r = total_r + 2
summ.cell(row=note_r, column=1, value="Reading the Client and Billing rows").font = bold
notes = [
    "Built / Partial / Missing describe the portal in main today. Every new capability ships switched off: the Super Admin makes it available to DLS, then the DLS Admin turns it on and chooses which roles get it.",
    "Where a row says 'claim follow-up', the data is on the record now (gender, address, physician NPI, authorization flags) but the 837P claim does not carry it yet. That is one piece of billing work, best done once the real fee schedule is loaded.",
    "Where a row says 'ask', your answer on the Questions tab decides whether it is built or dropped.",
    "Rows 341–344 of the original sheet were reconstructed from the export and should be checked against your copy.",
]
for i, text in enumerate(notes):
    c = summ.cell(row=note_r + 1 + i, column=1, value=f"• {text}"); c.font = base; c.alignment = wrap
    summ.merge_cells(start_row=note_r + 1 + i, start_column=1, end_row=note_r + 1 + i, end_column=11)
    summ.row_dimensions[note_r + 1 + i].height = 30

# ── Other modules ────────────────────────────────────────────────────────
om = wb.create_sheet("Other modules")
header(om, 1, list(other[0].keys()), [30, 110])
for i, r in enumerate(other, start=2):
    put(om, i, list(r.values())); om.row_dimensions[i].height = 32

# ── Questions ────────────────────────────────────────────────────────────
q = wb.create_sheet("Questions for Melissa")
header(q, 1, ["#", *questions[0].keys()], [4, 26, 80, 22, 50])
for i, r in enumerate(questions, start=2):
    put(q, i, [i - 1, *r.values()], fill_cols=(5,))
    q.cell(row=i, column=1).alignment = center
    q.row_dimensions[i].height = 48

# ── What shipped ─────────────────────────────────────────────────────────
sh = wb.create_sheet("What shipped")
header(sh, 1, list(shipped[0].keys()), [14, 16, 80, 44, 30])
for i, r in enumerate(shipped, start=2):
    put(sh, i, list(r.values())); sh.row_dimensions[i].height = 48
r = len(shipped) + 3
sh.cell(row=r, column=1, value="Before the switches do anything").font = bold
sh.cell(row=r + 1, column=1, value="Pull main in Replit, run the API once in the workspace so pending migrations apply, then publish. Then: Platform console → Feature switchboard (every organization) or Feature adoption (DLS alone) → make the capability available; Settings → Feature access → turn it on and grant roles.").font = base
sh.merge_cells(start_row=r + 1, start_column=1, end_row=r + 1, end_column=5)
sh.cell(row=r + 1, column=1).alignment = wrap
sh.row_dimensions[r + 1].height = 44

wb.save(OUT)
counts = {s: sum(1 for r in tracker if r["Portal status"] == s) for s in STATUSES}
print({"out": str(OUT), "rows": len(tracker), **counts})
