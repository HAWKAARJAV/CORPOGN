import { NGO_ROLES } from "@/lib/ngo";
import { supabaseAdmin } from "@/lib/supabase-admin";

const VALID_ROLES = NGO_ROLES.map((r) => r.value);

export async function POST(request: Request) {
  // Verify caller is an NGO super admin via Bearer token
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: callerData, error: callerError } =
    await supabaseAdmin.auth.getUser(token);

  if (callerError || !callerData.user) {
    return Response.json({ error: "Invalid session." }, { status: 401 });
  }

  if (callerData.user.user_metadata?.account_type !== "ngo") {
    return Response.json(
      { error: "Only NGO super admins can assign roles." },
      { status: 403 },
    );
  }

  // Fetch the caller's NGO record
  const { data: ngo, error: ngoError } = await supabaseAdmin
    .from("ngos")
    .select("id")
    .eq("auth_user_id", callerData.user.id)
    .single();

  if (ngoError || !ngo) {
    return Response.json({ error: "NGO record not found." }, { status: 404 });
  }

  const body = await request.json();
  const { fullName, email, role, password } = body as {
    fullName?: string;
    email?: string;
    role?: string;
    password?: string;
  };

  if (!fullName || !email || !role || !password) {
    return Response.json(
      { error: "Full name, email, role, and password are required." },
      { status: 400 },
    );
  }

  if (!VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
    return Response.json({ error: "Invalid role." }, { status: 400 });
  }

  if (password.length < 8) {
    return Response.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  // Create Supabase auth user for the member
  const { data: userData, error: userError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        account_type: "ngo_member",
        role,
        ngo_id: ngo.id,
      },
    });

  if (userError || !userData.user) {
    return Response.json(
      { error: userError?.message || "Could not create member account." },
      { status: 400 },
    );
  }

  try {
    const { data: member, error: memberError } = await supabaseAdmin
      .from("ngo_members")
      .insert({
        ngo_id: ngo.id,
        auth_user_id: userData.user.id,
        email,
        full_name: fullName,
        role,
        is_active: true,
      })
      .select()
      .single();

    if (memberError) throw memberError;

    return Response.json({ member });
  } catch (error) {
    await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save member record.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: callerData, error: callerError } =
    await supabaseAdmin.auth.getUser(token);

  if (callerError || !callerData.user) {
    return Response.json({ error: "Invalid session." }, { status: 401 });
  }

  if (callerData.user.user_metadata?.account_type !== "ngo") {
    return Response.json({ error: "Only NGO super admins can view members." }, { status: 403 });
  }

  const { data: ngo, error: ngoError } = await supabaseAdmin
    .from("ngos")
    .select("id")
    .eq("auth_user_id", callerData.user.id)
    .single();

  if (ngoError || !ngo) {
    return Response.json({ error: "NGO record not found." }, { status: 404 });
  }

  const { data: members, error: membersError } = await supabaseAdmin
    .from("ngo_members")
    .select("id, auth_user_id, email, full_name, role, is_active, created_at")
    .eq("ngo_id", ngo.id)
    .order("created_at", { ascending: false });

  if (membersError) {
    return Response.json({ error: membersError.message }, { status: 500 });
  }

  return Response.json({ members });
}
