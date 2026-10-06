import { getCaller, getOrgContext } from "@/lib/access-control";
import { supabaseAdmin } from "@/lib/supabase-admin";

async function requireAdmin(request: Request) {
  const user = await getCaller(request);
  if (!user) return { error: "Unauthorized.", status: 401 } as const;
  const context = await getOrgContext(user);
  if (!context || context.accountType !== "admin") {
    return { error: "Only platform admins can access this endpoint.", status: 403 } as const;
  }
  return { user, context } as const;
}

function isSchemaMissing(error?: { message?: string } | null) {
  return Boolean(error?.message?.includes("schema cache") || error?.message?.includes("does not exist"));
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  // ── Enrichment status breakdown ──────────────────────────────────────────
  const [
    { data: statusRows, error: statusErr },
    { data: recentRuns, error: runsErr },
    { data: scoreStats, error: scoreErr },
    { data: sourceStats, error: srcErr },
  ] = await Promise.all([
    supabaseAdmin
      .from("ngos")
      .select("enrichment_status, profile_completeness, overall_trust_score, last_enriched_at")
      .is("deleted_at", null),
    supabaseAdmin
      .from("ngo_enrichment_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("ngos")
      .select("profile_completeness, transparency_score, verification_score, documentation_score, financial_completeness, project_completeness, overall_trust_score")
      .is("deleted_at", null)
      .eq("enrichment_status", "done"),
    supabaseAdmin
      .from("ngo_enrichment_sources")
      .select("source_type, fetch_success")
      .order("fetched_at", { ascending: false })
      .limit(500),
  ]);

  if (statusErr && !isSchemaMissing(statusErr)) {
    return Response.json({ error: statusErr.message }, { status: 500 });
  }

  const rows = statusRows ?? [];

  // Count by status
  const counts = rows.reduce(
    (acc, r) => {
      const s = (r.enrichment_status as string) ?? "pending";
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  // Average scores (only for enriched NGOs)
  const enriched = (scoreStats ?? []);
  const avg = (field: keyof typeof enriched[0]) =>
    enriched.length > 0
      ? Math.round(enriched.reduce((s, r) => s + (Number(r[field]) || 0), 0) / enriched.length)
      : 0;

  // Source success stats
  const srcRows = sourceStats ?? [];
  const sourceBreakdown = srcRows.reduce(
    (acc, r) => {
      const t = r.source_type as string;
      if (!acc[t]) acc[t] = { success: 0, failed: 0 };
      if (r.fetch_success) acc[t].success++;
      else acc[t].failed++;
      return acc;
    },
    {} as Record<string, { success: number; failed: number }>,
  );

  // Per-NGO list for the table (latest only — limit 100)
  const { data: ngoList } = await supabaseAdmin
    .from("ngos")
    .select(
      "id, ngo_name, state, enrichment_status, profile_completeness, overall_trust_score, last_enriched_at, enrichment_error, website",
    )
    .is("deleted_at", null)
    .order("profile_completeness", { ascending: false })
    .limit(100);

  return Response.json({
    summary: {
      total:      rows.length,
      pending:    counts["pending"]    ?? 0,
      processing: counts["processing"] ?? 0,
      done:       counts["done"]       ?? 0,
      failed:     counts["failed"]     ?? 0,
    },
    averageScores: {
      profileCompleteness:   avg("profile_completeness"),
      transparencyScore:     avg("transparency_score"),
      verificationScore:     avg("verification_score"),
      documentationScore:    avg("documentation_score"),
      financialCompleteness: avg("financial_completeness"),
      projectCompleteness:   avg("project_completeness"),
      overallTrustScore:     avg("overall_trust_score"),
    },
    sourceBreakdown,
    recentRuns: !isSchemaMissing(runsErr) ? (recentRuns ?? []) : [],
    ngos: ngoList ?? [],
  });
}
