// FHIR R4 document-bundle builder + offline structural/conformance validator.
// Pure functions, no DOM — unit-tested in tests/fhir.test.mjs.

function uuid() {
  return (crypto.randomUUID
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      }));
}

export function buildFHIR(p) {
  const now = new Date().toISOString(), ref = id => ({ reference: "urn:uuid:" + id });
  const C = p.codes || {};
  const cc = (cat, text) => {
    const c = C[cat] && C[cat][text];
    return c ? { coding: [{ system: c.system, code: c.code, display: c.display }], text } : { text };
  };
  const ids = { pat: uuid(), comp: uuid() }, entries = [], push = (id, res) => entries.push({ fullUrl: "urn:uuid:" + id, resource: res });

  const patient = { resourceType: "Patient", id: ids.pat, name: [{ text: p.name || "Unknown" }] };
  patient.identifier = [];
  if (p.abha) patient.identifier.push({ system: "https://healthid.ndhm.gov.in", value: String(p.abha).replace(/\s/g, "") });
  if (!patient.identifier.length) delete patient.identifier;
  const g = (p.sex || "").toLowerCase();
  if (["male", "female", "other"].includes(g)) patient.gender = g;
  if (p.age && /^\d+$/.test(String(p.age))) patient.birthDate = String(new Date().getFullYear() - parseInt(p.age, 10));
  if (p.phone) patient.telecom = [{ system: "phone", value: p.phone, use: "mobile" }];

  const aR = []; (p.allergy || []).forEach(a => { const id = uuid(); push(id, { resourceType: "AllergyIntolerance", id,
    clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", code: "active" }] },
    verificationStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification", code: "unconfirmed" }] },
    patient: ref(ids.pat), code: cc("allergy", a), recordedDate: now }); aR.push(ref(id)); });
  const cR = []; (p.cond || []).forEach(c => { const id = uuid(); push(id, { resourceType: "Condition", id,
    clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] },
    subject: ref(ids.pat), code: cc("cond", c) }); cR.push(ref(id)); });
  const mR = []; (p.meds || []).forEach(m => { const id = uuid(); push(id, { resourceType: "MedicationStatement", id,
    status: "active", medicationCodeableConcept: cc("meds", m), subject: ref(ids.pat), effectiveDateTime: now }); mR.push(ref(id)); });
  const pR = []; if (p.hist) { const id = uuid(); push(id, { resourceType: "Procedure", id, status: "completed", code: cc("hist", p.hist), subject: ref(ids.pat) }); pR.push(ref(id)); }

  const section = [];
  section.push(aR.length
    ? { title: "Allergies and Intolerances", entry: aR }
    : { title: "Allergies and Intolerances", emptyReason: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/list-empty-reason", code: "nilknown" }], text: "No known allergies recorded" } });
  if (cR.length) section.push({ title: "Medical Conditions", entry: cR });
  if (mR.length) section.push({ title: "Current Medications", entry: mR });
  if (pR.length) section.push({ title: "Procedures / Past History", entry: pR });

  const composition = { resourceType: "Composition", id: ids.comp, status: "final",
    type: { coding: [{ system: "http://snomed.info/sct", code: "422735006", display: "Summary clinical document" }], text: "Patient Health Summary" },
    subject: ref(ids.pat), date: now, author: [{ display: "SehatCard v0.2" }], title: "Patient Health Summary", section };

  return { resourceType: "Bundle", id: uuid(), type: "document", timestamp: now,
    identifier: { system: "urn:ietf:rfc:3986", value: "urn:uuid:" + uuid() },
    entry: [{ fullUrl: "urn:uuid:" + ids.comp, resource: composition }, { fullUrl: "urn:uuid:" + ids.pat, resource: patient }, ...entries] };
}

export function validateFHIR(b) {
  const errors = [], warnings = []; let passed = 0;
  const E = m => errors.push(m), W = m => warnings.push(m), P = () => passed++;
  if (!b || b.resourceType !== "Bundle") { errors.push("Root is not a Bundle"); return { ok: false, errors, warnings, passed }; }
  P();
  if (b.type === "document") P(); else E('Bundle.type must be "document" (got "' + (b.type || "missing") + '")');
  if (b.timestamp) P(); else E("Bundle.timestamp is required for a document Bundle");
  const entries = Array.isArray(b.entry) ? b.entry : [];
  if (entries.length) P(); else E("Bundle has no entries");
  const urls = new Set(); let dup = false;
  entries.forEach((e, i) => {
    if (!e.fullUrl) E("entry[" + i + "] has no fullUrl");
    else { if (urls.has(e.fullUrl)) { E("Duplicate fullUrl: " + e.fullUrl); dup = true; } urls.add(e.fullUrl); }
    const r = e.resource;
    if (!r || !r.resourceType) E("entry[" + i + "] has no resource/resourceType");
    else if (!r.id) E(r.resourceType + " entry[" + i + "] has no id");
  });
  if (!dup && entries.length) P();
  const first = entries[0] && entries[0].resource;
  if (first && first.resourceType === "Composition") P();
  else E("First entry of a document Bundle must be the Composition");
  const refs = []; (function walk(o) { if (!o || typeof o !== "object") return; if (typeof o.reference === "string") refs.push(o.reference); Object.values(o).forEach(walk); })(b);
  let unresolved = 0;
  refs.forEach(r => { if (r.startsWith("urn:uuid:") && !urls.has(r)) { E("Unresolved reference: " + r); unresolved++; } });
  if (!unresolved && refs.length) P();
  if (first && first.resourceType === "Composition") {
    ["status", "type", "subject", "date", "title"].forEach(f => { if (!first[f]) E("Composition.'" + f + "' is required"); });
    if (first.status && first.type && first.subject && first.date && first.title) P();
  }
  let textOnly = 0, hasAbha = false;
  const codeText = c => c && c.text && !(c.coding && c.coding.length);
  entries.forEach(e => { const r = e.resource || {};
    switch (r.resourceType) {
      case "Patient":
        if (!r.name || !r.name.length) W("Patient has no name");
        if (!r.gender) W("Patient has no gender");
        if (!r.birthDate) W("Patient has no birthDate");
        else if (/^\d{4}$/.test(r.birthDate)) W("Patient.birthDate is year-only (derived from age) — fine, but not exact");
        if (r.identifier && r.identifier.some(id => /healthid|ndhm|abdm/i.test(id.system || ""))) hasAbha = true; break;
      case "AllergyIntolerance":
        if (!r.patient) E("AllergyIntolerance missing patient reference");
        if (!r.code) W("AllergyIntolerance has no code");
        if (codeText(r.code)) textOnly++; break;
      case "Condition":
        if (!r.subject) E("Condition missing subject");
        if (codeText(r.code)) textOnly++; break;
      case "MedicationStatement":
        if (!r.status) E("MedicationStatement missing status");
        if (!r.subject) E("MedicationStatement missing subject");
        if (!r.medicationCodeableConcept && !r.medicationReference) E("MedicationStatement missing medication[x]");
        if (codeText(r.medicationCodeableConcept)) textOnly++; break;
      case "Procedure":
        if (!r.status) E("Procedure missing status");
        if (!r.subject) E("Procedure missing subject");
        if (codeText(r.code)) textOnly++; break;
    }
  });
  if (!hasAbha) W("No ABHA identifier on Patient — record can't link to the national health record yet");
  if (textOnly) W(textOnly + " clinical item(s) are free-text only — ABDM conformance needs SNOMED CT / LOINC coding");
  return { ok: errors.length === 0, errors, warnings, passed };
}
