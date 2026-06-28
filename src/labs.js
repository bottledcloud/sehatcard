// Lab report text parser. Extracts structured results from pasted report text.
// Handles Tata 1mg table format, markdown summaries, and simple key-value lines.
// Pure functions, no DOM — unit-tested in tests/labs.test.mjs.

const CATEGORIES = {
  diabetes:      ["hba1c","glycosylated hemoglobin","glucose","fasting blood sugar","fbs","insulin","eag","estimated average glucose"],
  lipids:        ["cholesterol","triglyceride","hdl","ldl","vldl","non hdl","non-hdl"],
  allergy:       ["ige total","ige)","immunoglobulin e"],
  serology:      ["dengue","malaria","typhoid","widal","plasmodium"],
  liver:         ["sgot","sgpt","ast","alt","aspartate","alanine transaminase","ggt","gamma glutamyl","alkaline phosphatase","bilirubin","albumin","protein, total","protein total","a/g ratio","sgot/sgpt"],
  kidney:        ["creatinine","urea","bun","uric acid","sodium","potassium","chloride","egfr","glomerular filtration","bun/creatinine"],
  thyroid:       ["tsh","t3","t4","thyroid","free t3","free t4"],
  vitamins:      ["vitamin d","vitamin b12","vitamin b9","folate","folic acid","25-oh"],
  iron:          ["iron serum","iron,","tibc","iron binding","ferritin","transferrin","uibc","unsaturated iron"],
  cardiac:       ["lipoprotein","lp(a)","apolipoprotein","apob","apoa","homocysteine","hs-crp","high sensitivity crp","high sensitive crp"],
  inflammation:  ["c-reactive","crp","esr","erythrocyte sedimentation"],
  cbc:           ["hemoglobin","rbc","hct","mcv","mch","mchc","rdw","leucocyte","wbc","neutrophil","lymphocyte","monocyte","eosinophil","basophil","platelet","mpv","pdw"],
  urine:         ["urine","pus cell","epithelial","bacteria","cast","crystal","specific gravity","ketone","nitrite","urobilinogen","leucocyte esterase"],
  hormones:      ["testosterone","psa","prostate specific"],
  pancreas:      ["lipase","amylase"],
  arthritis:     ["rheumatoid","rf ","anti-ccp"],
};

export function categorize(name) {
  const n = (name || "").toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORIES)) {
    if (keywords.some(k => n.includes(k))) return cat;
  }
  return "other";
}

function deriveFlag(value, refLow, refHigh) {
  if (value == null || (refLow == null && refHigh == null)) return null;
  if (refLow != null && value < refLow) return "low";
  if (refHigh != null && value > refHigh) return "high";
  return "normal";
}

// Parse a reference range string like "0-45", "13.0-17.0", "<5.0", ">=39.9", "<=199.9", "70-99", "Negative"
function parseRef(s) {
  if (!s || /^negative|^normal/i.test(s.trim())) return { refLow: null, refHigh: null };
  // "<5.0" or "< 5.0"
  let m = s.match(/^[<≤]\s*([\d.]+)/);
  if (m) return { refLow: null, refHigh: parseFloat(m[1]) };
  // ">39.9" or ">= 39.9"
  m = s.match(/^[>≥]\s*([\d.]+)/);
  if (m) return { refLow: parseFloat(m[1]), refHigh: null };
  // "0-45" or "13.0 - 17.0" or "13.0-17.0"
  m = s.match(/([\d.]+)\s*[-–—]\s*([\d.]+)/);
  if (m) return { refLow: parseFloat(m[1]), refHigh: parseFloat(m[2]) };
  return { refLow: null, refHigh: null };
}

// Try to parse a numeric value from a result string. Returns { value, valueText }.
function parseValue(s) {
  const trimmed = (s || "").trim();
  if (!trimmed) return { value: null, valueText: "" };
  // Handle "< 1.0", "> 5", "<0.40"
  const ltm = trimmed.match(/^[<>≤≥]\s*([\d.]+)/);
  if (ltm) return { value: parseFloat(ltm[1]), valueText: trimmed };
  // Handle "Negative", "Positive", "Normal", "Clear" etc.
  if (/^[a-zA-Z]/.test(trimmed) && !/^\d/.test(trimmed)) return { value: null, valueText: trimmed };
  // Plain number
  const num = parseFloat(trimmed);
  if (!isNaN(num)) return { value: num, valueText: trimmed };
  return { value: null, valueText: trimmed };
}

// Canonical category labels for display
export const CAT_LABELS = {
  diabetes: "Diabetes", lipids: "Lipids", liver: "Liver", kidney: "Kidney",
  thyroid: "Thyroid", vitamins: "Vitamins", iron: "Iron Studies", cardiac: "Cardiac",
  inflammation: "Inflammation", cbc: "Blood Count", urine: "Urine",
  hormones: "Hormones", allergy: "Allergy", serology: "Serology",
  pancreas: "Pancreas", arthritis: "Arthritis", other: "Other"
};

// ===== Main parser =====
// Accepts raw pasted text (from a lab report or markdown summary).
// Returns an array of { name, category, value, valueText, unit, refLow, refHigh, flag }.
export function parseLabText(text) {
  const results = [];
  const seen = new Set();
  const lines = (text || "").split("\n");

  for (let raw of lines) {
    raw = raw.trim();
    if (!raw || raw.length < 4) continue;
    // Skip headers, comments, page markers, disclaimers
    if (/^(test name|comment|note|disclaimer|page \d|po no|customer name|age\/gender|lab visit|barcode|sample type|collected via|referred by|collection date|report date|report status|this test has been|address:|state of the art|delhi|---)/i.test(raw)) continue;
    if (/^[#*•●\-–]/.test(raw)) continue;                    // markdown bullets, comment lines
    if (/^\d+\.\s/.test(raw) && !/^\d+\.\d/.test(raw)) continue; // numbered list items like "1. Evaluation of..."
    if (raw.length > 200) continue;                           // skip long paragraphs

    let name, resultStr, unit, refStr;

    // Pattern 1: Markdown summary — "TestName: Value Unit Flag"
    // e.g. "HbA1c: 5.4% ✅" or "SGOT: 39 ↑" or "Vitamin D: 19.2 ↓"
    const mdMatch = raw.match(/^([A-Za-z][A-Za-z0-9 (),\-\/.']+?):\s*([\d.<>≤≥]+)\s*(%|[a-zA-Z/µμ^²³·\d]+)?\s*([✅↑↓⬆⬇].*)?$/);
    if (mdMatch) {
      name = mdMatch[1].trim();
      resultStr = mdMatch[2];
      unit = (mdMatch[3] || "").trim();
      refStr = null; // markdown format typically doesn't include ref ranges
    }

    // Pattern 2: Lab report table — "TestName    Result    Unit    RefRange    Method"
    // Fields separated by 2+ spaces or tabs
    if (!name) {
      const parts = raw.split(/\t|\s{2,}/).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 3) {
        // First part is name, second is result, third might be unit or ref
        const candidateName = parts[0];
        // Skip if name looks like a section header (all caps short, or just a category label)
        if (/^[A-Z ]+$/.test(candidateName) && candidateName.split(" ").length <= 3 && !/\d/.test(parts[1])) continue;

        const { value: testVal } = parseValue(parts[1]);
        // If second part looks like a number or Negative/Positive, treat it as result
        if (testVal !== null || /^(negative|positive|normal|trace|nil|clear|absent|present)/i.test(parts[1])) {
          name = candidateName;
          resultStr = parts[1];
          // Try to figure out unit vs ref from remaining parts
          if (parts.length >= 4) {
            // parts[2] is unit, parts[3] is ref range
            unit = parts[2];
            refStr = parts[3];
            // Sometimes unit gets merged with ref like "mg/dL 0-45" — check if unit contains a range
            if (/\d+-\d+/.test(unit) || /^[<>]/.test(unit)) {
              refStr = unit;
              unit = "";
            }
          } else if (parts.length === 3) {
            // Could be unit or ref
            if (/\d/.test(parts[2]) && !/^[a-zA-Z/%]+$/.test(parts[2])) {
              refStr = parts[2];
              unit = "";
            } else {
              unit = parts[2];
            }
          }
        }
      }
    }

    if (!name) continue;

    // Clean up name
    name = name.replace(/\s+/g, " ").trim();
    // Skip duplicates
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(key)) continue;

    // Skip non-test entries (section headers, interpretation tables)
    if (/^(interpretation|reference|criteria|category|gfr|consider therapy|risk group|extreme risk|very high|high risk|moderate risk|low risk|stage|tanner|pregnancy|comment)/i.test(name)) continue;

    seen.add(key);

    const { value, valueText } = parseValue(resultStr);
    const { refLow, refHigh } = parseRef(refStr || "");
    const flag = deriveFlag(value, refLow, refHigh);
    const category = categorize(name);

    // Skip if it's clearly not a test result (qualitative non-results)
    if (value === null && !valueText) continue;

    results.push({
      name,
      category,
      value,
      valueText: valueText || String(resultStr || ""),
      unit: (unit || "").replace(/\s+/g, ""),
      refLow,
      refHigh,
      flag,
    });
  }

  return results;
}

// Create a LabReport object from parsed results
export function createLabReport(date, lab, results, source) {
  return {
    id: "lr_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    date: date || new Date().toISOString().slice(0, 10),
    lab: lab || "",
    results: results || [],
    source: source || "manual",
  };
}

// Get all unique test names across reports, with their latest values and trends
export function labSummary(labs) {
  if (!labs || !labs.length) return [];
  const map = new Map(); // testName -> [{date, value, flag}, ...]
  const sorted = [...labs].sort((a, b) => a.date.localeCompare(b.date));
  for (const report of sorted) {
    for (const r of report.results) {
      if (r.value == null) continue;
      if (!map.has(r.name)) map.set(r.name, []);
      map.get(r.name).push({ date: report.date, value: r.value, flag: r.flag, unit: r.unit });
    }
  }
  const out = [];
  for (const [name, points] of map) {
    const latest = points[points.length - 1];
    out.push({ name, category: categorize(name), points, latest });
  }
  return out;
}
