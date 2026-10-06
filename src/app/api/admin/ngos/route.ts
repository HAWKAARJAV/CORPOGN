import { requirePlatformAdmin } from "@/lib/access-control";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const auth = await requirePlatformAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "25", 10);
  const tier = searchParams.get("tier");
  const city = searchParams.get("city");
  const search = searchParams.get("search");
  const sort = searchParams.get("sort") ?? "composite_rank";
  const dir = searchParams.get("dir") === "asc" ? true : false;
  const status = searchParams.get("status");

  const offset = (page - 1) * limit;

  let q = supabaseAdmin
    .from("discovered_ngos")
    .select(
      `id, name, legal_name, give_discover_url, certification_tier, 
       transparency_rating, city, state, website, pan, registration_number,
       fcra_number, founded_year, org_type, wikipedia_match,
       impact_score, transparency_score, completeness_score, verification_score,
       composite_rank, enrich_status, claimed_ngo_id, created_at`,
      { count: "exact" }
    );

  if (tier) q = q.eq("certification_tier", tier);
  if (city) q = q.ilike("city", `%${city}%`);
  if (search) q = q.ilike("name", `%${search}%`);
  if (status) q = q.eq("enrich_status", status);

  q = q.order(sort, { ascending: dir }).range(offset, offset + limit - 1);

  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ngos: data, total: count ?? 0, page, limit });
}
