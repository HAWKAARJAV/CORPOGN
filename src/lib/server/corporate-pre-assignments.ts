import { supabaseAdmin } from "@/lib/supabase-admin";

export type ShapedPreAssignment = {
  id: string;
  opportunityId: string;
  status: string;
  source: string[];
  matchScore: number;
  wasInTop10: boolean | null;
  overrideNotes: string | null;
  applicationData: { summary?: string; proposed_budget?: number } | null;
  ngoId: string | null;
  ngoName: string;
  ngoSlug: string | null;
  ngoState: string | null;
  ngoCity: string | null;
  certificationTier: string | null;
  trustScore: number | null;
  logoUrl: string | null;
  hasFullProfile: boolean;
  createdAt: string;
  corporateConfirmedAt: string | null;
  ngoConfirmedAt: string | null;
  activatedAt: string | null;
};

type PreAssignmentRow = {
  id: string;
  opportunity_id: string;
  status: string;
  source?: string[] | null;
  match_score?: number | null;
  was_in_top_10?: boolean | null;
  override_notes?: string | null;
  application_data?: { summary?: string; proposed_budget?: number } | null;
  ngo_id?: string | null;
  discovered_ngo_id?: string | null;
  created_at: string;
  corporate_confirmed_at?: string | null;
  ngo_confirmed_at?: string | null;
  activated_at?: string | null;
};

export async function shapeCorporatePreAssignments(rows: PreAssignmentRow[]): Promise<ShapedPreAssignment[]> {
  const discoveredIds = [...new Set(rows.map((r) => r.discovered_ngo_id).filter(Boolean))] as string[];
  const liveIds = [...new Set(rows.map((r) => r.ngo_id).filter(Boolean))] as string[];

  const [{ data: discoveredNgos }, { data: liveNgos }] = await Promise.all([
    discoveredIds.length
      ? supabaseAdmin.from("discovered_ngos").select("id, name, city, state, certification_tier").in("id", discoveredIds)
      : Promise.resolve({ data: [] }),
    liveIds.length
      ? supabaseAdmin.from("ngos").select("id, ngo_name, slug, state, overall_trust_score, logo_url").in("id", liveIds)
      : Promise.resolve({ data: [] }),
  ]);

  const discoveredById = new Map((discoveredNgos ?? []).map((n) => [n.id, n]));
  const liveById = new Map((liveNgos ?? []).map((n) => [n.id, n]));

  return rows.map((row) => {
    const discovered = row.discovered_ngo_id ? discoveredById.get(row.discovered_ngo_id) : null;
    const live = row.ngo_id ? liveById.get(row.ngo_id) : null;
    return {
      id: row.id,
      opportunityId: row.opportunity_id,
      status: row.status,
      source: row.source ?? [],
      matchScore: row.match_score ?? 0,
      wasInTop10: row.was_in_top_10 ?? null,
      overrideNotes: row.override_notes ?? null,
      applicationData: row.application_data ?? null,
      ngoId: row.ngo_id ?? null,
      ngoName: live?.ngo_name ?? discovered?.name ?? "Unknown NGO",
      ngoSlug: live?.slug ?? null,
      ngoState: live?.state ?? discovered?.state ?? null,
      ngoCity: discovered?.city ?? null,
      certificationTier: discovered?.certification_tier ?? null,
      trustScore: live?.overall_trust_score ?? null,
      logoUrl: live?.logo_url ?? null,
      hasFullProfile: Boolean(row.ngo_id),
      createdAt: row.created_at,
      corporateConfirmedAt: row.corporate_confirmed_at ?? null,
      ngoConfirmedAt: row.ngo_confirmed_at ?? null,
      activatedAt: row.activated_at ?? null,
    };
  });
}
