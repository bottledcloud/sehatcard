# Lab Results Feature — Design Spec

## Problem

A patient's summary card (allergies, conditions, meds) is useful but incomplete.
Lab results with trends over time are what a doctor actually needs at point of care
to make treatment decisions. Today those results live trapped in PDF reports from
different labs (Tata 1mg, Thyrocare, SRL, etc.) that the patient can't easily carry
or compare.

## Data Model

### LabReport (one per test session)
```js
{
  id: "lr_...",
  date: "2025-08-02",           // collection date
  lab: "Tata 1mg Bangalore",    // performing lab
  package: "Men Health Checkup Premium",  // optional
  results: [ ...LabResult ],
  source: "manual" | "parsed",  // how it entered the system
  rawText: "...",               // original extracted text (for audit)
}
```

### LabResult (one per test within a report)
```js
{
  name: "SGPT (Alanine Transaminase)",  // display name as on report
  category: "liver",                     // grouping key (see categories below)
  value: 60,                            // numeric result
  valueText: "60",                      // original string (handles "<1.0", "Negative", etc.)
  unit: "U/L",
  refLow: 0,
  refHigh: 45,
  flag: "high" | "low" | "normal" | "abnormal",  // derived
  loinc: null,                          // optional LOINC code (future)
}
```

### Categories (grouping for card display)
```
diabetes     — HbA1c, Fasting Glucose, Insulin
lipids       — Total Cholesterol, LDL, HDL, TG, Non-HDL, VLDL
liver        — SGOT, SGPT, GGT, ALP, Bilirubin, Albumin, Protein
kidney       — Creatinine, Urea, BUN, Uric Acid, eGFR, Na, K, Cl
thyroid      — TSH, T3, T4, FT3, FT4
vitamins     — Vitamin D, B12, Folate
iron         — Iron, TIBC, Ferritin, Transferrin Sat
cardiac      — Lp(a), ApoB, ApoA1, hs-CRP, Homocysteine
inflammation — CRP, ESR
cbc          — Hb, RBC, WBC, Platelets, differentials
urine        — Protein, Glucose, pH, specific gravity, pus cells
hormones     — Testosterone, PSA
allergy      — IgE Total
other        — anything not mapped
```

### Patient record extension
```js
// existing patient object gains:
{
  ...existingFields,
  labs: [ ...LabReport ],   // array of reports, sorted by date desc
}
```

Labs are saved inside the encrypted patient record (same AES-GCM envelope).
QR does NOT include lab data (too large); it stays as the critical-summary card.
FHIR export gains DiagnosticReport + Observation resources.

## Import Strategies (in priority order)

### 1. Structured paste (v1 — build first)
User pastes the markdown/text summary (like the one Vishnu wrote).
A simple parser splits lines, extracts name/value/unit/flag.
Works immediately, no AI, no PDF dependency.

### 2. AI-assisted PDF parse (v2)
User uploads a PDF. The app:
  a) Extracts text from the PDF (pdf.js or server-side)
  b) Sends text to Claude API with a structured extraction prompt
  c) Returns JSON matching the LabResult schema
  d) User reviews and confirms before saving

This is the high-value path. Claude is extremely good at this extraction
task — the prompt just needs to enforce the schema and say "do not
invent values not present in the text."

Prompt shape:
```
Extract lab test results from the following report text.
Return ONLY a JSON array of objects with these fields:
  name, category, value, valueText, unit, refLow, refHigh, flag
Do not invent any values. If a field is unclear, use null.
Use these categories: diabetes, lipids, liver, kidney, thyroid,
vitamins, iron, cardiac, inflammation, cbc, urine, hormones, allergy, other.

Report text:
---
{extracted PDF text}
---
```

### 3. Manual entry (always available)
Form: test name, value, unit, ref range, date.
Tedious but guaranteed to work for any lab.

## UI Changes

### Patient form
- New collapsible section: "Lab Reports"
- List of saved reports by date, expandable
- "Add report" → choice of: paste text, upload PDF (v2), manual entry
- Each report shows results grouped by category with flag indicators

### Card
- Card itself stays focused on the critical summary (allergies, meds, conditions)
- New "Lab trends" button (like FHIR button) opens a modal with:
  - Parameter selector
  - Sparkline / simple trend chart across dates
  - Flag any parameter that's worsening across reports

### FHIR
- Each LabReport → DiagnosticReport resource
- Each LabResult → Observation resource
- Observation.code uses LOINC when available (future), text otherwise
- Linked to the Patient via subject reference

## Implementation Plan (for Claude Code)

### Phase 1: Data model + manual/paste import
1. Add `labs` array to patient schema in main.js
2. Add "Lab Reports" section to the form (collapsible)
3. Build a paste-parser that handles the markdown format
4. Store inside the encrypted patient record
5. Add lab report list view (date, lab, result count, flags)
6. Update FHIR export with DiagnosticReport + Observation

### Phase 2: Trend view
1. Aggregate same-named results across reports
2. Simple sparkline or bar chart for selected parameter
3. Flag worsening trends (3+ consecutive increases in an out-of-range value)

### Phase 3: AI-assisted PDF parse
1. Extract text from uploaded PDF (pdf.js in-browser)
2. Call Claude API with extraction prompt
3. Return structured results for user review
4. User confirms → saved to patient record

### Test cases (use Vishnu's actual data)
- Oct 2025 Fever Package: CBC, CRP 21.6 (high), liver enzymes, dengue/typhoid/malaria (all negative)
- Aug 2025 Premium Checkup: full panel, LDL 147 (high), Vit D 19.2 (deficient), GGT 75 (high)
- Apr 2025 Diabetes follow-up: HbA1c 5.4, FBS 84, Insulin 5.0
- Trend: SGPT should show 44 → 60 → 47 across three dates
- Trend: GGT should show 51 → 75 (worsening)

## Invariants (add to CLAUDE.md)
- Lab values are stored exactly as reported. Never modify, round, or reinterpret a value.
- "flag" is derived mechanically from value vs refLow/refHigh. Never editorialize.
- AI-parsed results require explicit user confirmation before saving.
- Lab data stays inside the encrypted patient record. Never in the QR.
