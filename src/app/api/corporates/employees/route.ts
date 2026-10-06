import { corporateSidebarItems } from "@/lib/corporate";
import { supabaseAdmin } from "@/lib/supabase-admin";

const VALID_PAGES = new Set<string>(corporateSidebarItems);

type CorporateEmployeeResponse = {
  id: string;
  email: string;
  full_name: string;
  position: string;
  allowed_pages: string[];
  is_active: boolean;
  created_at?: string;
};

function isMissingEmployeeTable(error?: { message?: string } | null) {
  return Boolean(
    error?.message?.includes("corporate_employees") &&
      error.message.includes("schema cache"),
  );
}

function cleanAllowedPages(value: unknown) {
  const pages = Array.isArray(value)
    ? value.filter((page): page is string => typeof page === "string")
    : [];
  const cleaned = pages.filter((page) => VALID_PAGES.has(page));

  return cleaned.length ? Array.from(new Set(cleaned)) : ["Dashboard"];
}

const RESTRICTED_PAGES = ["Employees & Access", "Corporate Profile"];

async function getCorporateForRequest(request: Request) {
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    return { error: "Unauthorized.", status: 401 } as const;
  }

  const { data: callerData, error: callerError } =
    await supabaseAdmin.auth.getUser(token);

  if (callerError || !callerData.user) {
    return { error: "Invalid session.", status: 401 } as const;
  }

  if (callerData.user.user_metadata?.account_type !== "corporate") {
    return {
      error: "Only corporate admins can manage employee access.",
      status: 403,
    } as const;
  }

  const { data: corporate, error: corporateError } = await supabaseAdmin
    .from("corporates")
    .select("id, slug")
    .eq("auth_user_id", callerData.user.id)
    .single();

  if (corporateError || !corporate) {
    return { error: "Corporate profile not found.", status: 404 } as const;
  }

  return { corporate, user: callerData.user } as const;
}

async function getEmployeesFromAuth(corporateId: string) {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    throw error;
  }

  return data.users
    .filter(
      (user) =>
        user.user_metadata?.account_type === "corporate_employee" &&
        user.user_metadata?.corporate_id === corporateId,
    )
    .map<CorporateEmployeeResponse>((user) => ({
      id: user.id,
      email: user.email ?? "",
      full_name:
        typeof user.user_metadata.full_name === "string"
          ? user.user_metadata.full_name
          : user.email?.split("@")[0] ?? "Employee",
      position:
        typeof user.user_metadata.position === "string"
          ? user.user_metadata.position
          : "Employee",
      allowed_pages: cleanAllowedPages(user.user_metadata.allowed_pages),
      is_active: true,
      created_at: user.created_at,
    }));
}

export async function GET(request: Request) {
  const result = await getCorporateForRequest(request);

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  const { data: employees, error } = await supabaseAdmin
    .from("corporate_employees")
    .select(
      "id, email, full_name, position, allowed_pages, is_active, created_at",
    )
    .eq("corporate_id", result.corporate.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (isMissingEmployeeTable(error)) {
    try {
      const employees = await getEmployeesFromAuth(result.corporate.id);
      return Response.json({ employees });
    } catch (authError) {
      return Response.json(
        {
          error:
            authError instanceof Error
              ? authError.message
              : "Could not load employee access.",
        },
        { status: 500 },
      );
    }
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ employees: employees ?? [] });
}

export async function POST(request: Request) {
  const result = await getCorporateForRequest(request);

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  const body = (await request.json()) as {
    fullName?: string;
    email?: string;
    position?: string;
    password?: string;
    allowedPages?: unknown;
  };

  const fullName = body.fullName?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const position = body.position?.trim() ?? "";
  const password = body.password ?? "";
  const allowedPages = cleanAllowedPages(body.allowedPages);

  if (!fullName || !email || !position || !password) {
    return Response.json(
      { error: "Name, email, position, and password are required." },
      { status: 400 },
    );
  }

  if (password.length < 8) {
    return Response.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  const { data: userData, error: userError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        account_type: "corporate_employee",
        position,
        corporate_id: result.corporate.id,
        corporate_slug: result.corporate.slug,
        allowed_pages: allowedPages,
      },
    });

  if (userError || !userData.user) {
    return Response.json(
      { error: userError?.message || "Could not create employee account." },
      { status: 400 },
    );
  }

  try {
    const { data: employee, error: employeeError } = await supabaseAdmin
      .from("corporate_employees")
      .insert({
        corporate_id: result.corporate.id,
        auth_user_id: userData.user.id,
        email,
        full_name: fullName,
        position,
        allowed_pages: allowedPages,
        is_active: true,
      })
      .select(
        "id, email, full_name, position, allowed_pages, is_active, created_at",
      )
      .single();

    if (isMissingEmployeeTable(employeeError)) {
      return Response.json({
        employee: {
          id: userData.user.id,
          email,
          full_name: fullName,
          position,
          allowed_pages: allowedPages,
          is_active: true,
          created_at: userData.user.created_at,
        },
      });
    }

    if (employeeError) {
      throw employeeError;
    }

    return Response.json({ employee });
  } catch (error) {
    await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save employee access.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const result = await getCorporateForRequest(request);

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    employeeId?: string;
    allowed_pages?: unknown;
    is_active?: unknown;
  };

  const employeeId = body.employeeId?.trim() ?? "";

  if (!employeeId) {
    return Response.json({ error: "employeeId is required." }, { status: 400 });
  }

  const updates: { allowed_pages?: string[]; is_active?: boolean } = {};

  if (body.allowed_pages !== undefined) {
    const rawPages = Array.isArray(body.allowed_pages)
      ? body.allowed_pages.filter(
          (page): page is string => typeof page === "string",
        )
      : [];

    if (rawPages.some((page) => RESTRICTED_PAGES.includes(page))) {
      return Response.json(
        {
          error:
            "Employees cannot be granted access to Employee Management or Corporate Profile.",
        },
        { status: 400 },
      );
    }

    updates.allowed_pages = cleanAllowedPages(rawPages);
  }

  if (body.is_active !== undefined) {
    if (typeof body.is_active !== "boolean") {
      return Response.json(
        { error: "is_active must be a boolean." },
        { status: 400 },
      );
    }
    updates.is_active = body.is_active;
  }

  if (!updates.allowed_pages && updates.is_active === undefined) {
    return Response.json(
      { error: "No valid fields provided to update." },
      { status: 400 },
    );
  }

  const { data: employee, error } = await supabaseAdmin
    .from("corporate_employees")
    .update(updates)
    .eq("id", employeeId)
    .eq("corporate_id", result.corporate.id)
    .select(
      "id, email, full_name, position, allowed_pages, is_active, created_at",
    )
    .single();

  if (error || !employee) {
    return Response.json(
      { error: error?.message || "Employee not found." },
      { status: error ? 500 : 404 },
    );
  }

  return Response.json({ employee });
}

export async function DELETE(request: Request) {
  const result = await getCorporateForRequest(request);

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  const { searchParams } = new URL(request.url);
  let employeeId = searchParams.get("employeeId")?.trim() ?? "";

  if (!employeeId) {
    const body = (await request.json().catch(() => ({}))) as {
      employeeId?: string;
    };
    employeeId = body.employeeId?.trim() ?? "";
  }

  if (!employeeId) {
    return Response.json({ error: "employeeId is required." }, { status: 400 });
  }

  const { data: employee, error } = await supabaseAdmin
    .from("corporate_employees")
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq("id", employeeId)
    .eq("corporate_id", result.corporate.id)
    .select("id, email, full_name, position, allowed_pages, is_active, created_at")
    .single();

  if (error || !employee) {
    return Response.json(
      { error: error?.message || "Employee not found." },
      { status: error ? 500 : 404 },
    );
  }

  return Response.json({ employee });
}
