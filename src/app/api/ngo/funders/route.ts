import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const token = authorization.replace("Bearer ", "").trim();
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Fetch active corporates
  const { data: corporates, error } = await supabaseAdmin
    .from("corporates")
    .select("id, company_name, company_email, registration_data")
    .eq("access_status", "active")
    .order("company_name", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ funders: corporates ?? [] });
}
