/**
 * scripts/ngo-enrichment/lib/capacity-filter.mjs
 *
 * Capacity-based HARD FILTER for project recommendation — a gate, not a
 * scored/weighted input. An NGO whose largest verified historical funding
 * is ₹1 Cr should not be recommended for a ₹10 Cr corporate need, no matter
 * how high its trust score is. Runs BEFORE scoring, never averaged in.
 *
 * Operates on the live public.ngos.id (what recommendation actually keys
 * on), pulling the best available capacity signal in priority order:
 *   1. max(discovered_ngo_projects.funding_amount_inr) — project-level,
 *      reached via discovered_ngos.claimed_ngo_id. Sparse today (nothing
 *      populates this yet), but the highest-confidence tier once it is.
 *   2. discovered_ngos.givedo_lifetime_raised_inr — org-level lifetime
 *      crowdfunding total from give.do's own platform records, linked by
 *      construction (no name-matching risk).
 *   3. ngo_financials.income_total (live table, most recent financial_year)
 *      — annual budget as a last-resort ceiling.
 *   4. null — no capacity data at all. Never silently pass or fail; flag
 *      for manual review.
 */

const DEFAULT_REJECT_MULTIPLE = 3;
// TODO-tunable: starting guess, not calibrated against real outcomes yet.
// Revisit once enough completed projects exist to check whether NGOs that
// passed at e.g. 2.5x-3x actually delivered vs. NGOs that would have failed
// a stricter cutoff.

/**
 * @param {object} supabase - Supabase client (service role)
 * @param {string} ngoId - public.ngos.id
 * @returns {Promise<{ maxHistoricalProject: number|null, source: string|null, detail: string }>}
 */
export async function getMaxProjectAmount(supabase, ngoId) {
  // 1. Project-level funding, via the discovered_ngos link (if one exists).
  const { data: discovered } = await supabase
    .from("discovered_ngos")
    .select("id, givedo_lifetime_raised_inr")
    .eq("claimed_ngo_id", ngoId)
    .maybeSingle();

  if (discovered) {
    const { data: projects } = await supabase
      .from("discovered_ngo_projects")
      .select("funding_amount_inr, funding_amount_source, name")
      .eq("ngo_id", discovered.id)
      .not("funding_amount_inr", "is", null)
      .order("funding_amount_inr", { ascending: false })
      .limit(1);

    if (projects?.length) {
      const top = projects[0];
      return {
        maxHistoricalProject: Number(top.funding_amount_inr),
        source: "project_history",
        detail: `Largest known project "${top.name}" (${top.funding_amount_source ?? "source unspecified"})`,
      };
    }

    // 2. Org-level lifetime crowdfunding total from give.do.
    if (discovered.givedo_lifetime_raised_inr !== null && discovered.givedo_lifetime_raised_inr > 0) {
      return {
        maxHistoricalProject: Number(discovered.givedo_lifetime_raised_inr),
        source: "givedo_lifetime_raised",
        detail: "No project-level funding on record — using lifetime give.do platform total as a ceiling",
      };
    }
  }

  // 3. Annual budget fallback from the live ngo_financials table.
  const { data: financials } = await supabase
    .from("ngo_financials")
    .select("income_total, financial_year")
    .eq("ngo_id", ngoId)
    .not("income_total", "is", null)
    .order("financial_year", { ascending: false })
    .limit(1);

  if (financials?.length) {
    return {
      maxHistoricalProject: Number(financials[0].income_total),
      source: "annual_budget",
      detail: `No project- or platform-level funding data — using ${financials[0].financial_year} annual income as a ceiling`,
    };
  }

  // 4. Nothing at all.
  return { maxHistoricalProject: null, source: null, detail: "No capacity data found on any tier" };
}

/**
 * @param {number|null} maxHistoricalProject
 * @param {number} corporateProjectBudget
 * @param {object} [opts]
 * @param {number} [opts.rejectMultiple] - override the default 3x threshold
 */
export function evaluateCapacity(maxHistoricalProject, corporateProjectBudget, opts = {}) {
  const rejectMultiple = opts.rejectMultiple ?? DEFAULT_REJECT_MULTIPLE;

  if (maxHistoricalProject === null || maxHistoricalProject <= 0) {
    return {
      pass: true,
      confidence: "unknown",
      needsManualReview: true,
      note: "No historical project-size data — cannot verify capacity, flag for manual review rather than auto-reject.",
    };
  }

  const capacityMultiple = corporateProjectBudget / maxHistoricalProject;

  if (capacityMultiple > rejectMultiple) {
    return {
      pass: false,
      confidence: "high",
      needsManualReview: false,
      capacityMultiple: Math.round(capacityMultiple * 10) / 10,
      note: `Corporate budget ₹${corporateProjectBudget.toLocaleString("en-IN")} is ${capacityMultiple.toFixed(1)}x the NGO's largest prior funding (₹${maxHistoricalProject.toLocaleString("en-IN")}).`,
    };
  }

  return {
    pass: true,
    confidence: "high",
    needsManualReview: false,
    capacityMultiple: Math.round(capacityMultiple * 10) / 10,
    note: `Corporate budget is ${capacityMultiple.toFixed(1)}x the NGO's largest prior funding (₹${maxHistoricalProject.toLocaleString("en-IN")}) — within the ${rejectMultiple}x threshold.`,
  };
}

/**
 * Convenience wrapper: looks up the NGO's capacity data and evaluates it
 * against a corporate project budget in one call.
 *
 * @param {object} supabase
 * @param {string} ngoId
 * @param {number} corporateProjectBudget
 * @param {object} [opts]
 */
export async function passesCapacityFilter(supabase, ngoId, corporateProjectBudget, opts = {}) {
  const { maxHistoricalProject, source, detail } = await getMaxProjectAmount(supabase, ngoId);
  const result = evaluateCapacity(maxHistoricalProject, corporateProjectBudget, opts);
  return { ...result, maxHistoricalProject, source, sourceDetail: detail };
}
