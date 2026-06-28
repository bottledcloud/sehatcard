import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLabText, categorize, createLabReport, labSummary, CAT_LABELS } from "../src/labs.js";

test("categorize maps test names to correct categories", () => {
  assert.equal(categorize("Hemoglobin"), "cbc");
  assert.equal(categorize("SGPT (Alanine Transaminase)"), "liver");
  assert.equal(categorize("Glycosylated Hemoglobin (HbA1c)"), "diabetes");
  assert.equal(categorize("Cholesterol - LDL"), "lipids");
  assert.equal(categorize("Vitamin D (25-OH)"), "vitamins");
  assert.equal(categorize("C-Reactive Protein (Quantitative)"), "inflammation");
  assert.equal(categorize("Dengue NS1 Antigen"), "serology");
  assert.equal(categorize("Testosterone, total"), "hormones");
  assert.equal(categorize("Immunoglobulin E (IgE) Total"), "allergy");
  assert.equal(categorize("Some Unknown Test"), "other");
});

test("parses Tata 1mg table format (tab/space separated)", () => {
  const text = `Hemoglobin\t15.2\tg/dL\t13.0-17.0\tSpectrophotometry
RBC\t5.17\tmili/cu.mm\t4.5 - 5.5\tImpedence
SGOT (Aspartate Aminotransferase)\t44\tU/L\t11-34\tNADH w/o P-5'-P
SGPT (Alanine Transaminase)\t47\tU/L\t0-45\tNADH w/o P-5'-P
C-Reactive Protein (Quantitative)\t21.60\tmg/L\t<5.0\tTurbidimetry`;

  const results = parseLabText(text);

  const hb = results.find(r => r.name.includes("Hemoglobin"));
  assert.ok(hb, "should find Hemoglobin");
  assert.equal(hb.value, 15.2);
  assert.equal(hb.unit, "g/dL");
  assert.equal(hb.flag, "normal");

  const sgot = results.find(r => r.name.includes("SGOT"));
  assert.ok(sgot, "should find SGOT");
  assert.equal(sgot.value, 44);
  assert.equal(sgot.flag, "high");
  assert.equal(sgot.category, "liver");

  const crp = results.find(r => r.name.includes("C-Reactive"));
  assert.ok(crp, "should find CRP");
  assert.equal(crp.value, 21.60);
  assert.equal(crp.flag, "high");
  assert.equal(crp.category, "inflammation");
});

test("parses markdown summary format", () => {
  const text = `HbA1c: 5.4 %
FBS: 84 mg/dL
SGOT: 39 U/L
SGPT: 60 U/L
GGT: 75 U/L
Vitamin D: 19.2 ng/mL
LDL: 147 mg/dL`;

  const results = parseLabText(text);
  assert.ok(results.length >= 5, "should parse at least 5 results, got " + results.length);

  const hba1c = results.find(r => r.name.includes("HbA1c"));
  assert.ok(hba1c);
  assert.equal(hba1c.value, 5.4);
  assert.equal(hba1c.category, "diabetes");

  const sgpt = results.find(r => r.name.includes("SGPT"));
  assert.ok(sgpt);
  assert.equal(sgpt.value, 60);
});

test("handles qualitative results (Negative, Positive)", () => {
  const text = `Dengue NS1\tNegative\t\tNegative
Typhidot IgM\tNegative\t\tNegative`;

  const results = parseLabText(text);
  const dengue = results.find(r => r.name.includes("Dengue"));
  assert.ok(dengue);
  assert.equal(dengue.valueText, "Negative");
  assert.equal(dengue.value, null);
  assert.equal(dengue.category, "serology");
});

test("handles < and > in results", () => {
  const text = `High sensitivity CRP\t< 0.40\tmg/L\t0 - 3\tTurbidimetry
Rheumatoid Factor\t< 15.00\tIU/mL\t<30\tImmunoturbidimetric`;

  const results = parseLabText(text);
  const hsCRP = results.find(r => r.name.includes("CRP"));
  assert.ok(hsCRP);
  assert.equal(hsCRP.value, 0.40);
});

test("skips comment lines, headers, and disclaimers", () => {
  const text = `Test Name\tResult\tUnit\tBio. Ref. Interval\tMethod
Hemoglobin\t14.9\tg/dL\t13.0-17.0\tSpectrophotometry
Comment:
ESR provides an index of progress of the disease.
Page 1 of 13
PO No :PO10000346151-657
Customer Name : Mr.VISHNU V`;

  const results = parseLabText(text);
  assert.equal(results.length, 1, "should only parse Hemoglobin");
  assert.equal(results[0].name, "Hemoglobin");
});

test("createLabReport builds a valid report object", () => {
  const results = parseLabText("HbA1c: 5.4 %");
  const report = createLabReport("2025-08-02", "Tata 1mg Bangalore", results, "parsed");
  assert.ok(report.id.startsWith("lr_"));
  assert.equal(report.date, "2025-08-02");
  assert.equal(report.lab, "Tata 1mg Bangalore");
  assert.equal(report.results.length, 1);
  assert.equal(report.source, "parsed");
});

test("labSummary aggregates trends across reports", () => {
  const labs = [
    createLabReport("2025-04-22", "Lab", [{ name: "SGPT", category: "liver", value: 44, valueText: "44", unit: "U/L", refLow: 0, refHigh: 45, flag: "normal" }]),
    createLabReport("2025-08-02", "Lab", [{ name: "SGPT", category: "liver", value: 60, valueText: "60", unit: "U/L", refLow: 0, refHigh: 45, flag: "high" }]),
    createLabReport("2025-10-30", "Lab", [{ name: "SGPT", category: "liver", value: 47, valueText: "47", unit: "U/L", refLow: 0, refHigh: 45, flag: "high" }]),
  ];
  const summary = labSummary(labs);
  const sgpt = summary.find(s => s.name === "SGPT");
  assert.ok(sgpt);
  assert.equal(sgpt.points.length, 3);
  assert.equal(sgpt.points[0].value, 44);
  assert.equal(sgpt.points[2].value, 47);
  assert.equal(sgpt.latest.value, 47);
});
