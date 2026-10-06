export type NgoRole =
  | "super_admin"
  | "finance_officer"
  | "compliance_officer"
  | "operations_manager"
  | "field_coordinator"
  | "reporting_executive"
  | "volunteer";

export const NGO_ROLES: { value: Exclude<NgoRole, "super_admin">; label: string }[] = [
  { value: "finance_officer", label: "Finance Officer" },
  { value: "compliance_officer", label: "Compliance Officer" },
  { value: "operations_manager", label: "Operations Manager" },
  { value: "field_coordinator", label: "Field Coordinator" },
  { value: "reporting_executive", label: "Reporting / Content Executive" },
  { value: "volunteer", label: "Volunteer" },
];

export function getRoleLabel(role: NgoRole): string {
  if (role === "super_admin") return "NGO Super Admin";
  return NGO_ROLES.find((r) => r.value === role)?.label ?? role;
}

export function createNgoSlug(ngoName: string): string {
  const slug = ngoName
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "ngo";
}

// Which sidebar items each role can see (pre-project)
export const ROLE_SIDEBAR_ACCESS: Record<NgoRole, string[]> = {
  super_admin: [
    "Command Center",
    "NGO Profile",
    "Compliance Vault",
    "Trust Score",
    "AI Proposal Reviewer",
    "Role Assignment",
    "Settings",
  ],
  finance_officer: ["Fund Tracking", "Finance Analytics", "Invoices", "Utilization Reports", "Grant Tracking"],
  compliance_officer: ["Compliance Vault", "Audit Requests", "NGO Verification", "Compliance Workflow"],
  operations_manager: ["My Projects", "Milestones", "Beneficiary Tracking", "Task Assignment", "Report Drafts"],
  field_coordinator: ["Assigned Projects", "Beneficiary Forms", "Media Uploads", "Attendance"],
  reporting_executive: ["Impact Reports", "Media Library", "Analytics View", "Presentations"],
  volunteer: ["Assigned Tasks", "Event Participation", "Uploads"],
};

// Additional items unlocked after project assigned (only super_admin sees all)
export const PROJECT_UNLOCKED_ITEMS: Record<NgoRole, string[]> = {
  super_admin: [
    "My Projects",
    "Project Chat",
    "Fund Tracking",
    "Milestone Reporting",
    "Impact Reporting",
    "Utilization Certificate",
  ],
  finance_officer: ["Fund Tracking", "Utilization Certificate"],
  compliance_officer: ["Utilization Certificate"],
  operations_manager: ["My Projects", "Milestone Reporting"],
  field_coordinator: ["My Projects", "Milestone Reporting"],
  reporting_executive: ["Impact Reporting"],
  volunteer: [],
};
