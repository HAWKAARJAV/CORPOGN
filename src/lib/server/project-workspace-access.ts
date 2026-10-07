import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCaller, getOrgContext, type AuthUser, type OrgContext } from "@/lib/access-control";

export const MODULE_ACTOR_COLUMN: Record<string, string | null> = {
  campaigns: "created_by",
  funds: "released_by",
  ngo_collaboration: "created_by",
  audits: "created_by",
  reports: "created_by",
  documents: "uploaded_by",
  milestones: "created_by",
  tasks: "created_by",
  timeline: "created_by",
  meetings: "created_by",
  messages: null,
  approvals: "created_by",
  budget_tracking: "created_by",
  monitoring_evaluation: "created_by",
};

export const MODULE_TABLES: Record<string, string> = {
  campaigns: "campaigns",
  funds: "funds",
  ngo_collaboration: "ngo_collaboration_notes",
  audits: "audits",
  reports: "workspace_reports",
  documents: "workspace_documents",
  milestones: "milestones",
  tasks: "tasks",
  timeline: "project_timeline",
  meetings: "meetings",
  messages: "workspace_messages",
  approvals: "approvals",
  budget_tracking: "budget_tracking",
  monitoring_evaluation: "monitoring_evaluation",
};

export const PATCHABLE_FIELDS: Record<string, string[]> = {
  milestones: ["title", "due_date", "status", "progress"],
  tasks: ["title", "status", "due_date", "assigned_to"],
  monitoring_evaluation: ["metric_name", "metric_value", "unit", "period"],
  approvals: ["status", "item_ref", "approved_by"],
  budget_tracking: ["line_item", "budgeted_inr", "spent_inr"],
  campaigns: ["title", "description", "status"],
  funds: ["amount_inr", "purpose", "released_at"],
};

export type WorkspaceAccess =
  | { error: string; status: number }
  | {
      ok: true;
      user: AuthUser;
      context: OrgContext;
      workspace: { id: string; opportunity_id: string; corporate_id: string; ngo_id: string };
      permission: "read" | "edit";
    };

export async function resolveProjectWorkspaceAccess(
  request: Request,
  projectId: string,
  module: string,
): Promise<WorkspaceAccess> {
  const user = await getCaller(request);
  if (!user) return { error: "Unauthorized.", status: 401 };

  const context = await getOrgContext(user);
  if (!context) return { error: "Unsupported account type.", status: 403 };

  const { data: workspace, error: wsError } = await supabaseAdmin
    .from("project_workspaces")
    .select("id, opportunity_id, corporate_id, ngo_id")
    .eq("opportunity_id", projectId)
    .maybeSingle();

  if (wsError || !workspace) {
    return { error: "This project's workspace has not been unlocked yet.", status: 403 };
  }

  if (context.accountType === "admin") {
    return { ok: true, user, context, workspace, permission: "edit" };
  }

  if (context.accountType === "corporate" && context.orgId === workspace.corporate_id) {
    return { ok: true, user, context, workspace, permission: "edit" };
  }

  if (context.accountType === "ngo" && context.orgId === workspace.ngo_id) {
    return { ok: true, user, context, workspace, permission: "edit" };
  }

  const assigneeType =
    context.accountType === "corporate_employee"
      ? "corporate_employee"
      : context.accountType === "ngo_member"
        ? "ngo_worker"
        : null;

  if (!assigneeType) {
    return { error: "Access denied.", status: 403 };
  }

  const { data: grant } = await supabaseAdmin
    .from("project_module_permissions")
    .select("permission")
    .eq("project_id", projectId)
    .eq("assignee_type", assigneeType)
    .eq("assignee_id", user.id)
    .eq("module", module)
    .maybeSingle();

  if (!grant) {
    return {
      error: `Access denied. You have not been granted access to the "${module}" module on this project.`,
      status: 403,
    };
  }

  return { ok: true, user, context, workspace, permission: grant.permission as "read" | "edit" };
}
