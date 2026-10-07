import { NextResponse } from "next/server";
import { getCaller, getNgoIdForUser } from "@/lib/access-control";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * GET /api/ngo/signed-workspaces
 *
 * All activated project workspaces for the caller's NGO (newest first).
 * Used by the NGO dashboard to pick the correct opportunity_id for module APIs.
 */
export async function GET(request: Request) {
  const user = await getCaller(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const ngoId = await getNgoIdForUser(user);
  if (!ngoId) {
    return NextResponse.json({ error: "Only NGO accounts can list signed workspaces." }, { status: 403 });
  }

  const { data: rows, error } = await supabaseAdmin
    .from("project_workspaces")
    .select("opportunity_id, created_at, opportunities(id, title, lifecycle_status)")
    .eq("ngo_id", ngoId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const workspaces = (rows ?? [])
    .map((row) => {
      const rawOpp = row.opportunities as
        | { id: string; title: string; lifecycle_status: string }
        | { id: string; title: string; lifecycle_status: string }[]
        | null;
      const opp = Array.isArray(rawOpp) ? rawOpp[0] : rawOpp;
      if (!opp || opp.lifecycle_status !== "signed") return null;
      return {
        opportunityId: String(row.opportunity_id),
        title: String(opp.title ?? "CSR Project"),
        createdAt: (row.created_at as string | null) ?? null,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ workspaces });
}
