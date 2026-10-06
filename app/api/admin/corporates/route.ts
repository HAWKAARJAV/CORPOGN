import { requirePlatformAdmin } from "@/lib/access-control";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await supabaseAdmin
    .from("corporates")
    .select(
      "id, slug, company_name, company_email, access_status, created_at, registration_data",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const corporates = (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    company_name: row.company_name,
    company_email: row.company_email,
    access_status: row.access_status,
    created_at: row.created_at,
    industry:
      row.registration_data &&
      typeof row.registration_data === "object" &&
      !Array.isArray(row.registration_data)
        ? String((row.registration_data as Record<string, unknown>).industryType ?? "")
        : "",
  }));

  return NextResponse.json({ corporates });
}
