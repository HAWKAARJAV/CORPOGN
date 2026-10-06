/**
 * lib/categorizer.mjs
 *
 * Multi-category tagging for enriched NGOs.
 *
 * Confidence levels:
 *   'high'   = category came from an explicit "focus area" / "cause" / "sector"
 *              labelled field on the Give Discover profile
 *   'medium' = category inferred from program names / descriptions (structured text)
 *   'low'    = category matched in general prose body (not in a structured field)
 *
 * 'low' confidence categories ARE stored — they are real matches, just less certain.
 * The rule: never create a category from a guess. Only from text actually present.
 */

// ─── Category taxonomy ────────────────────────────────────────────────────────
// Each entry: { category, keywords: [string], highKeywords: [string] }
// highKeywords: terms so specific that matching them → high confidence even in prose
// keywords: general terms → medium if in structured field, low if in prose

const TAXONOMY = [
  {
    category: "Education",
    highKeywords: ["school", "literacy", "scholarship", "tuition", "curriculum", "dropout"],
    keywords: ["education", "learning", "student", "teacher", "classroom", "academic"],
  },
  {
    category: "Healthcare",
    highKeywords: ["hospital", "clinic", "medical", "surgery", "disease", "patient", "nutrition", "malnutrition"],
    keywords: ["health", "healthcare", "medicine", "sanitation", "hygiene", "wellness", "mental health"],
  },
  {
    category: "Women Empowerment",
    highKeywords: ["self-help group", "shg", "women entrepreneur", "gender violence", "girl child"],
    keywords: ["women", "gender", "female", "girl", "widow", "maternity", "trafficking"],
  },
  {
    category: "Environment",
    highKeywords: ["tree plantation", "afforestation", "solar energy", "waste segregation", "climate change"],
    keywords: ["environment", "ecology", "green", "pollution", "biodiversity", "conservation", "forest", "water body"],
  },
  {
    category: "Child Welfare",
    highKeywords: ["orphan", "juvenile", "street child", "child labour", "child abuse", "creche"],
    keywords: ["child", "children", "adolescent", "kid", "infant", "baby", "underprivileged child"],
  },
  {
    category: "Disability",
    highKeywords: ["wheelchair", "hearing impaired", "visually impaired", "blind", "deaf", "special education"],
    keywords: ["disability", "disabled", "handicap", "special need", "rehabilitation", "prosthetic"],
  },
  {
    category: "Livelihood",
    highKeywords: ["vocational training", "skill development", "self-employment", "microfinance", "micro-enterprise"],
    keywords: ["livelihood", "income", "employment", "job training", "sewing", "tailoring", "craft", "enterprise"],
  },
  {
    category: "Rural Development",
    highKeywords: ["gram panchayat", "village development", "rural infrastructure", "agricultural input"],
    keywords: ["rural", "village", "panchayat", "agriculture", "farm", "farmer", "tribal", "adivasi"],
  },
  {
    category: "Water & Sanitation",
    highKeywords: ["open defecation free", "odf", "toilet construction", "water purification", "borewell"],
    keywords: ["water", "sanitation", "wash", "hygiene", "toilet", "drainage", "sewage"],
  },
  {
    category: "Disaster Relief",
    highKeywords: ["flood relief", "earthquake relief", "cyclone", "disaster preparedness", "covid relief"],
    keywords: ["disaster", "relief", "emergency", "rescue", "rehabilitation", "refugee"],
  },
  {
    category: "Animal Welfare",
    highKeywords: ["stray dog", "stray cat", "animal rescue", "veterinary", "wildlife conservation"],
    keywords: ["animal", "pet", "livestock", "bird", "wildlife"],
  },
  {
    category: "Arts & Culture",
    highKeywords: ["heritage site", "folk art", "classical dance", "indigenous art"],
    keywords: ["art", "culture", "music", "dance", "theatre", "heritage", "craft", "indigenous"],
  },
];

// ─── Main categorizer ─────────────────────────────────────────────────────────

/**
 * Assign categories to an enriched NGO.
 *
 * @param {object} ngo - enriched NGO object
 * @returns {Array<{ category, confidence, source }>}
 */
export function categorize(ngo) {
  // Build text pools by confidence level
  const explicitText = buildExplicitText(ngo).toLowerCase();
  const programText = buildProgramText(ngo).toLowerCase();
  const bodyText = buildBodyText(ngo).toLowerCase();

  const results = [];
  const added = new Set();

  for (const { category, highKeywords, keywords } of TAXONOMY) {
    if (added.has(category)) continue;

    // Check explicit fields first (Give Discover labelled sections)
    if (matchesAny(explicitText, highKeywords) || matchesAny(explicitText, keywords)) {
      results.push({ category, confidence: "high", source: "give_discover_explicit" });
      added.add(category);
      continue;
    }

    // Check program names/descriptions (structured, medium confidence)
    if (matchesAny(programText, highKeywords) || matchesAny(programText, keywords)) {
      results.push({ category, confidence: "medium", source: "program_text_inferred" });
      added.add(category);
      continue;
    }

    // Check general body (low confidence — real match, less certain context)
    if (matchesAny(bodyText, highKeywords)) {
      // highKeywords in body = medium (they're very specific terms)
      results.push({ category, confidence: "medium", source: "body_text_specific" });
      added.add(category);
    } else if (matchesAny(bodyText, keywords)) {
      results.push({ category, confidence: "low", source: "body_text_general" });
      added.add(category);
    }
  }

  // Sort: high first, then medium, then low
  const ORDER = { high: 0, medium: 1, low: 2 };
  return results.sort((a, b) => ORDER[a.confidence] - ORDER[b.confidence]);
}

// ─── Text pool builders ───────────────────────────────────────────────────────

/** Explicit fields: Give Discover "focus area", "cause", "sector" labels.
 *  Includes categories already extracted by the profile parser (with any source),
 *  since those came from the GD page structured fields. */
function buildExplicitText(ngo) {
  const parts = [];
  // 1. Categories already extracted by the profile parser from GD explicit fields
  if (Array.isArray(ngo.categories)) {
    for (const c of ngo.categories) {
      parts.push(c.category);  // treat all parser-extracted categories as explicit seed
    }
  }
  // 2. org_type can seed a category (e.g. "Environment Trust" → Environment)
  if (ngo.org_type) parts.push(ngo.org_type);
  return parts.join(" ");
}

/** Program names and descriptions (structured) */
function buildProgramText(ngo) {
  const parts = [];
  if (Array.isArray(ngo.programs)) {
    for (const p of ngo.programs) {
      if (p.name) parts.push(p.name);
      if (p.description) parts.push(p.description);
    }
  }
  return parts.join(" ");
}

/** General body: address, org_type, report titles etc. */
function buildBodyText(ngo) {
  return [
    ngo.org_type,
    ngo.headquarters_address,
    ...(ngo.reports ?? []).map((r) => r.title),
    ...(ngo.metrics ?? []).map((m) => m.metric_name),
  ]
    .filter(Boolean)
    .join(" ");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function matchesAny(text, terms) {
  if (!text || !terms?.length) return false;
  return terms.some((t) => text.includes(t.toLowerCase()));
}
