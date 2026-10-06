export const corporateSidebarItems = [
  "Dashboard",
  "Master Analytics",
  "Campaign Management",
  "NGO Management",
  "Discover NGOs",
  "Project Workspace",
  "Budget & Fund Tracking",
  "ESG & Impact",
  "Reports & Approvals",
  "AI Insights",
  "Audit & Compliance",
  "Employees & Access",
  "Notifications",
  "Support / Chat",
  "Corporate Profile",
] as const;

export function createCorporateSlug(companyName: string) {
  const slug = companyName
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "corporate";
}
