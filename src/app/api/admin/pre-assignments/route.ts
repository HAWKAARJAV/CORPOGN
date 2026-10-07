import { requirePlatformAdmin } from "@/lib/access-control";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const auth = await requirePlatformAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  try {
    let q = supabaseAdmin
      .from("pre_assignments")
      .select(`
        id,
        match_score,
        status,
        corporate_confirmed_at,
        ngo_confirmed_at,
        activated_at,
        created_at,
        opportunity:opportunities(
          id,
          title,
          focus_area,
          budget,
          state,
          corporate:corporates(company_name)
        ),
        ngo_id,
        discovered_ngo_id,
        ngo:discovered_ngos(
          id,
          name,
          certification_tier,
          city,
          give_discover_url
        )
      `);

    if (status) {
      q = q.eq("status", status);
    }

    q = q.order("created_at", { ascending: false });

    const { data, error } = await q;
    if (error) throw error;

    const liveNgoIds = [
      ...new Set((data ?? []).map((row: { ngo_id?: string | null }) => row.ngo_id).filter(Boolean)),
    ] as string[];
    const { data: liveNgos } = liveNgoIds.length
      ? await supabaseAdmin.from("ngos").select("id, ngo_name, state").in("id", liveNgoIds)
      : { data: [] };
    const liveById = new Map((liveNgos ?? []).map((n) => [n.id, n]));

    // Clean up mapping for frontend consumption
    const list = (data ?? []).map((row: any) => {
      const opp = row.opportunity ?? {};
      const discovered = row.ngo ?? {};
      const live = row.ngo_id ? liveById.get(row.ngo_id) : null;
      const corp = opp.corporate ?? {};

      return {
        id: row.id,
        match_score: row.match_score,
        status: row.status,
        corporate_confirmed_at: row.corporate_confirmed_at,
        ngo_confirmed_at: row.ngo_confirmed_at,
        activated_at: row.activated_at,
        created_at: row.created_at,
        opportunity_id: opp.id,
        opportunity_title: opp.title ?? "Corporate Project",
        focus_area: opp.focus_area ?? "General",
        budget: Number(opp.budget ?? 0),
        state: opp.state ?? "Pan India",
        corporate_name: corp.company_name ?? "Corporate Partner",
        discovered_ngo_id: discovered.id ?? row.discovered_ngo_id ?? null,
        ngo_id: row.ngo_id ?? null,
        ngo_name: live?.ngo_name ?? discovered.name ?? "NGO Partner",
        ngo_tier: discovered.certification_tier ?? "None",
        ngo_city: discovered.city ?? live?.state ?? "—",
        give_discover_url: discovered.give_discover_url ?? "",
      };
    });

    return NextResponse.json({ pre_assignments: list });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
