import { NextResponse } from "next/server";
import { getCaller, getNgoIdForUser } from "@/lib/access-control";
import { getResolvedComplianceView } from "@/lib/resolved-compliance";

/**
 * Exposes lib/resolved-compliance.ts's getResolvedComplianceView() to the
 * browser. That resolver is server-only (uses supabaseAdmin) and, before
 * this route, had no caller anywhere in the app — the NGO dashboard's
 * Trust Score / Compliance Vault pages were reading a localStorage map
 * instead. Works for both the NGO's own super-admin login and any
 * ngo_member (e.g. Compliance Officer) — both resolve to the same ngo_id.
 */
export async function GET(request: Request) {
  const user = await getCaller(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const ngoId = await getNgoIdForUser(user);
  if (!ngoId) return NextResponse.json({ error: "NGO record not found for this account." }, { status: 404 });

  const fields = await getResolvedComplianceView(ngoId);
  return NextResponse.json({ ngoId, fields });
}
