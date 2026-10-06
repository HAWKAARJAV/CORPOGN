import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCaller, getCorporateIdForUser } from "@/lib/access-control";

/**
 * GET /api/corporates/workspace-overview
 *
 * Corporate-wide aggregate across every signed project this corporate owns.
 *
 * The per-project route (/api/project-workspace/:projectId/:module) answers
 * "one module, one project". The corporate sidebar pages (Master Analytics,
 * Campaign Management, NGO Management, Budget, ESG, Reports & Approvals,
 * AI Insights, Audit & Compliance) all need the portfolio view instead —
 * every signed project at once — so that lives here, once, rather than the
 * frontend fanning out N x M requests.
 *
 * Only projects that have actually reached `lifecycle_status = 'signed'` AND
 * have a `project_workspaces` row are included: an unsigned opportunity has
 * no workspace data by definition, and the workspace row is what names the
 * partner NGO.
 *
 * Every number returned here is summed from real rows. Nothing is synthesized:
 * if a module table is empty for a project, its totals are zero and the UI
 * shows an empty state.
 */

type Row = Record<string, unknown>;

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: Request) {
  const user = await getCaller(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const corporateId = await getCorporateIdForUser(user);
  if (!corporateId) {
    return NextResponse.json(
      { error: "Only corporate accounts or their active employees can view this overview." },
      { status: 403 },
    );
  }

  // ── 1. Signed projects owned by this corporate, with an unlocked workspace ──
  const { data: workspaceRows, error: wsError } = await supabaseAdmin
    .from("project_workspaces")
    .select("id, opportunity_id, corporate_id, ngo_id, created_at")
    .eq("corporate_id", corporateId);

  if (wsError) return NextResponse.json({ error: wsError.message }, { status: 500 });

  const workspaces = workspaceRows ?? [];
  const candidateProjectIds = workspaces.map((w) => w.opportunity_id);

  const emptyPayload = {
    corporateId,
    projects: [],
    ngos: [],
    campaigns: [],
    budgetLines: [],
    funds: [],
    metrics: [],
    reports: [],
    approvals: [],
    audits: [],
    activity: [],
    matching: { runs: [], topMatches: [] },
    totals: {
      projectCount: 0,
      ngoCount: 0,
      projectBudget: 0,
      budgeted: 0,
      spent: 0,
      released: 0,
      remaining: 0,
      allocationRate: 0,
      releaseRate: 0,
      utilizationRate: 0,
      campaignCount: 0,
      campaignsByStatus: {} as Record<string, number>,
      pendingApprovals: 0,
      approvalsByStatus: {} as Record<string, number>,
      openAudits: 0,
      reportCount: 0,
      metricCount: 0,
    },
  };

  if (candidateProjectIds.length === 0) return NextResponse.json(emptyPayload);

  const { data: oppRows, error: oppError } = await supabaseAdmin
    .from("opportunities")
    .select(
      "id, title, description, focus_area, csr_focus_area, state, district, budget, sdg_targets, target_beneficiaries, expected_start_date, duration_months, status, lifecycle_status, published_at, created_at",
    )
    .eq("corporate_id", corporateId)
    .eq("lifecycle_status", "signed")
    .in("id", candidateProjectIds);

  if (oppError) return NextResponse.json({ error: oppError.message }, { status: 500 });

  const opportunities = oppRows ?? [];
  const projectIds = opportunities.map((o) => o.id);
  if (projectIds.length === 0) return NextResponse.json(emptyPayload);

  const ngoIdByProject = new Map<string, string>();
  for (const w of workspaces) {
    if (projectIds.includes(w.opportunity_id)) ngoIdByProject.set(w.opportunity_id, w.ngo_id);
  }
  const ngoIds = Array.from(new Set(Array.from(ngoIdByProject.values())));

  // ── 2. Every module table, one query each, scoped to the signed projects ───
  const selectFor = (table: string, columns: string) =>
    supabaseAdmin.from(table).select(columns).in("project_id", projectIds).order("created_at", { ascending: false });

  const [
    campaignsRes,
    fundsRes,
    budgetRes,
    meRes,
    reportsRes,
    approvalsRes,
    auditsRes,
    activityRes,
    ngosRes,
    runsRes,
    matchRes,
  ] = await Promise.all([
    selectFor("campaigns", "id, project_id, title, description, status, created_at"),
    selectFor("funds", "id, project_id, amount_inr, purpose, released_at, created_at"),
    selectFor("budget_tracking", "id, project_id, line_item, budgeted_inr, spent_inr, created_at"),
    selectFor("monitoring_evaluation", "id, project_id, metric_name, metric_value, unit, period, created_at"),
    selectFor("workspace_reports", "id, project_id, report_type, title, url, created_at"),
    selectFor("approvals", "id, project_id, item_type, item_ref, status, approved_by, created_at"),
    selectFor("audits", "id, project_id, audit_type, findings, status, audit_date, created_at"),
    supabaseAdmin
      .from("activity_logs")
      .select("id, project_id, module, action, actor_type, actor_id, detail, created_at")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false })
      .limit(60),
    ngoIds.length
      ? supabaseAdmin
          .from("ngos")
          .select(
            "id, slug, ngo_name, logo_url, trust_score, overall_trust_score, transparency_score, verification_score, documentation_score, financial_completeness, project_completeness, profile_completeness, sector_primary, csr_focus_areas, state, district, access_status, legal_status, registration_number, ngo_darpan_id, pan_number, cert_12a, cert_80g, fcra_number, csr1_number, gst_number, tan_number, registration_validity, website, ngo_email",
          )
          .in("id", ngoIds)
      : Promise.resolve({ data: [] as Row[], error: null }),
    supabaseAdmin
      .from("scoring_runs")
      .select("id, project_id, triggered_at, scoring_version, candidate_pool_size, capacity_gate_excluded_count, admin_action")
      .in("project_id", projectIds)
      .order("triggered_at", { ascending: false }),
    supabaseAdmin
      .from("ngo_match_scores")
      .select(
        "id, project_id, ngo_id, computed_at, capacity_gate_passed, capacity_gate_reason, sector_fit_score, location_fit_score, capacity_fit_score, match_score_total, component_breakdown",
      )
      .in("project_id", projectIds)
      .order("match_score_total", { ascending: false })
      .limit(40),
  ]);

  const firstError =
    campaignsRes.error ||
    fundsRes.error ||
    budgetRes.error ||
    meRes.error ||
    reportsRes.error ||
    approvalsRes.error ||
    auditsRes.error ||
    activityRes.error ||
    ngosRes.error ||
    runsRes.error ||
    matchRes.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  const campaigns = (campaignsRes.data ?? []) as unknown as Row[];
  const funds = (fundsRes.data ?? []) as unknown as Row[];
  const budgetLines = (budgetRes.data ?? []) as unknown as Row[];
  const metrics = (meRes.data ?? []) as unknown as Row[];
  const reports = (reportsRes.data ?? []) as unknown as Row[];
  const approvals = (approvalsRes.data ?? []) as unknown as Row[];
  const audits = (auditsRes.data ?? []) as unknown as Row[];
  const activity = (activityRes.data ?? []) as Row[];
  const ngos = (ngosRes.data ?? []) as Row[];
  const runs = (runsRes.data ?? []) as Row[];
  const matches = (matchRes.data ?? []) as Row[];

  // ── 3. Shape NGO partners (the corporate's actually-signed partners) ───────
  const ngoById = new Map<string, Row>(ngos.map((n) => [String(n.id), n]));

  const partnerNgos = ngoIds.map((id) => {
    const n = ngoById.get(id);
    const projectsForNgo = projectIds.filter((pid) => ngoIdByProject.get(pid) === id);
    // Registration/compliance documents we genuinely hold on file, so the
    // compliance checklist reflects the NGO record rather than invented rows.
    const documents = [
      { name: "PAN", value: n?.pan_number ?? null },
      { name: "12A Certificate", value: n?.cert_12a ?? null },
      { name: "80G Certificate", value: n?.cert_80g ?? null },
      { name: "CSR-1", value: n?.csr1_number ?? null },
      { name: "FCRA", value: n?.fcra_number ?? null },
      { name: "NGO Darpan ID", value: n?.ngo_darpan_id ?? null },
      { name: "Registration Number", value: n?.registration_number ?? null },
      { name: "GST", value: n?.gst_number ?? null },
    ].map((doc) => ({
      name: doc.name,
      value: doc.value ? String(doc.value) : null,
      status: doc.value ? "On file" : "Missing",
    }));

    return {
      id,
      slug: n?.slug ?? null,
      name: n?.ngo_name ?? "Unknown NGO",
      logoUrl: n?.logo_url ?? null,
      trustScore: num(n?.trust_score),
      overallTrustScore: num(n?.overall_trust_score),
      scoreBreakdown: {
        transparency: num(n?.transparency_score),
        verification: num(n?.verification_score),
        documentation: num(n?.documentation_score),
        financialCompleteness: num(n?.financial_completeness),
        projectCompleteness: num(n?.project_completeness),
        profileCompleteness: num(n?.profile_completeness),
      },
      sectorPrimary: (n?.sector_primary as string | null) ?? null,
      csrFocusAreas: Array.isArray(n?.csr_focus_areas) ? (n?.csr_focus_areas as string[]) : [],
      state: (n?.state as string | null) ?? null,
      district: (n?.district as string | null) ?? null,
      accessStatus: (n?.access_status as string | null) ?? null,
      legalStatus: (n?.legal_status as string | null) ?? null,
      website: (n?.website as string | null) ?? null,
      email: (n?.ngo_email as string | null) ?? null,
      registrationValidity: (n?.registration_validity as string | null) ?? null,
      documents,
      documentsOnFile: documents.filter((d) => d.status === "On file").length,
      documentsTotal: documents.length,
      projectIds: projectsForNgo,
      projectCount: projectsForNgo.length,
    };
  });

  const partnerById = new Map(partnerNgos.map((p) => [p.id, p]));

  // ── 4. Per-project rollups ────────────────────────────────────────────────
  const byProject = <T extends Row>(rows: T[], pid: string) => rows.filter((r) => r.project_id === pid);

  const projects = opportunities.map((opp) => {
    const pid = opp.id as string;
    const ngoId = ngoIdByProject.get(pid) ?? null;
    const partner = ngoId ? partnerById.get(ngoId) ?? null : null;

    const pBudget = byProject(budgetLines, pid);
    const pFunds = byProject(funds, pid);
    const pCampaigns = byProject(campaigns, pid);
    const pApprovals = byProject(approvals, pid);
    const pAudits = byProject(audits, pid);
    const pReports = byProject(reports, pid);
    const pMetrics = byProject(metrics, pid);

    const budgeted = pBudget.reduce((sum, r) => sum + num(r.budgeted_inr), 0);
    const spent = pBudget.reduce((sum, r) => sum + num(r.spent_inr), 0);
    const released = pFunds.filter((f) => f.released_at).reduce((sum, f) => sum + num(f.amount_inr), 0);
    const fundsPending = pFunds.filter((f) => !f.released_at).reduce((sum, f) => sum + num(f.amount_inr), 0);
    const projectBudget = num(opp.budget);

    return {
      id: pid,
      title: opp.title as string,
      description: (opp.description as string | null) ?? null,
      focusArea: (opp.focus_area as string | null) ?? (opp.csr_focus_area as string | null) ?? null,
      state: (opp.state as string | null) ?? null,
      district: (opp.district as string | null) ?? null,
      sdgTargets: Array.isArray(opp.sdg_targets) ? (opp.sdg_targets as string[]) : [],
      targetBeneficiaries: Array.isArray(opp.target_beneficiaries) ? (opp.target_beneficiaries as string[]) : [],
      expectedStartDate: (opp.expected_start_date as string | null) ?? null,
      durationMonths: (opp.duration_months as number | null) ?? null,
      status: (opp.status as string | null) ?? null,
      lifecycleStatus: (opp.lifecycle_status as string | null) ?? null,
      createdAt: (opp.created_at as string | null) ?? null,
      ngo: partner
        ? {
            id: partner.id,
            name: partner.name,
            slug: partner.slug,
            logoUrl: partner.logoUrl,
            trustScore: partner.trustScore,
          }
        : null,
      totals: {
        projectBudget,
        budgeted,
        spent,
        released,
        fundsPending,
        remaining: projectBudget - spent,
        allocationRate: projectBudget > 0 ? Math.round((budgeted / projectBudget) * 100) : 0,
        releaseRate: projectBudget > 0 ? Math.round((released / projectBudget) * 100) : 0,
        utilizationRate: budgeted > 0 ? Math.round((spent / budgeted) * 100) : 0,
      },
      counts: {
        campaigns: pCampaigns.length,
        budgetLines: pBudget.length,
        funds: pFunds.length,
        approvals: pApprovals.length,
        pendingApprovals: pApprovals.filter((a) => a.status === "pending").length,
        audits: pAudits.length,
        reports: pReports.length,
        metrics: pMetrics.length,
      },
    };
  });

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const contextOf = (pid: unknown) => {
    const project = projectById.get(String(pid));
    return {
      projectId: String(pid),
      projectTitle: project?.title ?? "Unknown project",
      ngoId: project?.ngo?.id ?? null,
      ngoName: project?.ngo?.name ?? null,
    };
  };

  // ── 5. Flat, context-carrying lists for the portfolio-wide tables ─────────
  const flatCampaigns = campaigns.map((c) => ({
    id: String(c.id),
    ...contextOf(c.project_id),
    title: (c.title as string) ?? "",
    description: (c.description as string | null) ?? null,
    status: (c.status as string) ?? "planned",
    createdAt: (c.created_at as string | null) ?? null,
  }));

  const flatBudgetLines = budgetLines.map((b) => ({
    id: String(b.id),
    ...contextOf(b.project_id),
    lineItem: (b.line_item as string) ?? "",
    budgeted: num(b.budgeted_inr),
    spent: num(b.spent_inr),
    createdAt: (b.created_at as string | null) ?? null,
  }));

  const flatFunds = funds.map((f) => ({
    id: String(f.id),
    ...contextOf(f.project_id),
    amount: num(f.amount_inr),
    purpose: (f.purpose as string | null) ?? null,
    releasedAt: (f.released_at as string | null) ?? null,
    createdAt: (f.created_at as string | null) ?? null,
  }));

  const flatMetrics = metrics.map((m) => ({
    id: String(m.id),
    ...contextOf(m.project_id),
    metricName: (m.metric_name as string) ?? "",
    metricValue: num(m.metric_value),
    unit: (m.unit as string | null) ?? null,
    period: (m.period as string | null) ?? null,
    createdAt: (m.created_at as string | null) ?? null,
  }));

  const flatReports = reports.map((r) => ({
    id: String(r.id),
    ...contextOf(r.project_id),
    title: (r.title as string) ?? "",
    reportType: (r.report_type as string) ?? "",
    url: (r.url as string | null) ?? null,
    createdAt: (r.created_at as string | null) ?? null,
  }));

  const flatApprovals = approvals.map((a) => ({
    id: String(a.id),
    ...contextOf(a.project_id),
    itemType: (a.item_type as string) ?? "",
    itemRef: (a.item_ref as string | null) ?? null,
    status: (a.status as string) ?? "pending",
    approvedBy: (a.approved_by as string | null) ?? null,
    createdAt: (a.created_at as string | null) ?? null,
  }));

  const flatAudits = audits.map((a) => ({
    id: String(a.id),
    ...contextOf(a.project_id),
    auditType: (a.audit_type as string) ?? "",
    findings: (a.findings as string | null) ?? null,
    status: (a.status as string) ?? "pending",
    auditDate: (a.audit_date as string | null) ?? null,
    createdAt: (a.created_at as string | null) ?? null,
  }));

  const flatActivity = activity.map((a) => ({
    id: String(a.id),
    ...contextOf(a.project_id),
    module: (a.module as string) ?? "",
    action: (a.action as string) ?? "",
    actorType: (a.actor_type as string) ?? "",
    detail: (a.detail as Record<string, unknown>) ?? {},
    createdAt: (a.created_at as string | null) ?? null,
  }));

  // ── 6. Matching signals — the only genuinely computed "intelligence" we    ─
  //       have. Surfaced as-is (scores + the engine's own explanations), not
  //       rewritten into invented prose.
  const scoredNgoIds = Array.from(new Set(matches.map((m) => String(m.ngo_id))));
  const { data: scoredNgoRows } = scoredNgoIds.length
    ? await supabaseAdmin.from("ngos").select("id, ngo_name, slug, trust_score, state, sector_primary").in("id", scoredNgoIds)
    : { data: [] as Row[] };
  const scoredNgoById = new Map((scoredNgoRows ?? []).map((n) => [String(n.id), n]));

  // A match row whose NGO no longer exists (reseeded/removed NGO record) is
  // dropped rather than rendered as "Unknown NGO" — a dangling score is not a
  // signal anyone can act on.
  const topMatches = matches
    .filter((m) => scoredNgoById.has(String(m.ngo_id)))
    .map((m) => {
      const n = scoredNgoById.get(String(m.ngo_id));
      const breakdown = (m.component_breakdown as Record<string, string> | null) ?? {};
      return {
        id: String(m.id),
        ...contextOf(m.project_id),
        ngoId: String(m.ngo_id),
        ngoName: (n?.ngo_name as string) ?? "Unknown NGO",
        ngoSlug: (n?.slug as string | null) ?? null,
        ngoState: (n?.state as string | null) ?? null,
        ngoSector: (n?.sector_primary as string | null) ?? null,
        ngoTrustScore: num(n?.trust_score),
        matchScore: num(m.match_score_total),
        sectorFit: num(m.sector_fit_score),
        locationFit: num(m.location_fit_score),
        capacityFit: num(m.capacity_fit_score),
        capacityGatePassed: Boolean(m.capacity_gate_passed),
        capacityGateReason: (m.capacity_gate_reason as string | null) ?? null,
        breakdown,
        computedAt: (m.computed_at as string | null) ?? null,
      };
    });

  const scoringRuns = runs.map((r) => ({
    id: String(r.id),
    ...contextOf(r.project_id),
    triggeredAt: (r.triggered_at as string | null) ?? null,
    scoringVersion: (r.scoring_version as string | null) ?? null,
    candidatePoolSize: num(r.candidate_pool_size),
    capacityGateExcludedCount: num(r.capacity_gate_excluded_count),
    adminAction: (r.admin_action as string | null) ?? null,
  }));

  // ── 7. Portfolio totals ───────────────────────────────────────────────────
  const projectBudget = projects.reduce((sum, p) => sum + p.totals.projectBudget, 0);
  const budgeted = projects.reduce((sum, p) => sum + p.totals.budgeted, 0);
  const spent = projects.reduce((sum, p) => sum + p.totals.spent, 0);
  const released = projects.reduce((sum, p) => sum + p.totals.released, 0);

  const countBy = (rows: { status: string }[]) =>
    rows.reduce<Record<string, number>>((acc, row) => {
      const key = row.status || "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

  return NextResponse.json({
    corporateId,
    projects,
    ngos: partnerNgos,
    campaigns: flatCampaigns,
    budgetLines: flatBudgetLines,
    funds: flatFunds,
    metrics: flatMetrics,
    reports: flatReports,
    approvals: flatApprovals,
    audits: flatAudits,
    activity: flatActivity,
    matching: { runs: scoringRuns, topMatches },
    totals: {
      projectCount: projects.length,
      ngoCount: partnerNgos.length,
      projectBudget,
      budgeted,
      spent,
      released,
      remaining: projectBudget - spent,
      allocationRate: projectBudget > 0 ? Math.round((budgeted / projectBudget) * 100) : 0,
      releaseRate: projectBudget > 0 ? Math.round((released / projectBudget) * 100) : 0,
      utilizationRate: budgeted > 0 ? Math.round((spent / budgeted) * 100) : 0,
      campaignCount: flatCampaigns.length,
      campaignsByStatus: countBy(flatCampaigns),
      pendingApprovals: flatApprovals.filter((a) => a.status === "pending").length,
      approvalsByStatus: countBy(flatApprovals),
      openAudits: flatAudits.filter((a) => a.status !== "closed" && a.status !== "completed").length,
      reportCount: flatReports.length,
      metricCount: flatMetrics.length,
    },
  });
}
