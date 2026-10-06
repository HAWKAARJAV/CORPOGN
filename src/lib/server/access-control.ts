import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type AuthUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

export type OrgContext =
  | {
      accountType: "corporate";
      orgType: "corporate";
      orgId: string;
      orgSlug: string;
      orgName: string;
      roleLabel: string;
      allowedPages: string[] | null;
    }
  | {
      accountType: "corporate_employee";
      orgType: "corporate";
      orgId: string;
      orgSlug: string;
      orgName: string;
      roleLabel: string;
      allowedPages: string[];
    }
  | {
      accountType: "ngo";
      orgType: "ngo";
      orgId: string;
      orgSlug: string;
      orgName: string;
      roleLabel: string;
      allowedPages: string[] | null;
    }
  | {
      accountType: "ngo_member";
      orgType: "ngo";
      orgId: string;
      orgSlug: string;
      orgName: string;
      roleLabel: string;
      allowedPages: string[] | null;
    }
  | {
      accountType: "admin";
      orgType: "admin";
      orgId: string;
      orgSlug: string;
      orgName: string;
      roleLabel: string;
      allowedPages: string[] | null;
    };

export type ProjectPermission = "read_only" | "edit";

export function tokenFrom(request: Request) {
  return (request.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
}

export async function getCaller(request: Request): Promise<AuthUser | null> {
  const token = tokenFrom(request);
  if (token) {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && data.user) return data.user as AuthUser;
  }

  // Same-origin dashboard fetches often rely on the Supabase session cookie
  // rather than an explicit Authorization header.
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
        },
      },
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return user as AuthUser;
  } catch {
    // cookies() unavailable outside a request context — ignore.
  }

  return null;
}

export type PlatformAdminAuth =
  | { ok: true; user: AuthUser; context: OrgContext }
  | { ok: false; status: number; error: string };

export async function requirePlatformAdmin(request: Request): Promise<PlatformAdminAuth> {
  const user = await getCaller(request);
  if (!user) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  const context = await getOrgContext(user);
  if (!context || context.accountType !== "admin") {
    return {
      ok: false,
      status: 403,
      error: "Only platform admins can access this endpoint.",
    };
  }

  return { ok: true, user, context };
}

/**
 * Resolve the NGO id for a caller, whether they're the org's own login or a
 * team member. The `ngo_members` table is the source of truth — session
 * metadata (`user_metadata.ngo_id`) can drift out of sync (e.g. after a
 * reseed or an NGO id change) and must never be trusted on its own.
 */
export async function getNgoIdForUser(user: AuthUser): Promise<string | null> {
  const accountType = user.user_metadata?.account_type;

  if (accountType === "ngo") {
    const { data } = await supabaseAdmin
      .from("ngos")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    return data?.id ?? null;
  }

  if (accountType === "ngo_member") {
    const { data: member } = await supabaseAdmin
      .from("ngo_members")
      .select("ngo_id, is_active")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (member?.is_active && member.ngo_id) return member.ngo_id;

    // Fallback only if the membership row itself is missing.
    return typeof user.user_metadata?.ngo_id === "string" ? user.user_metadata.ngo_id : null;
  }

  return null;
}

/**
 * Resolve the corporate id for a caller, whether they're the org's own login
 * or an employee. Same source-of-truth rule as getNgoIdForUser above.
 */
export async function getCorporateIdForUser(user: AuthUser): Promise<string | null> {
  const accountType = user.user_metadata?.account_type;

  if (accountType === "corporate") {
    const { data } = await supabaseAdmin
      .from("corporates")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    return data?.id ?? null;
  }

  if (accountType === "corporate_employee") {
    const { data: employee } = await supabaseAdmin
      .from("corporate_employees")
      .select("corporate_id, is_active")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (employee?.is_active && employee.corporate_id) return employee.corporate_id;

    return typeof user.user_metadata?.corporate_id === "string" ? user.user_metadata.corporate_id : null;
  }

  return null;
}

function cleanStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Employees/members must never be grantable access to org-admin-only pages. */
const FORBIDDEN_EMPLOYEE_PAGES = new Set(["Employees & Access", "Corporate Profile"]);

function cleanAllowedPages(value: unknown) {
  return cleanStringArray(value).filter((page) => !FORBIDDEN_EMPLOYEE_PAGES.has(page));
}

export async function getAdminForUser(user: AuthUser) {
  const { data } = await supabaseAdmin
    .from("admin_users")
    .select("id, email, full_name, is_active")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  return data as { id: string; email: string; full_name: string; is_active: boolean } | null;
}

export async function getOrgContext(user: AuthUser): Promise<OrgContext | null> {
  const admin = await getAdminForUser(user);
  if (admin) {
    return {
      accountType: "admin",
      orgType: "admin",
      orgId: admin.id,
      orgSlug: "admin",
      orgName: admin.full_name,
      roleLabel: "Platform Admin",
      allowedPages: null,
    };
  }

  const accountType = user.user_metadata?.account_type;

  if (accountType === "corporate") {
    const { data } = await supabaseAdmin
      .from("corporates")
      .select("id, slug, company_name")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!data) return null;

    return {
      accountType,
      orgType: "corporate",
      orgId: data.id,
      orgSlug: data.slug,
      orgName: data.company_name,
      roleLabel: "Corporate Admin",
      allowedPages: null,
    };
  }

  if (accountType === "corporate_employee") {
    const { data: employee } = await supabaseAdmin
      .from("corporate_employees")
      .select("corporate_id, full_name, position, allowed_pages, is_active")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    const corporateId =
      employee?.is_active && employee.corporate_id
        ? employee.corporate_id
        : typeof user.user_metadata?.corporate_id === "string"
          ? user.user_metadata.corporate_id
          : "";

    if (!corporateId) return null;

    const { data: corporate } = await supabaseAdmin
      .from("corporates")
      .select("id, slug, company_name")
      .eq("id", corporateId)
      .maybeSingle();
    if (!corporate) return null;

    return {
      accountType,
      orgType: "corporate",
      orgId: corporate.id,
      orgSlug: corporate.slug,
      orgName: corporate.company_name,
      roleLabel:
        typeof employee?.position === "string"
          ? employee.position
          : typeof user.user_metadata?.position === "string"
            ? user.user_metadata.position
            : "Corporate Employee",
      allowedPages: cleanAllowedPages(employee?.allowed_pages ?? user.user_metadata?.allowed_pages),
    };
  }

  if (accountType === "ngo") {
    const { data } = await supabaseAdmin
      .from("ngos")
      .select("id, slug, ngo_name")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!data) return null;

    return {
      accountType,
      orgType: "ngo",
      orgId: data.id,
      orgSlug: data.slug,
      orgName: data.ngo_name,
      roleLabel: "NGO Super Admin",
      allowedPages: null,
    };
  }

  if (accountType === "ngo_member") {
    const { data: member } = await supabaseAdmin
      .from("ngo_members")
      .select("ngo_id, role, allowed_pages, is_active")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    const ngoId = member?.is_active && member.ngo_id ? member.ngo_id : await getNgoIdForUser(user);
    if (!ngoId) return null;

    const { data: ngo } = await supabaseAdmin
      .from("ngos")
      .select("id, slug, ngo_name")
      .eq("id", ngoId)
      .maybeSingle();
    if (!ngo) return null;

    return {
      accountType,
      orgType: "ngo",
      orgId: ngo.id,
      orgSlug: ngo.slug,
      orgName: ngo.ngo_name,
      roleLabel:
        typeof member?.role === "string"
          ? member.role
          : typeof user.user_metadata?.role === "string"
            ? user.user_metadata.role
            : "NGO Member",
      // Empty/missing allowed_pages means "no explicit list recorded" — the
      // NGO dashboard's own role-based sidebar (ROLE_SIDEBAR_IDS) is the
      // real enforcement for now. Never treat a member as unrestricted.
      allowedPages: cleanStringArray(member?.allowed_pages),
    };
  }

  return null;
}

function permissionForArea(value: unknown, area: string): ProjectPermission | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = (value as Record<string, unknown>)[area] ?? (value as Record<string, unknown>).all;
  return raw === "edit" || raw === "read_only" ? raw : null;
}

export async function authorizeProjectAccess(
  user: AuthUser,
  connectionId: string,
  options: {
    area?: string;
    action?: ProjectPermission;
  } = {},
) {
  const context = await getOrgContext(user);
  if (!context) {
    return { ok: false, status: 403, error: "Unsupported account type." } as const;
  }

  if (context.accountType === "admin") {
    return { ok: true, context, permission: "edit" as ProjectPermission } as const;
  }

  const { data: connection, error } = await supabaseAdmin
    .from("project_connections")
    .select("id, corporate_id, ngo_id, status")
    .eq("id", connectionId)
    .maybeSingle();

  if (error || !connection) {
    return { ok: false, status: 404, error: "Project connection not found." } as const;
  }

  const isOwnerOrg =
    (context.orgType === "corporate" && context.orgId === connection.corporate_id) ||
    (context.orgType === "ngo" && context.orgId === connection.ngo_id);

  if (
    isOwnerOrg &&
    (context.accountType === "corporate" || context.accountType === "ngo")
  ) {
    return { ok: true, context, connection, permission: "edit" as ProjectPermission } as const;
  }

  const { data: assignee } = await supabaseAdmin
    .from("project_assignees")
    .select("permissions")
    .eq("project_id", connectionId)
    .eq("user_id", user.id)
    .maybeSingle();

  const permission = permissionForArea(assignee?.permissions, options.area ?? "all");
  const hasPermission =
    permission === "edit" || (permission === "read_only" && options.action !== "edit");

  if (!hasPermission) {
    return {
      ok: false,
      status: 403,
      error: "Access denied. You are not assigned to this project connection.",
    } as const;
  }

  return { ok: true, context, connection, permission } as const;
}
