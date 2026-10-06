/**
 * scripts/ngo-enrichment/lib/merger.mjs
 *
 * Merges enrichment results from multiple sources into a single NGO record.
 *
 * Rules (in priority order):
 *  1. Never overwrite a field marked verified = true in an existing source record.
 *  2. If existing DB value is NULL or empty → always write incoming.
 *  3. If two incoming sources agree → higher combined confidence wins.
 *  4. If sources disagree → prefer the one with higher authority (CONFIDENCE_RANK).
 *  5. Arrays are union-merged (deduped), not replaced.
 */

/** Source authority ranking — higher = more trusted */
const CONFIDENCE_RANK = {
  official_website: 0.90,
  give_discover:    0.82,
  fcra_online:      0.95,
  csrbox:           0.72,
  ngo_darpan:       0.88,
  linkedin:         0.60,
  manual:           1.00,
};

/** Fields that are text arrays — merged by union instead of replacement */
const ARRAY_FIELDS = new Set([
  "focus_areas", "beneficiary_types", "sectors_secondary", "sdgs",
  "csr_focus_areas", "states_served", "districts_served", "cities_served", "countries",
  "enrichment_sources_used",
]);

/** Fields that must NEVER be overwritten once set (legal identifiers) */
const IMMUTABLE_ONCE_SET = new Set([
  "registration_number", "pan_number", "fcra_number", "ngo_darpan_id",
  "csr1_number", "gst_number", "tan_number",
]);

/**
 * Merge a list of EnrichmentResult objects into a single flat field map.
 *
 * @param {object} existingNgo — Current DB row (all fields, may have nulls)
 * @param {Array<EnrichmentResult>} results — Results from each source (may include nulls)
 * @returns {{ mergedFields: object, sourceContributions: Array }}
 */
export function mergeResults(existingNgo, results) {
  const validResults = results.filter(r => r && r.fetchSuccess && r.fields && Object.keys(r.fields).length > 0);

  const mergedFields = {};
  const sourceContributions = []; // which source contributed which field

  // Sort by descending confidence so highest authority wins in case of conflict
  const sorted = [...validResults].sort(
    (a, b) => (CONFIDENCE_RANK[b.sourceType] ?? b.confidence ?? 0) - (CONFIDENCE_RANK[a.sourceType] ?? a.confidence ?? 0)
  );

  for (const result of sorted) {
    const authority = CONFIDENCE_RANK[result.sourceType] ?? result.confidence ?? 0.5;
    const fieldsWritten = [];

    for (const [field, value] of Object.entries(result.fields)) {
      if (value === null || value === undefined || value === "") continue;

      // Array fields: union-merge
      if (ARRAY_FIELDS.has(field)) {
        const existing = Array.isArray(existingNgo[field]) ? existingNgo[field] : [];
        const incoming = Array.isArray(value) ? value : [value];
        const merged = [...new Set([...existing, ...incoming])].filter(Boolean);
        if (merged.length > existing.length) {
          mergedFields[field] = merged;
          fieldsWritten.push(field);
        }
        continue;
      }

      // Immutable fields: only write if currently null/empty in DB
      if (IMMUTABLE_ONCE_SET.has(field)) {
        const dbVal = existingNgo[field];
        if (dbVal && dbVal !== "" && dbVal !== null) continue; // already set, skip
        if (mergedFields[field]) continue; // already written by a higher authority
        mergedFields[field] = value;
        fieldsWritten.push(field);
        continue;
      }

      // Regular fields: write if DB is null/empty OR if not yet decided
      const dbVal = existingNgo[field];
      const dbEmpty = dbVal === null || dbVal === undefined || dbVal === "" ||
        (Array.isArray(dbVal) && dbVal.length === 0);

      if (dbEmpty && !mergedFields[field]) {
        mergedFields[field] = value;
        fieldsWritten.push(field);
      }
      // If already in mergedFields, lower authority source loses (sorted descending)
    }

    if (fieldsWritten.length > 0) {
      sourceContributions.push({
        sourceType: result.sourceType,
        sourceUrl: result.sourceUrl,
        confidence: authority,
        fieldsUpdated: fieldsWritten,
        rawData: result.rawData ?? {},
        fetchSuccess: result.fetchSuccess,
      });
    }
  }

  // Track which sources were used
  if (sorted.length > 0) {
    const usedSources = [...new Set(sorted.map(r => r.sourceType))];
    const existingSources = Array.isArray(existingNgo.enrichment_sources_used)
      ? existingNgo.enrichment_sources_used : [];
    mergedFields.enrichment_sources_used = [...new Set([...existingSources, ...usedSources])];
  }

  return { mergedFields, sourceContributions };
}

/**
 * Build the projects rows to upsert into ngo_projects.
 */
export function buildProjectRows(ngoId, results) {
  const projects = [];
  for (const result of results) {
    if (!result?.fetchSuccess || !result?.projects) continue;
    for (const proj of result.projects) {
      projects.push({
        ngo_id: ngoId,
        project_name: proj.name,
        sector: proj.sector ?? null,
        description: proj.description ?? null,
        location: proj.location ?? null,
        states: proj.states ?? [],
        budget_inr: proj.budget ?? null,
        corporate_partner: proj.corporate_partner ?? null,
        funding_agency: proj.funding_agency ?? null,
        beneficiary_count: proj.beneficiary_count ?? null,
        outcomes: proj.outcomes ?? null,
        current_status: proj.status ?? "ongoing",
        source_url: result.sourceUrl,
        confidence: result.confidence ?? 0.5,
        verified: false,
      });
    }
  }
  return projects;
}

/**
 * Build the impact metric rows to upsert into ngo_impact_metrics.
 */
export function buildImpactRows(ngoId, results) {
  const metrics = [];
  for (const result of results) {
    if (!result?.fetchSuccess || !result?.impactMetrics) continue;
    for (const metric of result.impactMetrics) {
      metrics.push({
        ngo_id: ngoId,
        metric_name: metric.name,
        metric_value: metric.value,
        metric_unit: metric.unit ?? null,
        metric_year: metric.year ?? null,
        category: metric.category ?? null,
        source_url: result.sourceUrl,
        confidence: result.confidence ?? 0.5,
        verified: false,
      });
    }
  }
  return metrics;
}
