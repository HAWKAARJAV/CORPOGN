import { getCaller, getOrgContext } from "@/lib/access-control";
import { AI_PRODUCT_COPY } from "@/lib/ai-insights";
import { supabaseAdmin } from "@/lib/supabase-admin";

function textFromRegistration(data: unknown, key: string) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export async function GET(request: Request) {
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const context = await getOrgContext(user);
  if (!context || context.orgType !== "corporate") {
    return Response.json(
      { error: "Only corporate users can discover NGOs." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();
  const focus = url.searchParams.get("focus")?.trim();
  const state = url.searchParams.get("state")?.trim();

  // access_status in live data is only ever 'pending' or 'active' — 'verified'
  // never appears. Filtering to ['verified','active'] left 553/555 NGOs
  // invisible here. Corporates should be able to discover any non-rejected
  // NGO; there's currently no 'rejected'/'suspended' status to exclude.
  let builder = supabaseAdmin
    .from("ngos")
    .select(
      "id, slug, ngo_name, ngo_email, access_status, trust_score, overall_trust_score, registration_data, ngo_type, state, website, mission, registration_number, pan_number, focus_areas, beneficiary_types, sector_primary, logo_url",
    )
    .order("trust_score", { ascending: false })
    .limit(50);

  if (query) {
    builder = builder.or(`ngo_name.ilike.%${query}%,mission.ilike.%${query}%,state.ilike.%${query}%`);
  }
  if (state) builder = builder.eq("state", state);
  if (focus) builder = builder.contains("focus_areas", [focus]);

  const { data, error } = await builder;
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const ngos = (data ?? []).map((ngo) => ({
    id: ngo.id,
    slug: ngo.slug,
    name: ngo.ngo_name,
    email: ngo.ngo_email,
    status: ngo.access_status,
    trustScore: ngo.overall_trust_score || ngo.trust_score || 0,
    sectorPrimary: ngo.sector_primary ?? null,
    logoUrl: ngo.logo_url ?? null,
    ngoType: ngo.ngo_type ?? textFromRegistration(ngo.registration_data, "ngo_type"),
    state: ngo.state ?? textFromRegistration(ngo.registration_data, "state"),
    website: ngo.website ?? textFromRegistration(ngo.registration_data, "website"),
    mission: ngo.mission ?? textFromRegistration(ngo.registration_data, "mission"),
    registrationNumber:
      ngo.registration_number ?? textFromRegistration(ngo.registration_data, "registration_number"),
    panNumber: ngo.pan_number ?? textFromRegistration(ngo.registration_data, "pan_number"),
    focusAreas: ngo.focus_areas ?? [],
    beneficiaryTypes: ngo.beneficiary_types ?? [],
  }));

  return Response.json({
    ngos,
    ai: {
      ranking: "trust_focus_state",
      summary: AI_PRODUCT_COPY.discovery,
      model: "CorpoGN Trust + Focus Ranker",
    },
  });
}
