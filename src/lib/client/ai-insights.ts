/**
 * Lightweight client-side copy helpers. NGO opportunity match scores are computed
 * server-side in `/api/ngo/opportunities` (see ngo-opportunity-fit.mjs).
 */

export type OpportunityFit = {
  score: number;
  label: string;
  insight: string;
};

export function opportunityFitForNgo(
  ngoTrustScore: number,
  minRequired: number | null | undefined,
): OpportunityFit {
  const trust = Math.max(0, Math.round(ngoTrustScore));
  const min = Math.max(0, Math.round(minRequired ?? 0));

  if (min > 0 && trust < min) {
    return {
      score: Math.max(15, Math.round((trust / min) * 55)),
      label: "Eligibility gap",
      insight: `CorpoGN AI notes your trust score (${trust}) is below this corporate minimum (${min}). Upload compliance evidence to improve ranking.`,
    };
  }

  const score = min > 0
    ? Math.min(98, Math.round(55 + (trust / Math.max(min, 1)) * 35))
    : Math.min(98, Math.round(40 + trust * 0.55));

  if (score >= 80) {
    return {
      score,
      label: "Strong AI match",
      insight: "High predicted fit — trust profile and project requirements align well in our match model.",
    };
  }

  return {
    score,
    label: "Good match",
    insight: "Moderate fit — AI recommends tailoring your proposal to the stated focus area and SDG targets.",
  };
}

export const AI_PRODUCT_COPY = {
  matchmaker: "CorpoGN AI ranks NGOs using trust scores, capacity gates, and project fit — with human override for edge cases.",
  enrichment: "Autonomous enrichment pipeline scrapes and scores public NGO signals to keep the directory investor-grade.",
  proposalReview: "LLM-powered CSR proposal review (Groq, OpenRouter, or Gemini) checks Schedule VII alignment, metrics, and budget clarity.",
  discovery: "AI-assisted discovery sorts partners by trust, focus overlap, and compliance readiness.",
  complianceSummary:
    "Streaming LLM summaries compliance vault metadata, partner document gaps, and due-diligence priorities — paste PDF excerpts for deeper review.",
  impactReport:
    "Auto-drafts board-ready impact narratives from M&E metrics and field notes; edit before corporate approval workflows.",
  copilot:
    "CorpoGN Copilot streams answers across NGO, corporate, and admin dashboards with page-aware CSR context.",
} as const;
