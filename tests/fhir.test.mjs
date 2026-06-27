import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFHIR, validateFHIR } from "../src/fhir.js";

test("a complete summary builds a valid R4 document bundle", () => {
  const b = buildFHIR({
    name: "Sunita Devi", age: "64", sex: "Female", abha: "12 3456 7890 1234",
    allergy: ["Penicillin"], cond: ["Type 2 Diabetes"], meds: ["Metformin 500mg"], hist: "Cataract surgery 2022"
  });
  const r = validateFHIR(b);
  assert.equal(r.ok, true, r.errors.join("; "));
  assert.equal(b.type, "document");
  assert.equal(b.entry[0].resource.resourceType, "Composition");
});

test("absent allergies are asserted, not blank", () => {
  const b = buildFHIR({ name: "X", age: "40", sex: "Male", allergy: [], cond: [], meds: [] });
  const sec = b.entry[0].resource.section.find(s => s.title.startsWith("Allergies"));
  assert.ok(sec.emptyReason, "expected an emptyReason for absent allergies");
});

test("structural faults are caught", () => {
  const b = buildFHIR({ name: "X", allergy: [], cond: [], meds: [] });
  b.type = "collection";
  delete b.timestamp;
  b.entry.reverse(); // Composition no longer first
  const r = validateFHIR(b);
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 3);
});

test("SNOMED coding clears the free-text warning", () => {
  const codes = { cond: { "Asthma": { system: "http://snomed.info/sct", code: "195967001", display: "Asthma" } } };
  const b = buildFHIR({ name: "Y", age: "30", sex: "Male", allergy: [], cond: ["Asthma"], meds: [], codes });
  const r = validateFHIR(b);
  assert.ok(!r.warnings.some(w => /free-text/.test(w)), "free-text warning should be cleared when coded");
});

test("no ABHA produces a linkage warning", () => {
  const b = buildFHIR({ name: "Z", age: "50", sex: "Female", allergy: [], cond: [], meds: [] });
  const r = validateFHIR(b);
  assert.ok(r.warnings.some(w => /ABHA/.test(w)));
});
