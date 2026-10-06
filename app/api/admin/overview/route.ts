import { requirePlatformAdmin } from "@/lib/access-control";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const [
      { count: ngoCount },
      { count: discoveredCount },
      { count: projectCount },
      { count: corporateCount },
      { count: activeProjectCount },
      { data: topNgos },
      { data: recentLogs },
      { data: pipelineRuns },
      { data: projectStats },
    ] = await Promise.all([
      supabaseAdmin.from("ngos").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("discovered_ngos").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("project_connections").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("corporates").select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("project_connections")
        .select("*", { count: "exact", head: true })
        .eq("status", "active"),
      supabaseAdmin
        .from("discovered_ngos")
        .select("id,name,certification_tier,composite_rank,transparency_score,verification_score,completeness_score,impact_score,city,enrich_status")
        .order("composite_rank", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("research_logs")
        .select("id,step,message,severity,created_at,entity_ref,metadata")
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("research_logs")
        .select("run_id,created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("project_connections")
        .select("status,budget,progress,focus_area"),
    ]);

    // Unique pipeline runs
    const runIds = [...new Set((pipelineRuns ?? []).map((r: any) => r.run_id))];

    // Project stats by status
    const byStatus: Record<string, { count: number; totalBudget: number }> = {};
    for (const row of (projectStats ?? []) as any[]) {
      const s = row.status ?? "unknown";
      if (!byStatus[s]) byStatus[s] = { count: 0, totalBudget: 0 };
      byStatus[s].count++;
      
      // Parse budget text if it's formatted
      let numericBudget = 2500000;
      if (row.budget) {
        const budgetStr = String(row.budget);
        const cleaned = budgetStr.replace(/[^0-9]/g, "");
        const parsed = parseInt(cleaned, 10);
        if (!isNaN(parsed)) {
          if (budgetStr.toLowerCase().includes("l") && parsed < 100) {
            numericBudget = parsed * 100000;
          } else if (budgetStr.toLowerCase().includes("cr") && parsed < 100) {
            numericBudget = parsed * 10000000;
          } else {
            numericBudget = parsed;
          }
        }
      }
      byStatus[s].totalBudget += numericBudget;
    }

    const totalBudget = (projectStats ?? []).reduce(
      (sum: number, row: any) => {
        let numericBudget = 2500000;
        if (row.budget) {
          const budgetStr = String(row.budget);
          const cleaned = budgetStr.replace(/[^0-9]/g, "");
          const parsed = parseInt(cleaned, 10);
          if (!isNaN(parsed)) {
            if (budgetStr.toLowerCase().includes("l") && parsed < 100) {
              numericBudget = parsed * 100000;
            } else if (budgetStr.toLowerCase().includes("cr") && parsed < 100) {
              numericBudget = parsed * 10000000;
            } else {
              numericBudget = parsed;
            }
          }
        }
        return sum + numericBudget;
      },
      0
    );

    // Discovered NGO tier breakdown
    const { data: tierData } = await supabaseAdmin
      .from("discovered_ngos")
      .select("certification_tier");
    const tiers: Record<string, number> = { Gold: 0, Silver: 0, Bronze: 0, None: 0 };
    for (const r of (tierData ?? []) as any[]) {
      const t = r.certification_tier ?? "None";
      tiers[t] = (tiers[t] ?? 0) + 1;
    }

    // Category breakdown
    const { data: catData } = await supabaseAdmin
      .from("discovered_ngo_categories")
      .select("category");
    const catCounts: Record<string, number> = {};
    for (const r of (catData ?? []) as any[]) {
      const c = r.category;
      catCounts[c] = (catCounts[c] ?? 0) + 1;
    }

    return NextResponse.json({
      stats: {
        registeredNgos: ngoCount ?? 0,
        discoveredNgos: discoveredCount ?? 0,
        totalProjects: projectCount ?? 0,
        activeProjects: activeProjectCount ?? 0,
        corporates: corporateCount ?? 0,
        pipelineRuns: runIds.length,
        totalBudgetInr: totalBudget,
      },
      projectsByStatus: byStatus,
      tierBreakdown: tiers,
      categoryBreakdown: catCounts,
      topDiscoveredNgos: topNgos ?? [],
      recentLogs: recentLogs ?? [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
