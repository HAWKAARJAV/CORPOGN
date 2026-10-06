import { requirePlatformAdmin } from "@/lib/access-control";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePlatformAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;
    if (!id) {
      return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    const [
      { data: ngo, error: ngoErr },
      { data: categories },
      { data: financials },
      { data: projects },
      { data: contacts },
      { data: socials },
      { data: metrics },
      { data: reports }
    ] = await Promise.all([
      supabaseAdmin.from("discovered_ngos").select("*").eq("id", id).single(),
      supabaseAdmin.from("discovered_ngo_categories").select("*").eq("ngo_id", id),
      supabaseAdmin.from("discovered_ngo_financials").select("*").eq("ngo_id", id).order("year", { ascending: false }),
      supabaseAdmin.from("discovered_ngo_projects").select("*").eq("ngo_id", id),
      supabaseAdmin.from("discovered_ngo_contacts").select("*").eq("ngo_id", id),
      supabaseAdmin.from("discovered_ngo_socials").select("*").eq("ngo_id", id),
      supabaseAdmin.from("discovered_ngo_metrics").select("*").eq("ngo_id", id),
      supabaseAdmin.from("discovered_ngo_reports").select("*").eq("ngo_id", id)
    ]);

    if (ngoErr) {
      return NextResponse.json({ error: ngoErr.message }, { status: 404 });
    }

    return NextResponse.json({
      ngo,
      categories: categories ?? [],
      financials: financials ?? [],
      projects: projects ?? [],
      contacts: contacts ?? [],
      socials: socials ?? [],
      metrics: metrics ?? [],
      reports: reports ?? []
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
