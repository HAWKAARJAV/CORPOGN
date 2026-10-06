"use client";

import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";
import { loadState, saveState, type NgoSharedState, type DocStatus } from "@/lib/ngo-store";
import type { ProjectConnection } from "@/lib/project-connections";
import type { ResolvedComplianceField } from "@/lib/resolved-compliance";
import {
  LayoutDashboard, Building2, ShieldCheck, Star, Sparkles, Settings,
  Lock, Briefcase, MessageSquare, Wallet, BarChart3, FileText, Users,
  UserPlus, LogOut, CheckCircle2, AlertCircle, Clock, TrendingUp,
  Globe, Award, Eye, Upload, Camera, Bell, Target, ClipboardList,
  MapPin, Calendar, Heart, Leaf, ArrowUpRight, X, Pencil,
} from "lucide-react";
import { getRoleLabel, NGO_ROLES, ROLE_SIDEBAR_ACCESS } from "@/lib/ngo";
import type { NgoRole } from "@/lib/ngo";
import { AiAssistBadge, AiInsightLine } from "@/components/ai-assist-badge";
import { AiTaskStreamPanel } from "@/components/ai-task-stream-panel";
import { DashboardCopilot } from "@/components/dashboard-copilot";
import { NgoRoleWorkQueue } from "@/components/ngo-role-work-queue";
import { WorkspaceMilestonesPanel } from "@/components/workspace-milestones-panel";
import { AI_PRODUCT_COPY } from "@/lib/ai-insights";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ngo {
  id: string; slug: string; ngo_name: string;
  ngo_email: string; access_status: string;
  has_project: boolean; trust_score: number;
  registration_data: Record<string, unknown>;
}
interface Member {
  id: string; auth_user_id: string; email: string; full_name: string;
  role: string; is_active: boolean; created_at: string;
}
type ProjectMessage = {
  id: string;
  connection_id: string;
  sender_type: "ngo" | "corporate";
  body: string;
  created_at: string;
};
type SidebarItem = {
  id: string; label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresProject?: boolean; requiresVerified?: boolean;
  superAdminOnly?: boolean; locked?: boolean;
};

// ─── Sidebar config ───────────────────────────────────────────────────────────

const ALL_SIDEBAR_ITEMS: SidebarItem[] = [
  // Super Admin — Overview
  { id: "command-center", label: "Command Center", icon: LayoutDashboard, superAdminOnly: true },
  { id: "ngo-profile", label: "NGO Profile", icon: Building2, superAdminOnly: true },
  // Super Admin — Compliance & Trust
  { id: "compliance-vault", label: "Compliance Vault", icon: ShieldCheck },
  { id: "trust-score", label: "Trust Score", icon: Star, superAdminOnly: true },
  { id: "ai-proposal", label: "AI Proposal Reviewer", icon: Sparkles, superAdminOnly: true },
  // Super Admin — Opportunities
  { id: "opportunities", label: "Opportunities", icon: Globe },
  { id: "corporate-funders", label: "Corporate Funders", icon: Briefcase },
  { id: "proposals", label: "Proposals", icon: FileText },
  { id: "corporate-partnerships", label: "Corporate Partnerships", icon: Briefcase, superAdminOnly: true },
  // Super Admin — Project Work (locked until project assigned)
  { id: "my-projects", label: "My Projects", icon: Target, requiresProject: true },
  { id: "project-chat", label: "Project Chat", icon: MessageSquare, requiresProject: true },
  { id: "fund-tracking", label: "Fund Tracking", icon: Wallet, requiresProject: true },
  { id: "milestone-reporting", label: "Milestone Reporting", icon: BarChart3, requiresProject: true },
  { id: "impact-reporting", label: "Impact Reporting", icon: TrendingUp, requiresProject: true },
  { id: "utilization-cert", label: "Utilization Certificate", icon: Award, requiresProject: true },
  // Super Admin — Reports & Admin
  { id: "reports", label: "Reports", icon: FileText, superAdminOnly: true },
  { id: "audit-logs", label: "Audit Logs", icon: ClipboardList, superAdminOnly: true },
  { id: "team-management", label: "Team Management", icon: UserPlus, superAdminOnly: true },
  { id: "settings", label: "Settings", icon: Settings, superAdminOnly: true },

  // Finance Officer
  { id: "funds", label: "Funds", icon: Wallet },
  { id: "expenses", label: "Expenses", icon: ArrowUpRight },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "utilization-reports", label: "Utilization Reports", icon: BarChart3 },
  { id: "grant-tracking", label: "Grant Tracking", icon: Target },
  { id: "finance-analytics", label: "Finance Analytics", icon: TrendingUp },

  // Compliance Officer
  { id: "legal-documents", label: "Legal Documents", icon: ShieldCheck },
  { id: "ngo-verification", label: "NGO Verification", icon: CheckCircle2 },
  { id: "audit-requests", label: "Audit Requests", icon: ClipboardList },
  { id: "compliance-workflow", label: "Compliance Workflow", icon: Eye },

  // Operations Manager
  { id: "projects", label: "Projects", icon: Target },
  { id: "milestones", label: "Milestones", icon: BarChart3 },
  { id: "beneficiary-tracking", label: "Beneficiary Tracking", icon: Users },
  { id: "task-assignment", label: "Task Assignment", icon: ClipboardList },
  { id: "partnership-communication", label: "Partnership Comms", icon: MessageSquare },
  { id: "report-drafts", label: "Report Drafts", icon: FileText },

  // Field Coordinator
  { id: "assigned-projects", label: "Assigned Projects", icon: MapPin },
  { id: "beneficiary-forms", label: "Beneficiary Forms", icon: ClipboardList },
  { id: "field-updates", label: "Field Updates", icon: Camera },
  { id: "media-uploads", label: "Media Uploads", icon: Upload },
  { id: "attendance", label: "Attendance", icon: Calendar },

  // Reporting Executive
  { id: "impact-reports", label: "Impact Reports", icon: TrendingUp },
  { id: "media-library", label: "Media Library", icon: Camera },
  { id: "analytics-view", label: "Analytics View", icon: BarChart3 },
  { id: "presentations", label: "Presentations", icon: Eye },

  // Volunteer
  { id: "assigned-tasks", label: "Assigned Tasks", icon: ClipboardList },
  { id: "event-participation", label: "Event Participation", icon: Heart },
  { id: "uploads", label: "Uploads", icon: Upload },
];

// Which items each non-admin role can see
// (project-unlocked items are added at runtime when has_project = true)
const ROLE_SIDEBAR_IDS: Record<Exclude<NgoRole, "super_admin">, { base: string[]; withProject: string[] }> = {
  finance_officer: {
    base: ["funds", "expenses", "invoices", "utilization-reports", "grant-tracking", "finance-analytics"],
    withProject: ["fund-tracking", "utilization-cert"],
  },
  compliance_officer: {
    base: ["compliance-vault", "legal-documents", "ngo-verification", "audit-requests", "compliance-workflow"],
    withProject: ["utilization-cert"],
  },
  operations_manager: {
    base: ["projects", "milestones", "beneficiary-tracking", "task-assignment", "partnership-communication", "report-drafts"],
    withProject: ["my-projects", "milestone-reporting"],
  },
  field_coordinator: {
    base: ["assigned-projects", "beneficiary-forms", "field-updates", "media-uploads", "attendance"],
    withProject: ["my-projects", "milestone-reporting"],
  },
  reporting_executive: {
    base: ["impact-reports", "media-library", "analytics-view", "presentations"],
    withProject: ["impact-reporting"],
  },
  volunteer: {
    base: ["assigned-tasks", "event-participation", "uploads"],
    withProject: [],
  },
};

// Default landing section per role
const ROLE_DEFAULT_SECTION: Record<NgoRole, string> = {
  super_admin: "command-center",
  finance_officer: "funds",
  compliance_officer: "compliance-vault",
  operations_manager: "projects",
  field_coordinator: "assigned-projects",
  reporting_executive: "impact-reports",
  volunteer: "assigned-tasks",
};

// Groups — order controls sidebar visual order; unused groups auto-hide
const SIDEBAR_GROUPS = [
  { label: "Overview", ids: ["command-center", "ngo-profile"] },
  { label: "Compliance", ids: ["compliance-vault", "trust-score", "ai-proposal", "legal-documents", "ngo-verification", "audit-requests", "compliance-workflow"] },
  { label: "Opportunities", ids: ["opportunities", "corporate-funders", "proposals", "corporate-partnerships"] },
  { label: "Finance", ids: ["funds", "expenses", "invoices", "utilization-reports", "grant-tracking", "finance-analytics"] },
  { label: "Operations", ids: ["projects", "milestones", "beneficiary-tracking", "task-assignment", "partnership-communication", "report-drafts"] },
  { label: "Field Work", ids: ["assigned-projects", "beneficiary-forms", "field-updates", "media-uploads", "attendance", "assigned-tasks", "event-participation", "uploads"] },
  { label: "Project Work", ids: ["my-projects", "project-chat", "fund-tracking", "milestone-reporting", "impact-reporting", "utilization-cert"] },
  { label: "Reporting", ids: ["impact-reports", "media-library", "analytics-view", "presentations", "reports", "audit-logs"] },
  { label: "Team & Admin", ids: ["team-management", "settings"] },
];

// ─── Design tokens ────────────────────────────────────────────────────────────

const btn = "inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
const btnOutline = "inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 active:scale-95";
const btnGhost = "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-50 active:scale-95";
const inputCls = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
const cardCls = "rounded-2xl border border-slate-100 bg-white shadow-sm";

// ─── Corporate-aligned shared components ─────────────────────────────────────
// These match the corporate dashboard's Card / PageHero / MiniStat / Progress
// design tokens exactly so the connection panels look identical on both sides.

function NgoDashCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-xl border border-slate-200/80 bg-white shadow-sm ${className}`}>
      {children}
    </section>
  );
}

function NgoDashPageHero({ eyebrow, title, text, actions }: {
  eyebrow: string; title: string; text: string; actions?: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col justify-between gap-4 rounded-xl border border-slate-200/80 bg-white px-5 py-4 shadow-sm lg:flex-row lg:items-center">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-600">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl tracking-tight">{title}</h2>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-500">{text}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
}

function NgoDashMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1.5 break-words text-sm font-semibold text-slate-800 leading-snug">{value}</p>
    </div>
  );
}

function NgoDashProgress({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-blue-500" : "bg-amber-500";
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-slate-100">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-500">{Math.round(value)}%</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const SECTION_DETAILS: Record<string, string> = {
  "Compliance Vault": "Keep the compliance trail audit-ready with a controlled document repository, clear upload status, and a single source of truth for governance evidence.",
  "Trust Score": "Use this score as a board-level health indicator for verification progress, document completeness, and platform credibility.",
  "AI Proposal Reviewer": "Review proposal quality before submission so teams can tighten scope, strengthen metrics, and reduce revision cycles with corporate partners.",
  "My Projects": "Track active CSR delivery in one place, including budget ownership, phase progress, and execution status across live engagements.",
  "Fund Tracking": "Monitor tranche release, balance availability, and project-level fund movement with the level of visibility expected in enterprise reporting.",
  "Milestone Reporting": "Capture delivery checkpoints with enough context for leadership review, partner updates, and compliance sign-off.",
  "Impact Reporting": "Translate field execution into outcomes that can be shared with executives, auditors, and external CSR stakeholders.",
  "Utilization Certificate": "Prepare fund utilization evidence with consistent references, structured notes, and a clean approval trail.",
  "Role Assignment": "Manage access with a clear operating model so each team member sees the right tools, responsibilities, and permissions.",
  "Settings": "Centralize organization preferences, identity details, and account controls in a single admin surface.",
};

// ─── Shared components ────────────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  const detail = SECTION_DETAILS[title] ?? "This workspace is designed to support enterprise-grade execution, governance, and reporting.";
  return (
    <div className="mb-6 max-w-3xl">
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{detail}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const m: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pending Verification", cls: "bg-amber-100 text-amber-800 border-amber-200" },
    verified: { label: "Verified ✓", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    active: { label: "Active ✓", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  };
  const b = m[status] ?? { label: status, cls: "bg-slate-100 text-slate-600 border-slate-200" };
  return <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold ${b.cls}`}>{b.label}</span>;
}

function TrustBar({ score }: { score: number }) {
  const c = score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="h-2 w-full rounded-full bg-slate-100">
      <div data-testid="trust-bar-fill" className={`${c} h-2 rounded-full transition-all duration-700`} style={{ width: `${score}%` }} />
    </div>
  );
}

function KpiCard({ label, value, sub, icon: Icon, color = "emerald" }: {
  label: string; value: string; sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: "emerald" | "amber" | "blue" | "violet" | "rose";
}) {
  const p: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    blue: "bg-blue-50 text-blue-600",
    violet: "bg-violet-50 text-violet-600",
    rose: "bg-rose-50 text-rose-600",
  };
  return (
    <div className={`${cardCls} p-5`}>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${p[color]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function Alert({ type, title, body }: { type: "warn" | "info" | "success"; title: string; body: string }) {
  const s = {
    warn: { wrap: "border-amber-200 bg-amber-50", icon: "text-amber-500", title: "text-amber-900", body: "text-amber-700", Icon: AlertCircle },
    info: { wrap: "border-blue-200 bg-blue-50", icon: "text-blue-500", title: "text-blue-900", body: "text-blue-700", Icon: Bell },
    success: { wrap: "border-emerald-200 bg-emerald-50", icon: "text-emerald-500", title: "text-emerald-900", body: "text-emerald-700", Icon: CheckCircle2 },
  }[type];
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 ${s.wrap}`}>
      <s.Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${s.icon}`} />
      <div>
        <p className={`text-sm font-semibold ${s.title}`}>{title}</p>
        <p className={`mt-0.5 text-sm ${s.body}`}>{body}</p>
      </div>
    </div>
  );
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

const DOC_TYPES = [
  // ── Legal & Registration ──────────────────────────────────────────
  { id: "certificate12a", label: "12A Certificate", category: "Legal & Registration", mandatory: false },
  { id: "certificate80g", label: "80G Certificate", category: "Legal & Registration", mandatory: false },
  { id: "csr1Certificate", label: "CSR-1 Registration", category: "Legal & Registration", mandatory: false },
  { id: "registrationCertificate", label: "NGO Registration Certificate", category: "Legal & Registration", mandatory: false },
  { id: "fcraCertificate", label: "FCRA License", category: "Legal & Registration", mandatory: false },
  { id: "panCard", label: "PAN Card", category: "Legal & Registration", mandatory: false },
  { id: "gstCertificate", label: "GST Certificate", category: "Legal & Registration", mandatory: false },
  { id: "ngoDarpanId", label: "NGO Darpan Registration", category: "Legal & Registration", mandatory: false },
  { id: "moa", label: "Memorandum of Association (MoA)", category: "Legal & Registration", mandatory: false },
  { id: "aoa", label: "Articles of Association (AoA)", category: "Legal & Registration", mandatory: false },
  { id: "trustDeed", label: "Trust Deed", category: "Legal & Registration", mandatory: false },
  // ── Financial ────────────────────────────────────────────────────
  { id: "annualReport", label: "Annual Report", category: "Financial", mandatory: false },
  { id: "auditReport", label: "Audit Report", category: "Financial", mandatory: false },
  { id: "financialStatements", label: "Financial Statements (3 years)", category: "Financial", mandatory: false },
  { id: "utilization_certificate", label: "Utilization Certificate (UC)", category: "Financial", mandatory: false },
  { id: "cancelledCheque", label: "Cancelled Cheque", category: "Financial", mandatory: false },
  { id: "itrFilings", label: "ITR Filings", category: "Financial", mandatory: false },
  // ── Impact & Operations ──────────────────────────────────────────
  { id: "impactReport", label: "Impact Report", category: "Impact & Operations", mandatory: false },
  { id: "csr_project_report", label: "CSR Project Report", category: "Impact & Operations", mandatory: false },
  { id: "brochure", label: "NGO Brochure / Profile Deck", category: "Impact & Operations", mandatory: false },
  { id: "fieldPhotos", label: "Field Photos / Media", category: "Impact & Operations", mandatory: false },
  { id: "beneficiaryList", label: "Beneficiary List", category: "Impact & Operations", mandatory: false },
  { id: "esgReport", label: "ESG / Sustainability Report", category: "Impact & Operations", mandatory: false },
];

function UploadModal({
  open, defaultDocType, onClose, onSuccess, ngoId,
}: {
  open: boolean; defaultDocType?: string;
  onClose: () => void; onSuccess: (docId: string, docLabel: string, storagePath?: string) => void;
  ngoId: string;
}) {
  const [docType, setDocType] = useState(defaultDocType ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) setDocType(defaultDocType ?? ""); }, [open, defaultDocType]);

  async function handleUpload() {
    setError("");
    if (!docType) { setError("Please select a document type."); return; }
    if (!file) { setError("Please choose a file."); return; }
    setUploading(true);
    try {
      // 1. Upload file to Supabase Storage via signed upload or direct client upload
      const ext = file.name.split(".").pop() ?? "pdf";
      const storagePath = `compliance/${Date.now()}-${docType}.${ext}`;
      const { error: storageError } = await supabaseBrowser.storage
        .from("ngo-documents")
        .upload(storagePath, file, { upsert: true, contentType: file.type });

      if (storageError) {
        // Bucket may not exist yet — still mark locally so UI reflects upload
        console.warn("[Compliance] Storage upload failed (bucket may not exist):", storageError.message);
      }

      // 2. Upsert document metadata into the database
      const { error: dbError } = await supabaseBrowser
        .from("ngo_documents")
        .upsert({
          ngo_id: ngoId,
          doc_type: docType,
          storage_path: storagePath,
          status: "uploaded",
          uploaded_at: new Date().toISOString()
        }, { onConflict: "ngo_id,doc_type" });

      if (dbError) {
        console.warn("[Compliance] Database metadata save failed:", dbError.message);
      }

      const label = DOC_TYPES.find((d) => d.id === docType)?.label ?? docType;
      onSuccess(docType, label, storagePath);
      setFile(null);
      setDocType("");
      fileRef.current && (fileRef.current.value = "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" data-testid="upload-modal">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <p className="font-bold text-slate-900">Upload Compliance Document</p>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Close modal">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
            Document Type *
            <select
              data-testid="doc-type-select"
              className={inputCls}
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
              <option value="">Select document type</option>
              {DOC_TYPES.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}{d.mandatory ? " *" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
            Choose File (PDF / Image) *
            <input
              data-testid="doc-file-input"
              ref={fileRef}
              type="file"
              accept=".pdf,image/*"
              className={inputCls + " py-2"}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <div className="flex gap-3 pt-1">
            <button onClick={handleUpload} disabled={uploading} className={btn + " flex-1"} data-testid="upload-submit-btn">
              {uploading ? "Uploading..." : "Upload Document"}
            </button>
            <button onClick={onClose} className={btnOutline}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section: Command Center ──────────────────────────────────────────────────

function CommandCenterSection({
  ngo, onNavigate, uploadedCount, liveTrustScore, docs,
}: {
  ngo: Ngo; onNavigate: (id: string) => void;
  uploadedCount: number; liveTrustScore: number;
  docs: Record<string, string>;
}) {
  const isVerified = ngo.access_status === "verified" || ngo.access_status === "active";
  return (
    <div className="space-y-6">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 p-6 text-white shadow-md">
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-emerald-200 text-sm font-medium mb-1">
            <Leaf className="h-4 w-4" /> NGO Command Center
          </div>
          <h2 className="text-2xl font-bold">{ngo.ngo_name}</h2>
          <p className="mt-1 text-emerald-100 text-sm">
            {ngo.access_status === "pending"
              ? "Your verification is in progress."
              : ngo.has_project
                ? "You have an active CSR project."
                : "Verified — apply for CSR opportunities."}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <StatusBadge status={ngo.access_status} />
            <span className="text-xs text-emerald-200">Trust Score: {ngo.trust_score}/100</span>
          </div>
        </div>
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -right-2 bottom-0 h-24 w-24 rounded-full bg-white/5" />
      </div>

      {/* Status alert */}
      {ngo.access_status === "pending" && (
        <Alert type="warn" title="Verification Pending"
          body="Your NGO is under review. Upload compliance documents to speed up the process." />
      )}
      {isVerified && !ngo.has_project && (
        <Alert type="info" title="Ready to Apply"
          body="You're verified! Browse Opportunities to submit proposals and get a CSR project assigned." />
      )}
      {ngo.has_project && (
        <Alert type="success" title="Project Active"
          body="You have an active CSR project. Track milestones and submit reports from the sidebar." />
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Trust Score" value={`${liveTrustScore}/100`} icon={Star} color="amber"
          sub={liveTrustScore >= 70 ? "High trust" : liveTrustScore >= 40 ? "Medium trust" : "Upload docs"} />
        <KpiCard label="Active Projects" value={ngo.has_project ? "1" : "0"} icon={Target} color="emerald" />
        <KpiCard label="Docs Uploaded" value={`${uploadedCount} / 24`} icon={ShieldCheck} color="blue" sub="Upload to boost score" />
        <KpiCard label="Team Members" value="0" icon={Users} color="violet" sub="Manage via Team Management" />
      </div>

      {/* Trust score + org health visual */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={`${cardCls} p-5`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" /> Trust Score
            </p>
            <span className={`text-sm font-bold ${liveTrustScore >= 70 ? "text-emerald-600" : liveTrustScore >= 40 ? "text-amber-600" : "text-red-500"}`}>
              {liveTrustScore} / 100
            </span>
          </div>
          <TrustBar score={liveTrustScore} />
          <div className="mt-3 flex gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" />0–39 Low</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />40–69 Med</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />70+ High</span>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-500 mb-2 font-medium">Score Breakdown</p>
            <BarChart color="amber" data={[
              { label: "Base score", value: 15, formatted: "+15 pts" },
              { label: "12A Certificate", value: !!docs["certificate12a"] ? 20 : 0, formatted: !!docs["certificate12a"] ? "+20 pts" : "0 pts" },
              { label: "80G Certificate", value: !!docs["certificate80g"] ? 20 : 0, formatted: !!docs["certificate80g"] ? "+20 pts" : "0 pts" },
              { label: "FCRA / CSR-1", value: !!docs["fcraCertificate"] ? 15 : 0, formatted: !!docs["fcraCertificate"] ? "+15 pts" : "0 pts" },
              { label: "Annual & Audit Reports", value: (!!docs["annualReport"] || !!docs["auditReport"]) ? 20 : 0, formatted: (!!docs["annualReport"] || !!docs["auditReport"]) ? "+20 pts" : "0 pts" },
            ]} />
          </div>
        </div>
        <div className={`${cardCls} p-5`}>
          <p className="text-sm font-semibold text-slate-700 mb-3">Organisation Health</p>
          <DonutChart center="NGO" segments={[
            { label: "Docs Complete", value: Math.round((uploadedCount / 24) * 40), color: "emerald", formatted: `${uploadedCount}/24 docs` },
            { label: "Profile Filled", value: ngo.registration_data && Object.keys(ngo.registration_data).length > 2 ? 25 : 5, color: "blue", formatted: Object.keys(ngo.registration_data ?? {}).length > 2 ? "Profile filled" : "Profile incomplete" },
            { label: "Pending Actions", value: (!ngo.has_project ? 10 : 0) + (uploadedCount < 5 ? 10 : 0), color: "amber", formatted: "Pending" },
            { label: "Unlocked Later", value: 25, color: "slate", formatted: "Post-project" },
          ]} />
          <div className="mt-4 space-y-2">
            {[
              { l: "NGO registered", done: true },
              { l: "Email verified", done: true },
              { l: "Profile details added", done: Object.keys(ngo.registration_data ?? {}).length > 2 },
              { l: "Compliance docs uploaded", done: uploadedCount >= 1 },
              { l: "Project assigned", done: ngo.has_project },
            ].map((it) => (
              <div key={it.l} className="flex items-center gap-2 text-xs">
                <div className={`h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold ${it.done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                  {it.done ? "✓" : "○"}
                </div>
                <span className={it.done ? "text-slate-700" : "text-slate-400"}>{it.l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity — only show when project is active (no fake data for new NGOs) */}
      {ngo.has_project && (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="px-5 pt-4 pb-3 border-b border-slate-100">
            <p className="text-sm font-bold text-slate-700">Recent Team Activity</p>
          </div>
          <div className="px-5 py-10 flex flex-col items-center justify-center text-center gap-2">
            <ClipboardList className="h-8 w-8 text-slate-200" />
            <p className="text-sm font-medium text-slate-400">Activity will appear here once your team logs actions on the project.</p>
          </div>
        </div>
      )}

      {/* Quick Actions — all navigating to real sections */}
      <div>
        <p className="mb-3 text-sm font-semibold text-slate-700">Quick Actions</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { label: "Upload Compliance Docs", desc: "Boost trust score", icon: Upload, target: "compliance-vault", color: "bg-emerald-50 border-emerald-200 hover:bg-emerald-100", testId: "qa-upload-docs" },
            { label: "Edit NGO Profile", desc: "Keep info up to date", icon: Building2, target: "ngo-profile", color: "bg-blue-50 border-blue-200 hover:bg-blue-100", testId: "qa-edit-profile" },
            { label: "AI Proposal Tips", desc: "Improve your proposals", icon: Sparkles, target: "ai-proposal", color: "bg-violet-50 border-violet-200 hover:bg-violet-100", testId: "qa-ai-proposal" },
            { label: "Assign Team Roles", desc: "Add team members", icon: UserPlus, target: "role-assignment", color: "bg-amber-50 border-amber-200 hover:bg-amber-100", testId: "qa-assign-roles" },
          ].map((a) => (
            <button
              key={a.label}
              data-testid={a.testId}
              onClick={() => onNavigate(a.target)}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${a.color}`}
            >
              <a.icon className="h-5 w-5 text-slate-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-800">{a.label}</p>
                <p className="text-xs text-slate-500">{a.desc}</p>
              </div>
              <ArrowUpRight className="ml-auto h-4 w-4 text-slate-400" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Section: NGO Profile ─────────────────────────────────────────────────────

const FOCUS_AREAS_LIST = [
  "Education", "Healthcare", "Environment", "Women Empowerment", "Rural Development",
  "Skill Development", "Child Welfare", "Animal Welfare", "Disaster Relief",
  "Food & Nutrition", "Sanitation", "Water Conservation", "Climate Action",
  "Employment Generation", "Digital Literacy", "Other",
];

const BENEFICIARY_TYPES_LIST = [
  "Children", "Women", "Elderly", "Farmers", "Students",
  "Rural Communities", "Urban Poor", "Differently Abled", "Tribal Communities",
  "Animals", "General Public", "Other",
];

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Odisha", "Punjab", "Rajasthan", "Tamil Nadu",
  "Telangana", "Uttar Pradesh", "West Bengal", "Other",
];

const NGO_TYPES_LIST = [
  "Trust", "Society", "Section 8 Company", "Foundation", "Non-Profit Organization",
  "Community-Based Organization", "International NGO", "Other",
];

function NgoProfileSection({
  ngo, onNavigate, token, onNgoUpdate,
}: {
  ngo: Ngo; onNavigate: (id: string) => void;
  token: string;
  onNgoUpdate: (updated: Partial<Ngo>) => void;
}) {
  const rd = ngo.registration_data ?? {};

  // Helper to pull a string from registration_data (handles both signup fields and extra_profile fields)
  function rdStr(key: string): string {
    const val = rd[key] ?? (rd.extra_profile as Record<string, unknown> | undefined)?.[key] ?? "";
    return typeof val === "string" ? val : "";
  }
  function rdArr(key: string): string[] {
    const val = rd[key] ?? (rd.extra_profile as Record<string, unknown> | undefined)?.[key] ?? [];
    return Array.isArray(val) ? (val as unknown[]).map(String) : [];
  }

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    ngo_name: ngo.ngo_name,
    ngo_email: ngo.ngo_email,
    // Pre-populate from registration_data (written at signup or profile-update time)
    ngo_type: rdStr("ngoType") || rdStr("ngo_type"),
    state: rdStr("state"),
    contact_number: rdStr("contactNumber") || rdStr("contact_number"),
    website: rdStr("ngoWebsite") || rdStr("website"),
    mission: rdStr("ngoMissionVision") || rdStr("mission"),
    registration_number: rdStr("registrationNumber") || rdStr("registration_number"),
    pan_number: rdStr("panNumber") || rdStr("pan_number"),
    year_of_establishment: rdStr("yearOfEstablishment") || rdStr("year_of_establishment"),
    number_of_employees: rdStr("numberOfEmployees") || rdStr("number_of_employees"),
    number_of_volunteers: rdStr("numberOfVolunteers") || rdStr("number_of_volunteers"),
    focus_areas: rdArr("focusAreas").length ? rdArr("focusAreas") : rdArr("focus_areas"),
    beneficiary_types: rdArr("beneficiaryTypes").length ? rdArr("beneficiaryTypes") : rdArr("beneficiary_types"),
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!editing) {
      setForm({
        ngo_name: ngo.ngo_name,
        ngo_email: ngo.ngo_email,
        ngo_type: rdStr("ngoType") || rdStr("ngo_type"),
        state: rdStr("state"),
        contact_number: rdStr("contactNumber") || rdStr("contact_number"),
        website: rdStr("ngoWebsite") || rdStr("website"),
        mission: rdStr("ngoMissionVision") || rdStr("mission"),
        registration_number: rdStr("registrationNumber") || rdStr("registration_number"),
        pan_number: rdStr("panNumber") || rdStr("pan_number"),
        year_of_establishment: rdStr("yearOfEstablishment") || rdStr("year_of_establishment"),
        number_of_employees: rdStr("numberOfEmployees") || rdStr("number_of_employees"),
        number_of_volunteers: rdStr("numberOfVolunteers") || rdStr("number_of_volunteers"),
        focus_areas: rdArr("focusAreas").length ? rdArr("focusAreas") : rdArr("focus_areas"),
        beneficiary_types: rdArr("beneficiaryTypes").length ? rdArr("beneficiaryTypes") : rdArr("beneficiary_types"),
      });
    }
  }, [ngo, editing]);

  function setField(key: string, value: string) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function toggleMulti(key: "focus_areas" | "beneficiary_types", value: string) {
    setForm((p) => {
      const arr = p[key];
      return {
        ...p,
        [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
      };
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    try {
      const payload: Record<string, unknown> = {
        ngo_name: form.ngo_name,
        ngo_email: form.ngo_email,
        extra_profile: {
          ngo_type: form.ngo_type,
          state: form.state,
          contact_number: form.contact_number,
          website: form.website,
          mission: form.mission,
          registration_number: form.registration_number,
          pan_number: form.pan_number,
          year_of_establishment: form.year_of_establishment,
          number_of_employees: form.number_of_employees,
          number_of_volunteers: form.number_of_volunteers,
          focus_areas: form.focus_areas,
          beneficiary_types: form.beneficiary_types,
        },
      };
      const res = await fetch("/api/ngo/profile", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ngo?: Partial<Ngo>; error?: string };
      if (!res.ok) { setSaveError(data.error ?? "Save failed."); return; }
      onNgoUpdate(data.ngo ?? {});
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  const fieldCls = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
  const selectFieldCls = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
  const areaCls = "min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 resize-none";
  const labelCls = "flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500";

  return (
    <div className="space-y-6">
      <SectionHeader title="NGO Profile" sub="Your public identity on the CorpoGN platform." />

      {/* Profile card */}
      <div className={`${cardCls} overflow-hidden`}>
        <div className="h-20 bg-gradient-to-r from-emerald-500 to-teal-500" />
        <div className="px-6 pb-6">
          <div className="-mt-8 flex items-end justify-between gap-4 flex-wrap">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-white bg-emerald-600 text-2xl font-bold text-white shadow-md">
              {ngo.ngo_name.charAt(0)}
            </div>
            {!editing && (
              <button
                data-testid="edit-profile-btn"
                onClick={() => setEditing(true)}
                className={btnOutline}
              >
                <Pencil className="h-3.5 w-3.5" /> Update Profile
              </button>
            )}
          </div>
          {saved && (
            <p className="mt-3 text-xs font-semibold text-emerald-600">✓ Profile updated successfully</p>
          )}
          {!editing && (
            <>
              <h3 className="mt-3 text-lg font-bold text-slate-900">{ngo.ngo_name}</h3>
              <p className="text-sm text-slate-500">{ngo.ngo_email}</p>
              <div className="mt-2"><StatusBadge status={ngo.access_status} /></div>
            </>
          )}
        </div>
      </div>

      {/* KPI row */}
      {!editing && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <KpiCard label="Trust Score" value={`${ngo.trust_score} / 100`} icon={Star} color="amber" />
            <KpiCard label="Verification Status" value={ngo.access_status.charAt(0).toUpperCase() + ngo.access_status.slice(1)} icon={ShieldCheck} color="emerald" />
            <KpiCard label="Project Status" value={ngo.has_project ? "Project Assigned" : "No Project Yet"} icon={Target} color="blue" />
            <KpiCard label="Contact Email" value={ngo.ngo_email} icon={Globe} color="violet" />
          </div>

          <div className="grid gap-6 md:grid-cols-2 mt-6">
            {/* Organization Details */}
            <div className={`${cardCls} p-5 space-y-4`}>
              <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-2">
                <Building2 className="h-4.5 w-4.5 text-emerald-600" /> Organization Details
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">NGO Type</p>
                  <p className="mt-0.5 text-slate-700 font-medium">{form.ngo_type || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">State / Location</p>
                  <p className="mt-0.5 text-slate-700 font-medium">{form.state || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Contact Number</p>
                  <p className="mt-0.5 text-slate-700 font-medium">{form.contact_number || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Website</p>
                  <p className="mt-0.5 text-slate-700 font-medium">
                    {form.website ? (
                      <a href={form.website.startsWith("http") ? form.website : `https://${form.website}`} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
                        {form.website}
                      </a>
                    ) : "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Legal & Compliance */}
            <div className={`${cardCls} p-5 space-y-4`}>
              <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-2">
                <ShieldCheck className="h-4.5 w-4.5 text-emerald-600" /> Legal & Registration
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Registration No.</p>
                  <p className="mt-0.5 text-slate-700 font-medium">{form.registration_number || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">PAN Number</p>
                  <p className="mt-0.5 text-slate-700 font-medium uppercase">{form.pan_number || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Year of Establishment</p>
                  <p className="mt-0.5 text-slate-700 font-medium">{form.year_of_establishment || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Team Strength</p>
                  <p className="mt-0.5 text-slate-700 font-medium">
                    {form.number_of_employees ? `${form.number_of_employees} Employees` : ""}
                    {form.number_of_employees && form.number_of_volunteers ? " · " : ""}
                    {form.number_of_volunteers ? `${form.number_of_volunteers} Volunteers` : ""}
                    {!form.number_of_employees && !form.number_of_volunteers ? "—" : ""}
                  </p>
                </div>
              </div>
            </div>

            {/* Mission & Focus Areas */}
            <div className={`${cardCls} p-5 space-y-4 md:col-span-2`}>
              <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-2">
                <Target className="h-4.5 w-4.5 text-emerald-600" /> Mission, Focus & Beneficiaries
              </h4>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mission Statement</p>
                  <p className="mt-1 text-slate-600 leading-relaxed italic">{form.mission || "No mission statement added yet."}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Focus Areas</p>
                    {form.focus_areas.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {form.focus_areas.map((f) => (
                          <span key={f} className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-100">
                            {f}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-400">No focus areas selected.</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Target Beneficiaries</p>
                    {form.beneficiary_types.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {form.beneficiary_types.map((b) => (
                          <span key={b} className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700 border border-teal-100">
                            {b}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-400">No beneficiary types selected.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Update Profile Form ────────────────────────────────────────────────── */}
      {editing && (
        <div className={`${cardCls} p-6`}>
          <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-base font-bold text-slate-900">Update Profile</h3>
              <p className="text-xs text-slate-500 mt-0.5">All fields are optional — fill in what's relevant to your NGO.</p>
            </div>
            <button onClick={() => setEditing(false)} className={btnOutline}>
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>

          {saveError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
              {saveError}
            </div>
          )}

          <div className="space-y-6">
            {/* Core identity */}
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-emerald-600">Core Identity</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelCls}>
                  NGO Name
                  <input data-testid="profile-name-input" className={fieldCls} value={form.ngo_name}
                    onChange={(e) => setField("ngo_name", e.target.value)} />
                </label>
                <label className={labelCls}>
                  Contact Email
                  <input data-testid="profile-email-input" type="email" className={fieldCls} value={form.ngo_email}
                    onChange={(e) => setField("ngo_email", e.target.value)} />
                </label>
                <label className={labelCls}>
                  NGO Type
                  <select className={selectFieldCls} value={form.ngo_type} onChange={(e) => setField("ngo_type", e.target.value)}>
                    <option value="">Select type</option>
                    {NGO_TYPES_LIST.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className={labelCls}>
                  State
                  <select className={selectFieldCls} value={form.state} onChange={(e) => setField("state", e.target.value)}>
                    <option value="">Select state</option>
                    {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className={labelCls}>
                  Contact Number
                  <input type="tel" className={fieldCls} value={form.contact_number}
                    placeholder="+91 98765 43210"
                    onChange={(e) => setField("contact_number", e.target.value)} />
                </label>
                <label className={labelCls}>
                  Website
                  <input type="url" className={fieldCls} value={form.website}
                    placeholder="https://yourngo.org"
                    onChange={(e) => setField("website", e.target.value)} />
                </label>
              </div>
            </div>

            {/* Mission */}
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-emerald-600">Mission & Vision</p>
              <label className={labelCls}>
                Mission / Vision Statement
                <textarea className={areaCls} value={form.mission}
                  placeholder="Describe your NGO's purpose and goals…"
                  onChange={(e) => setField("mission", e.target.value)} />
              </label>
            </div>

            {/* Legal */}
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-emerald-600">Legal & Registration</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className={labelCls}>
                  Registration Number
                  <input className={fieldCls} value={form.registration_number}
                    placeholder="e.g. MH-2019-0012345"
                    onChange={(e) => setField("registration_number", e.target.value)} />
                </label>
                <label className={labelCls}>
                  PAN Number
                  <input className={fieldCls} value={form.pan_number}
                    placeholder="AABCN1234D"
                    onChange={(e) => setField("pan_number", e.target.value)} />
                </label>
                <label className={labelCls}>
                  Year of Establishment
                  <input type="number" min="1800" max="2026" className={fieldCls} value={form.year_of_establishment}
                    placeholder="e.g. 2010"
                    onChange={(e) => setField("year_of_establishment", e.target.value)} />
                </label>
              </div>
            </div>

            {/* Team size */}
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-emerald-600">Team</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelCls}>
                  Number of Employees
                  <input type="number" min="0" className={fieldCls} value={form.number_of_employees}
                    placeholder="e.g. 25"
                    onChange={(e) => setField("number_of_employees", e.target.value)} />
                </label>
                <label className={labelCls}>
                  Number of Volunteers
                  <input type="number" min="0" className={fieldCls} value={form.number_of_volunteers}
                    placeholder="e.g. 200"
                    onChange={(e) => setField("number_of_volunteers", e.target.value)} />
                </label>
              </div>
            </div>

            {/* Focus Areas */}
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-emerald-600">Focus Areas</p>
              <div className="flex flex-wrap gap-2">
                {FOCUS_AREAS_LIST.map((f) => (
                  <button
                    key={f} type="button"
                    onClick={() => toggleMulti("focus_areas", f)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${form.focus_areas.includes(f)
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300"
                      }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Beneficiary Types */}
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-emerald-600">Beneficiary Types</p>
              <div className="flex flex-wrap gap-2">
                {BENEFICIARY_TYPES_LIST.map((b) => (
                  <button
                    key={b} type="button"
                    onClick={() => toggleMulti("beneficiary_types", b)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${form.beneficiary_types.includes(b)
                        ? "border-teal-500 bg-teal-50 text-teal-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-teal-300"
                      }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {/* Save button */}
            <div className="flex gap-3 border-t border-slate-100 pt-5">
              <button
                data-testid="save-profile-btn"
                onClick={handleSave}
                disabled={saving}
                className={btn}
              >
                {saving ? "Saving…" : "Save Profile"}
              </button>
              <button onClick={() => setEditing(false)} className={btnOutline}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {!editing && (
        <div className="flex gap-3 flex-wrap">
          <button data-testid="goto-compliance-from-profile" onClick={() => onNavigate("compliance-vault")} className={btnGhost}>
            <ShieldCheck className="h-4 w-4" /> Compliance Vault
          </button>
          <button data-testid="goto-trust-from-profile" onClick={() => onNavigate("trust-score")} className={btnGhost}>
            <Star className="h-4 w-4" /> Trust Score
          </button>
        </div>
      )}
    </div>
  );
}


// ─── Section: Compliance Vault ────────────────────────────────────────────────

const COMPLIANCE_FIELD_LABELS: Record<string, string> = {
  cert_12a: "12A Certificate",
  cert_80g: "80G Certificate",
  csr1_number: "CSR-1 Registration",
  registration_number: "NGO Registration",
  fcra_number: "FCRA License",
};

const COMPLIANCE_SOURCE_LABELS: Record<string, { label: string; color: BadgeColor }> = {
  self_uploaded_verified: { label: "Verified (self-uploaded)", color: "emerald" },
  self_uploaded_unverified: { label: "Self-uploaded, pending review", color: "amber" },
  pipeline_scraped: { label: "From public records", color: "blue" },
  none: { label: "Not on file", color: "slate" },
};

function ResolvedComplianceSummary({ fields }: { fields: ResolvedComplianceField[] }) {
  if (fields.length === 0) return null;
  return (
    <div className={`${cardCls} p-5`}>
      <p className="text-sm font-bold text-slate-700 mb-1">Resolved Compliance Fields</p>
      <p className="text-xs text-slate-400 mb-4">
        The single, real value CorpoGN shows corporates for each field — preferring your admin-verified upload, then your own upload, then public-record data. Conflicts are flagged for review.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => {
          const src = COMPLIANCE_SOURCE_LABELS[f.resolvedSource];
          return (
            <div key={f.field} className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">{COMPLIANCE_FIELD_LABELS[f.field] ?? f.field}</p>
                <Chip label={src.label} color={src.color} />
              </div>
              <p className="mt-1.5 text-xs text-slate-500 break-words">
                {f.resolvedValue ?? "No value on file yet"}
              </p>
              {f.hasConflict && (
                <p className="mt-1.5 text-[11px] font-semibold text-amber-600">
                  ⚠ Both a self-upload and a public-record value exist for this field — worth a quick review.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ComplianceVaultSection({
  docs, docPaths, onDocUpload, ngoId, resolvedCompliance, ngoName, token, documentExcerpt,
}: {
  docs: Record<string, string>;
  docPaths: Record<string, string>;
  onDocUpload: (docId: string, storagePath?: string) => void;
  ngoId: string;
  resolvedCompliance: ResolvedComplianceField[];
  ngoName: string;
  token: string;
  documentExcerpt?: string;
}) {
  const [excerpt, setExcerpt] = useState(documentExcerpt ?? "");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [defaultDocType, setDefaultDocType] = useState<string | undefined>();
  const [toast, setToast] = useState("");
  const [viewing, setViewing] = useState(false);

  function openUpload(docId?: string) {
    setDefaultDocType(docId);
    setUploadOpen(true);
  }

  function handleSuccess(docId: string, label: string, storagePath?: string) {
    onDocUpload(docId, storagePath);
    setUploadOpen(false);
    setToast(`✓ ${label} uploaded successfully`);
    setTimeout(() => setToast(""), 3500);
  }

  async function viewDoc(docId: string) {
    const path = (docPaths ?? {})[docId];
    if (!path) {
      setToast("⚠️ Document storage path not found in DB. Please re-upload.");
      setTimeout(() => setToast(""), 3500);
      return;
    }
    setViewing(true);
    try {
      const { data, error } = await supabaseBrowser.storage
        .from("ngo-documents")
        .createSignedUrl(path, 60);

      if (error || !data?.signedUrl) {
        throw new Error(error?.message || "Failed to generate preview URL.");
      }

      window.open(data.signedUrl, "_blank");
    } catch (err) {
      setToast(err instanceof Error ? `❌ ${err.message}` : "❌ Could not open document.");
      setTimeout(() => setToast(""), 4000);
    } finally {
      setViewing(false);
    }
  }

  // Group docs by category
  const categories = Array.from(new Set(DOC_TYPES.map((d) => d.category)));
  const uploadedCount = DOC_TYPES.filter((d) => docs[d.id]).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <SectionHeader title="Compliance Vault"
            sub="Upload documents to boost your Trust Score. All documents are optional — share what you have." />
          <p className="mt-1 text-xs text-slate-500">
            {uploadedCount} of {DOC_TYPES.length} documents uploaded
          </p>
        </div>
        <button data-testid="upload-doc-btn" onClick={() => openUpload()} className={btn}>
          <Upload className="h-3.5 w-3.5" /> Upload Document
        </button>
      </div>

      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">
          {toast}
        </div>
      )}

      <ResolvedComplianceSummary fields={resolvedCompliance} />

      <AiTaskStreamPanel
        title="AI compliance summary"
        description="LLM summarizes your vault status, resolved registration fields, and gaps — paste an excerpt from a PDF below for deeper analysis."
        task="compliance_summary"
        token={token}
        portal="ngo"
        section="Compliance Vault"
        orgName={ngoName}
        testId="ai-compliance-summary-btn"
        payload={{
          ngoId,
          uploadedDocuments: DOC_TYPES.filter((d) => docs[d.id]).map((d) => ({
            id: d.id,
            label: d.label,
            category: d.category,
            status: docs[d.id],
          })),
          missingDocuments: DOC_TYPES.filter((d) => !docs[d.id]).map((d) => d.label),
          resolvedFields: resolvedCompliance.map((f) => ({
            field: f.field,
            value: f.resolvedValue,
            source: f.resolvedSource,
            hasConflict: f.hasConflict,
          })),
          optionalExcerpt: excerpt.trim() || undefined,
        }}
        extraInstructions={excerpt.trim() ? undefined : "Focus on statutory gaps for Indian CSR due diligence."}
      />
      <div className={`${cardCls} p-4`}>
        <p className="text-xs font-semibold text-slate-700 mb-2">Optional: paste text from a compliance PDF</p>
        <textarea
          data-testid="compliance-doc-excerpt"
          rows={3}
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          placeholder="Registration number, validity dates, auditor notes…"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
      </div>

      {categories.map((cat) => (
        <div key={cat}>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">{cat}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {DOC_TYPES.filter((d) => d.category === cat).map((doc) => (
              <div
                key={doc.id}
                data-testid={`doc-card-${doc.id}`}
                className={`${cardCls} flex items-center justify-between p-4 transition hover:shadow-md`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${docs[doc.id] ? "bg-emerald-50" : "bg-slate-50"}`}>
                    <FileText className={`h-4 w-4 ${docs[doc.id] ? "text-emerald-600" : "text-slate-400"}`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {doc.label}
                    </p>
                    <p className="text-xs text-slate-400">{docs[doc.id] ? "Uploaded — pending review" : "Not uploaded · Optional"}</p>
                  </div>
                </div>
                {docs[doc.id] ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" data-testid={`doc-check-${doc.id}`} />
                    <button
                      onClick={() => viewDoc(doc.id)}
                      disabled={viewing}
                      className="text-slate-400 hover:text-slate-700 disabled:opacity-50 transition p-1 rounded-lg hover:bg-slate-100"
                      title="View Document"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    data-testid={`upload-btn-${doc.id}`}
                    onClick={() => openUpload(doc.id)}
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
                  >
                    Upload
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
        <span className="font-semibold">💡 Tip:</span> All documents are optional — upload what you have at your own pace. Each verified document adds points to your Trust Score and helps corporates trust your NGO faster.
      </div>

      <UploadModal
        open={uploadOpen}
        defaultDocType={defaultDocType}
        onClose={() => setUploadOpen(false)}
        onSuccess={handleSuccess}
        ngoId={ngoId}
      />
    </div>
  );
}

// ─── Section: Trust Score ─────────────────────────────────────────────────────

function TrustScoreSection({
  ngo, onNavigate, liveTrustScore, docs,
}: {
  ngo: Ngo; onNavigate: (id: string) => void;
  liveTrustScore: number; docs: Record<string, string>;
}) {
  const docFactors = [
    { label: "12A Certification", docId: "certificate12a", weight: "High", points: 20 },
    { label: "80G Verification", docId: "certificate80g", weight: "High", points: 20 },
    { label: "FCRA License", docId: "fcraCertificate", weight: "High", points: 15 },
    { label: "CSR-1 Registration", docId: "csr1Certificate", weight: "Medium", points: 10 },
    { label: "Annual Report", docId: "annualReport", weight: "Medium", points: 10 },
    { label: "Audit Report", docId: "auditReport", weight: "Low", points: 10 },
  ];
  const extraFactors = [
    { label: "Expense Ratio", docId: null, weight: "Medium", points: 15, status: "not-computed" },
    { label: "Financial Strain Index", docId: null, weight: "Medium", points: 10, status: "not-computed" },
  ];
  const scoreColor = liveTrustScore >= 70 ? "text-emerald-600" : liveTrustScore >= 40 ? "text-amber-500" : "text-red-500";
  return (
    <div className="space-y-6">
      <SectionHeader title="Trust Score" sub="Dynamically computed from your compliance and financial health." />
      <div className={`${cardCls} p-6 text-center`}>
        <p data-testid="trust-score-value" className={`text-7xl font-black ${scoreColor}`}>{liveTrustScore}</p>
        <p className="mt-1 text-sm font-medium text-slate-400">out of 100</p>
        <div className="mx-auto mt-5 max-w-xs"><TrustBar score={liveTrustScore} /></div>
        <div className="mt-4 flex justify-center gap-5 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400" />0–39 Low</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />40–69 Medium</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />70+ High Trust</span>
        </div>
      </div>
      <div className={`${cardCls} divide-y divide-slate-50`}>
        {docFactors.map((f) => {
          const status = docs[f.docId] === "verified" ? "verified" : docs[f.docId] ? "uploaded" : "missing";
          return (
            <div key={f.label} className="flex items-center justify-between px-5 py-3.5">
              <div>
                <p className="text-sm font-semibold text-slate-800">{f.label}</p>
                <p className="text-xs text-slate-400">Weight: {f.weight} · Up to {f.points} pts</p>
              </div>
              <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${status === "verified" ? "bg-emerald-100 text-emerald-700" :
                  status === "uploaded" ? "bg-amber-100 text-amber-700" :
                    "bg-red-50 text-red-600"
                }`}>
                {status === "verified" ? "✓ Verified" : status === "uploaded" ? "Pending review" : "Missing"}
              </span>
            </div>
          );
        })}
        {extraFactors.map((f) => (
          <div key={f.label} className="flex items-center justify-between px-5 py-3.5">
            <div>
              <p className="text-sm font-semibold text-slate-800">{f.label}</p>
              <p className="text-xs text-slate-400">Weight: {f.weight} · Up to {f.points} pts</p>
            </div>
            <span className="rounded-full px-3 py-0.5 text-xs font-semibold bg-slate-100 text-slate-500">Pending data</span>
          </div>
        ))}
      </div>
      <button data-testid="goto-vault-from-trust" onClick={() => onNavigate("compliance-vault")} className={btn}>
        <Upload className="h-4 w-4" /> Upload Documents to Improve Score
      </button>
    </div>
  );
}

// ─── Section: AI Proposal Reviewer ───────────────────────────────────────────

function AiProposalSection({ token }: { token: string }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleAnalyse() {
    if (!text.trim()) return;
    setLoading(true);
    setResult(null);
    setError("");
    try {
      const res = await fetch("/api/analyse-proposal", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to analyze proposal.");
      }
      setResult(data.result);
    } catch (err: any) {
      setError(err.message || "An error occurred during analysis.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <AiAssistBadge label="Groq / LLM" variant="emerald" />
      </div>
      <SectionHeader title="AI Proposal Reviewer" sub={AI_PRODUCT_COPY.proposalReview} />
      <div className={`${cardCls} p-6`}>
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100">
            <Sparkles className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <p className="font-semibold text-slate-800">Powered by Gemini AI</p>
            <p className="text-xs text-slate-400">Reviews against Schedule VII · 28 CSR doc types</p>
          </div>
        </div>
        <textarea
          data-testid="proposal-textarea"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100 placeholder:text-slate-400"
          placeholder="Paste your proposal text here — AI will check alignment with CSR Schedule VII, impact measurement, budget justification, and geographic targeting..."
        />
        {error && (
          <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>
        )}
        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-slate-400">Checks: Schedule VII · Impact metrics · Budget · Beneficiary targeting</p>
          <button
            data-testid="analyse-proposal-btn"
            onClick={handleAnalyse}
            disabled={loading || !text.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {loading ? "Analysing..." : "Analyse Proposal"}
          </button>
        </div>
      </div>
      {result && (
        <div data-testid="proposal-result" className={`${cardCls} p-5`}>
          <p className="text-sm font-bold text-slate-700 mb-3">Analysis Result</p>
          <div className="space-y-1.5">
            {result.split("\n").filter(Boolean).map((line, i) => (
              <p key={i} className="text-sm text-slate-700 leading-relaxed">{line}</p>
            ))}
          </div>
        </div>
      )}
      <div className={`${cardCls} p-5`}>
        <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" /> What the AI checks
        </p>
        <ul className="space-y-2">
          {[
            "Alignment with Schedule VII CSR mandate areas",
            "Clarity of objectives and measurable outcomes",
            "Budget justification and phase-wise breakdown",
            "Geographic coverage and beneficiary targeting",
            "Impact measurement methodology",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-slate-600">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Section: Opportunities ──────────────────────────────────────────────────

interface Opportunity {
  id: string;
  corporate_id: string;
  title: string;
  description: string;
  focus_area: string;
  budget: number;
  state: string;
  district?: string;
  sdg_targets?: string[];
  target_beneficiaries?: string[];
  expected_start_date?: string | null;
  duration_months?: number | null;
  min_trust_score?: number;
  created_at: string;
  corporate_name: string;
  ai_fit_score?: number;
  ai_fit_label?: string;
  ai_insight?: string;
}

function getSdgInfo(focusArea: string) {
  const fa = (focusArea ?? "").toLowerCase();
  if (fa.includes("education")) {
    return {
      label: "SDG 4: Quality Education",
      desc: "Ensure inclusive and equitable quality education and promote lifelong learning opportunities for all."
    };
  } else if (fa.includes("health") || fa.includes("medical")) {
    return {
      label: "SDG 3: Good Health and Well-being",
      desc: "Ensure healthy lives and promote well-being for all at all ages."
    };
  } else if (fa.includes("women") || fa.includes("gender")) {
    return {
      label: "SDG 5: Gender Equality",
      desc: "Achieve gender equality and empower all women and girls."
    };
  } else if (fa.includes("water") || fa.includes("sanitation")) {
    return {
      label: "SDG 6: Clean Water and Sanitation",
      desc: "Ensure availability and sustainable management of water and sanitation for all."
    };
  } else if (fa.includes("environment") || fa.includes("climate") || fa.includes("conservation")) {
    return {
      label: "SDG 13: Climate Action",
      desc: "Take urgent action to combat climate change and its impacts."
    };
  }
  return {
    label: "SDG 1: No Poverty",
    desc: "End poverty in all its forms everywhere."
  };
}

function getBeneficiariesInfo(focusArea: string) {
  const fa = (focusArea ?? "").toLowerCase();
  if (fa.includes("education")) {
    return "Municipal school students, rural children, local educators";
  } else if (fa.includes("health")) {
    return "Rural patient populations, underprivileged families, infant healthcare centers";
  } else if (fa.includes("women")) {
    return "Rural women, self-help groups, female artisans";
  } else if (fa.includes("water")) {
    return "Drought-prone village residents, farming communities, school sanitation setups";
  }
  return "Marginalized local communities, children, and low-income families";
}

function OpportunityDetailsModal({
  opp,
  hasApplied,
  onClose,
  onApply,
}: {
  opp: Opportunity;
  hasApplied: boolean;
  onClose: () => void;
  onApply: () => void;
}) {
  const sdg = getSdgInfo(opp.focus_area);
  const beneficiaries = getBeneficiariesInfo(opp.focus_area);
  const btn = "rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500 transition duration-200 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50">
          <div>
            <div className="flex gap-2">
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                {opp.focus_area}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                {opp.state}
              </span>
            </div>
            <h3 className="font-bold text-slate-900 text-xl leading-tight mt-2">{opp.title}</h3>
            <p className="text-xs text-slate-400 mt-1">Proposed by: {opp.corporate_name}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 text-slate-700">
          {/* Budget + Meta Row */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Project Budget</span>
              <p className="text-2xl font-black text-slate-800">INR {opp.budget.toLocaleString("en-IN")}</p>
            </div>
            <div className="text-right space-y-1">
              <span className="text-xs font-semibold px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full block">
                CSR Grant Funding
              </span>
              {opp.duration_months && (
                <span className="text-xs font-medium text-slate-500 block">{opp.duration_months} months</span>
              )}
              {opp.expected_start_date && (
                <span className="text-xs font-medium text-slate-500 block">
                  Starts: {new Date(opp.expected_start_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                </span>
              )}
            </div>
          </div>

          {/* Location */}
          {(opp.state || opp.district) && (
            <div className="flex items-center gap-3 text-sm text-slate-600 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              <MapPin className="h-4 w-4 text-blue-500 shrink-0" />
              <span className="font-medium">{[opp.district, opp.state].filter(Boolean).join(", ")}</span>
            </div>
          )}

          {/* Description */}
          <div>
            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">Project Overview</h4>
            <p className="text-sm leading-relaxed text-slate-600 bg-white border border-slate-100 rounded-xl p-4 shadow-sm whitespace-pre-line">
              {opp.description}
            </p>
          </div>

          {/* SDG Tags — use real data when available, fallback to derived */}
          <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Sparkles className="h-4 w-4" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">Sustainable Development Goals</h4>
            </div>
            {opp.sdg_targets && opp.sdg_targets.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {opp.sdg_targets.map((sdgTag) => (
                  <span key={sdgTag} className="rounded-full bg-blue-50 border border-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">{sdgTag}</span>
                ))}
              </div>
            ) : (
              (() => {
                const sdg = getSdgInfo(opp.focus_area);
                return (
                  <>
                    <p className="text-xs font-semibold text-slate-700">{sdg.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{sdg.desc}</p>
                  </>
                );
              })()
            )}
          </div>

          {/* Target Beneficiaries — use real data when available */}
          <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <Users className="h-4 w-4" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">Target Beneficiaries</h4>
            </div>
            {opp.target_beneficiaries && opp.target_beneficiaries.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {opp.target_beneficiaries.map((b) => (
                  <span key={b} className="rounded-full bg-amber-50 border border-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{b}</span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 leading-relaxed">{getBeneficiariesInfo(opp.focus_area)}</p>
            )}
          </div>

          {/* Eligibility */}
          {(opp.min_trust_score ?? 0) > 0 && (
            <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-800">
              ⚠ Minimum NGO Trust Score required: {opp.min_trust_score}/100
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-6 py-4 bg-slate-50/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onClose();
              onApply();
            }}
            disabled={hasApplied}
            className={hasApplied ? "rounded-xl bg-slate-100 text-slate-400 px-5 py-2 text-sm font-semibold cursor-not-allowed" : btn}
          >
            {hasApplied ? "Applied ✓" : "Apply / Submit Proposal"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OpportunitiesSection({
  token,
  onNavigate,
}: {
  token: string;
  onNavigate: (id: string) => void;
}) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [appliedOppIds, setAppliedOppIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [focusArea, setFocusArea] = useState("All focus areas");
  const [stateFilter, setStateFilter] = useState("All states");

  // Modal
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [selectedDetailOpp, setSelectedDetailOpp] = useState<Opportunity | null>(null);
  const [proposalSummary, setProposalSummary] = useState("");
  const [proposedBudget, setProposedBudget] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError("");

        // 1. Fetch open opportunities
        const oppsRes = await fetch("/api/ngo/opportunities", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const oppsData = await oppsRes.json();
        if (!oppsRes.ok) throw new Error(oppsData.error ?? "Failed to fetch opportunities.");
        setOpportunities(oppsData.opportunities ?? []);

        // 2. Fetch submitted proposals to check applied status
        const propsRes = await fetch("/api/ngo/proposals", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const propsData = await propsRes.json();
        if (propsRes.ok && propsData.proposals) {
          const applied = new Set<string>();
          propsData.proposals.forEach((p: any) => {
            const matchedOpp = oppsData.opportunities?.find(
              (o: any) => o.title === p.project_name && o.corporate_id === p.corporate_id
            );
            if (matchedOpp) {
              applied.add(matchedOpp.id);
            }
          });
          setAppliedOppIds(applied);
        }
      } catch (err: any) {
        setError(err.message || "An error occurred.");
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      loadData();
    }
  }, [token]);

  const handleApplyClick = (opp: Opportunity) => {
    setSelectedOpp(opp);
    setProposedBudget(opp.budget);
    setProposalSummary("");
  };

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOpp) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/ngo/proposals", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          opportunity_id: selectedOpp.id,
          corporate_id: selectedOpp.corporate_id,
          project_name: selectedOpp.title,
          focus_area: selectedOpp.focus_area,
          budget: proposedBudget,
          summary: proposalSummary,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit proposal.");

      setAppliedOppIds((prev) => {
        const next = new Set(prev);
        next.add(selectedOpp.id);
        return next;
      });

      setSelectedOpp(null);
      setToast("✓ Proposal submitted successfully!");
      setTimeout(() => setToast(""), 3500);
    } catch (err: any) {
      setError(err.message || "Failed to submit proposal.");
    } finally {
      setSubmitting(false);
    }
  };

  const focusAreas = ["All focus areas", ...Array.from(new Set(opportunities.map((o) => o.focus_area)))];
  const states = ["All states", ...Array.from(new Set(opportunities.map((o) => o.state)))];

  const filtered = opportunities.filter((o) => {
    const matchesSearch = o.title.toLowerCase().includes(search.toLowerCase()) || o.description.toLowerCase().includes(search.toLowerCase());
    const matchesFocus = focusArea === "All focus areas" || o.focus_area === focusArea;
    const matchesState = stateFilter === "All states" || o.state === stateFilter;
    return matchesSearch && matchesFocus && matchesState;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <AiAssistBadge label="AI match scores" variant="emerald" />
          </div>
          <SectionHeader
            title="Opportunities"
            sub="Browse open CSR funding programs. CorpoGN AI scores each brief against your trust profile before you apply."
          />
          <p className="mt-1 max-w-2xl text-xs text-slate-500">{AI_PRODUCT_COPY.discovery}</p>
        </div>
      </div>

      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">
          {toast}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="grid gap-3 sm:grid-cols-3 bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Search</label>
          <input
            className={inputCls}
            placeholder="Search programs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Focus Area</label>
          <select
            className={inputCls}
            value={focusArea}
            onChange={(e) => setFocusArea(e.target.value)}
          >
            {focusAreas.map((fa) => (
              <option key={fa} value={fa}>{fa}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">State</label>
          <select
            className={inputCls}
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
          >
            {states.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading opportunities...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl">
          <p className="text-sm text-slate-500">No opportunities match the filters.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((opp) => {
            const hasApplied = appliedOppIds.has(opp.id);
            return (
              <div
                key={opp.id}
                onClick={() => setSelectedDetailOpp(opp)}
                className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between cursor-pointer"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      {opp.focus_area}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {opp.state}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 tracking-tight">{opp.title}</h3>
                  <p className="text-xs font-semibold text-slate-400 mt-1">Funder: {opp.corporate_name}</p>
                  {typeof opp.ai_fit_score === "number" ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[10px] font-bold text-violet-800">
                        AI fit {opp.ai_fit_score}% · {opp.ai_fit_label ?? "Match"}
                      </span>
                    </div>
                  ) : null}
                  {opp.ai_insight ? (
                    <AiInsightLine text={opp.ai_insight} className="mt-2 text-violet-600/90" />
                  ) : null}
                  <p className="text-sm text-slate-600 mt-3 line-clamp-3">{opp.description}</p>
                </div>
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">CSR Budget</span>
                    <p className="text-base font-bold text-slate-800">Rs {opp.budget.toLocaleString("en-IN")}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleApplyClick(opp);
                    }}
                    disabled={hasApplied}
                    className={hasApplied ? "rounded-xl bg-slate-100 text-slate-400 px-4 py-2 text-sm font-semibold cursor-not-allowed" : btn}
                  >
                    {hasApplied ? "Applied ✓" : "Apply Now"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Apply Modal */}
      {selectedOpp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <div>
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Submit Proposal</p>
                <h3 className="font-bold text-slate-900 text-lg leading-tight mt-0.5">{selectedOpp.title}</h3>
              </div>
              <button
                onClick={() => setSelectedOpp(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleApplySubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Funder</label>
                <p className="text-sm text-slate-600 font-medium">{selectedOpp.corporate_name}</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Proposed Budget (INR) *</label>
                <input
                  type="number"
                  required
                  className={inputCls}
                  value={proposedBudget}
                  onChange={(e) => setProposedBudget(Number(e.target.value))}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Proposal & Implementation Summary *</label>
                <textarea
                  required
                  rows={4}
                  className={`${inputCls} h-auto py-2`}
                  placeholder="Outline your target beneficiaries, implementation milestones, and project timeline..."
                  value={proposalSummary}
                  onChange={(e) => setProposalSummary(e.target.value)}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className={`${btn} flex-1 justify-center`}
                >
                  {submitting ? "Submitting..." : "Submit Proposal"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedOpp(null)}
                  className={btnOutline}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedDetailOpp && (
        <OpportunityDetailsModal
          opp={selectedDetailOpp}
          hasApplied={appliedOppIds.has(selectedDetailOpp.id)}
          onClose={() => setSelectedDetailOpp(null)}
          onApply={() => handleApplyClick(selectedDetailOpp)}
        />
      )}
    </div>
  );
}

// ─── Section: Corporate Funders ──────────────────────────────────────────────

interface Funder {
  id: string;
  company_name: string;
  company_email: string;
  registration_data: {
    state?: string;
    industryType?: string;
    csrFocusAreas?: string;
    headquartersAddress?: string;
  };
}

function CorporateFundersSection({
  token,
  onNavigate,
}: {
  token: string;
  onNavigate: (id: string) => void;
}) {
  const [funders, setFunders] = useState<Funder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Pitch Modal
  const [selectedFunder, setSelectedFunder] = useState<Funder | null>(null);
  const [projectName, setProjectName] = useState("");
  const [focusArea, setFocusArea] = useState("Education");
  const [proposedBudget, setProposedBudget] = useState(2500000);
  const [pitchMessage, setPitchMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    async function loadFunders() {
      try {
        setLoading(true);
        setError("");
        const res = await fetch("/api/ngo/funders", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to fetch corporate funders.");
        setFunders(data.funders ?? []);
      } catch (err: any) {
        setError(err.message || "An error occurred.");
      } finally {
        setLoading(false);
      }
    }
    if (token) {
      loadFunders();
    }
  }, [token]);

  const handlePitchClick = (funder: Funder) => {
    setSelectedFunder(funder);
    setProjectName("");
    setFocusArea(funder.registration_data?.csrFocusAreas || "Education");
    setProposedBudget(2500000);
    setPitchMessage("");
  };

  const handlePitchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFunder) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/ngo/proposals", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          corporate_id: selectedFunder.id,
          project_name: projectName,
          focus_area: focusArea,
          budget: proposedBudget,
          summary: pitchMessage,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send pitch.");

      setSelectedFunder(null);
      setToast("✓ Partnership pitch submitted successfully!");
      setTimeout(() => setToast(""), 3500);
    } catch (err: any) {
      setError(err.message || "Failed to submit pitch.");
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = funders.filter((f) => {
    const matchesSearch = f.company_name.toLowerCase().includes(search.toLowerCase()) ||
      (f.registration_data?.csrFocusAreas || "").toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      <SectionHeader title="Corporate Funders" sub="Connect with registered corporate partners, explore their focus areas, and pitch new projects." />

      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">
          {toast}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Search Funders</label>
        <input
          className={inputCls}
          placeholder="Search by corporate name or focus area..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading corporate funders...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl">
          <p className="text-sm text-slate-500">No funders found.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((funder) => (
            <div key={funder.id} className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 font-bold text-sm">
                      {funder.company_name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 tracking-tight">{funder.company_name}</h3>
                      <p className="text-xs text-slate-400">{funder.company_email}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                    {funder.registration_data?.state || "India"}
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  {funder.registration_data?.csrFocusAreas && (
                    <p>
                      <span className="font-semibold text-slate-800">CSR Focus:</span> {funder.registration_data.csrFocusAreas}
                    </p>
                  )}
                  {funder.registration_data?.industryType && (
                    <p>
                      <span className="font-semibold text-slate-800">Industry:</span> {funder.registration_data.industryType}
                    </p>
                  )}
                  {funder.registration_data?.headquartersAddress && (
                    <p className="text-xs text-slate-500">
                      <span className="font-semibold text-slate-800">HQs:</span> {funder.registration_data.headquartersAddress}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex gap-2">
                <button
                  onClick={() => handlePitchClick(funder)}
                  className={`${btn} flex-1 justify-center`}
                >
                  Direct Pitch
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pitch Modal */}
      {selectedFunder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <div>
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Direct Partnership Pitch</p>
                <h3 className="font-bold text-slate-900 text-lg leading-tight mt-0.5">Pitch to {selectedFunder.company_name}</h3>
              </div>
              <button
                onClick={() => setSelectedFunder(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handlePitchSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Project Name / Title *</label>
                <input
                  required
                  className={inputCls}
                  placeholder="e.g. Clean Energy school electrification"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">CSR Focus Area *</label>
                  <select
                    className={inputCls}
                    value={focusArea}
                    onChange={(e) => setFocusArea(e.target.value)}
                  >
                    <option value="Education">Education</option>
                    <option value="Healthcare">Healthcare</option>
                    <option value="Women Empowerment">Women Empowerment</option>
                    <option value="Water Conservation">Water Conservation</option>
                    <option value="Environment">Environment</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Proposed Budget (INR) *</label>
                  <input
                    type="number"
                    required
                    className={inputCls}
                    value={proposedBudget}
                    onChange={(e) => setProposedBudget(Number(e.target.value))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Pitch message & Partnership alignment *</label>
                <textarea
                  required
                  rows={4}
                  className={`${inputCls} h-auto py-2`}
                  placeholder="Explain why this project aligns with the funder's CSR goal and what outcomes you hope to deliver..."
                  value={pitchMessage}
                  onChange={(e) => setPitchMessage(e.target.value)}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className={`${btn} flex-1 justify-center`}
                >
                  {submitting ? "Sending Pitch..." : "Submit Pitch"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFunder(null)}
                  className={btnOutline}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section: Proposals ──────────────────────────────────────────────────────

interface Proposal {
  id: string;
  project_name: string;
  focus_area: string;
  budget: number;
  status: string;
  created_at: string;
  corporate_name: string;
  latest_update: string;
  opportunity_id?: string | null;
  lifecycle_status?: string | null;
  isShortlisted?: boolean;
}

type NgoPreAssignmentMeeting = {
  id: string;
  proposed_by: "corporate" | "ngo";
  scheduled_at: string;
  status: "proposed" | "confirmed" | "cancelled";
  meeting_link: string | null;
  notes: string | null;
  confirmed_by_corporate_at: string | null;
  confirmed_by_ngo_at: string | null;
};

/**
 * NGO-side counterpart to the corporate PreAssignmentMessageModal — the NGO
 * dashboard had no pre-assignment messaging/scheduling UI at all before this;
 * built fresh against the same real /api/pre-assignments/:id/messages and
 * /api/pre-assignments/:id/meetings routes the corporate side already uses.
 */
function NgoPreAssignmentModal({ preAssignmentId, corporateName, token, onClose }: { preAssignmentId: string; corporateName: string; token: string; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<"messages" | "meetings">("messages");
  const [messages, setMessages] = useState<{ id: string; sender_type: string; body: string; created_at: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [meetings, setMeetings] = useState<NgoPreAssignmentMeeting[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  const [proposedAt, setProposedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [proposing, setProposing] = useState(false);
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({});

  async function loadMessages() {
    const res = await fetch(`/api/pre-assignments/${preAssignmentId}/messages`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    if (res.ok) setMessages(body.messages ?? []);
  }

  async function loadMeetings() {
    setMeetingsLoading(true);
    const res = await fetch(`/api/pre-assignments/${preAssignmentId}/meetings`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    if (res.ok) setMeetings(body.meetings ?? []);
    setMeetingsLoading(false);
  }

  useEffect(() => {
    loadMessages();
    loadMeetings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preAssignmentId]);

  async function send() {
    if (!draft.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/pre-assignments/${preAssignmentId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body: draft }),
      });
      if (res.ok) {
        setDraft("");
        await loadMessages();
      }
    } finally {
      setSending(false);
    }
  }

  async function propose(e: React.FormEvent) {
    e.preventDefault();
    if (!proposedAt) return;
    setProposing(true);
    try {
      const res = await fetch(`/api/pre-assignments/${preAssignmentId}/meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scheduled_at: new Date(proposedAt).toISOString(), notes }),
      });
      if (res.ok) {
        setProposedAt("");
        setNotes("");
        await loadMeetings();
      }
    } finally {
      setProposing(false);
    }
  }

  async function patchMeeting(meetingId: string, payload: Record<string, unknown>) {
    const res = await fetch(`/api/pre-assignments/${preAssignmentId}/meetings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ meeting_id: meetingId, ...payload }),
    });
    if (res.ok) await loadMeetings();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="flex h-[70vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h3 className="font-bold text-slate-900">{corporateName}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        <div className="flex border-b border-slate-200 px-4">
          <button
            onClick={() => setActiveTab("messages")}
            className={`border-b-2 px-3 py-2 text-xs font-semibold ${activeTab === "messages" ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-400"}`}
          >
            Messages
          </button>
          <button
            onClick={() => setActiveTab("meetings")}
            className={`border-b-2 px-3 py-2 text-xs font-semibold ${activeTab === "meetings" ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-400"}`}
          >
            Schedule meeting
          </button>
        </div>
        {activeTab === "meetings" ? (
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <form onSubmit={propose} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Propose a time</p>
              <input
                type="datetime-local"
                value={proposedAt}
                onChange={(e) => setProposedAt(e.target.value)}
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Agenda / notes (optional)"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <button type="submit" disabled={proposing} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                {proposing ? "Proposing..." : "Propose meeting"}
              </button>
            </form>

            {meetingsLoading ? (
              <p className="text-sm text-slate-400">Loading...</p>
            ) : meetings.length === 0 ? (
              <p className="text-sm text-slate-400">No meetings proposed yet.</p>
            ) : (
              <div className="space-y-2">
                {meetings.map((m) => (
                  <div key={m.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">
                        {new Date(m.scheduled_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
                        m.status === "confirmed" ? "bg-emerald-50 text-emerald-700" : m.status === "cancelled" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"
                      }`}>{m.status}</span>
                    </div>
                    {m.notes ? <p className="mt-1 text-xs text-slate-500">{m.notes}</p> : null}
                    <p className="mt-1 text-[11px] text-slate-400">
                      Proposed by {m.proposed_by} · Corporate confirmed: {m.confirmed_by_corporate_at ? "yes" : "no"} · NGO confirmed: {m.confirmed_by_ngo_at ? "yes" : "no"}
                    </p>
                    {m.meeting_link ? (
                      <a href={m.meeting_link} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-emerald-700 hover:underline">
                        Join: {m.meeting_link}
                      </a>
                    ) : null}
                    {m.status !== "cancelled" ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {!m.confirmed_by_ngo_at ? (
                          <button onClick={() => patchMeeting(m.id, { action: "confirm" })} className="rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800">
                            Confirm
                          </button>
                        ) : null}
                        <button onClick={() => patchMeeting(m.id, { action: "cancel" })} className="rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
                          Cancel
                        </button>
                        <input
                          value={linkDrafts[m.id] ?? ""}
                          onChange={(e) => setLinkDrafts((v) => ({ ...v, [m.id]: e.target.value }))}
                          placeholder="Paste Meet/Zoom link"
                          className="h-7 flex-1 min-w-[140px] rounded-md border border-slate-300 px-2 text-[11px]"
                        />
                        <button
                          onClick={() => patchMeeting(m.id, { meeting_link: linkDrafts[m.id] ?? "" })}
                          className="rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          Save link
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 ? (
                <p className="text-center text-sm text-slate-400">No messages yet.</p>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`max-w-[80%] rounded-lg p-3 text-sm ${m.sender_type === "ngo" ? "ml-auto bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"}`}>
                    {m.body}
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2 border-t border-slate-200 p-4">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                className="h-10 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600"
                placeholder="Type a message..."
              />
              <button onClick={send} disabled={sending} className="rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const NGO_WORKSPACE_MODULES: { key: string; label: string; fields: { name: string; label: string; type: "text" | "textarea" | "number" | "date" }[] }[] = [
  { key: "campaigns", label: "Campaigns", fields: [{ name: "title", label: "Title", type: "text" }, { name: "description", label: "Description", type: "textarea" }] },
  { key: "funds", label: "Funds", fields: [{ name: "amount_inr", label: "Amount (INR)", type: "number" }, { name: "purpose", label: "Purpose", type: "text" }] },
  { key: "ngo_collaboration", label: "NGO Collaboration", fields: [{ name: "note", label: "Note", type: "textarea" }] },
  { key: "audits", label: "Audits", fields: [{ name: "audit_type", label: "Audit type", type: "text" }, { name: "findings", label: "Findings", type: "textarea" }] },
  { key: "reports", label: "Reports", fields: [{ name: "title", label: "Title", type: "text" }, { name: "report_type", label: "Report type", type: "text" }] },
  { key: "documents", label: "Documents", fields: [{ name: "doc_type", label: "Document type", type: "text" }, { name: "storage_path", label: "File path / URL", type: "text" }] },
  { key: "milestones", label: "Milestones", fields: [{ name: "title", label: "Title", type: "text" }, { name: "due_date", label: "Due date", type: "date" }] },
  { key: "tasks", label: "Tasks", fields: [{ name: "title", label: "Title", type: "text" }, { name: "due_date", label: "Due date", type: "date" }] },
  { key: "timeline", label: "Timeline", fields: [{ name: "event_title", label: "Event", type: "text" }, { name: "event_date", label: "Date", type: "date" }] },
  { key: "meetings", label: "Meetings", fields: [{ name: "title", label: "Title", type: "text" }, { name: "notes", label: "Notes", type: "textarea" }] },
  { key: "messages", label: "Messages", fields: [{ name: "body", label: "Message", type: "textarea" }] },
  { key: "approvals", label: "Approvals", fields: [{ name: "item_type", label: "Item type", type: "text" }, { name: "item_ref", label: "Reference", type: "text" }] },
  { key: "budget_tracking", label: "Budget Tracking", fields: [{ name: "line_item", label: "Line item", type: "text" }, { name: "budgeted_inr", label: "Budgeted (INR)", type: "number" }] },
  { key: "monitoring_evaluation", label: "Monitoring & Evaluation", fields: [{ name: "metric_name", label: "Metric", type: "text" }, { name: "metric_value", label: "Value", type: "number" }] },
];

/**
 * Additive NGO-side counterpart to the corporate WorkspaceModulesPanel — same
 * generic /api/project-workspace/:projectId/:module route, same permission
 * enforcement, just rendered under a proposal row once its project is signed.
 */
function NgoWorkspaceModulesPanel({ projectId, token }: { projectId: string; token: string }) {
  const [activeModule, setActiveModule] = useState(NGO_WORKSPACE_MODULES[0].key);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [permission, setPermission] = useState<"read" | "edit" | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeConfig = NGO_WORKSPACE_MODULES.find((m) => m.key === activeModule)!;

  async function load() {
    setIsLoading(true);
    setError(null);
    const res = await fetch(`/api/project-workspace/${projectId}/${activeModule}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    if (res.ok) {
      setItems(body.items ?? []);
      setPermission(body.permission ?? null);
    } else {
      setItems([]);
      setPermission(null);
      setError(body.error ?? "Could not load this module.");
    }
    setIsLoading(false);
  }

  useEffect(() => {
    load();
    setFormValues({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, activeModule]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const payload: Record<string, unknown> = {};
    for (const field of activeConfig.fields) {
      const raw = formValues[field.name];
      if (!raw) continue;
      payload[field.name] = field.type === "number" ? Number(raw) : raw;
    }
    const res = await fetch(`/api/project-workspace/${projectId}/${activeModule}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (res.ok) {
      setFormValues({});
      await load();
    } else {
      setError(body.error ?? "Could not save this entry.");
    }
    setIsSubmitting(false);
  }

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap gap-1.5">
        {NGO_WORKSPACE_MODULES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setActiveModule(m.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              activeModule === m.key ? "bg-emerald-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{activeConfig.label} entries</p>
          {isLoading ? (
            <p className="mt-2 text-sm text-slate-400">Loading...</p>
          ) : error ? (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          ) : items.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">No entries yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {items.map((item) => (
                <li key={String(item.id)} className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
                  {activeConfig.fields.map((f) => (item[f.name] != null ? <div key={f.name}><span className="text-slate-400">{f.label}: </span>{String(item[f.name])}</div> : null))}
                </li>
              ))}
            </ul>
          )}
        </div>

        {permission === "edit" ? (
          <form onSubmit={handleAdd} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Add entry</p>
            {activeConfig.fields.map((f) =>
              f.type === "textarea" ? (
                <textarea
                  key={f.name}
                  placeholder={f.label}
                  value={formValues[f.name] ?? ""}
                  onChange={(e) => setFormValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  rows={2}
                />
              ) : (
                <input
                  key={f.name}
                  type={f.type}
                  placeholder={f.label}
                  value={formValues[f.name] ?? ""}
                  onChange={(e) => setFormValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              ),
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Add"}
            </button>
          </form>
        ) : permission === "read" ? (
          <p className="text-sm text-slate-400">You have read-only access to this module.</p>
        ) : null}
      </div>
    </div>
  );
}

// ─── Restricted-role module sections ───────────────────────────────────────
// Step 9's project_module_permissions table + the generic
// /api/project-workspace/:projectId/:module route already exist and are
// already enforced server-side — these were simply never wired to any real
// UI. RoleModuleSection reuses that exact pattern (same fetch shape, same
// NGO_WORKSPACE_MODULES field config, same permission gate) for the
// restricted team-role dashboards, instead of the ~30 previously-hardcoded
// mock pages. NoBackingSection is the honest fallback for pages that have
// no clean real-table mapping — no fabricated numbers.

function NoBackingSection({
  from = "from-slate-500", to = "to-slate-700", eyebrow, title, description,
}: {
  from?: string; to?: string; eyebrow: string; title: string; description: string;
}) {
  return (
    <div className="space-y-6">
      <GradientHero from={from} to={to} eyebrow={eyebrow} title={title} description={description} badge="Not available yet" />
      <div className={`${cardCls} p-10 flex flex-col items-center justify-center text-center gap-2`}>
        <ClipboardList className="h-8 w-8 text-slate-200" />
        <p className="text-sm font-medium text-slate-400 max-w-md">
          This module isn&apos;t backed by real project data yet. Rather than show placeholder numbers, we&apos;re leaving it empty until it&apos;s wired up.
        </p>
      </div>
    </div>
  );
}

function RoleModuleSection({
  from, to, eyebrow, title, description, module, projectId, token, filterByAssignee,
}: {
  from: string; to: string; eyebrow: string; title: string; description: string;
  module: string; projectId: string | null; token: string;
  /** Volunteer's "Assigned Tasks" — only show rows whose assigned_to matches the viewer, when the data supports it. */
  filterByAssignee?: string;
}) {
  const config = NGO_WORKSPACE_MODULES.find((m) => m.key === module)!;
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [permission, setPermission] = useState<"read" | "edit" | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!projectId || !token) return;
    setIsLoading(true);
    setError(null);
    const res = await fetch(`/api/project-workspace/${projectId}/${module}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    if (res.ok) {
      setItems(body.items ?? []);
      setPermission(body.permission ?? null);
    } else {
      setItems([]);
      setPermission(null);
      setError(body.error ?? "Could not load this module.");
    }
    setIsLoading(false);
  }, [projectId, module, token]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setIsSubmitting(true);
    setError(null);
    const payload: Record<string, unknown> = {};
    for (const field of config.fields) {
      const raw = formValues[field.name];
      if (!raw) continue;
      payload[field.name] = field.type === "number" ? Number(raw) : raw;
    }
    const res = await fetch(`/api/project-workspace/${projectId}/${module}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (res.ok) {
      setFormValues({});
      await load();
    } else {
      setError(body.error ?? "Could not save this entry.");
    }
    setIsSubmitting(false);
  }

  const visibleItems = filterByAssignee
    ? items.filter((it) => it.assigned_to == null || it.assigned_to === filterByAssignee)
    : items;

  return (
    <div className="space-y-6">
      <GradientHero from={from} to={to} eyebrow={eyebrow} title={title} description={description}
        badge={projectId ? `${visibleItems.length} ${config.label.toLowerCase()} on record` : "No project yet"} />

      {!projectId ? (
        <div className={`${cardCls} p-10 flex flex-col items-center justify-center text-center gap-2`}>
          <Target className="h-8 w-8 text-slate-200" />
          <p className="text-sm font-medium text-slate-400 max-w-md">
            This unlocks once your NGO has a signed CSR project — connect one from Opportunities first.
          </p>
        </div>
      ) : error ? (
        <div className={`${cardCls} p-6`}>
          <p className="text-sm font-medium text-red-600">{error}</p>
        </div>
      ) : (
        <>
          <DataTable
            headers={config.fields.map((f) => f.label)}
            emptyMsg={isLoading ? "Loading..." : "No entries yet."}
            rows={visibleItems.map((item) => config.fields.map((f) => (item[f.name] != null ? String(item[f.name]) : "—")))}
          />
          {permission === "edit" && (
            <div className={`${cardCls} p-5`}>
              <p className="mb-3 text-sm font-bold text-slate-700">Add entry</p>
              <form onSubmit={handleAdd} className="grid gap-3 sm:grid-cols-2">
                {config.fields.map((f) =>
                  f.type === "textarea" ? (
                    <textarea key={f.name} placeholder={f.label} value={formValues[f.name] ?? ""}
                      onChange={(e) => setFormValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      className={`${inputCls} sm:col-span-2`} rows={2} />
                  ) : (
                    <input key={f.name} type={f.type} placeholder={f.label} value={formValues[f.name] ?? ""}
                      onChange={(e) => setFormValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      className={inputCls} />
                  ),
                )}
                <button type="submit" disabled={isSubmitting} className={`${btn} sm:col-span-2 justify-center`}>
                  {isSubmitting ? "Saving..." : "Add"}
                </button>
              </form>
            </div>
          )}
          {permission === "read" && (
            <p className="text-xs text-slate-400">You have read-only access to this module.</p>
          )}
        </>
      )}
    </div>
  );
}

/** Finance Analytics — a real summary computed over the funds + budget_tracking modules, not fabricated. */
function FinanceAnalyticsSection({ projectId, token }: { projectId: string | null; token: string }) {
  const [funds, setFunds] = useState<Record<string, unknown>[]>([]);
  const [budget, setBudget] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!projectId || !token) return;
    setIsLoading(true);
    Promise.all([
      fetch(`/api/project-workspace/${projectId}/funds`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      fetch(`/api/project-workspace/${projectId}/budget_tracking`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
    ])
      .then(([f, b]) => {
        setFunds(f.items ?? []);
        setBudget(b.items ?? []);
      })
      .finally(() => setIsLoading(false));
  }, [projectId, token]);

  const totalFunds = funds.reduce((sum, f) => sum + (Number(f.amount_inr) || 0), 0);
  const totalBudgeted = budget.reduce((sum, b) => sum + (Number(b.budgeted_inr) || 0), 0);
  const totalSpent = budget.reduce((sum, b) => sum + (Number(b.spent_inr) || 0), 0);
  const utilizationPct = totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0;

  return (
    <div className="space-y-6">
      <GradientHero from="from-violet-600" to="to-purple-700"
        eyebrow="Finance Officer · Finance Analytics"
        title="Financial Summary"
        description="A real, computed summary over your project's Funds and Budget Tracking modules — no placeholder figures."
        badge={projectId ? "Live data" : "No project yet"} />

      {!projectId ? (
        <div className={`${cardCls} p-10 flex flex-col items-center justify-center text-center gap-2`}>
          <Target className="h-8 w-8 text-slate-200" />
          <p className="text-sm font-medium text-slate-400">This unlocks once your NGO has a signed CSR project.</p>
        </div>
      ) : (
        <>
          <MetricRow items={[
            { label: "Total Funds Recorded", value: `₹${totalFunds.toLocaleString("en-IN")}`, sub: `${funds.length} entries`, color: "blue" },
            { label: "Total Budgeted", value: `₹${totalBudgeted.toLocaleString("en-IN")}`, sub: `${budget.length} line items`, color: "violet" },
            { label: "Total Spent", value: `₹${totalSpent.toLocaleString("en-IN")}`, sub: "Across all line items", color: "emerald" },
            { label: "Utilization", value: isLoading ? "…" : `${utilizationPct}%`, sub: "Spent / budgeted", color: "amber" },
          ]} />
          <DataTable
            headers={["Line Item", "Budgeted (INR)", "Spent (INR)"]}
            emptyMsg={isLoading ? "Loading..." : "No budget line items yet."}
            rows={budget.map((b) => [String(b.line_item ?? "—"), String(b.budgeted_inr ?? "—"), String(b.spent_inr ?? "0")])}
          />
        </>
      )}
    </div>
  );
}

/** Operations Manager "Projects" / Field Coordinator "Assigned Projects" — the NGO's real, already-existing project connections. */
function RealProjectsSection({
  eyebrow, connections, onNavigate,
}: {
  eyebrow: string; connections: ProjectConnection[]; onNavigate: (id: string) => void;
}) {
  const active = connections.filter((c) => c.status === "active" || c.status === "completed");
  return (
    <div className="space-y-6">
      <GradientHero from="from-green-600" to="to-emerald-700"
        eyebrow={eyebrow}
        title="CSR Project Connections"
        description="Your NGO's real, signed CSR project connections — the same data corporate partners see on their side."
        badge={`${active.length} active`} />
      <DataTable
        headers={["Project", "Corporate Partner", "Budget", "Progress", "Status"]}
        emptyMsg="No CSR projects connected yet."
        rows={connections.map((c) => [
          c.project_name,
          c.corporate_name,
          `₹${Number(c.budget || 0).toLocaleString("en-IN")}`,
          `${c.progress ?? 0}%`,
          <Chip key="s" label={c.status} color={c.status === "active" ? "emerald" : c.status === "completed" ? "blue" : "amber"} />,
        ])} />
      {connections.length > 0 && (
        <button onClick={() => onNavigate("my-projects")} className={btnOutline}>
          <Target className="h-4 w-4" /> Open full project workspace
        </button>
      )}
    </div>
  );
}

function ProposalsSection({
  token,
  onNavigate,
}: {
  token: string;
  onNavigate: (id: string) => void;
}) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [appliedOppIds, setAppliedOppIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [selectedDetailOpp, setSelectedDetailOpp] = useState<Opportunity | null>(null);
  const [proposalSummary, setProposalSummary] = useState("");
  const [proposedBudget, setProposedBudget] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");
  const [expandedWorkspaceId, setExpandedWorkspaceId] = useState<string | null>(null);
  const [messageTarget, setMessageTarget] = useState<{ id: string; corporateName: string } | null>(null);

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      // 1. Fetch proposals
      const propsRes = await fetch("/api/ngo/proposals", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const propsData = await propsRes.json();
      if (!propsRes.ok) throw new Error(propsData.error ?? "Failed to fetch proposals.");
      const propsList = propsData.proposals ?? [];
      setProposals(propsList);

      // 2. Fetch opportunities
      const oppsRes = await fetch("/api/ngo/opportunities", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const oppsData = await oppsRes.json();
      if (oppsRes.ok && oppsData.opportunities) {
        const oppsList = oppsData.opportunities ?? [];
        setOpportunities(oppsList);
        const applied = new Set<string>();
        propsList.forEach((p: any) => {
          const matchedOpp = oppsList.find(
            (o: any) => o.title === p.project_name && o.corporate_id === p.corporate_id
          );
          if (matchedOpp) {
            applied.add(matchedOpp.id);
          }
        });
        setAppliedOppIds(applied);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [token]);

  const handleApplyClick = (opp: Opportunity) => {
    setSelectedOpp(opp);
    setProposedBudget(opp.budget);
    setProposalSummary("");
  };

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOpp) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/ngo/proposals", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          opportunity_id: selectedOpp.id,
          corporate_id: selectedOpp.corporate_id,
          project_name: selectedOpp.title,
          focus_area: selectedOpp.focus_area,
          budget: proposedBudget,
          summary: proposalSummary,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit proposal.");

      setAppliedOppIds((prev) => {
        const next = new Set(prev);
        next.add(selectedOpp.id);
        return next;
      });

      // Reload data
      await loadData();

      setSelectedOpp(null);
      setToast("✓ Proposal submitted successfully!");
      setTimeout(() => setToast(""), 3500);
    } catch (err: any) {
      setError(err.message || "Failed to submit proposal.");
    } finally {
      setSubmitting(false);
    }
  };

  const total = proposals.length;
  const pending = proposals.filter((p) => p.status === "proposal").length;
  const approved = proposals.filter((p) => p.status === "active" || p.status === "completed").length;
  const awaitingAdmin = proposals.filter((p) => p.status === "pending_admin").length;

  return (
    <div className="space-y-6">
      <SectionHeader title="Proposals" sub="Track the submission progress, status, and communication logs of your project proposals." />

      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">
          {toast}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Submitted</p>
          <p className="text-3xl font-black text-slate-800 mt-2">{total}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pending Review</p>
          <p className="text-3xl font-black text-amber-500 mt-2">{pending}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Approved & Active</p>
          <p className="text-3xl font-black text-emerald-500 mt-2">{approved}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Awaiting Admin</p>
          <p className="text-3xl font-black text-blue-500 mt-2">{awaitingAdmin}</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading proposals...</p>
      ) : (
        <>
          {proposals.length === 0 ? (
            <div className="bg-white p-6 rounded-xl border border-slate-200/80 text-center py-10 shadow-sm">
              <p className="text-sm text-slate-500">No proposals submitted yet. You can apply for any of the active opportunities below.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-6 py-4">Project / Proposal</th>
                      <th className="px-6 py-4">Funder</th>
                      <th className="px-6 py-4">Focus Area</th>
                      <th className="px-6 py-4">Requested Budget</th>
                      <th className="px-6 py-4">Submitted Date</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Contact</th>
                      <th className="px-6 py-4">Workspace</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {proposals.map((prop) => (
                      <Fragment key={prop.id}>
                      <tr className="hover:bg-slate-50/50">
                        <td className="px-6 py-4">
                          <p className="font-bold text-slate-800 leading-tight">{prop.project_name}</p>
                          {prop.latest_update && (
                            <p className="text-xs text-slate-500 mt-1 line-clamp-1">{prop.latest_update}</p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-600 font-medium">{prop.corporate_name}</td>
                        <td className="px-6 py-4">
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                            {prop.focus_area}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-700">
                          Rs {prop.budget.toLocaleString("en-IN")}
                        </td>
                        <td className="px-6 py-4 text-slate-500">
                          {new Date(prop.created_at).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                            prop.status === "active" || prop.status === "completed"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                              : prop.status === "pending_admin"
                                ? "bg-blue-50 text-blue-700 border border-blue-100"
                              : "bg-amber-50 text-amber-700 border border-amber-100"
                            }`}>
                            {prop.status === "active" || prop.status === "completed"
                              ? "Approved"
                              : prop.status === "pending_admin"
                                ? "Awaiting Admin"
                                : "Pending Review"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            onClick={() => setMessageTarget({ id: prop.id, corporateName: prop.corporate_name })}
                            className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                          >
                            Message &amp; schedule
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          {prop.lifecycle_status === "signed" && prop.opportunity_id ? (
                            <button
                              type="button"
                              onClick={() => setExpandedWorkspaceId(expandedWorkspaceId === prop.id ? null : prop.id)}
                              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                            >
                              {expandedWorkspaceId === prop.id ? "Hide modules" : "Open modules"}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-300">Not unlocked</span>
                          )}
                        </td>
                      </tr>
                      {expandedWorkspaceId === prop.id && prop.opportunity_id ? (
                        <tr>
                          <td colSpan={8} className="bg-slate-50/50 px-6 py-4">
                            <NgoWorkspaceModulesPanel projectId={prop.opportunity_id} token={token} />
                          </td>
                        </tr>
                      ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CSR Opportunities section in Proposals */}
          <div className="pt-6 border-t border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 tracking-tight mb-2">Available CSR Projects</h3>
            <p className="text-sm text-slate-500 mb-6">Review open funding requirements from our corporate sponsors. Click a card to view sector, location, target beneficiaries, SDGs, and apply.</p>

            {opportunities.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No available projects found.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {opportunities.map((opp) => {
                  const hasApplied = appliedOppIds.has(opp.id);
                  return (
                    <div
                      key={opp.id}
                      onClick={() => setSelectedDetailOpp(opp)}
                      className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                            {opp.focus_area}
                          </span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                            {opp.state}
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-slate-900 tracking-tight">{opp.title}</h4>
                        <p className="text-xs font-semibold text-slate-400 mt-1">Funder: {opp.corporate_name}</p>
                        <p className="text-xs text-slate-500 mt-3 line-clamp-2">{opp.description}</p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Budget</span>
                          <p className="text-sm font-bold text-slate-800">Rs {opp.budget.toLocaleString("en-IN")}</p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApplyClick(opp);
                          }}
                          disabled={hasApplied}
                          className={hasApplied ? "rounded-xl bg-slate-100 text-slate-400 px-3 py-1.5 text-xs font-semibold cursor-not-allowed" : "rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-emerald-500 transition"}
                        >
                          {hasApplied ? "Applied ✓" : "Apply"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Apply Modal */}
      {selectedOpp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <div>
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Submit Proposal</p>
                <h3 className="font-bold text-slate-900 text-lg leading-tight mt-0.5">{selectedOpp.title}</h3>
              </div>
              <button
                onClick={() => setSelectedOpp(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleApplySubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Funder</label>
                <p className="text-sm text-slate-600 font-medium">{selectedOpp.corporate_name}</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Proposed Budget (INR) *</label>
                <input
                  type="number"
                  required
                  className={inputCls}
                  value={proposedBudget}
                  onChange={(e) => setProposedBudget(Number(e.target.value))}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Proposal & Implementation Summary *</label>
                <textarea
                  required
                  rows={4}
                  className={`${inputCls} h-auto py-2`}
                  placeholder="Outline your target beneficiaries, implementation milestones, and project timeline..."
                  value={proposalSummary}
                  onChange={(e) => setProposalSummary(e.target.value)}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500 transition duration-200 flex-1 justify-center disabled:opacity-50"
                >
                  {submitting ? "Submitting..." : "Submit Proposal"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedOpp(null)}
                  className={btnOutline}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedDetailOpp && (
        <OpportunityDetailsModal
          opp={selectedDetailOpp}
          hasApplied={appliedOppIds.has(selectedDetailOpp.id)}
          onClose={() => setSelectedDetailOpp(null)}
          onApply={() => handleApplyClick(selectedDetailOpp)}
        />
      )}

      {messageTarget && (
        <NgoPreAssignmentModal
          preAssignmentId={messageTarget.id}
          corporateName={messageTarget.corporateName}
          token={token}
          onClose={() => setMessageTarget(null)}
        />
      )}
    </div>
  );
}

// ─── Locked sections ──────────────────────────────────────────────────────────

function LockedSection({ label, onNavigate }: { label: string; onNavigate: (id: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 mb-5">
        <Lock className="h-7 w-7 text-slate-300" />
      </div>
      <h3 className="text-lg font-bold text-slate-600">{label}</h3>
      <p className="mt-2 max-w-sm text-sm text-slate-400 leading-relaxed">
        Unlocks once your NGO is verified. Complete compliance documents to speed up verification.
      </p>
      <button data-testid="goto-vault-locked" onClick={() => onNavigate("compliance-vault")} className={`mt-5 ${btn}`}>
        Go to Compliance Vault →
      </button>
    </div>
  );
}

function ProjectLockedSection({ label, onNavigate }: { label: string; onNavigate: (id: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 mb-5">
        <Heart className="h-7 w-7 text-emerald-400" />
      </div>
      <h3 className="text-lg font-bold text-slate-600">{label}</h3>
      <p className="mt-2 max-w-sm text-sm text-slate-400 leading-relaxed">
        Unlocks once a corporate assigns a CSR project to your NGO. Browse Opportunities to apply.
      </p>
      <button data-testid="goto-opportunities-locked" onClick={() => onNavigate("opportunities")} className={`mt-5 ${btn}`}>
        Browse Opportunities →
      </button>
    </div>
  );
}

// ─── Section: My Projects ─────────────────────────────────────────────────────

function MyProjectsSection({
  connections,
  onNavigate,
}: {
  connections: ProjectConnection[];
  onNavigate: (id: string) => void;
}) {
  const activeConnections = connections.filter(
    (connection) => connection.status === "active" || connection.status === "completed",
  );
  const hasReal = activeConnections.length > 0;
  const projects = hasReal
    ? activeConnections
    : [{
      id: "demo-1",
      corporate_id: "", ngo_id: "", created_at: "",
      project_name: "Rural Education Mission",
      corporate_name: "Tata Steel CSR",
      budget: 2500000,
      milestone: "Kickoff and baseline",
      status: "active" as const,
      progress: 18,
      focus_area: "Education",
      document_requests: ["CSR-1 certificate", "Latest audit report"],
      latest_update: "Project workspace established.",
      ngo_name: "",
      ngo_progress_notes: null,
      ngo_milestone_status: null,
      ngo_beneficiary_count: null,
      uc_submitted: false,
      uc_submitted_at: null,
      impact_report_submitted: false,
      impact_report_submitted_at: null,
      deleted_at: null,
    }];

  return (
    <div className="space-y-6">
      <SectionHeader title="My Projects" sub="CSR projects assigned to your NGO by corporate partners." />

      {!hasReal && (
        <Alert type="info"
          title="Using demo project data"
          body="Once a corporate assigns a real project to your NGO, it appears here live from Supabase."
        />
      )}

      {projects.map((p) => (
        <div key={p.id} className={`${cardCls} overflow-hidden`}>
          {/* Colour band */}
          <div className="h-1.5 bg-gradient-to-r from-emerald-400 to-teal-500" />
          <div className="p-5 sm:p-6">

            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                    {p.focus_area}
                  </span>
                  <span className="rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                    ACTIVE PROJECT
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900">{p.project_name}</h3>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-700 uppercase tracking-wide">
                {p.status}
              </span>
            </div>

            {/* Corporate connection card */}
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-sm">
                {p.corporate_name.charAt(0)}
              </div>
              <div>
                <p className="text-xs text-blue-500 font-medium">Assigned by corporate partner</p>
                <p className="text-sm font-bold text-blue-900">{p.corporate_name}</p>
              </div>
              <span className="ml-auto rounded-full bg-blue-600 px-2.5 py-0.5 text-[10px] font-bold text-white">CONNECTED</span>
            </div>

            {/* KPIs */}
            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
              {[
                { label: "Budget", value: typeof p.budget === "number" ? `₹${(p.budget / 100000).toFixed(0)}L` : String(p.budget) },
                { label: "Milestone", value: p.milestone.length > 18 ? p.milestone.slice(0, 18) + "…" : p.milestone },
                { label: "Progress", value: `${p.progress}%` },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{s.label}</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Shared progress bar */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                <span>Shared project progress <span className="text-slate-400">(same bar corporate sees)</span></span>
                <span className="font-bold text-emerald-600">{p.progress}%</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-100">
                <div className="h-2.5 rounded-full bg-emerald-500" style={{ width: `${p.progress}%` }} />
              </div>
            </div>

            {/* Document requests callout */}
            {p.document_requests.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-bold text-amber-800 mb-1.5">
                  📋 {p.document_requests.length} document{p.document_requests.length > 1 ? "s" : ""} requested by corporate
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {p.document_requests.map((d) => (
                    <span key={d} className="rounded-full bg-amber-100 border border-amber-200 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">{d}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-5 flex gap-2 flex-wrap">
              <button onClick={() => onNavigate("project-chat")} className={btn}>
                <MessageSquare className="h-3.5 w-3.5" /> Shared Workspace
              </button>
              <button onClick={() => onNavigate("fund-tracking")} className={btnOutline}>
                <Wallet className="h-3.5 w-3.5" /> Fund Tracking
              </button>
              <button onClick={() => onNavigate("milestone-reporting")} className={btnOutline}>
                <BarChart3 className="h-3.5 w-3.5" /> Milestones
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectChatSection({
  connections,
  token,
  onConnectionUpdate,
}: {
  connections: ProjectConnection[];
  token: string;
  onConnectionUpdate: (updated: ProjectConnection) => void;
}) {
  const activeConnections = connections.filter(
    (connection) => connection.status === "active" || connection.status === "completed",
  );
  const conn = activeConnections[0];
  const [updateText, setUpdateText] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");
  const [postSuccess, setPostSuccess] = useState(false);
  const [chatMessages, setChatMessages] = useState<ProjectMessage[]>([]);
  const [chatBody, setChatBody] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [chatError, setChatError] = useState("");

  useEffect(() => {
    if (!conn?.id || !token) {
      setChatMessages([]);
      return;
    }

    let ignore = false;

    async function loadMessages() {
      try {
        const res = await fetch(`/api/ngo/messages?connectionId=${conn.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as { messages?: ProjectMessage[]; error?: string };
        if (ignore) return;

        if (res.ok) {
          setChatMessages(data.messages ?? []);
          setChatError("");
        } else {
          setChatError(data.error ?? "Could not load project chat.");
        }
      } catch {
        if (!ignore) setChatError("Could not load project chat.");
      }
    }

    loadMessages();
    const interval = window.setInterval(loadMessages, 3000);

    return () => {
      ignore = true;
      window.clearInterval(interval);
    };
  }, [conn?.id, token]);

  async function handlePostUpdate() {
    if (!conn || !updateText.trim()) return;
    setPosting(true);
    setPostError("");
    setPostSuccess(false);

    const res = await fetch("/api/project-connections", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        connectionId: conn.id,
        latest_update: updateText.trim(),
      }),
    });
    const data = (await res.json()) as { connection?: ProjectConnection; error?: string };
    setPosting(false);

    if (!res.ok || !data.connection) {
      setPostError(data.error ?? "Could not post update.");
      return;
    }

    onConnectionUpdate(data.connection);
    setUpdateText("");
    setPostSuccess(true);
    setTimeout(() => setPostSuccess(false), 3500);
  }

  async function handleSendChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!conn || !chatBody.trim() || sendingChat) return;

    setSendingChat(true);
    setChatError("");

    const res = await fetch("/api/ngo/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        connectionId: conn.id,
        body: chatBody.trim(),
      }),
    });
    const data = (await res.json()) as { message?: ProjectMessage; error?: string };
    setSendingChat(false);

    if (!res.ok || !data.message) {
      setChatError(data.error ?? "Could not send message.");
      return;
    }

    setChatMessages((prev) =>
      prev.some((message) => message.id === data.message?.id)
        ? prev
        : [...prev, data.message as ProjectMessage],
    );
    setChatBody("");
  }

  const docRequests = conn?.document_requests.length
    ? conn.document_requests
    : ["CSR-1 certificate", "Latest audit report"];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Project Chat"
        sub="Shared workspace — your updates appear live on the corporate dashboard."
      />

      {/* Project header banner */}
      <div className="overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
        <div className="px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-200">Connected shared workspace</p>
              <h3 className="mt-1.5 text-xl font-bold">{conn?.project_name ?? "Assigned CSR Project"}</h3>
              <p className="mt-1 text-sm text-emerald-100">Corporate: <span className="font-semibold text-white">{conn?.corporate_name ?? "Corporate Partner"}</span></p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white">{conn?.status?.toUpperCase() ?? "ACTIVE"}</span>
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-emerald-100">{conn?.progress ?? 0}% complete</span>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-xs text-emerald-200">
              <span>Shared project progress</span><span className="font-semibold text-white">{conn?.progress ?? 0}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/20">
              <div className="h-2 rounded-full bg-white/80" style={{ width: `${conn?.progress ?? 0}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">

        {/* Left: update thread */}
        <div className="space-y-4">
          {/* Corporate's latest update (what they see) */}
          <div className={`${cardCls} p-5`}>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Conversation thread</p>
            <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
              {chatMessages.length ? (
                chatMessages.map((message) => {
                  const fromNgo = message.sender_type === "ngo";
                  return (
                    <div key={message.id} className={`flex ${fromNgo ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm ${fromNgo
                          ? "bg-emerald-600 text-white"
                          : "border border-slate-200 bg-white text-slate-800"
                        }`}>
                        <p className={`mb-1 text-[10px] font-bold uppercase tracking-wide ${fromNgo ? "text-emerald-200" : "text-blue-600"}`}>
                          {fromNgo ? "Your NGO" : "Corporate"}
                        </p>
                        <p className="whitespace-pre-wrap">{message.body}</p>
                        <p className={`mt-1 text-[10px] ${fromNgo ? "text-emerald-300" : "text-slate-400"}`}>
                          {new Date(message.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white p-5 text-center text-sm text-slate-500">
                  No shared chat messages yet.
                </div>
              )}
              {conn?.latest_update && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600">Latest project update</p>
                  <p>{conn.latest_update}</p>
                </div>
              )}
            </div>

            <form onSubmit={handleSendChat} className="mt-3 flex gap-2">
              <input
                className={inputCls}
                value={chatBody}
                onChange={(event) => setChatBody(event.target.value)}
                placeholder="Reply to the corporate partner..."
                disabled={!conn || sendingChat}
              />
              <button className={btn} type="submit" disabled={!conn || !chatBody.trim() || sendingChat}>
                {sendingChat ? "Sending..." : "Send"}
              </button>
            </form>
            {chatError && <p className="mt-2 text-xs font-semibold text-red-600">{chatError}</p>}
          </div>

          {/* Post update form */}
          <div className={`${cardCls} p-5`}>
            <p className="mb-1 text-sm font-bold text-slate-800">Post a field update</p>
            <p className="mb-3 text-xs text-slate-500">This appears instantly as "Latest NGO update" on the corporate dashboard.</p>
            <textarea
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              placeholder="e.g. Completed beneficiary enrolment for Zone 3. 340 students onboarded. Photos attached in Media section."
              value={updateText}
              onChange={(e) => setUpdateText(e.target.value)}
            />
            {postError && (
              <p className="mt-2 text-xs font-semibold text-red-600">{postError}</p>
            )}
            {postSuccess && (
              <p className="mt-2 text-xs font-semibold text-emerald-600">✓ Update posted — visible on corporate dashboard now.</p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                onClick={handlePostUpdate}
                disabled={posting || !updateText.trim()}
                className={`${btn} flex-1 justify-center`}
              >
                {posting ? "Posting..." : "Post Update"}
              </button>
              <button
                onClick={() => setUpdateText("")}
                className={btnOutline}
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Right: document requests panel */}
        <div className="space-y-4">
          <div className={`${cardCls} p-5`}>
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Bell className="h-4 w-4 text-amber-500" />
              Corporate document requests
            </h4>
            <p className="mt-1 text-xs text-slate-500">Upload these to unblock tranche releases.</p>
            <div className="mt-4 space-y-2.5">
              {docRequests.map((req) => (
                <div
                  key={req}
                  className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50 px-3.5 py-3"
                >
                  <div>
                    <p className="text-xs font-semibold text-amber-900">{req}</p>
                    <p className="text-[10px] text-amber-600">Pending upload</p>
                  </div>
                  <Upload className="h-4 w-4 flex-shrink-0 text-amber-600" />
                </div>
              ))}
            </div>
            <button className={`mt-4 w-full justify-center ${btn}`}>
              <Upload className="h-3.5 w-3.5" />
              Upload Document
            </button>
          </div>

          {/* Project metrics */}
          <div className={`${cardCls} p-5 space-y-3`}>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Project metrics</p>
            {[
              { label: "Budget sanctioned", value: conn?.budget != null ? `₹${(conn.budget / 100000).toFixed(2)}L` : "—" },
              { label: "Current milestone", value: conn?.milestone ?? "Kickoff" },
              { label: "Focus area", value: conn?.focus_area ?? "Education" },
              { label: "Status", value: conn?.status ?? "active" },
            ].map((m) => (
              <div key={m.label} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-500">{m.label}</span>
                <span className="font-semibold text-slate-800 capitalize">{m.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section: Fund Tracking ───────────────────────────────────────────────────

function FundTrackingSection({
  onNavigate,
  connection,
  projectId,
  token,
}: {
  onNavigate: (id: string) => void;
  connection?: ProjectConnection;
  projectId: string | null;
  token: string;
}) {
  const [funds, setFunds] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !token) return;
    setIsLoading(true);
    setLoadError(null);
    fetch(`/api/project-workspace/${projectId}/funds`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((body) => {
        if (body.error) setLoadError(body.error);
        else setFunds(body.items ?? []);
      })
      .catch(() => setLoadError("Could not load fund releases."))
      .finally(() => setIsLoading(false));
  }, [projectId, token]);

  const rawBudget = connection?.budget != null
    ? `₹${connection.budget.toLocaleString("en-IN")}`
    : "—";

  const progressPct = connection?.progress ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <SectionHeader title="Fund Tracking" sub="Milestone-gated tranche release status for your assigned project." />
        <button onClick={() => onNavigate("utilization-cert")} className={btn}>
          <Wallet className="h-3.5 w-3.5" /> Request Tranche Release
        </button>
      </div>

      {/* Connected project banner */}
      {connection && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 flex items-center gap-3">
          <Wallet className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-900">{connection.project_name}</p>
            <p className="text-xs text-blue-600">Corporate: {connection.corporate_name} · Budget: {rawBudget}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Total Sanctioned" value={rawBudget} icon={Wallet} color="blue" />
        <KpiCard
          label="Released (workspace funds)"
          value={
            isLoading
              ? "…"
              : `₹${funds
                  .filter((f) => f.released_at)
                  .reduce((s, f) => s + Number(f.amount_inr ?? 0), 0)
                  .toLocaleString("en-IN")}`
          }
          icon={TrendingUp}
          color="emerald"
          sub={`${funds.filter((f) => f.released_at).length} release(s)`}
        />
        <KpiCard label="Project Progress" value={`${progressPct}%`} icon={BarChart3} color="violet" sub={connection?.milestone ?? "—"} />
      </div>

      {/* Progress bar synced with corporate */}
      <div className={`${cardCls} p-5`}>
        <div className="flex items-center justify-between mb-2 text-sm">
          <span className="font-semibold text-slate-700">Shared progress (synced with corporate view)</span>
          <span className="font-bold text-emerald-600">{progressPct}%</span>
        </div>
        <div className="h-3 w-full rounded-full bg-slate-100">
          <div className="h-3 rounded-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-400">Current milestone: <span className="font-medium text-slate-600">{connection?.milestone ?? "Kickoff and baseline"}</span></p>
      </div>

      <div className={`${cardCls} divide-y divide-slate-50`}>
        {loadError ? (
          <p className="px-5 py-4 text-sm text-red-600">{loadError}</p>
        ) : isLoading ? (
          <p className="px-5 py-4 text-sm text-slate-400">Loading fund releases…</p>
        ) : funds.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-400">No fund rows in the project workspace yet.</p>
        ) : (
          funds.map((f) => {
            const released = Boolean(f.released_at);
            return (
              <div key={String(f.id)} className="flex items-center gap-4 px-5 py-4">
                <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${released ? "bg-emerald-500" : "bg-amber-400"}`} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">{String(f.purpose ?? "Fund release")}</p>
                  <p className="text-xs text-slate-400">
                    ₹{Number(f.amount_inr ?? 0).toLocaleString("en-IN")}
                    {released ? ` · ${String(f.released_at).slice(0, 10)}` : " · Scheduled"}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${released ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {released ? "Released" : "Pending"}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Section: Impact Reporting ────────────────────────────────────────────────

function ImpactReportingSection({
  connection, token, ngoName, projectId,
}: {
  connection?: ProjectConnection;
  token: string;
  ngoName: string;
  projectId?: string | null;
}) {
  const [impactNotes, setImpactNotes] = useState("");
  const [meKpis, setMeKpis] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!projectId || !token) return;
    fetch(`/api/project-workspace/${projectId}/monitoring_evaluation`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((body) => {
        const map: Record<string, number> = {};
        for (const row of body.items ?? []) {
          if (row.metric_name) map[String(row.metric_name)] = Number(row.metric_value ?? 0);
        }
        setMeKpis(map);
      })
      .catch(() => setMeKpis({}));
  }, [projectId, token]);
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState<"success" | "error">("success");
  const [uploading, setUploading] = useState<string | null>(null);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast(msg);
    setToastType(type);
    setTimeout(() => setToast(""), 4000);
  }

  async function handleUpload(type: "photo" | "video" | "pdf", file: File) {
    if (!connection) { showToast("No project connection — assign a project first.", "error"); return; }
    setUploading(type);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `evidence/${connection.id}/${type}-${Date.now()}.${ext}`;
      const { error: storageErr } = await supabaseBrowser.storage
        .from("ngo-documents")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (storageErr) {
        console.warn("[Evidence] Storage error:", storageErr.message);
        showToast(`${file.name} recorded (storage bucket not yet created — set up 'ngo-documents' bucket in Supabase).`, "success");
      } else {
        showToast(`✓ ${file.name} uploaded successfully.`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed.", "error");
    } finally {
      setUploading(null);
    }
  }

  const items = [
    { label: "Geo-Tagged Photos", icon: Camera, hint: "JPG, PNG · Max 10MB", accept: "image/*", type: "photo" as const, ref: photoRef, testId: "upload-photos-btn" },
    { label: "Progress Videos", icon: Upload, hint: "MP4, MOV · Max 50MB", accept: "video/*", type: "video" as const, ref: videoRef, testId: "upload-videos-btn" },
    { label: "PDF Reports", icon: FileText, hint: "PDF · Max 20MB", accept: ".pdf", type: "pdf" as const, ref: pdfRef, testId: "upload-pdf-btn" },
  ] as const;

  return (
    <div className="space-y-6">
      <SectionHeader title="Impact Reporting" sub="Upload field evidence — photos, videos, and reports. Syncs to corporate review queue." />
      <AiTaskStreamPanel
        title="AI impact report draft"
        description="Streams a board-ready narrative from your KPIs and field notes. Edit before sharing with corporate partners."
        task="impact_report"
        token={token}
        portal="ngo"
        section="Impact Reporting"
        orgName={ngoName}
        testId="ai-impact-report-btn"
        buttonLabel="Draft impact report"
        payload={{
          projectName: connection?.project_name ?? "Active CSR project",
          corporatePartner: connection?.corporate_name ?? "Corporate partner",
          connectionStatus: connection?.status,
          illustrativeKpis: {
            beneficiariesReached: meKpis["Beneficiaries reached"] ?? meKpis["Target beneficiaries"],
            communitiesServed: meKpis["Active locations"],
            learningImprovementPct: meKpis["Learning improvement"],
          },
          fieldNotes: impactNotes.trim() || undefined,
        }}
      />
      <div className={`${cardCls} p-4`}>
        <p className="text-xs font-semibold text-slate-700 mb-2">Field notes for the AI draft</p>
        <textarea
          data-testid="impact-field-notes"
          rows={4}
          value={impactNotes}
          onChange={(e) => setImpactNotes(e.target.value)}
          placeholder="Outcomes this quarter, locations, beneficiary stories, data caveats…"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Beneficiaries Reached" value="1,240" icon={Heart} color="rose" />
        <KpiCard label="Communities Served" value="8" icon={MapPin} color="emerald" />
        <KpiCard label="Reports Submitted" value="2" icon={FileText} color="blue" />
      </div>
      {toast && (
        <div className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${toastType === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}>{toast}</div>
      )}
      <div className={`${cardCls} p-5`}>
        <p className="text-sm font-semibold text-slate-700 mb-4">Submit Evidence</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <Fragment key={item.type}>
              {/* Hidden real file input */}
              <input
                ref={item.ref}
                type="file"
                accept={item.accept}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(item.type, f);
                  e.target.value = "";
                }}
              />
              <button
                data-testid={item.testId}
                onClick={() => item.ref.current?.click()}
                disabled={uploading !== null}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition ${uploading === item.type
                    ? "border-emerald-400 bg-emerald-50 opacity-70"
                    : "border-emerald-200 bg-emerald-50/50 hover:border-emerald-400 hover:bg-emerald-50"
                  }`}
              >
                <item.icon className="h-6 w-6 text-emerald-500" />
                <p className="text-sm font-semibold text-slate-700">
                  {uploading === item.type ? "Uploading…" : item.label}
                </p>
                <p className="text-xs text-slate-400">{item.hint}</p>
              </button>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Section: Utilization Certificate ────────────────────────────────────────

function UtilizationCertSection({
  connection, token,
}: {
  connection?: ProjectConnection;
  token: string;
}) {
  const [form, setForm] = useState({ tranche: "", date: "", notes: "" });
  const [file, setFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Tranche amounts derived from real budget (connection.budget / 4)
  const trancheAmt = connection?.budget ? Math.round(connection.budget / 4) : 625000;
  const fmtTranche = `₹${trancheAmt.toLocaleString("en-IN")}`;

  async function handleSubmit() {
    if (!form.tranche || !form.date) return;
    if (!connection) { setSubmitError("No project connection found."); return; }
    setSubmitting(true);
    setSubmitError("");

    try {
      // 1. Upload PDF to Supabase Storage if provided
      let storageObjectId: string | undefined;
      let fileName: string | undefined;
      let mimeType: string | undefined;
      let fileSize: number | undefined;

      if (file) {
        const storagePath = `uc/${connection.id}/${Date.now()}-${file.name}`;
        const { error: storageErr } = await supabaseBrowser.storage
          .from("ngo-documents")
          .upload(storagePath, file, { upsert: true, contentType: file.type });
        if (!storageErr) {
          storageObjectId = storagePath;
          fileName = file.name;
          mimeType = file.type;
          fileSize = file.size;
        } else {
          console.warn("[UC] Storage upload failed:", storageErr.message);
        }
      }

      // 2. Submit UC record
      const res = await fetch(`/api/project-connections/${connection.id}/uc`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCertified: trancheAmt,
          periodFrom: undefined,
          periodTo: form.date,
          storageObjectId,
          bucketName: storageObjectId ? "ngo-documents" : undefined,
          fileName,
          mimeType,
          fileSize,
        }),
      });

      const data = (await res.json()) as { utilization_certificate?: unknown; error?: string };
      if (!res.ok) { setSubmitError(data.error ?? "Submission failed."); return; }
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <CheckCircle2 className="h-14 w-14 text-emerald-500 mb-4" />
        <h3 className="text-lg font-bold text-slate-900">Certificate Submitted!</h3>
        <p className="mt-2 text-sm text-slate-500">Your utilization certificate has been submitted for corporate review. The corporate dashboard now shows UC submitted ✓</p>
        <button onClick={() => { setSubmitted(false); setForm({ tranche: "", date: "", notes: "" }); setFile(null); }} className={`mt-5 ${btnOutline}`}>Submit Another</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader title="Utilization Certificate" sub="Submit utilization certificates for fund tranches. Syncs to corporate dashboard instantly." />
      {!connection && (
        <Alert type="warn" title="No project connection" body="A UC can only be submitted once a corporate has assigned a project to your NGO." />
      )}
      <div className={`${cardCls} p-6`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
            Tranche Reference *
            <select data-testid="uc-tranche-select" className={inputCls}
              value={form.tranche} onChange={(e) => setForm((p) => ({ ...p, tranche: e.target.value }))}
              disabled={!connection}>
              <option value="">Select tranche</option>
              <option value="T1">Tranche 1 — {fmtTranche}</option>
              <option value="T2">Tranche 2 — {fmtTranche}</option>
              <option value="T3">Tranche 3 — {fmtTranche}</option>
              <option value="T4">Tranche 4 — {fmtTranche}</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
            Certificate Date *
            <input data-testid="uc-date-input" type="date" className={inputCls}
              value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
              disabled={!connection} />
          </label>
          <div className="sm:col-span-2">
            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              Upload Certificate (PDF)
              <input data-testid="uc-file-input" type="file" accept=".pdf"
                className={inputCls + " py-2"}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={!connection} />
            </label>
          </div>
          <div className="sm:col-span-2">
            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              Notes
              <textarea rows={3} data-testid="uc-notes-input"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="Additional context…"
                value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                disabled={!connection} />
            </label>
          </div>
        </div>
        {submitError && <p className="mt-3 text-xs font-semibold text-red-600">{submitError}</p>}
        <button data-testid="uc-submit-btn" onClick={handleSubmit}
          disabled={submitting || !form.tranche || !form.date || !connection}
          className={btn + " mt-5"}>
          {submitting ? "Submitting…" : "Submit Certificate"}
        </button>
        {connection && (
          <p className="mt-2 text-xs text-slate-400">Project: <span className="font-semibold text-slate-600">{connection.project_name}</span> · Budget: <span className="font-semibold">{`₹${connection.budget.toLocaleString("en-IN")}`}</span></p>
        )}
      </div>
    </div>
  );
}

// ─── Section: Role Assignment ─────────────────────────────────────────────────

function RoleAssignmentSection({ ngo, token, projectId }: { ngo: Ngo; token: string; projectId: string | null }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loadedMembers, setLoadedMembers] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", role: "", password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Module access grants (project_module_permissions) ─────────────────────
  const [grants, setGrants] = useState<{ assignee_id: string; module: string; permission: string }[]>([]);
  const [grantForm, setGrantForm] = useState({ memberAuthUserId: "", module: NGO_WORKSPACE_MODULES[0].key, permission: "read" });
  const [grantMsg, setGrantMsg] = useState("");
  const [isGranting, setIsGranting] = useState(false);

  async function loadGrants() {
    if (!projectId) return;
    const res = await fetch(`/api/ngos/module-permissions?projectId=${projectId}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.grants) setGrants(data.grants);
  }

  useEffect(() => { loadGrants(); loadMembers(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  async function handleGrant() {
    setGrantMsg("");
    if (!projectId) { setGrantMsg("No active project yet — connect one before granting module access."); return; }
    if (!grantForm.memberAuthUserId) { setGrantMsg("Select a team member."); return; }
    setIsGranting(true);
    const res = await fetch("/api/ngos/module-permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ projectId, ...grantForm }),
    });
    const data = await res.json();
    setIsGranting(false);
    if (!res.ok) { setGrantMsg(data.error || "Could not save this grant."); return; }
    setGrantMsg("✓ Access granted.");
    await loadGrants();
  }

  async function loadMembers() {
    if (loadedMembers) return;
    const res = await fetch("/api/ngos/members", { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.members) { setMembers(data.members); setLoadedMembers(true); }
  }

  async function handleAdd() {
    setError(""); setSuccess("");
    if (!form.fullName || !form.email || !form.role || !form.password) { setError("All fields are required."); return; }
    if (form.password !== form.confirmPassword) { setError("Passwords do not match."); return; }
    setIsSubmitting(true);
    const res = await fetch("/api/ngos/members", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setIsSubmitting(false);
    if (!res.ok) { setError(data.error || "Failed to add member."); return; }
    setSuccess(`✓ ${form.fullName} added as ${getRoleLabel(form.role as NgoRole)}.`);
    setForm({ fullName: "", email: "", role: "", password: "", confirmPassword: "" });
    setMembers((p) => [...p, data.member]);
  }

  return (
    <div className="space-y-6">
      <SectionHeader title="Role Assignment"
        sub="Assign roles to team members. Each gets their own login and a role-specific dashboard." />

      <div className={`${cardCls} p-6`}>
        <p className="text-sm font-bold text-slate-700 mb-5 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-emerald-500" /> Add New Member
        </p>
        {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700" data-testid="role-error">{error}</p>}
        {success && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700" data-testid="role-success">{success}</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { label: "Full Name", key: "fullName", type: "text", placeholder: "Jane Doe", testId: "role-fullname-input" },
            { label: "Email Address", key: "email", type: "email", placeholder: "jane@example.com", testId: "role-email-input" },
          ].map((f) => (
            <label key={f.key} className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              {f.label} *
              <input data-testid={f.testId} type={f.type} placeholder={f.placeholder} className={inputCls}
                value={form[f.key as keyof typeof form]}
                onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))} />
            </label>
          ))}

          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
            Role *
            <select data-testid="role-select" className={inputCls} value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}>
              <option value="">Select role</option>
              {NGO_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
            Password *
            <input data-testid="role-password-input" type="password" placeholder="Min. 8 characters" className={inputCls}
              value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700 sm:col-span-2">
            Confirm Password *
            <input data-testid="role-confirm-input" type="password" placeholder="Repeat password" className={inputCls}
              value={form.confirmPassword} onChange={(e) => setForm((p) => ({ ...p, confirmPassword: e.target.value }))} />
          </label>
        </div>

        <button data-testid="add-member-btn" onClick={handleAdd} disabled={isSubmitting} className={btn + " mt-5"}>
          {isSubmitting ? "Adding..." : "Add Member"}
        </button>
      </div>

      <div className={cardCls}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <p className="text-sm font-bold text-slate-700">Team Members</p>
          <button data-testid="load-members-btn" onClick={loadMembers} className={btnGhost}>Load members ↻</button>
        </div>
        {members.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No team members yet. Add one above.</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {members.map((m) => (
              <div key={m.id} data-testid={`member-row-${m.email}`} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{m.full_name}</p>
                  <p className="text-xs text-slate-400">{m.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-semibold text-emerald-700">
                    {getRoleLabel(m.role as NgoRole)}
                  </span>
                  <span className={`h-2 w-2 rounded-full ${m.is_active ? "bg-emerald-500" : "bg-slate-300"}`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`${cardCls} p-5`}>
        <p className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-500" /> Project Module Access
        </p>
        <p className="text-xs text-slate-400 mb-4">
          Grant a team member read or edit access to a specific project workspace module (Funds, Tasks, Audits, Reports, etc.).
          This is the same permission table (<code>project_module_permissions</code>) the project workspace route enforces server-side —
          without a grant here, a team member gets a 403 when their role page tries to load that module.
        </p>
        {!projectId ? (
          <p className="text-sm text-slate-400">Connect a CSR project first — module access can only be granted once a project workspace exists.</p>
        ) : (
          <>
            {grantMsg && <p className="mb-3 text-sm font-medium text-emerald-700">{grantMsg}</p>}
            <div className="grid gap-3 sm:grid-cols-4">
              <select className={inputCls} value={grantForm.memberAuthUserId}
                onChange={(e) => setGrantForm((p) => ({ ...p, memberAuthUserId: e.target.value }))}>
                <option value="">Select member</option>
                {members.map((m) => <option key={m.id} value={m.auth_user_id}>{m.full_name} ({getRoleLabel(m.role as NgoRole)})</option>)}
              </select>
              <select className={inputCls} value={grantForm.module}
                onChange={(e) => setGrantForm((p) => ({ ...p, module: e.target.value }))}>
                {NGO_WORKSPACE_MODULES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
              <select className={inputCls} value={grantForm.permission}
                onChange={(e) => setGrantForm((p) => ({ ...p, permission: e.target.value }))}>
                <option value="read">Read only</option>
                <option value="edit">Read + Edit</option>
              </select>
              <button onClick={handleGrant} disabled={isGranting} className={btn}>
                {isGranting ? "Saving..." : "Grant Access"}
              </button>
            </div>
            {grants.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {grants.map((g, i) => {
                  const m = members.find((mm) => mm.auth_user_id === g.assignee_id);
                  return (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                      <span className="text-slate-600">{m?.full_name ?? g.assignee_id} — {NGO_WORKSPACE_MODULES.find((mo) => mo.key === g.module)?.label ?? g.module}</span>
                      <Chip label={g.permission} color={g.permission === "edit" ? "emerald" : "slate"} />
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <div className={`${cardCls} p-5`}>
        <p className="text-sm font-bold text-slate-700 mb-4">Role Access Reference</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {NGO_ROLES.map((r) => (
            <div key={r.value} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-700">{r.label}</p>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                {ROLE_SIDEBAR_ACCESS[r.value]?.join(", ") || "Limited access"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Section: Settings ────────────────────────────────────────────────────────

function SettingsSection({ ngo }: { ngo: Ngo }) {
  return (
    <div className="space-y-6">
      <SectionHeader title="Settings" sub="Manage your NGO account and preferences." />
      <div className={`${cardCls} divide-y divide-slate-50`}>
        {[
          { label: "NGO Name", value: ngo.ngo_name, testId: "settings-name" },
          { label: "Contact Email", value: ngo.ngo_email, testId: "settings-email" },
          { label: "Account Status", value: ngo.access_status.charAt(0).toUpperCase() + ngo.access_status.slice(1), testId: "settings-status" },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">{item.label}</p>
              <p data-testid={item.testId} className="text-xs text-slate-400 mt-0.5">{item.value}</p>
            </div>
            <button className="text-xs font-semibold text-emerald-600 hover:text-emerald-800">Edit</button>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-red-100 bg-red-50 p-5">
        <p className="text-sm font-bold text-red-800 mb-1">Danger Zone</p>
        <p className="text-xs text-red-500 mb-4">These actions cannot be undone.</p>
        <button data-testid="deactivate-btn" className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 transition">
          Deactivate NGO Account
        </button>
      </div>
    </div>
  );
}

// ─── Shared rich-panel primitives ────────────────────────────────────────────

function GradientHero({
  from, to, eyebrow, title, description, badge,
}: {
  from: string; to: string; eyebrow: string;
  title: string; description: string; badge?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${from} ${to} p-6 text-white shadow-md`}>
      <div className="relative z-10">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest opacity-80">{eyebrow}</p>
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="mt-1.5 max-w-xl text-sm opacity-80 leading-relaxed">{description}</p>
        {badge && <span className="mt-3 inline-block rounded-full bg-white/20 px-3 py-0.5 text-xs font-semibold">{badge}</span>}
      </div>
      <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10" />
      <div className="absolute -right-2 bottom-0 h-20 w-20 rounded-full bg-white/5" />
    </div>
  );
}

function MetricRow({ items }: { items: { label: string; value: string; sub?: string; color?: string }[] }) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    violet: "bg-violet-50 text-violet-700 border-violet-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
    slate: "bg-slate-50 text-slate-700 border-slate-100",
  };
  return (
    <div className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, minmax(0,1fr))` }}>
      {items.map((m) => {
        const cls = colors[m.color ?? "emerald"] ?? colors.emerald;
        return (
          <div key={m.label} className={`rounded-2xl border p-4 ${cls}`}>
            <p className="text-xs font-medium opacity-70">{m.label}</p>
            <p className="mt-1 text-2xl font-bold">{m.value}</p>
            {m.sub && <p className="mt-0.5 text-xs opacity-60">{m.sub}</p>}
          </div>
        );
      })}
    </div>
  );
}

type BadgeColor = "emerald" | "amber" | "blue" | "red" | "slate" | "violet";
function Chip({ label, color = "slate" }: { label: string; color?: BadgeColor }) {
  const m: Record<BadgeColor, string> = {
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
    red: "bg-red-100 text-red-700",
    slate: "bg-slate-100 text-slate-600",
    violet: "bg-violet-100 text-violet-700",
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${m[color]}`}>{label}</span>;
}

function DataTable({
  headers, rows, emptyMsg = "No records found.",
}: {
  headers: string[];
  rows: (string | React.ReactNode)[][];
  emptyMsg?: string;
}) {
  return (
    <div className={`${cardCls} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {headers.map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.length === 0
              ? <tr><td colSpan={headers.length} className="py-10 text-center text-xs text-slate-400">{emptyMsg}</td></tr>
              : rows.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/60 transition">
                  {row.map((cell, j) => (
                    <td key={j} className="px-4 py-3 text-slate-700">{cell}</td>
                  ))}
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HowItWorks({ title = "How This Works", points }: { title?: string; points: string[] }) {
  return (
    <div className={`${cardCls} p-5`}>
      <p className="mb-3 text-sm font-bold text-slate-700">{title}</p>
      <ul className="space-y-2">
        {points.map((p, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">{i + 1}</span>
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Chart Primitives (pure SVG/CSS, zero external deps) ─────────────────────

/** Circular progress ring */
function ProgressRing({ percent, color = "emerald", size = 80, label }: {
  percent: number; color?: string; size?: number; label?: string;
}) {
  const r = 32; const c = 2 * Math.PI * r;
  const fill = Math.max(0, Math.min(percent, 100));
  const dash = (fill / 100) * c;
  const clr: Record<string, string> = {
    emerald: "#10b981", blue: "#3b82f6", amber: "#f59e0b",
    red: "#ef4444", violet: "#8b5cf6", rose: "#f43f5e", cyan: "#06b6d4",
  };
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 80 80" width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="9" stroke="#f1f5f9" />
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="9"
          stroke={clr[color] ?? clr.emerald}
          strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="round" />
      </svg>
      {label !== undefined && (
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-800">{label}</span>
      )}
    </div>
  );
}

/** SVG donut chart with legend */
function DonutChart({ segments, size = 110, center }: {
  segments: { label: string; value: number; color: string; formatted?: string }[];
  size?: number; center?: string;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const r = 38; const c = 2 * Math.PI * r;
  const clr: Record<string, string> = {
    emerald: "#10b981", blue: "#3b82f6", amber: "#f59e0b",
    red: "#ef4444", violet: "#8b5cf6", slate: "#94a3b8", rose: "#f43f5e", cyan: "#06b6d4",
  };
  let cum = 0;
  return (
    <div className="flex items-center gap-5 flex-wrap">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="16" stroke="#f1f5f9" />
          {segments.map((seg, i) => {
            const len = (seg.value / total) * c;
            const off = -cum;
            cum += len;
            return (
              <circle key={i} cx="50" cy="50" r={r} fill="none" strokeWidth="16"
                stroke={clr[seg.color] ?? "#94a3b8"}
                strokeDasharray={`${len} ${c - len}`} strokeDashoffset={off} />
            );
          })}
        </svg>
        {center && (
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-700 text-center leading-tight px-1">{center}</span>
        )}
      </div>
      <div className="space-y-2 flex-1 min-w-0">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: clr[seg.color] ?? "#94a3b8" }} />
            <span className="truncate text-xs text-slate-600">{seg.label}</span>
            <span className="ml-auto text-xs font-semibold text-slate-700 flex-shrink-0">{seg.formatted ?? `${seg.value}%`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bar chart */
function BarChart({ data, color = "emerald" }: {
  data: { label: string; value: number; formatted?: string }[];
  color?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const bgClr: Record<string, string> = {
    emerald: "bg-emerald-500", blue: "bg-blue-500", amber: "bg-amber-400",
    violet: "bg-violet-500", rose: "bg-rose-500", cyan: "bg-cyan-500",
  };
  const bar = bgClr[color] ?? bgClr.emerald;
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.label} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-600">{d.label}</span>
            <span className="font-semibold text-slate-700">{d.formatted ?? d.value}</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-100">
            <div className={`h-2.5 rounded-full ${bar} transition-all duration-700`}
              style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Vertical stacked column chart (SVG) */
function ColumnChart({ categories, series }: {
  categories: string[];
  series: { label: string; color: string; values: number[] }[];
}) {
  const max = Math.max(...series.flatMap((s) => s.values), 1);
  const barH = 120; const barW = 28; const gap = 20;
  const svgW = categories.length * (series.length * (barW + 4) + gap);
  const clr: Record<string, string> = {
    emerald: "#10b981", blue: "#3b82f6", amber: "#f59e0b",
    violet: "#8b5cf6", rose: "#f43f5e", cyan: "#06b6d4",
  };
  return (
    <div className="overflow-x-auto">
      <svg height={barH + 30} style={{ width: "100%", minWidth: Math.max(svgW, 200) }}>
        {categories.map((cat, ci) => {
          const gx = ci * (series.length * (barW + 4) + gap) + gap / 2;
          return (
            <g key={cat}>
              {series.map((s, si) => {
                const h = max > 0 ? (s.values[ci] / max) * barH : 0;
                const x = gx + si * (barW + 4);
                return (
                  <rect key={s.label} x={x} y={barH - h} width={barW} height={h}
                    fill={clr[s.color] ?? "#10b981"} rx="3" opacity="0.85" />
                );
              })}
              <text x={gx + (series.length * (barW + 4)) / 2} y={barH + 18}
                textAnchor="middle" fontSize="10" fill="#64748b">{cat}</text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3">
        {series.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: clr[s.color] ?? "#10b981" }} />
            <span className="text-xs text-slate-600">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Vertical milestone timeline */
function MiniTimeline({ steps }: { steps: { label: string; date: string; done: boolean; note?: string }[] }) {
  return (
    <div className="space-y-0">
      {steps.map((step, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${step.done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
              }`}>
              {step.done ? "✓" : i + 1}
            </div>
            {i < steps.length - 1 && <div className="w-0.5 flex-1 my-1 bg-slate-200" />}
          </div>
          <div className="pb-4">
            <p className={`text-sm font-semibold ${step.done ? "text-slate-800" : "text-slate-400"}`}>{step.label}</p>
            <p className="text-xs text-slate-400">{step.date}</p>
            {step.note && <p className="mt-0.5 text-xs text-slate-500 italic">{step.note}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Live activity feed */
function ActivityFeed({ items }: { items: { time: string; user: string; action: string; type?: "success" | "warning" | "info" }[] }) {
  const dot: Record<string, string> = { success: "bg-emerald-500", warning: "bg-amber-400", info: "bg-blue-400" };
  return (
    <div className="divide-y divide-slate-50">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50/60 transition">
          <div className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${dot[item.type ?? "info"]}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-700">
              <span className="font-semibold text-slate-900">{item.user}</span>{" "}{item.action}
            </p>
          </div>
          <span className="text-xs text-slate-400 flex-shrink-0">{item.time}</span>
        </div>
      ))}
    </div>
  );
}

/** Stat with ring — compact KPI + ring combo */
function RingKpi({ label, value, sub, percent, color = "emerald" }: {
  label: string; value: string; sub?: string; percent: number; color?: string;
}) {
  return (
    <div className={`${cardCls} p-4 flex items-center gap-4`}>
      <ProgressRing percent={percent} color={color} size={64} label={`${percent}%`} />
      <div>
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-slate-800">{value}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Finance Officer Sections ─────────────────────────────────────────────────
// Real mapping (Step 9 project_module_permissions + generic workspace route):
// Funds → `funds` module. Utilization Reports & Grant Tracking → `budget_tracking`
// (closest real table — no separate grant-pipeline table exists). Finance
// Analytics → a real computed summary over funds + budget_tracking (see
// FinanceAnalyticsSection above, near NgoWorkspaceModulesPanel). Expenses and
// Invoices have no real backing table — honest empty state, not fabricated.

function FundsSection({ projectId, token }: { projectId: string | null; token: string }) {
  return (
    <RoleModuleSection
      from="from-blue-600" to="to-cyan-700"
      eyebrow="Finance Officer · Funds"
      title="Fund Management Centre"
      description="Real fund entries recorded against your NGO's active CSR project — synced with the corporate partner's workspace."
      module="funds" projectId={projectId} token={token}
    />
  );
}

function ExpensesSection() {
  return (
    <NoBackingSection from="from-blue-600" to="to-indigo-700"
      eyebrow="Finance Officer · Expenses" title="Expenditure Tracker"
      description="No dedicated expenses table yet. Use Budget Tracking in the project workspace for real spend lines until this module ships." />
  );
}

function InvoicesSection() {
  return (
    <NoBackingSection from="from-cyan-600" to="to-blue-700"
      eyebrow="Finance Officer · Invoices" title="Vendor Invoice Management"
      description="No dedicated invoices table yet. Use Funds and Budget Tracking in the project workspace for disbursement and utilization records." />
  );
}

function UtilizationReportsSection({ projectId, token }: { projectId: string | null; token: string }) {
  return (
    <RoleModuleSection
      from="from-indigo-600" to="to-purple-700"
      eyebrow="Finance Officer · Utilization Reports"
      title="Utilization Report Centre"
      description="Real budget-tracking line items for your active project — the closest real data source until a dedicated utilization-report table exists."
      module="budget_tracking" projectId={projectId} token={token}
    />
  );
}

function GrantTrackingSection({ projectId, token }: { projectId: string | null; token: string }) {
  return (
    <RoleModuleSection
      from="from-teal-600" to="to-emerald-700"
      eyebrow="Finance Officer · Grant Tracking"
      title="Grant / Budget Pipeline"
      description="Real budget-tracking line items for your active project — the closest real data source until a dedicated multi-source grant table exists."
      module="budget_tracking" projectId={projectId} token={token}
    />
  );
}

// ─── Compliance Officer Sections ──────────────────────────────────────────────
// Legal Documents / NGO Verification reuse the SAME real compliance data as
// the Super Admin's Compliance Vault (ngo_documents + resolved-compliance.ts)
// — not a second fake dataset. Audit Requests → `audits` module. Compliance
// Workflow → `approvals` module.

function LegalDocumentsSection({
  docs, docPaths, resolvedCompliance, ngo, token, onDocUpload, onNavigate,
}: {
  docs: Record<string, string>; docPaths: Record<string, string>; resolvedCompliance: ResolvedComplianceField[];
  ngo: Ngo; token: string; onDocUpload: (docId: string, storagePath?: string) => void;
  onNavigate: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <GradientHero from="from-emerald-600" to="to-teal-700"
        eyebrow="Compliance Officer · Legal Documents"
        title="Regulatory Document Vault"
        description="The NGO's real compliance document vault — the same data and uploads the Super Admin sees, not a separate mock list."
        badge={`${Object.keys(docs).length} of ${DOC_TYPES.length} uploaded`} />
      <ComplianceVaultSection docs={docs} docPaths={docPaths} onDocUpload={onDocUpload} ngoId={ngo.id} resolvedCompliance={resolvedCompliance} ngoName={ngo.ngo_name} token={token} />
    </div>
  );
}

function NgoVerificationSection({ ngo, resolvedCompliance }: { ngo: Ngo; resolvedCompliance: ResolvedComplianceField[] }) {
  const isVerified = ngo.access_status === "verified" || ngo.access_status === "active";
  return (
    <div className="space-y-6">
      <GradientHero from="from-sky-600" to="to-blue-700"
        eyebrow="Compliance Officer · NGO Verification"
        title="Verification Status"
        description="Your NGO's real, current verification status and trust score — not a simulated step tracker."
        badge={isVerified ? "Verified" : "Pending"} />
      <MetricRow items={[
        { label: "Access Status", value: ngo.access_status, color: isVerified ? "emerald" : "amber" },
        { label: "Trust Score", value: `${ngo.trust_score}/100`, color: "blue" },
        { label: "Resolved Fields On File", value: String(resolvedCompliance.filter((f) => f.resolvedSource !== "none").length), sub: `of ${resolvedCompliance.length}`, color: "violet" },
      ]} />
      <ResolvedComplianceSummary fields={resolvedCompliance} />
    </div>
  );
}

function AuditRequestsSection({ projectId, token }: { projectId: string | null; token: string }) {
  return (
    <RoleModuleSection
      from="from-orange-600" to="to-red-700"
      eyebrow="Compliance Officer · Audit Requests"
      title="Audit Query Management"
      description="Real audit entries recorded against your NGO's active CSR project."
      module="audits" projectId={projectId} token={token}
    />
  );
}

function ComplianceWorkflowSection({ projectId, token }: { projectId: string | null; token: string }) {
  return (
    <RoleModuleSection
      from="from-emerald-700" to="to-green-800"
      eyebrow="Compliance Officer · Workflow"
      title="Approvals Workflow"
      description="Real approval items recorded against your NGO's active CSR project."
      module="approvals" projectId={projectId} token={token}
    />
  );
}

// ─── Operations Manager Sections ──────────────────────────────────────────────

function ProjectsSection({ connections, onNavigate }: { connections: ProjectConnection[]; onNavigate: (id: string) => void }) {
  return <RealProjectsSection eyebrow="Operations Manager · Projects" connections={connections} onNavigate={onNavigate} />;
}

function MilestonesSection({ projectId, token }: { projectId: string | null; token: string }) {
  return (
    <div className="space-y-6">
      <GradientHero
        from="from-teal-600"
        to="to-cyan-700"
        eyebrow="Operations Manager · Milestones"
        title="Milestone Delivery Tracker"
        description="Same milestone records as Milestone Reporting — synced with the corporate partner via the shared workspace."
        badge={projectId ? "Live workspace" : "No active project"}
      />
      <WorkspaceMilestonesPanel projectId={projectId} getToken={async () => token} />
    </div>
  );
}

function BeneficiaryTrackingSection({ projectId, token }: { projectId: string | null; token: string }) {
  return (
    <RoleModuleSection
      from="from-pink-600" to="to-rose-700"
      eyebrow="Operations Manager · Beneficiary Tracking"
      title="Beneficiary Impact Registry"
      description="Real monitoring & evaluation metrics recorded against your NGO's active CSR project."
      module="monitoring_evaluation" projectId={projectId} token={token}
    />
  );
}

function TaskAssignmentSection({ projectId, token }: { projectId: string | null; token: string }) {
  return (
    <RoleModuleSection
      from="from-slate-700" to="to-slate-900"
      eyebrow="Operations Manager · Task Assignment"
      title="Team Task Management"
      description="Real tasks recorded against your NGO's active CSR project."
      module="tasks" projectId={projectId} token={token}
    />
  );
}

function PartnershipCommunicationSection({ projectId, token }: { projectId: string | null; token: string }) {
  return (
    <RoleModuleSection
      from="from-indigo-600" to="to-blue-700"
      eyebrow="Operations Manager · Partnership Comms"
      title="Corporate Partner Communication"
      description="Real project workspace messages exchanged with your corporate CSR partner."
      module="messages" projectId={projectId} token={token}
    />
  );
}

function ReportDraftsSection({ projectId, token }: { projectId: string | null; token: string }) {
  return (
    <RoleModuleSection
      from="from-amber-600" to="to-orange-700"
      eyebrow="Operations Manager · Report Drafts"
      title="Report Drafting"
      description="Real workspace reports recorded against your NGO's active CSR project."
      module="reports" projectId={projectId} token={token}
    />
  );
}

// ─── Field Coordinator Sections ───────────────────────────────────────────────

function AssignedProjectsSection({ connections, onNavigate }: { connections: ProjectConnection[]; onNavigate: (id: string) => void }) {
  return <RealProjectsSection eyebrow="Field Coordinator · Assigned Projects" connections={connections} onNavigate={onNavigate} />;
}

function BeneficiaryFormsSection({ projectId, token }: { projectId: string | null; token: string }) {
  return (
    <RoleModuleSection
      from="from-pink-600" to="to-fuchsia-700"
      eyebrow="Field Coordinator · Beneficiary Forms"
      title="Beneficiary Registration"
      description="Real monitoring & evaluation metrics recorded against your NGO's active CSR project."
      module="monitoring_evaluation" projectId={projectId} token={token}
    />
  );
}

function FieldUpdatesSection({ projectId, token }: { projectId: string | null; token: string }) {
  return (
    <RoleModuleSection
      from="from-green-700" to="to-lime-600"
      eyebrow="Field Coordinator · Field Updates"
      title="Field Timeline"
      description="Real project timeline entries recorded against your NGO's active CSR project."
      module="timeline" projectId={projectId} token={token}
    />
  );
}

function MediaUploadsSection({ projectId, token }: { projectId: string | null; token: string }) {
  return (
    <RoleModuleSection
      from="from-purple-600" to="to-violet-700"
      eyebrow="Field Coordinator · Media Uploads"
      title="Field Media Repository"
      description="Real workspace documents recorded against your NGO's active CSR project."
      module="documents" projectId={projectId} token={token}
    />
  );
}

function AttendanceSection() {
  return (
    <NoBackingSection from="from-sky-600" to="to-indigo-700"
      eyebrow="Field Coordinator · Attendance" title="Field Attendance & Session Logs"
      description="Log daily beneficiary and staff attendance for every session." />
  );
}

// ─── Reporting Executive Sections ─────────────────────────────────────────────

function ImpactReportsSection({ projectId, token }: { projectId: string | null; token: string }) {
  return (
    <RoleModuleSection
      from="from-emerald-600" to="to-teal-700"
      eyebrow="Reporting Executive · Impact Reports"
      title="Impact Report Centre"
      description="Real workspace reports recorded against your NGO's active CSR project."
      module="reports" projectId={projectId} token={token}
    />
  );
}

function MediaLibrarySection({ projectId, token }: { projectId: string | null; token: string }) {
  return (
    <RoleModuleSection
      from="from-purple-600" to="to-violet-700"
      eyebrow="Reporting Executive · Media Library"
      title="Media Library"
      description="Real workspace documents recorded against your NGO's active CSR project."
      module="documents" projectId={projectId} token={token}
    />
  );
}

function AnalyticsViewSection({ projectId, token }: { projectId: string | null; token: string }) {
  return (
    <RoleModuleSection
      from="from-blue-600" to="to-cyan-700"
      eyebrow="Reporting Executive · Analytics"
      title="Analytics View"
      description="Real monitoring & evaluation metrics recorded against your NGO's active CSR project."
      module="monitoring_evaluation" projectId={projectId} token={token}
    />
  );
}

function PresentationsSection() {
  return (
    <NoBackingSection from="from-rose-600" to="to-pink-700"
      eyebrow="Reporting Executive · Presentations" title="Corporate Pitch & Presentation Decks"
      description="Build and manage presentations for corporate partners." />
  );
}

// ─── Volunteer Sections ───────────────────────────────────────────────────────

function AssignedTasksSection({ projectId, token, viewerAuthUserId }: { projectId: string | null; token: string; viewerAuthUserId: string }) {
  return (
    <RoleModuleSection
      from="from-emerald-500" to="to-green-700"
      eyebrow="Volunteer · Assigned Tasks"
      title="Your Assigned Tasks"
      description="Real tasks from your NGO's active CSR project — filtered to items assigned to you where the data records an assignee."
      module="tasks" projectId={projectId} token={token}
      filterByAssignee={viewerAuthUserId}
    />
  );
}

function EventParticipationSection() {
  return (
    <NoBackingSection from="from-fuchsia-600" to="to-pink-700"
      eyebrow="Volunteer · Events" title="Event Participation Centre"
      description="Browse and register for NGO events and community drives." />
  );
}

function UploadsSection({ projectId, token }: { projectId: string | null; token: string }) {
  return (
    <RoleModuleSection
      from="from-slate-600" to="to-slate-800"
      eyebrow="Volunteer · Uploads"
      title="File & Evidence Uploads"
      description="Real workspace documents recorded against your NGO's active CSR project."
      module="documents" projectId={projectId} token={token}
    />
  );
}

// ─── Super Admin — extra sections ────────────────────────────────────────────

function CorporatePartnershipsSection() {
  return (
    <div className="space-y-6">
      <GradientHero from="from-blue-700" to="to-indigo-800"
        eyebrow="Super Admin · Corporate Partnerships"
        title="Corporate Partnership Management"
        description="Track your NGO's relationships with corporate CSR partners. Active engagements, proposals in-pipeline, and funding history will all appear here once partnerships are formed through the Opportunities section."
        badge="" />
      <div className={`${cardCls} flex flex-col items-center justify-center py-16 text-center gap-3`}>
        <Briefcase className="h-10 w-10 text-slate-200" />
        <p className="text-base font-semibold text-slate-500">No corporate partnerships yet</p>
        <p className="text-sm text-slate-400 max-w-sm">
          Once a corporate assigns you a CSR project through the Opportunities section,
          your partnership history will appear here.
        </p>
      </div>
      <HowItWorks points={[
        "Partnership health score is auto-calculated from response time, milestone delivery, and corporate satisfaction ratings.",
        "All proposal submissions to corporates are tracked here — view status, feedback, and next steps in one place.",
        "CorpoGN's AI recommends which corporates are most likely to fund your NGO based on sector, geography, and SDG alignment.",
        "When a corporate shortlists your NGO, you receive an instant notification and the proposal workspace activates.",
      ]} />
    </div>
  );
}

function ReportsSection() {
  return (
    <div className="space-y-6">
      <GradientHero from="from-slate-700" to="to-slate-900"
        eyebrow="Super Admin · Reports"
        title="Consolidated NGO Reports Centre"
        description="The single source of truth for all reports generated by your NGO — compliance, financial, impact, and milestone. Every report submitted through CorpoGN is logged here with version history, signatory details, and corporate acknowledgement status."
        badge="" />
      <div className={`${cardCls} flex flex-col items-center justify-center py-16 text-center gap-3`}>
        <FileText className="h-10 w-10 text-slate-200" />
        <p className="text-base font-semibold text-slate-500">No reports published yet</p>
        <p className="text-sm text-slate-400 max-w-sm">
          Impact reports, milestone reports, utilization certificates and annual reports
          submitted through your project workspace will appear here.
        </p>
      </div>
      <HowItWorks points={[
        "Every report submitted through CorpoGN gets a unique timestamp and is tamper-evident — protecting your NGO legally.",
        "Super Admin can retract a report for correction within 24 hours of submission before the corporate reviews it.",
        "Reports are retained for 7 years per Indian regulatory requirements — auto-archived and retrievable on demand.",
      ]} />
    </div>
  );
}

function AuditLogsSection() {
  return (
    <div className="space-y-6">
      <GradientHero from="from-gray-700" to="to-zinc-900"
        eyebrow="Super Admin · Audit Logs"
        title="Complete Activity Audit Trail"
        description="Every action taken on your NGO's CorpoGN account is recorded in an immutable, timestamped audit log. Audit logs are the backbone of compliance — available for review by your CA, corporate partners, and regulatory authorities during any inspection or due diligence."
        badge="" />
      <MetricRow items={[
        { label: "Retention Period", value: "7 yrs", sub: "Per Indian compliance norms", color: "violet" },
        { label: "Immutable Logs", value: "Yes", sub: "Cannot be edited or deleted", color: "emerald" },
        { label: "Export Ready", value: "PDF", sub: "One-click signed export", color: "blue" },
        { label: "Real-time Tracking", value: "Live", sub: "All roles tracked instantly", color: "slate" },
      ]} />
      <div className={`${cardCls} flex flex-col items-center justify-center py-16 text-center gap-3`}>
        <ClipboardList className="h-10 w-10 text-slate-200" />
        <p className="text-base font-semibold text-slate-500">No audit entries yet</p>
        <p className="text-sm text-slate-400 max-w-sm">
          All profile changes, document uploads, team member actions, and report submissions
          will be automatically logged here for compliance purposes.
        </p>
      </div>
      <HowItWorks points={[
        "High-risk actions (profile edits, member removal, report retraction) require a second admin to review within 24h.",
        "Audit logs cannot be edited or deleted — any attempt is itself logged and flagged to CorpoGN's security team.",
        "During a corporate due diligence, you can export a filtered audit log as a signed PDF — one click, instant download.",
        "Log entries are automatically cross-referenced with document uploads and financial entries to detect discrepancies.",
      ]} />
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function NgoDashboard({
  ngo, viewerRole, viewerName,
}: {
  ngo: Ngo; viewerRole: NgoRole; viewerName: string;
}) {
  // NOTE: ngo.registration_data now contains all profile fields from signup and update-profile
  const router = useRouter();
  const [activeSection, setActiveSection] = useState(
    ROLE_DEFAULT_SECTION[viewerRole] ?? "command-center",
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [token, setToken] = useState("");
  // liveNgo mirrors the DB row — updated in real-time without page refresh
  const [liveNgo, setLiveNgo] = useState<Ngo>(ngo);
  const [syncStatus, setSyncStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [projectConnections, setProjectConnections] = useState<ProjectConnection[]>([]);
  const [viewerAuthUserId, setViewerAuthUserId] = useState("");
  const [resolvedCompliance, setResolvedCompliance] = useState<ResolvedComplianceField[]>([]);
  // The real project-workspace module route keys off a SIGNED proposal's
  // opportunity_id (opportunities.id / project_workspaces.opportunity_id) —
  // this is a different id space from the legacy project_connections table.
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [sharedState, setSharedState] = useState<NgoSharedState>(() => ({
    docs: {},
    docPaths: {},
    milestones: { 1: "pending", 2: "pending", 3: "pending", 4: "pending" },
    ngoName: ngo.ngo_name, ngoEmail: ngo.ngo_email, trustScore: ngo.trust_score,
  }));

  // ── Initial data load + localStorage cross-tab sync ───────────────────────
  useEffect(() => {
    supabaseBrowser.auth.getSession().then(async ({ data }) => {
      const accessToken = data.session?.access_token ?? "";
      setToken(accessToken);
      setViewerAuthUserId(data.session?.user?.id ?? "");

      if (accessToken) {
        // Fetch project connections
        const response = await fetch("/api/project-connections", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const result = (await response.json()) as {
          connections?: ProjectConnection[];
        };
        if (response.ok) {
          setProjectConnections(result.connections ?? []);
        }

        // Load compliance documents from database (the real source of truth
        // for the Compliance Vault — this overwrites the localStorage-seeded
        // docs/docPaths below once it resolves).
        const { data: dbDocs, error: docsErr } = await supabaseBrowser
          .from("ngo_documents")
          .select("doc_type, status, storage_path")
          .eq("ngo_id", ngo.id);

        if (!docsErr && dbDocs) {
          const docMap: Record<string, DocStatus> = {};
          const pathMap: Record<string, string> = {};
          dbDocs.forEach((d) => {
            docMap[d.doc_type] = d.status as DocStatus;
            if (d.storage_path) {
              pathMap[d.doc_type] = d.storage_path;
            }
          });
          setSharedState((prev) => ({
            ...prev,
            docs: docMap,
            docPaths: pathMap,
          }));
        }

        // Real resolved compliance view (self-uploaded verified > self-uploaded
        // unverified > pipeline-scraped), merged server-side per field.
        fetch("/api/ngo/compliance-view", { headers: { Authorization: `Bearer ${accessToken}` } })
          .then((r) => r.json())
          .then((body: { fields?: ResolvedComplianceField[] }) => {
            if (body.fields) setResolvedCompliance(body.fields);
          })
          .catch(() => { });

        // Real project id for the /api/project-workspace/:projectId/:module
        // route — the first SIGNED proposal's opportunity_id, if any.
        fetch("/api/ngo/proposals", { headers: { Authorization: `Bearer ${accessToken}` } })
          .then((r) => r.json())
          .then((body: { proposals?: { opportunity_id?: string | null; lifecycle_status?: string | null }[] }) => {
            const signed = (body.proposals ?? []).find((p) => p.lifecycle_status === "signed" && p.opportunity_id);
            if (signed?.opportunity_id) setActiveProjectId(signed.opportunity_id);
          })
          .catch(() => { });
      }
    });
    // Only milestones come from localStorage — docs/docPaths/trustScore are
    // always sourced from the DB fetch above, never from this local cache.
    const initial = loadState(ngo.id, ngo.ngo_name, ngo.ngo_email, ngo.trust_score);
    setSharedState((prev) => ({ ...prev, milestones: initial.milestones }));
    function handleStorage(e: StorageEvent) {
      if (e.key === `ngo_shared_state_${ngo.id}` && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as NgoSharedState;
          setSharedState((prev) => ({ ...prev, milestones: parsed.milestones }));
        } catch { /* ignore */ }
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [ngo.id, ngo.ngo_name, ngo.ngo_email, ngo.trust_score]);

  // ── Supabase Realtime — sync all roles across all devices ─────────────────
  useEffect(() => {
    // project_connections: corporate doc requests, progress, milestone, NGO updates
    const connChannel = supabaseBrowser
      .channel(`ngo-rt-connections-${ngo.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "project_connections",
          filter: `ngo_id=eq.${ngo.id}`,
        },
        (payload) => {
          const raw = payload.new as Record<string, unknown>;
          setProjectConnections((prev) =>
            prev.map((c) =>
              c.id === String(raw.id)
                ? {
                  ...c,
                  latest_update: typeof raw.latest_update === "string" ? raw.latest_update : c.latest_update,
                  progress: typeof raw.progress === "number" ? raw.progress : c.progress,
                  milestone: typeof raw.milestone === "string" ? raw.milestone : c.milestone,
                  status: (raw.status as ProjectConnection["status"]) ?? c.status,
                  document_requests: Array.isArray(raw.document_requests)
                    ? (raw.document_requests as unknown[]).map(String)
                    : c.document_requests,
                }
                : c,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "project_connections",
          filter: `ngo_id=eq.${ngo.id}`,
        },
        () => {
          // Re-fetch with joins to get corporate_name
          supabaseBrowser.auth.getSession().then(({ data }) => {
            const tok = data.session?.access_token;
            if (!tok) return;
            fetch("/api/project-connections", {
              headers: { Authorization: `Bearer ${tok}` },
            })
              .then((r) => r.json())
              .then((d: { connections?: ProjectConnection[] }) => {
                if (d.connections) {
                  setProjectConnections(d.connections);
                  if (d.connections.length > 0) {
                    setLiveNgo((prev) => ({ ...prev, has_project: true }));
                  }
                }
              })
              .catch(() => { });
          });
        },
      )
      .subscribe((status) => {
        setSyncStatus(status === "SUBSCRIBED" ? "live" : status === "CLOSED" ? "offline" : "connecting");
      });

    // ngos table: has_project unlock, trust_score, access_status changes
    const ngoChannel = supabaseBrowser
      .channel(`ngo-rt-row-${ngo.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "ngos",
          filter: `id=eq.${ngo.id}`,
        },
        (payload) => {
          const raw = payload.new as Partial<Ngo>;
          setLiveNgo((prev) => ({
            ...prev,
            ...(raw.has_project !== undefined && { has_project: raw.has_project }),
            ...(raw.trust_score !== undefined && { trust_score: raw.trust_score }),
            ...(raw.access_status !== undefined && { access_status: raw.access_status }),
          }));
        },
      )
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(connChannel);
      supabaseBrowser.removeChannel(ngoChannel);
    };
  }, [ngo.id]);

  const updateSharedState = useCallback((updater: (prev: NgoSharedState) => NgoSharedState) => {
    setSharedState((prev) => {
      const next = updater(prev);
      saveState(ngo.id, next);

      // Trust score is NEVER computed client-side here — ngos.trust_score is
      // the real, pipeline/admin-computed value. Re-fetch the resolved
      // compliance view so the vault reflects the just-uploaded document.
      if (token) {
        fetch("/api/ngo/compliance-view", { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json())
          .then((body: { fields?: ResolvedComplianceField[] }) => {
            if (body.fields) setResolvedCompliance(body.fields);
          })
          .catch(() => { });
      }

      return next;
    });
  }, [ngo.id, token]);

  const hasConnectedProject =
    liveNgo.has_project ||
    projectConnections.some((c) => c.status === "active" || c.status === "completed");
  // Real, DB-computed trust score — never a client-side formula.
  const liveTrustScore = liveNgo.trust_score || 0;
  const uploadedCount = Object.values(sharedState.docs).filter(Boolean).length;

  async function handleSignOut() {
    await supabaseBrowser.auth.signOut();
    router.push("/signin");
  }

  function navigate(id: string) {
    setActiveSection(id);
    setMobileOpen(false);
  }

  function getSidebarItems(): SidebarItem[] {
    if (viewerRole === "super_admin") {
      // Super admin sees everything (superAdminOnly + shared items)
      return ALL_SIDEBAR_ITEMS.filter((i) => !i.id.startsWith("assigned-") && !["funds", "expenses", "invoices", "utilization-reports", "grant-tracking", "finance-analytics", "legal-documents", "ngo-verification", "audit-requests", "compliance-workflow", "projects", "milestones", "beneficiary-tracking", "task-assignment", "partnership-communication", "report-drafts", "beneficiary-forms", "field-updates", "media-uploads", "attendance", "impact-reports", "media-library", "analytics-view", "presentations", "assigned-tasks", "event-participation", "uploads"].includes(i.id));
    }
    const cfg = ROLE_SIDEBAR_IDS[viewerRole as Exclude<NgoRole, "super_admin">];
    if (!cfg) return [];
    const ids = hasConnectedProject ? [...cfg.base, ...cfg.withProject] : cfg.base;
    return ALL_SIDEBAR_ITEMS.filter((i) => ids.includes(i.id));
  }

  function isLocked(item: SidebarItem) {
    if (item.requiresVerified && liveNgo.access_status === "pending") return true;
    if (item.requiresProject && !hasConnectedProject) return true;
    return false;
  }

  function renderSectionBody() {
    const item = ALL_SIDEBAR_ITEMS.find((i) => i.id === activeSection);
    const primaryActiveConnection =
      projectConnections.find(
        (connection) => connection.status === "active" || connection.status === "completed",
      ) ??
      projectConnections[0];

    if (item && isLocked(item)) {
      return item.requiresProject
        ? <ProjectLockedSection label={item.label} onNavigate={navigate} />
        : <LockedSection label={item.label} onNavigate={navigate} />;
    }
    switch (activeSection) {
      case "opportunities": return <OpportunitiesSection token={token} onNavigate={navigate} />;
      case "corporate-funders": return <CorporateFundersSection token={token} onNavigate={navigate} />;
      case "proposals": return <ProposalsSection token={token} onNavigate={navigate} />;
      case "command-center": return <CommandCenterSection ngo={liveNgo} onNavigate={navigate} uploadedCount={uploadedCount} liveTrustScore={liveTrustScore} docs={sharedState.docs} />;
      case "ngo-profile": return <NgoProfileSection ngo={liveNgo} onNavigate={navigate} token={token} onNgoUpdate={(u) => setLiveNgo((p) => ({ ...p, ...u }))} />;
      case "compliance-vault": return (
        <ComplianceVaultSection
          docs={sharedState.docs}
          docPaths={sharedState.docPaths}
          onDocUpload={(docId, storagePath) => updateSharedState((prev) => ({
            ...prev,
            docs: { ...prev.docs, [docId]: "uploaded" },
            docPaths: { ...prev.docPaths, [docId]: storagePath || "" },
          }))}
          ngoId={liveNgo.id}
          resolvedCompliance={resolvedCompliance}
          ngoName={liveNgo.ngo_name}
          token={token}
        />
      );
      case "trust-score": return <TrustScoreSection ngo={liveNgo} onNavigate={navigate} liveTrustScore={liveTrustScore} docs={sharedState.docs} />;
      case "ai-proposal": return <AiProposalSection token={token} />;
      case "my-projects": return <MyProjectsSection connections={projectConnections} onNavigate={navigate} />;
      case "project-chat": return (
        <ProjectChatSection
          connections={projectConnections}
          token={token}
          onConnectionUpdate={(updated) =>
            setProjectConnections((prev) =>
              prev.map((c) => (c.id === updated.id ? updated : c))
            )
          }
        />
      );
      case "fund-tracking": return (
        <FundTrackingSection
          onNavigate={navigate}
          connection={primaryActiveConnection}
          projectId={activeProjectId}
          token={token}
        />
      );
      case "milestone-reporting": return (
        <div className="space-y-6">
          <SectionHeader title="Milestone Reporting" sub="Update progress in the shared workspace — corporate partners see the same records." />
          <WorkspaceMilestonesPanel
            projectId={activeProjectId}
            getToken={async () => token}
          />
        </div>
      );
      case "impact-reporting": return (
        <ImpactReportingSection
          connection={primaryActiveConnection}
          token={token}
          ngoName={liveNgo.ngo_name}
          projectId={activeProjectId}
        />
      );
      case "utilization-cert": return <UtilizationCertSection connection={primaryActiveConnection} token={token} />;
      case "team-management":
      case "role-assignment": return <RoleAssignmentSection ngo={liveNgo} token={token} projectId={activeProjectId} />;
      case "settings": return <SettingsSection ngo={liveNgo} />;
      // Finance Officer
      case "funds": return <FundsSection projectId={activeProjectId} token={token} />;
      case "expenses": return <ExpensesSection />;
      case "invoices": return <InvoicesSection />;
      case "utilization-reports": return <UtilizationReportsSection projectId={activeProjectId} token={token} />;
      case "grant-tracking": return <GrantTrackingSection projectId={activeProjectId} token={token} />;
      case "finance-analytics": return <FinanceAnalyticsSection projectId={activeProjectId} token={token} />;
      // Compliance Officer
      case "legal-documents": return (
        <LegalDocumentsSection
          docs={sharedState.docs}
          docPaths={sharedState.docPaths}
          resolvedCompliance={resolvedCompliance}
          ngo={liveNgo}
          token={token}
          onNavigate={navigate}
          onDocUpload={(docId, storagePath) => updateSharedState((prev) => ({
            ...prev,
            docs: { ...prev.docs, [docId]: "uploaded" },
            docPaths: { ...prev.docPaths, [docId]: storagePath || "" },
          }))}
        />
      );
      case "ngo-verification": return <NgoVerificationSection ngo={liveNgo} resolvedCompliance={resolvedCompliance} />;
      case "audit-requests": return <AuditRequestsSection projectId={activeProjectId} token={token} />;
      case "compliance-workflow": return <ComplianceWorkflowSection projectId={activeProjectId} token={token} />;
      // Operations Manager
      case "projects": return <ProjectsSection connections={projectConnections} onNavigate={navigate} />;
      case "milestones": return <MilestonesSection projectId={activeProjectId} token={token} />;
      case "beneficiary-tracking": return <BeneficiaryTrackingSection projectId={activeProjectId} token={token} />;
      case "task-assignment": return <TaskAssignmentSection projectId={activeProjectId} token={token} />;
      case "partnership-communication": return <PartnershipCommunicationSection projectId={activeProjectId} token={token} />;
      case "report-drafts": return <ReportDraftsSection projectId={activeProjectId} token={token} />;
      // Field Coordinator
      case "assigned-projects": return <AssignedProjectsSection connections={projectConnections} onNavigate={navigate} />;
      case "beneficiary-forms": return <BeneficiaryFormsSection projectId={activeProjectId} token={token} />;
      case "field-updates": return <FieldUpdatesSection projectId={activeProjectId} token={token} />;
      case "media-uploads": return <MediaUploadsSection projectId={activeProjectId} token={token} />;
      case "attendance": return <AttendanceSection />;
      // Volunteer
      case "assigned-tasks": return <AssignedTasksSection projectId={activeProjectId} token={token} viewerAuthUserId={viewerAuthUserId} />;
      case "event-participation": return <EventParticipationSection />;
      case "uploads": return <UploadsSection projectId={activeProjectId} token={token} />;
      // Reporting Executive
      case "impact-reports": return <ImpactReportsSection projectId={activeProjectId} token={token} />;
      case "media-library": return <MediaLibrarySection projectId={activeProjectId} token={token} />;
      case "analytics-view": return <AnalyticsViewSection projectId={activeProjectId} token={token} />;
      case "presentations": return <PresentationsSection />;
      // Super Admin extras
      case "corporate-partnerships": return <CorporatePartnershipsSection />;
      case "reports": return <ReportsSection />;
      case "audit-logs": return <AuditLogsSection />;
      default:
        return (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <ClipboardList className="h-10 w-10 text-slate-200 mb-3" />
            <p className="text-sm text-slate-400">This section is coming soon.</p>
          </div>
        );
    }
  }

  function renderSection() {
    const body = renderSectionBody();
    const isRoleHome = activeSection === (ROLE_DEFAULT_SECTION[viewerRole] ?? "command-center");
    if (!isRoleHome) return body;
    return (
      <div className="space-y-6 min-w-0">
        <NgoRoleWorkQueue
          role={viewerRole}
          projectId={activeProjectId}
          token={token}
          onNavigate={navigate}
          viewerAuthUserId={viewerAuthUserId}
        />
        {body}
      </div>
    );
  }

  const sidebarItems = getSidebarItems();

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">

      {/* Sidebar */}
      <aside className={`${mobileOpen ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-emerald-950 transition-transform lg:relative lg:translate-x-0`}>
        <div className="flex items-center gap-3 px-5 py-5 border-b border-emerald-900">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400 text-emerald-950 font-black text-sm">
            {ngo.ngo_name.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{ngo.ngo_name}</p>
            <p className="text-xs text-emerald-400" data-testid="sidebar-role-label">{getRoleLabel(viewerRole)}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {SIDEBAR_GROUPS.map((group) => {
            const items = sidebarItems.filter((i) => group.ids.includes(i.id));
            if (items.length === 0) return null;
            return (
              <div key={group.label}>
                <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-emerald-600">{group.label}</p>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const locked = isLocked(item);
                    const active = activeSection === item.id;
                    return (
                      <button
                        key={item.id}
                        data-testid={`nav-${item.id}`}
                        onClick={() => navigate(item.id)}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "bg-emerald-500 text-white shadow-sm" :
                            locked ? "text-emerald-800 cursor-default" :
                              "text-emerald-200 hover:bg-emerald-900 hover:text-white"
                          }`}
                      >
                        <item.icon className={`h-4 w-4 flex-shrink-0 ${active ? "text-white" : locked ? "text-emerald-800" : "text-emerald-400"}`} />
                        <span className="truncate">{item.label}</span>
                        {locked && <Lock className="ml-auto h-3 w-3 flex-shrink-0 text-emerald-800" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-emerald-900 p-3">
          <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-emerald-200">
              {viewerName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{viewerName}</p>
              <p className="truncate text-xs text-emerald-500">{getRoleLabel(viewerRole)}</p>
            </div>
            <button data-testid="signout-btn" onClick={handleSignOut} title="Sign out" className="text-emerald-600 hover:text-emerald-300 transition">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen && <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3 shadow-sm">
          <button className="rounded-lg border border-slate-200 p-2 lg:hidden hover:bg-slate-50 transition" onClick={() => setMobileOpen(true)}>
            <div className="space-y-1.5">{[0, 1, 2].map((i) => <div key={i} className="h-0.5 w-5 bg-slate-600 rounded" />)}</div>
          </button>
          <div className="flex items-center gap-3 ml-auto">
            {/* Real-time sync indicator */}
            <span className="hidden sm:flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold">
              <span className={`h-2 w-2 rounded-full ${syncStatus === "live" ? "bg-emerald-400 animate-pulse" :
                  syncStatus === "offline" ? "bg-red-400" :
                    "bg-amber-400 animate-pulse"
                }`} />
              <span className={
                syncStatus === "live" ? "text-emerald-600" :
                  syncStatus === "offline" ? "text-red-500" :
                    "text-amber-600"
              }>
                {syncStatus === "live" ? "Live sync" : syncStatus === "offline" ? "Offline" : "Connecting…"}
              </span>
            </span>
            <StatusBadge status={liveNgo.access_status} />
            <button className="relative rounded-full border border-slate-200 p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition">
              <Bell className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-5 py-7 sm:px-8" data-testid="dashboard-main">
          {renderSection()}
        </main>
      </div>
      <DashboardCopilot
        portal="ngo"
        orgName={liveNgo.ngo_name}
        section={ALL_SIDEBAR_ITEMS.find((i) => i.id === activeSection)?.label ?? activeSection}
      />
    </div>
  );
}
