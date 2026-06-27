// STARTER terminology subset. VERIFY every code against the official SNOMED CT
// (NRCeS / browser.ihtsdotools.org) before any clinical use. This is a convenience
// seed, NOT an authoritative value set. Swap for the real NRCeS value sets / a
// terminology server for production.
export const SCT = "http://snomed.info/sct";

export const TERMINOLOGY = {
  allergy: [
    { code: "373270004", display: "Substance with penicillin structure and antibacterial mechanism of action", syn: ["penicillin", "pcn"] },
    { code: "387406002", display: "Sulfonamide", syn: ["sulfa", "sulpha", "sulfonamide", "sulphonamide"] },
    { code: "387458008", display: "Aspirin", syn: ["aspirin", "asa"] },
    { code: "227493005", display: "Cashew nut", syn: ["cashew"] },
    { code: "256349002", display: "Peanut", syn: ["peanut", "groundnut"] },
    { code: "412071004", display: "Iodinated contrast media", syn: ["contrast", "iodine contrast", "dye"] }
  ],
  cond: [
    { code: "44054006", display: "Type 2 diabetes mellitus", syn: ["type 2 diabetes", "t2dm", "diabetes type 2", "dm2", "sugar"] },
    { code: "38341003", display: "Hypertensive disorder", syn: ["hypertension", "high bp", "htn", "high blood pressure"] },
    { code: "195967001", display: "Asthma", syn: ["asthma"] },
    { code: "13645005", display: "Chronic obstructive pulmonary disease", syn: ["copd"] },
    { code: "40930008", display: "Hypothyroidism", syn: ["hypothyroid", "low thyroid"] },
    { code: "84757009", display: "Epilepsy", syn: ["epilepsy", "seizure disorder"] },
    { code: "56717001", display: "Tuberculosis", syn: ["tb", "tuberculosis"] },
    { code: "37796009", display: "Migraine", syn: ["migraine"] },
    { code: "55822004", display: "Hyperlipidemia", syn: ["hyperlipidemia", "high cholesterol", "dyslipidemia"] },
    { code: "709044004", display: "Chronic kidney disease", syn: ["ckd", "chronic kidney", "renal failure"] },
    { code: "35489007", display: "Depressive disorder", syn: ["depression", "depressive disorder"] },
    { code: "396275006", display: "Osteoarthritis", syn: ["osteoarthritis", "oa", "arthritis"] }
  ],
  meds: [
    { code: "372567009", display: "Metformin", syn: ["metformin", "glycomet"] },
    { code: "387458008", display: "Aspirin", syn: ["aspirin", "ecosprin", "asa"] },
    { code: "387517004", display: "Paracetamol", syn: ["paracetamol", "acetaminophen", "crocin", "dolo"] },
    { code: "386864001", display: "Amlodipine", syn: ["amlodipine", "amlong"] },
    { code: "387467008", display: "Atenolol", syn: ["atenolol"] },
    { code: "108656009", display: "Atorvastatin", syn: ["atorvastatin", "atorva"] },
    { code: "325072002", display: "Insulin", syn: ["insulin"] },
    { code: "387207008", display: "Omeprazole", syn: ["omeprazole", "pantoprazole", "ppi", "pan"] }
  ]
};

const normalize = s => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

export function autoMatch(cat, text) {
  const list = TERMINOLOGY[cat];
  if (!list) return null;
  const n = normalize(text);
  for (const e of list) {
    if (e.syn.some(s => n === s || n.startsWith(s + " ") || n.includes(" " + s)))
      return { system: SCT, code: e.code, display: e.display };
  }
  return null;
}

export function searchTerms(cat, q) {
  const n = normalize(q);
  if (!n) return [];
  const pool = cat ? TERMINOLOGY[cat] : [].concat(...Object.values(TERMINOLOGY));
  return pool
    .filter(e => normalize(e.display).includes(n) || e.syn.some(s => s.includes(n)))
    .slice(0, 8)
    .map(e => ({ system: SCT, code: e.code, display: e.display }));
}
