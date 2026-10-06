import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCaller, getOrgContext } from "@/lib/access-control";

/**
 * GET /api/ngos/:id/full-profile
 *
 * Single-pane-of-glass NGO profile for corporate diligence — aggregates the
 * live public.ngos row with everything the discovery/enrichment pipeline
 * knows (reached via discovered_ngos.claimed_ngo_id, when that link exists)
 * plus the live project/financials/documents tables. Every section carries
 * its source and confidence — nothing is presented as fact without one.
 *
 * Optional ?projectBudget=<inr> evaluates the capacity hard-filter for a
 * specific corporate project budget and returns the reasoning, not just a
 * pass/fail boolean.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const context = await getOrgContext(user);
  if (!context) return Response.json({ error: "Unsupported account type." }, { status: 403 });

  const mayView =
    context.accountType === "admin" ||
    context.accountType === "corporate" ||
    context.accountType === "corporate_employee" ||
    (context.orgType === "ngo" && context.orgId === id);

  if (!mayView) {
    return Response.json({ error: "Access denied." }, { status: 403 });
  }

  const { data: ngo, error: ngoError } = await supabaseAdmin
    .from("ngos")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (ngoError || !ngo) {
    return Response.json({ error: "NGO not found." }, { status: 404 });
  }

  // ── Discovery-side link, if one exists ──────────────────────────────────
  const { data: discovered } = await supabaseAdmin
    .from("discovered_ngos")
    .select("*")
    .eq("claimed_ngo_id", id)
    .maybeSingle();

  const [
    liveProjects,
    liveFinancials,
    liveAwards,
    livePartners,
    liveDocuments,
    discoveredProjects,
    discoveredFinancials,
    discoveredMetrics,
    discoveredReports,
    discoveredCategories,
    csrDisclosures,
  ] = await Promise.all([
    supabaseAdmin.from("ngo_projects").select("*").eq("ngo_id", id).order("created_at", { ascending: false }),
    supabaseAdmin.from("ngo_financials").select("*").eq("ngo_id", id).order("financial_year", { ascending: false }),
    supabaseAdmin.from("ngo_awards").select("*").eq("ngo_id", id).order("award_year", { ascending: false }),
    supabaseAdmin.from("ngo_partners").select("*").eq("ngo_id", id),
    supabaseAdmin.from("ngo_documents").select("id, doc_type, status, uploaded_at, verified_at, storage_path").eq("ngo_id", id),
    discovered
      ? supabaseAdmin.from("discovered_ngo_projects").select("*").eq("ngo_id", discovered.id).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    discovered
      ? supabaseAdmin.from("discovered_ngo_financials").select("*").eq("ngo_id", discovered.id).order("year", { ascending: false })
      : Promise.resolve({ data: [] }),
    discovered
      ? supabaseAdmin.from("discovered_ngo_metrics").select("*").eq("ngo_id", discovered.id).order("year", { ascending: false })
      : Promise.resolve({ data: [] }),
    discovered
      ? supabaseAdmin.from("discovered_ngo_reports").select("*").eq("ngo_id", discovered.id).order("year", { ascending: false })
      : Promise.resolve({ data: [] }),
    discovered
      ? supabaseAdmin.from("discovered_ngo_categories").select("category, confidence, source").eq("ngo_id", discovered.id)
      : Promise.resolve({ data: [] }),
    // Company-level CSR disclosures currently have no ngo_id link (see Part
    // 1 findings — the bulk dataset has no implementing-agency name field),
    // so this section can't be scoped to a specific NGO yet.
    Promise.resolve({ data: [] }),
  ]);

  // ── Project history, merged from both live and discovery sources ───────
  // discovered_ngo_projects (populated by an earlier, unrelated pipeline
  // run) has a real data-quality problem — a large share of rows are CSS/JS
  // fragments and generic award blurbs mis-captured as "projects" by an
  // upstream text extractor. Filtering here rather than trusting the source,
  // since surfacing this to corporates as fact would be actively misleading.
  const looksLikeJunk = (name: string | null | undefined) => {
    if (!name) return true;
    if (name.length > 220) return true;
    return /[{}<>;]|function\s*\(|@media|grid-template|:\s*hover|\\\d/.test(name);
  };

  const projectHistory = [
    ...(liveProjects.data ?? []).map((p) => ({
      name: p.project_name,
      sector: p.sector,
      description: p.description,
      location: p.location,
      budgetInr: p.budget_inr,
      corporatePartner: p.corporate_partner,
      beneficiaryCount: p.beneficiary_count,
      status: p.current_status,
      year: p.completion_year,
      fundingAmountInr: p.budget_inr,
      fundingAmountSource: p.corporate_partner ? "corporate_partner_disclosed" : "ngo_self_reported",
      sourceUrl: p.source_url,
      confidence: p.confidence,
      verified: p.verified,
    })),
    ...(discoveredProjects.data ?? [])
      .filter((p) => !looksLikeJunk(p.name))
      .map((p) => ({
        name: p.name,
        sector: null,
        description: p.description,
        location: p.location,
        budgetInr: p.funding_amount_inr,
        corporatePartner: null,
        beneficiaryCount: null,
        status: p.status,
        year: null,
        fundingAmountInr: p.funding_amount_inr,
        fundingAmountSource: p.funding_amount_source,
        sourceUrl: p.source_url,
        confidence: p.confidence,
        verified: false,
      })),
  ].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

  // ── Registration / legal status, with verification visibility ──────────
  const registration = {
    registrationNumber: { value: ngo.registration_number, verified: Boolean(ngo.registration_number) && ngo.enrichment_sources_used?.length > 0 },
    panNumber: { value: ngo.pan_number, verified: Boolean(ngo.pan_number) },
    fcraNumber: { value: ngo.fcra_number, verified: Boolean(ngo.fcra_number), source: ngo.fcra_number ? "fcra_online_portal" : null },
    cert12a: { value: ngo.cert_12a, verified: Boolean(ngo.cert_12a) },
    cert80g: { value: ngo.cert_80g, verified: Boolean(ngo.cert_80g) },
    csr1Number: { value: ngo.csr1_number, verified: Boolean(ngo.csr1_number) },
    legalStatus: ngo.legal_status,
  };

  // ── Trust signal components — real fields, not an opaque score ─────────
  const trustSignals = [
    { signal: "FCRA registration", present: Boolean(ngo.fcra_number), confidence: ngo.fcra_number ? "high" : "unknown", source: "FCRA Online Portal" },
    { signal: "12A registered", present: Boolean(ngo.cert_12a), confidence: ngo.cert_12a ? "medium" : "unknown", source: "Give Discover profile" },
    { signal: "80G registered", present: Boolean(ngo.cert_80g), confidence: ngo.cert_80g ? "medium" : "unknown", source: "Give Discover profile" },
    { signal: "Give Discover certification tier", present: Boolean(discovered?.certification_tier), value: discovered?.certification_tier ?? null, confidence: discovered ? "medium" : "unknown", source: "Give Discover" },
    { signal: "Wikipedia presence", present: Boolean(discovered?.wikipedia_match), confidence: discovered ? "medium" : "unknown", source: "Wikipedia cross-reference" },
    { signal: "CSR-1 eligible", present: Boolean(discovered?.csr_eligible), confidence: discovered ? "medium" : "unknown", source: "Give Discover profile" },
    { signal: "Years active", value: ngo.founded_year ? new Date().getFullYear() - ngo.founded_year : null, confidence: ngo.founded_year ? "medium" : "unknown", source: "NGO profile" },
    { signal: "Give.do lifetime platform funding", value: discovered?.givedo_lifetime_raised_inr ?? null, confidence: discovered?.givedo_lifetime_raised_inr ? "high" : "unknown", source: "give.do platform records" },
    { signal: "Give.do supporter count", value: discovered?.givedo_supporter_count ?? null, confidence: discovered?.givedo_supporter_count ? "high" : "unknown", source: "give.do platform records" },
  ];

  const scoreBreakdown = {
    overallTrustScore: ngo.overall_trust_score,
    profileCompleteness: ngo.profile_completeness,
    verificationScore: ngo.verification_score,
    transparencyScore: ngo.transparency_score,
    documentationScore: ngo.documentation_score,
    financialCompleteness: ngo.financial_completeness,
    projectCompleteness: ngo.project_completeness,
    sourcesUsed: ngo.enrichment_sources_used ?? [],
  };

  // ── Capacity filter, only if a project budget was supplied ─────────────
  let capacityFilterResult = null;
  const url = new URL(request.url);
  const projectBudgetParam = url.searchParams.get("projectBudget");
  if (projectBudgetParam) {
    const budget = Number(projectBudgetParam);
    if (!isNaN(budget) && budget > 0) {
      const { passesCapacityFilter } = await import("@/scripts/ngo-enrichment/lib/capacity-filter.mjs");
      capacityFilterResult = await passesCapacityFilter(supabaseAdmin, id, budget);
    }
  }

  return Response.json({
    core: {
      id: ngo.id,
      slug: ngo.slug,
      name: ngo.ngo_name,
      description: ngo.description,
      mission: ngo.mission,
      logoUrl: ngo.logo_url,
      website: ngo.website,
      foundedYear: ngo.founded_year,
      state: ngo.state,
      district: ngo.district,
      addressHeadOffice: ngo.address_head_office,
      email: ngo.email_public,
      phone: ngo.phone,
      sectorPrimary: ngo.sector_primary,
      sectorsSecondary: ngo.sectors_secondary ?? [],
      statesServed: ngo.states_served ?? [],
      leadershipTeam: ngo.leadership_team ?? [],
      socials: {
        linkedin: ngo.linkedin_url, facebook: ngo.facebook_url,
        instagram: ngo.instagram_url, twitter: ngo.twitter_url, youtube: ngo.youtube_url,
      },
    },
    categories: (discoveredCategories.data ?? []).map((c) => ({ category: c.category, confidence: c.confidence, source: c.source })),
    registration,
    projectHistory,
    csrDisclosureHistory: {
      note: "Government CSR-1 disclosure matching is not implemented yet — the bulk MCA dataset has no implementing-agency name field to link against a specific NGO. Not shown per-NGO until a source with real agency names is available.",
      disclosures: csrDisclosures.data ?? [],
    },
    financials: {
      live: liveFinancials.data ?? [],
      discovered: discoveredFinancials.data ?? [],
      givedoLifetimeRaisedInr: discovered?.givedo_lifetime_raised_inr ?? null,
      givedoDonationCount: discovered?.givedo_donation_count ?? null,
      givedoSupporterCount: discovered?.givedo_supporter_count ?? null,
      givedoActiveFundraisersCount: discovered?.givedo_active_fundraisers_count ?? null,
    },
    trustSignals,
    scoreBreakdown,
    metrics: discoveredMetrics.data ?? [],
    awards: liveAwards.data ?? [],
    partners: livePartners.data ?? [],
    reports: {
      live: liveDocuments.data ?? [],
      discovered: discoveredReports.data ?? [],
      compliancePdfs: discovered
        ? {
            registration: discovered.givedo_registration_doc_url,
            fcra: discovered.givedo_fcra_doc_url,
            annualReport: discovered.givedo_annual_report_doc_url,
          }
        : null,
    },
    scoreBreakdownNote: "Trust score is a weighted blend of the components above, not an independent input — see trustSignals and scoreBreakdown for what's actually verified vs. self-reported.",
    capacityFilter: capacityFilterResult,
    dataLineage: {
      hasDiscoveryLink: Boolean(discovered),
      discoveryLinkConfidence: discovered ? "matched by PAN or exact name during backfill" : null,
      lastGivedoSync: discovered?.givedo_last_synced_at ?? null,
      lastEnriched: ngo.last_enriched_at,
    },
  });
}
