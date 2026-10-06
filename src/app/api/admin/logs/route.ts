import { requirePlatformAdmin } from "@/lib/access-control";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const auth = await requirePlatformAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("run_id");
  const severity = searchParams.get("severity");
  const step = searchParams.get("step");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = (page - 1) * limit;

  let q = supabaseAdmin
    .from("research_logs")
    .select("id,run_id,step,entity_type,entity_ref,message,metadata,severity,created_at", {
      count: "exact",
    });

  if (runId) q = q.eq("run_id", runId);
  if (severity) q = q.eq("severity", severity);
  if (step) q = q.eq("step", step);

  q = q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get distinct run IDs for the run filter dropdown
  const { data: runs } = await supabaseAdmin
    .from("research_logs")
    .select("run_id,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const runIds = [...new Map((runs ?? []).map((r: any) => [r.run_id, r])).values()].map(
    (r: any) => ({ run_id: r.run_id, started_at: r.created_at })
  );

  return NextResponse.json({ logs: data, total: count ?? 0, runs: runIds, page, limit });
}
