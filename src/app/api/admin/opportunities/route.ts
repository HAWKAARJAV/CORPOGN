import { requirePlatformAdmin } from "@/lib/access-control";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("opportunities")
      .select(`
        id,
        title,
        description,
        focus_area,
        budget,
        state,
        created_at,
        corporate:corporates(company_name)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const list = (data ?? []).map((row: any) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      focus_area: row.focus_area,
      budget: Number(row.budget ?? 0),
      state: row.state,
      created_at: row.created_at,
      corporate_name: row.corporate?.company_name ?? "Corporate Partner",
    }));

    return NextResponse.json({ opportunities: list });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
