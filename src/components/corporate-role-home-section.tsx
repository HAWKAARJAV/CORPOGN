"use client";

import { ArrowUpRight, Briefcase, CircleDollarSign, FileCheck, LayoutDashboard, ShieldCheck, Users } from "lucide-react";

export type CorporateLandingRole = "csr_manager" | "finance" | "compliance" | "executive";

export function inferCorporateLandingRole(position: string, allowedPages: string[]): CorporateLandingRole {
  const p = position.toLowerCase();
  const pages = allowedPages.join(" ").toLowerCase();

  if (/finance|budget|fund|account|treasury/.test(p) || /budget|fund tracking/.test(pages)) {
    return "finance";
  }
  if (/compliance|audit|legal|risk/.test(p) || /audit|compliance/.test(pages)) {
    return "compliance";
  }
  if (/csr|ngo manager|program manager|partnership/.test(p) || /campaign|ngo management|post csr/.test(pages)) {
    return "csr_manager";
  }
  if (/executive|director|ceo|chief|viewer|read.?only/.test(p)) {
    return "executive";
  }
  return "executive";
}

type QuickLink = {
  label: string;
  destination: string;
  icon: typeof LayoutDashboard;
  description: string;
};

const ROLE_LINKS: Record<CorporateLandingRole, QuickLink[]> = {
  csr_manager: [
    { label: "My Projects", destination: "My Projects", icon: Briefcase, description: "Posted CSR projects and NGO applications" },
    { label: "Campaign Management", destination: "Campaign Management", icon: LayoutDashboard, description: "Signed project milestones and delivery" },
    { label: "NGO Management", destination: "NGO Management", icon: Users, description: "Partner NGOs, trust, and diligence" },
    { label: "Reports & Approvals", destination: "Reports & Approvals", icon: FileCheck, description: "Pending fund, report, and NGO approvals" },
  ],
  finance: [
    { label: "Budget & Fund Tracking", destination: "Budget & Fund Tracking", icon: CircleDollarSign, description: "Budget lines, releases, and utilization" },
    { label: "Reports & Approvals", destination: "Reports & Approvals", icon: FileCheck, description: "Financial approval queue" },
    { label: "Campaign Management", destination: "Campaign Management", icon: LayoutDashboard, description: "Per-project budget and fund context" },
    { label: "Master Analytics", destination: "Master Analytics", icon: LayoutDashboard, description: "Portfolio financial overview" },
  ],
  compliance: [
    { label: "Audit & Compliance", destination: "Audit & Compliance", icon: ShieldCheck, description: "Audits, activity trail, partner documents" },
    { label: "NGO Management", destination: "NGO Management", icon: Users, description: "Partner compliance and trust posture" },
    { label: "Discover NGOs", destination: "Discover NGOs", icon: Users, description: "Directory diligence before assignment" },
    { label: "Reports & Approvals", destination: "Reports & Approvals", icon: FileCheck, description: "Compliance-related approval items" },
  ],
  executive: [
    { label: "Master Analytics", destination: "Master Analytics", icon: LayoutDashboard, description: "Cross-project portfolio view" },
    { label: "ESG & Impact", destination: "ESG & Impact", icon: LayoutDashboard, description: "Partner-reported M&E and impact" },
    { label: "Campaign Management", destination: "Campaign Management", icon: Briefcase, description: "Active signed programs" },
    { label: "AI Insights", destination: "AI Insights", icon: LayoutDashboard, description: "Risk and narrative signals" },
  ],
};

const ROLE_TITLES: Record<CorporateLandingRole, string> = {
  csr_manager: "CSR program operations",
  finance: "Finance & fund control",
  compliance: "Compliance & partner diligence",
  executive: "Executive portfolio overview",
};

export function CorporateRoleHomeSection({
  role,
  position,
  navigateTo,
  allowedPages,
}: {
  role: CorporateLandingRole;
  position: string;
  allowedPages: string[];
  navigateTo: (destination: string) => void;
}) {
  const links = ROLE_LINKS[role].filter((link) => {
    if (allowedPages.length === 0) return true;
    return allowedPages.includes(link.destination);
  });

  if (links.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Your role focus</p>
          <h2 className="text-lg font-semibold text-slate-900">{ROLE_TITLES[role]}</h2>
          <p className="mt-1 text-sm text-slate-500">{position.trim() || "Team member"} — shortcuts match your granted pages.</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {links.map((link) => (
          <button
            key={link.destination}
            type="button"
            onClick={() => navigateTo(link.destination)}
            className="flex min-w-0 flex-col rounded-lg border border-slate-200 bg-slate-50/80 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/60"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <link.icon className="h-4 w-4 shrink-0 text-blue-600" />
              <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-900">{link.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{link.description}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

export function shouldShowPostedProjectsTable(role: CorporateLandingRole) {
  return role === "csr_manager" || role === "executive";
}

export function metricLabelsForRole(role: CorporateLandingRole) {
  if (role === "finance") {
    return {
      budget: "Sanctioned budget",
      released: "Funds released",
      utilized: "Utilized (UC-linked)",
      pending: "Financial approvals",
      audits: "Open audit items",
    };
  }
  if (role === "compliance") {
    return {
      budget: "Program exposure",
      released: "Released funds",
      utilized: "Evidence-linked spend",
      pending: "Items awaiting sign-off",
      audits: "Open audits (priority)",
    };
  }
  return {
    budget: "Annual CSR Budget",
    released: "Released",
    utilized: "Utilized",
    pending: "Pending Approvals",
    audits: "Open Audits",
  };
}
