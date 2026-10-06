"use client";

import { AiAssistBadge } from "@/components/ai-assist-badge";
import { AiTaskStreamPanel } from "@/components/ai-task-stream-panel";
import { DashboardCopilot } from "@/components/dashboard-copilot";
import {
  CorporateRoleHomeSection,
  inferCorporateLandingRole,
  metricLabelsForRole,
  shouldShowPostedProjectsTable,
} from "@/components/corporate-role-home-section";
import { WorkspaceMilestonesPanel } from "@/components/workspace-milestones-panel";
import { AI_PRODUCT_COPY } from "@/lib/ai-insights";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState, useRef } from "react";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Bell,
  Bot,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Filter,
  FolderKanban,
  GraduationCap,
  HeartPulse,
  HandHeart,
  HeartHandshake,
  LayoutDashboard,
  LineChart,
  Lock,
  LogOut,
  MessageCircle,
  PieChart,
  Plus,
  PlusCircle,
  ShieldCheck,
  Sparkles,
  Table2,
  TrendingUp,
  Users,
  Wallet,
  Workflow,
  X,
  Send,
  MessageSquare,
  Search,
} from "lucide-react";
import { corporateSidebarItems } from "@/lib/corporate";
import {
  projectNameForFocus,
  type NgoCandidate,
  type ProjectConnection,
} from "@/lib/project-connections";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Corporate = {
  id: string;
  slug: string;
  company_name: string;
  company_email: string;
  access_status: "locked" | "active";
  registration_data?: CorporateRegistrationData;
};

type CorporateRegistrationData = Record<string, string | string[] | number | null | undefined>;

type Message = {
  id: string;
  corporate_id: string;
  sender_type: "corporate" | "admin";
  body: string;
  created_at: string;
};

type RoleAccess = {
  id?: string;
  name: string;
  email: string;
  position: string;
  pages: string[];
  isActive?: boolean;
};

// No seeded employees — only real employees from DB are shown
const SEEDED_EMPLOYEES: RoleAccess[] = [];

type CorporateEmployeeRecord = {
  id: string;
  email: string;
  full_name: string;
  position: string;
  allowed_pages: unknown;
  is_active: boolean;
  corporate_id?: string;
};

type RoleDraft = RoleAccess & {
  password: string;
};

type Tone = "blue" | "green" | "amber" | "red" | "violet" | "slate";
type Destination =
  | "Dashboard"
  | "My Projects"
  | "Recommended NGOs"
  | "Post CSR Project"
  | "Master Analytics"
  | "Campaign Management"
  | "NGO Management"
  | "Discover NGOs"
  | "Project Workspace"
  | "Budget & Fund Tracking"
  | "ESG & Impact"
  | "Reports & Approvals"
  | "AI Insights"
  | "Audit & Compliance"
  | "Employees & Access"
  | "Notifications"
  | "Support / Chat"
  | "Corporate Profile";

type CsrOpportunity = {
  id: string;
  corporate_id: string;
  corporate_name: string;
  title: string;
  focus_area: string;
  state: string | null;
  district: string | null;
  budget: number;
  description: string | null;
  sdg_targets: string[];
  target_beneficiaries: string[];
  expected_start_date: string | null;
  duration_months: number | null;
  min_trust_score: number;
  status: "open" | "assigned" | "closed";
  lifecycle_status?: "draft" | "published" | "pre_signed" | "signed" | "completed";
  assigned_ngo_id: string | null;
  created_at: string;
  updated_at: string;
};

type CorporateRecommendation = {
  id: string;
  batch_id: string;
  opportunity_id: string;
  ngo_id: string;
  rank: number;
  trust_score: number;
  score_breakdown: Record<string, number>;
  why_recommended: string;
  key_strengths: string[];
  past_similar_projects: string;
  budget_experience: string;
  compliance_status: string;
  decision: "pending" | "accepted" | "rejected";
  decision_at: string | null;
  created_at: string;
  ngos?: {
    id: string;
    ngo_name: string;
    ngo_email?: string;
    access_status?: string;
    website?: string | null;
    mission?: string | null;
    registration_data?: Record<string, unknown>;
  };
  opportunities?: CsrOpportunity;
};

type NgoReviewProfile = {
  id: string;
  ngo_name: string;
  ngo_email: string;
  access_status: string;
  has_project: boolean;
  trust_score: number;
  slug: string;
  registration_data?: Record<string, unknown>;
  created_at: string;
  ngo_type?: string | null;
  contact_number?: string | null;
  website?: string | null;
  mission?: string | null;
  registration_number?: string | null;
  pan_number?: string | null;
  year_of_establishment?: number | null;
  employee_count?: number | null;
  volunteer_count?: number | null;
  focus_areas?: string[];
  beneficiary_types?: string[];
};

type ProjectMessage = {
  id: string;
  sender_type: "ngo" | "corporate";
  body: string;
  created_at: string;
};

const sidebarIcons: Record<string, React.ElementType> = {
  Dashboard: LayoutDashboard,
  "My Projects": FolderKanban,
  "Post CSR Project": PlusCircle,
  "Master Analytics": BarChart3,
  "Campaign Management": HandHeart,
  "NGO Management": Users,
  "Discover NGOs": Search,
  "Project Workspace": FolderKanban,
  "Budget & Fund Tracking": Wallet,
  "ESG & Impact": ShieldCheck,
  "Reports & Approvals": FileText,
  "AI Insights": Bot,
  "Audit & Compliance": CheckCircle2,
  "Employees & Access": Users,
  Notifications: Bell,
  "Support / Chat": MessageCircle,
  "Corporate Profile": Building2,
};

// Pre-assignment state (no project workspace open yet) — Step 2 of the
// platform-core spec: Profile, Employees, Projects, Discover NGOs.
const corporateShellItems = [
  "Corporate Profile",
  "Employees & Access",
  "Post CSR Project",
  "My Projects",
  "Discover NGOs",
] as const satisfies readonly Destination[];

const roleAccessPages = corporateSidebarItems.filter(
  (item) => item !== "Support / Chat",
);

// Employees must never be able to see Employee Management or Corporate
// Profile, regardless of what's in their session metadata or the DB row —
// session metadata can go stale, so this is enforced again server-side in
// lib/access-control.ts too.
const FORBIDDEN_EMPLOYEE_PAGES = new Set(["Employees & Access", "Corporate Profile"]);

function normalizePageList(value: unknown) {
  const pages = Array.isArray(value)
    ? value.filter((page): page is string => typeof page === "string" && !FORBIDDEN_EMPLOYEE_PAGES.has(page))
    : [];

  return pages.length ? pages : ["Dashboard"];
}

function errorMessageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function mapCorporateEmployee(employee: CorporateEmployeeRecord): RoleAccess {
  return {
    id: employee.id,
    name: employee.full_name,
    email: employee.email,
    position: employee.position,
    pages: normalizePageList(employee.allowed_pages),
    isActive: employee.is_active,
  };
}

export function CorporateDashboard({ slug }: { slug: string }) {
  const router = useRouter();
  const [corporate, setCorporate] = useState<Corporate | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeItem, setActiveItem] = useState<Destination>("My Projects");
  const [isProjectWorkspaceOpen, setIsProjectWorkspaceOpen] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [employees, setEmployees] = useState<RoleAccess[]>([]);
  const [viewerAllowedPages, setViewerAllowedPages] = useState<string[] | null>(null);
  const [viewerAccountType, setViewerAccountType] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeCampaignId, setActiveCampaignId] = useState("");
  const [activeNgoId, setActiveNgoId] = useState("");
  const [selectedApprovalId, setSelectedApprovalId] = useState("");
  const [campaignDetailTab, setCampaignDetailTab] = useState("Overview");
  const [projectConnections, setProjectConnections] = useState<ProjectConnection[]>([]);
  const [ngoCandidates, setNgoCandidates] = useState<NgoCandidate[]>([]);
  const [assigningNgoId, setAssigningNgoId] = useState("");
  const [postedOpportunities, setPostedOpportunities] = useState<CsrOpportunity[]>([]);
  const [recommendations, setRecommendations] = useState<CorporateRecommendation[]>([]);
  const [recommendationActionId, setRecommendationActionId] = useState("");
  const [activeComparisonProposal, setActiveComparisonProposal] = useState<ProjectConnection | null>(null);
  const [activeComparisonOpp, setActiveComparisonOpp] = useState<CsrOpportunity | null>(null);

  const isUnlocked = corporate?.access_status === "active";
  const isCorporateEmployee = viewerAccountType === "corporate_employee";
  const canOpenAssignedPages = isUnlocked || isCorporateEmployee;
  const hasActiveProject = projectConnections.some(
    (connection) => connection.status === "active" || connection.status === "completed",
  );
  const { data: portfolioOverview } = useWorkspaceOverview();
  const unreadCount = portfolioOverview?.totals?.pendingApprovals ?? 0;

  // Items that require an active account unlock
  const accountLockedItems = new Set<string>(
    ["Employees & Access", "Notifications", "Support / Chat", "Corporate Profile", "Dashboard", "Post CSR Project", "My Projects", "Recommended NGOs"]
  );

  // Items that require at least one posted or assigned project
  const projectRequiredItems = new Set<string>([
    "Campaign Management", "NGO Management", "Project Workspace",
    "Budget & Fund Tracking", "ESG & Impact", "Reports & Approvals",
    "AI Insights", "Audit & Compliance", "Master Analytics",
  ]);

  const visibleSidebarItems = useMemo(() => {
    // An employee's allowedPages is an explicit admin-granted allow-list —
    // it should be filtered against the full page set regardless of the
    // owner-only pre-project "shell" vs full-nav split, otherwise an
    // employee granted pages like "Campaign Management" sees an empty
    // sidebar whenever their org hasn't posted/assigned a project yet
    // (those pages simply don't exist in the 5-item shell list).
    if (viewerAllowedPages) {
      return corporateSidebarItems.filter((item) => viewerAllowedPages.includes(item));
    }

    if (!isProjectWorkspaceOpen) {
      return isCorporateEmployee ? [] : [...corporateShellItems];
    }

    return isCorporateEmployee ? [] : corporateSidebarItems;
  }, [isCorporateEmployee, isProjectWorkspaceOpen, viewerAllowedPages]);

  const lockedItems = useMemo(
    () =>
      new Set<string>(
        visibleSidebarItems.filter((item) => {
          // Lock everything except always-available items when account is locked
          if (!canOpenAssignedPages && !accountLockedItems.has(item)) return true;
          // Lock project-specific tabs until at least one assigned/current project exists.
          if (canOpenAssignedPages && projectRequiredItems.has(item) && !hasActiveProject) return true;
          return false;
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canOpenAssignedPages, visibleSidebarItems, hasActiveProject],
  );

  useEffect(() => {
    let ignore = false;

    async function loadCorporate() {
      setIsLoading(true);
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();

      if (!session) {
        router.replace("/signin");
        return;
      }

      const accountType = session.user.user_metadata?.account_type as string;
      const metadata = session.user.user_metadata ?? {};
      setViewerAccountType(accountType);

      let employeeRecord: RoleAccess | null = null;
      let corporateQuery;

      if (accountType === "corporate_employee") {
        const metadataPages = normalizePageList(metadata.allowed_pages);
        const metadataCorporateId =
          typeof metadata.corporate_id === "string" ? metadata.corporate_id : "";
        const metadataCorporateSlug =
          typeof metadata.corporate_slug === "string" ? metadata.corporate_slug : "";

        employeeRecord = {
          email: session.user.email ?? "",
          name:
            typeof metadata.full_name === "string"
              ? metadata.full_name
              : session.user.email?.split("@")[0] || "Employee",
          position:
            typeof metadata.position === "string" ? metadata.position : "Employee",
          pages: metadataPages,
          isActive: true,
        };

        setViewerAllowedPages(metadataPages);
        setEmployees([employeeRecord]);
        setActiveItem((current) =>
          metadataPages.includes(current) ? current : (metadataPages[0] as Destination),
        );

        const { data: employeeData, error: employeeError } = await supabaseBrowser
          .from("corporate_employees")
          .select("id, corporate_id, email, full_name, position, allowed_pages, is_active")
          .eq("auth_user_id", session.user.id)
          .single();

        if (employeeData?.is_active) {
          employeeRecord = mapCorporateEmployee(employeeData as CorporateEmployeeRecord);
          setViewerAllowedPages(employeeRecord.pages);
          setEmployees([employeeRecord]);
          setActiveItem((current) =>
            employeeRecord?.pages.includes(current)
              ? current
              : ((employeeRecord?.pages[0] || "Dashboard") as Destination),
          );

          corporateQuery = supabaseBrowser
            .from("corporates")
            .select("id, slug, company_name, company_email, access_status")
            .eq("id", employeeData.corporate_id)
            .single();
        } else if (employeeError && !metadataCorporateId && !metadataCorporateSlug) {
          setErrorMessage("Employee access not found or inactive.");
          setIsLoading(false);
          return;
        } else if (metadataCorporateId) {
          corporateQuery = supabaseBrowser
            .from("corporates")
            .select("id, slug, company_name, company_email, access_status")
            .eq("id", metadataCorporateId)
            .single();
        } else if (metadataCorporateSlug) {
          corporateQuery = supabaseBrowser
            .from("corporates")
            .select("id, slug, company_name, company_email, access_status, registration_data")
            .eq("slug", metadataCorporateSlug)
            .single();
        } else {
          setErrorMessage("Employee access not found or inactive.");
          setIsLoading(false);
          return;
        }
      } else if (accountType === "corporate") {
        setViewerAllowedPages(null);
        corporateQuery = supabaseBrowser
          .from("corporates")
          .select("id, slug, company_name, company_email, access_status, registration_data")
          .eq("slug", slug)
          .single();
      } else {
        router.replace("/signin");
        return;
      }

      const { data, error } = await corporateQuery;

      if (ignore) {
        return;
      }

      if (error || !data || data.slug !== slug) {
        setErrorMessage(error?.message || "Corporate profile not found.");
        setIsLoading(false);
        return;
      }

      setCorporate(data as Corporate);

      if (accountType === "corporate") {
        const response = await fetch("/api/corporates/employees", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const result = (await response.json()) as {
          employees?: CorporateEmployeeRecord[];
          error?: string;
        };

        if (response.ok && result.employees) {
          const dbEmployees = result.employees.map(mapCorporateEmployee);
          const combined = [...dbEmployees];
          for (const seeded of SEEDED_EMPLOYEES) {
            if (!combined.some((emp) => emp.email.toLowerCase() === seeded.email.toLowerCase())) {
              combined.push(seeded);
            }
          }
          setEmployees(combined);
        } else if (result.error) {
          setErrorMessage(result.error);
        }

        const { data: messageData, error: messagesError } = await supabaseBrowser
          .from("corporate_messages")
          .select("id, corporate_id, sender_type, body, created_at")
          .eq("corporate_id", data.id)
          .order("created_at", { ascending: true });

        if (messagesError) {
          setErrorMessage(messagesError.message);
        } else {
          setMessages((messageData || []) as Message[]);
        }
      } else if (employeeRecord) {
        setEmployees([employeeRecord]);
        setMessages([]);
      }

      const connectionResponse = await fetch("/api/project-connections", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const connectionResult = (await connectionResponse.json()) as {
        connections?: ProjectConnection[];
        candidates?: NgoCandidate[];
        error?: string;
      };

      if (connectionResponse.ok) {
        setProjectConnections(connectionResult.connections ?? []);
        setNgoCandidates(
          connectionResult.candidates?.length
            ? connectionResult.candidates
            : [],
        );
      } else if (connectionResult.error) {
        setErrorMessage(connectionResult.error);
      }

      // Fetch the corporate's posted CSR opportunities
      try {
        const oppResponse = await fetch("/api/corporates/opportunities", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (oppResponse.ok) {
          const oppResult = (await oppResponse.json()) as { opportunities?: CsrOpportunity[] };
          setPostedOpportunities(oppResult.opportunities ?? []);
        }
      } catch {
        // Non-fatal: table may not exist yet
      }

      try {
        const recommendationResponse = await fetch("/api/corporates/recommendations", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (recommendationResponse.ok) {
          const recommendationResult = (await recommendationResponse.json()) as {
            recommendations?: CorporateRecommendation[];
          };
          setRecommendations(recommendationResult.recommendations ?? []);
        }
      } catch {
        // Non-fatal: lifecycle migration may not be applied yet
      }

      setIsLoading(false);
    }

    loadCorporate();

    return () => {
      ignore = true;
    };
  }, [router, slug]);

  useEffect(() => {
    if (!corporate || viewerAccountType !== "corporate") {
      return;
    }

    // ── Channel 1: Corporate admin<->admin chat messages ───────────────────
    const chatChannel = supabaseBrowser
      .channel(`corporate-chat-${corporate.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "corporate_messages",
          filter: `corporate_id=eq.${corporate.id}`,
        },
        (payload) => {
          const incoming = payload.new as Message;
          setMessages((current) =>
            current.some((message) => message.id === incoming.id)
              ? current
              : [...current, incoming],
          );
        },
      )
      .subscribe();

    // ── Channel 2: NGO project updates (realtime sync to corporate) ────────
    // When the NGO posts an update, changes progress, or submits a UC,
    // the corporate Project Workspace updates immediately without refresh.
    const connectionsChannel = supabaseBrowser
      .channel(`corporate-connections-${corporate.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "project_connections",
          filter: `corporate_id=eq.${corporate.id}`,
        },
        () => {
          // Proposal list refreshes when the user opens My Projects; no client-side mock notifications.
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "project_connections",
          filter: `corporate_id=eq.${corporate.id}`,
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
                  status: (raw.status as typeof c.status) ?? c.status,
                  uc_submitted: typeof raw.uc_submitted === "boolean" ? raw.uc_submitted : c.uc_submitted,
                  impact_report_submitted: typeof raw.impact_report_submitted === "boolean" ? raw.impact_report_submitted : c.impact_report_submitted,
                  ngo_milestone_status: typeof raw.ngo_milestone_status === "string" ? (raw.ngo_milestone_status as typeof c.ngo_milestone_status) : c.ngo_milestone_status,
                  ngo_beneficiary_count: typeof raw.ngo_beneficiary_count === "number" ? raw.ngo_beneficiary_count : c.ngo_beneficiary_count,
                  document_requests: Array.isArray(raw.document_requests)
                    ? (raw.document_requests as unknown[]).map(String)
                    : c.document_requests,
                }
                : c,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(chatChannel);
      supabaseBrowser.removeChannel(connectionsChannel);
    };
  }, [corporate, viewerAccountType]);

  function navigateTo(destination: Destination, focus?: {
    campaignId?: string;
    ngoId?: string;
    approvalId?: string;
  }) {
    if (destination !== "Notifications" && !corporateShellItems.includes(destination as (typeof corporateShellItems)[number])) {
      setIsProjectWorkspaceOpen(true);
    }

    setActiveItem(destination);
    if (focus?.campaignId) {
      setActiveCampaignId(focus.campaignId);
    }
    if (focus?.ngoId) {
      setActiveNgoId(focus.ngoId);
    }
    if (focus?.approvalId) {
      setSelectedApprovalId(focus.approvalId);
    }
  }

  function openProjectWorkspace() {
    setIsProjectWorkspaceOpen(true);
    setActiveItem("Dashboard");
  }

  function closeProjectWorkspace() {
    setIsProjectWorkspaceOpen(false);
    setActiveItem("My Projects");
  }


  function handleSidebarClick(item: string) {
    if (lockedItems.has(item)) {
      setActiveItem("Support / Chat");
      return;
    }

    setActiveItem(item as Destination);
  }

  async function handleLogout() {
    await supabaseBrowser.auth.signOut();
    router.replace("/");
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!corporate || viewerAccountType !== "corporate" || !messageBody.trim()) {
      return;
    }

    setIsSending(true);
    setErrorMessage("");

    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();

    if (!session) {
      router.replace("/signin");
      return;
    }

    const response = await fetch("/api/corporates/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        corporateId: corporate.id,
        body: messageBody,
      }),
    });
    const result = (await response.json()) as {
      message?: Message;
      error?: string;
    };

    setIsSending(false);

    if (!response.ok || !result.message) {
      setErrorMessage(result.error || "Could not send message.");
      return;
    }

    const sentMessage = result.message;

    setMessageBody("");
    setMessages((current) =>
      current.some((message) => message.id === sentMessage.id)
        ? current
        : [...current, sentMessage],
    );
    setCorporate((current) =>
      current ? { ...current, access_status: "active" } : current,
    );
  }

  async function createEmployeeAccess(draft: RoleDraft) {
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();

    if (!session) {
      router.replace("/signin");
      return { error: "Session expired. Please sign in again." };
    }

    const response = await fetch("/api/corporates/employees", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName: draft.name,
        email: draft.email,
        position: draft.position,
        password: draft.password,
        allowedPages: draft.pages,
      }),
    });
    const result = (await response.json()) as {
      employee?: CorporateEmployeeRecord;
      error?: string;
    };

    if (!response.ok || !result.employee) {
      return { error: result.error || "Could not create employee access." };
    }

    const employee = mapCorporateEmployee(result.employee);
    setEmployees((current) => [employee, ...current]);
    return { employee };
  }

  async function assignProjectToNgo(
    candidate: { id: string; name: string; focusArea: string },
    customProjectName?: string,
    customBudget?: number,
    proposalId?: string,
  ) {
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();

    if (!session) {
      router.replace("/signin");
      return;
    }

    setAssigningNgoId(candidate.id);
    setErrorMessage("");

    const response = await fetch("/api/project-connections", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ngoId: candidate.id.startsWith("demo-") ? undefined : candidate.id,
        ngoName: candidate.name,
        projectName: customProjectName || projectNameForFocus(candidate.focusArea),
        focusArea: candidate.focusArea,
        budget: customBudget || 2500000,
        proposalId,
      }),
    });
    const result = (await response.json()) as {
      connection?: ProjectConnection;
      error?: string;
    };

    setAssigningNgoId("");

    if (!response.ok || !result.connection) {
      setErrorMessage(
        result.error ||
        "Could not assign project. Make sure this NGO is registered on the platform.",
      );
      return;
    }

    // Refresh connections
    setProjectConnections((current) =>
      current.some((connection) => connection.id === result.connection?.id)
        ? current.map((c) => c.id === result.connection?.id ? (result.connection as ProjectConnection) : c)
        : [result.connection as ProjectConnection, ...current],
    );

    // Refresh posted opportunities
    try {
      const oppResponse = await fetch("/api/corporates/opportunities", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (oppResponse.ok) {
        const oppResult = (await oppResponse.json()) as { opportunities?: CsrOpportunity[] };
        setPostedOpportunities(oppResult.opportunities ?? []);
      }
    } catch { }

    setIsProjectWorkspaceOpen(true);
    setActiveItem("Dashboard");
  }

  async function decideRecommendation(
    recommendation: CorporateRecommendation,
    decision: "accept" | "reject" | "request_more",
  ) {
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();

    if (!session) {
      router.replace("/signin");
      return;
    }

    setRecommendationActionId(recommendation.id);
    setErrorMessage("");

    const response = await fetch("/api/corporates/recommendations", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recommendationId: recommendation.id,
        opportunityId: recommendation.opportunity_id,
        decision,
      }),
    });

    const result = (await response.json()) as {
      recommendation?: CorporateRecommendation;
      connection?: ProjectConnection;
      error?: string;
    };

    setRecommendationActionId("");

    if (!response.ok) {
      setErrorMessage(result.error || "Could not update recommendation.");
      return;
    }

    if (decision === "request_more") {
      setRecommendations((current) =>
        current.map((item) =>
          item.opportunity_id === recommendation.opportunity_id
            ? { ...item, decision: "pending" }
            : item,
        ),
      );
      return;
    }

    if (decision === "reject" && result.recommendation) {
      setRecommendations((current) =>
        current.map((item) => (item.id === result.recommendation?.id ? result.recommendation : item)),
      );
      return;
    }

    if (decision === "accept" && result.connection) {
      setRecommendations((current) =>
        current.map((item) =>
          item.opportunity_id === recommendation.opportunity_id
            ? { ...item, decision: item.id === recommendation.id ? "accepted" : "rejected" }
            : item,
        ),
      );
      setProjectConnections((current) =>
        current.some((connection) => connection.id === result.connection?.id)
          ? current.map((connection) => (connection.id === result.connection?.id ? (result.connection as ProjectConnection) : connection))
          : [result.connection as ProjectConnection, ...current],
      );
      setIsProjectWorkspaceOpen(true);
      setActiveItem("Dashboard");
    }
  }

  async function requestDocumentForConnection(connectionId: string, documentName: string) {
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();

    if (!session) {
      router.replace("/signin");
      return;
    }

    const connection = projectConnections.find((c) => c.id === connectionId);
    if (!connection) return;

    if (connection.document_requests.includes(documentName)) {
      return;
    }

    const updatedRequests = [...connection.document_requests, documentName];

    const response = await fetch(`/api/project-connections/${connectionId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        document_requests: updatedRequests,
      }),
    });

    const result = (await response.json()) as {
      connection?: ProjectConnection;
      error?: string;
    };

    if (!response.ok || !result.connection) {
      throw new Error(result.error || "Could not request document.");
    }

    setProjectConnections((current) =>
      current.map((c) => (c.id === connectionId ? (result.connection as ProjectConnection) : c)),
    );
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-950">
        <p className="text-sm font-medium text-slate-600">Loading dashboard...</p>
      </main>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-[#f8f9fb] font-sans text-slate-900 lg:flex">
        <aside className="fixed inset-x-0 top-0 z-50 flex h-16 flex-row bg-[#0f172a] text-white lg:inset-y-0 lg:left-0 lg:h-auto lg:w-64 lg:flex-col">
          <div className="flex h-16 items-center gap-3 border-b border-white/5 px-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500">
              <ShieldCheck className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">
              CorpoGN
            </span>
          </div>

          <div className="hidden border-b border-white/5 px-4 py-4 lg:block">
            <div className="flex items-center gap-3 rounded-lg bg-white/5 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-500/20 text-blue-300">
                <Building2 size={18} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {corporate?.company_name || "Corporate Giant"}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {isProjectWorkspaceOpen ? "Project workspace" : "Corporate dashboard"}
                </p>
              </div>
            </div>
            <span
              className={`mt-2.5 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${isUnlocked
                  ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20"
                  : "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20"
                }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isUnlocked ? "bg-emerald-400" : "bg-amber-400"}`} />
              {isUnlocked ? "Unlocked" : "Chat required"}
            </span>
          </div>

          <nav className="flex flex-1 gap-0.5 overflow-x-auto p-2 lg:block lg:space-y-0.5 lg:overflow-y-auto">
            {visibleSidebarItems.map((item) => {
              const locked = lockedItems.has(item);
              const active = activeItem === item;
              const Icon = sidebarIcons[item] || LayoutDashboard;

              return (
                <button
                  className={`group relative flex min-w-fit items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-all lg:w-full ${active
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:bg-white/6 hover:text-slate-200"
                    } ${locked ? "cursor-not-allowed opacity-40" : ""}`}
                  key={item}
                  onClick={() => handleSidebarClick(item)}
                  type="button"
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-slate-500"}`} />
                  <span className="min-w-0 flex-1 whitespace-nowrap font-medium lg:truncate">{item}</span>
                  {item === "Notifications" && unreadCount > 0 ? (
                    <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {unreadCount}
                    </span>
                  ) : null}
                  {locked ? <Lock className="h-3 w-3 text-slate-600" /> : null}
                </button>
              );
            })}
          </nav>

          <div className="hidden border-t border-white/5 p-3 lg:block">
            <button
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-400 transition hover:bg-red-500/10 hover:text-red-300"
              onClick={handleLogout}
              type="button"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Logout</span>
            </button>
          </div>
        </aside>

        <section className="flex min-h-screen min-w-0 flex-1 flex-col pt-16 lg:ml-64 lg:pt-0">
          <header className="sticky top-16 z-40 flex min-h-[60px] items-center justify-between gap-3 border-b border-slate-200/80 bg-white/98 px-4 py-2.5 backdrop-blur-sm lg:top-0 lg:px-6">
            <div className="flex items-center gap-2.5">
              {isProjectWorkspaceOpen ? (
                <button
                  className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50"
                  onClick={closeProjectWorkspace}
                  type="button"
                  title="Back to corporate dashboard"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              ) : null}
              <h1 className="text-base font-semibold text-slate-800 tracking-tight">{activeItem}</h1>
              <span className="hidden rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600 md:inline-block">
                {isProjectWorkspaceOpen ? "Project Workspace" : "Corporate"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="relative grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:border-slate-300"
                onClick={() => setActiveItem("Notifications")}
                type="button"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                    {unreadCount}
                  </span>
                ) : null}
              </button>
              <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 md:flex">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600">
                  <Building2 className="h-3 w-3 text-white" />
                </div>
                <span className="text-sm font-medium text-slate-700">
                  {corporate?.company_email.split("@")[0] || "Corporate"}
                </span>
              </div>
            </div>
          </header>

          <div className="mx-auto w-full min-w-0 max-w-7xl flex-1 space-y-5 overflow-x-hidden px-4 py-5 sm:px-5 lg:p-6">
            {activeItem === "Support / Chat" ? (
              <ChatPanel
                errorMessage={errorMessage}
                isSending={isSending}
                messageBody={messageBody}
                messages={messages}
                onMessageBodyChange={setMessageBody}
                onSendMessage={sendMessage}
                unlocked={isUnlocked}
              />
            ) : activeItem === "My Projects" ? (
              <MyProjectsPage
                navigateTo={navigateTo}
                onReviewProposal={(prop, opp) => {
                  setActiveComparisonProposal(prop);
                  setActiveComparisonOpp(opp);
                }}
                onOpenWorkspace={openProjectWorkspace}
                postedOpportunities={postedOpportunities}
                projectConnections={projectConnections}
                onPublished={(updated) =>
                  setPostedOpportunities((current) => current.map((o) => (o.id === updated.id ? updated : o)))
                }
                corporateSlug={slug}
              />
            ) : activeItem === "Recommended NGOs" ? (
              <RecommendedNgosPage
                recommendations={recommendations}
                actionId={recommendationActionId}
                onDecision={decideRecommendation}
              />
            ) : activeItem === "Dashboard" ? (
              <DashboardPage
                companyName={corporate?.company_name || "Corporate Admin"}
                navigateTo={navigateTo}
                postedOpportunities={postedOpportunities}
                projectConnections={projectConnections}
                onReviewProposal={(prop, opp) => {
                  setActiveComparisonProposal(prop);
                  setActiveComparisonOpp(opp);
                }}
                viewerPosition={
                  isCorporateEmployee
                    ? employees[0]?.position ?? "Employee"
                    : "Corporate Admin"
                }
                viewerAllowedPages={viewerAllowedPages ?? [...corporateSidebarItems]}
              />
            ) : activeItem === "Post CSR Project" ? (
              <PostCsrProjectPage
                corporate={corporate!}
                onPosted={(opp) => {
                  setPostedOpportunities((prev) => [opp, ...prev]);
                  setActiveItem("My Projects");
                }}
              />
            ) : activeItem === "Master Analytics" ? (
              <MasterAnalyticsPage navigateTo={navigateTo} />
            ) : activeItem === "Campaign Management" ? (
              <CampaignManagementPage
                activeCampaignId={activeCampaignId}
                campaignDetailTab={campaignDetailTab}
                navigateTo={navigateTo}
                setActiveCampaignId={setActiveCampaignId}
                setCampaignDetailTab={setCampaignDetailTab}
              />
            ) : activeItem === "NGO Management" ? (
              <NgoManagementPage
                activeNgoId={activeNgoId}
                assigningNgoId={assigningNgoId}
                candidates={ngoCandidates}
                connections={projectConnections}
                navigateTo={navigateTo}
                onAssignProject={assignProjectToNgo}
                setActiveNgoId={setActiveNgoId}
              />
            ) : activeItem === "Discover NGOs" ? (
              <DiscoverNgosPage corporateSlug={slug} />
            ) : activeItem === "Project Workspace" ? (
              <ProjectWorkspace connections={projectConnections} onRequestDocument={requestDocumentForConnection} />
            ) : activeItem === "Budget & Fund Tracking" ? (
              <BudgetPage navigateTo={navigateTo} />
            ) : activeItem === "ESG & Impact" ? (
              <EsgImpactPage navigateTo={navigateTo} />
            ) : activeItem === "Reports & Approvals" ? (
              <ReportsApprovalsPage
                navigateTo={navigateTo}
                selectedApprovalId={selectedApprovalId}
                setSelectedApprovalId={setSelectedApprovalId}
              />
            ) : activeItem === "AI Insights" ? (
              <AiInsightsPage navigateTo={navigateTo} />
            ) : activeItem === "Audit & Compliance" ? (
              <AuditCompliancePage navigateTo={navigateTo} />
            ) : activeItem === "Employees & Access" ? (
              <RolePermissions
                canManageEmployees={viewerAccountType === "corporate"}
                employees={employees}
                onCreateEmployee={createEmployeeAccess}
              />
            ) : activeItem === "Notifications" ? (
              <NotificationsPage navigateTo={navigateTo} />
            ) : activeItem === "Corporate Profile" && corporate ? (
              <CorporateProfilePage
                corporate={corporate}
                onUpdate={(updated) => setCorporate((prev) => prev ? { ...prev, ...updated } : null)}
              />
            ) : null}
          </div>
        </section>
      </main>

      <DashboardCopilot
        portal="corporate"
        orgName={corporate?.company_name ?? slug}
        section={activeItem}
        theme="light"
      />

      {activeComparisonProposal && activeComparisonOpp && (
        <NgoComparisonModal
          opp={activeComparisonOpp}
          proposal={activeComparisonProposal}
          allProposals={projectConnections.filter(
            (conn) =>
              conn.status === "proposal" &&
              conn.project_name.toLowerCase() === activeComparisonOpp.title.toLowerCase()
          )}
          onClose={() => {
            setActiveComparisonProposal(null);
            setActiveComparisonOpp(null);
          }}
          onAssign={assignProjectToNgo}
          onSwitchProposal={(prop) => setActiveComparisonProposal(prop)}
        />
      )}
    </>
  );
}

type PreAssignmentCandidate = {
  id: string;
  status: string;
  source: string[];
  matchScore: number;
  wasInTop10: boolean | null;
  applicationData: { summary?: string; proposed_budget?: number } | null;
  ngoId: string | null;
  ngoName: string;
  ngoState: string | null;
  ngoCity: string | null;
  certificationTier: string | null;
  trustScore: number | null;
  hasFullProfile: boolean;
};

function CandidateCard({
  candidate,
  corporateSlug,
  showScore,
  onShortlist,
  onMessage,
  isShortlisting,
}: {
  candidate: PreAssignmentCandidate;
  corporateSlug: string;
  showScore: boolean;
  onShortlist: () => void;
  onMessage: () => void;
  isShortlisting: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-900">{candidate.ngoName}</p>
            {candidate.certificationTier ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{candidate.certificationTier}</span>
            ) : null}
            {candidate.status === "shortlisted" ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Shortlisted</span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {[candidate.ngoCity, candidate.ngoState].filter(Boolean).join(", ") || "Location unknown"}
            {showScore ? ` · Match score ${candidate.matchScore}/100${candidate.wasInTop10 ? " (top 10)" : ""}` : ""}
            {candidate.applicationData?.proposed_budget ? ` · Proposed ${formatINR(candidate.applicationData.proposed_budget)}` : ""}
          </p>
          {candidate.applicationData?.summary ? (
            <p className="mt-2 rounded-md border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-600">
              {candidate.applicationData.summary}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-2 md:items-end">
          {candidate.hasFullProfile ? (
            <a
              href={`/corporate/${corporateSlug}/ngo/${candidate.ngoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              View full profile
            </a>
          ) : (
            <span className="text-[11px] text-slate-400">No full profile yet</span>
          )}
          <div className="flex gap-2">
            <button
              onClick={onMessage}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              type="button"
            >
              <MessageSquare className="h-3.5 w-3.5" /> Message
            </button>
            {candidate.status !== "shortlisted" ? (
              <button
                onClick={onShortlist}
                disabled={isShortlisting}
                className="rounded-lg bg-[#849b34] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#71852c] disabled:opacity-50"
                type="button"
              >
                {isShortlisting ? "..." : "Shortlist"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

type PreAssignmentMeeting = {
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
 * Lightweight scheduling — propose a time, either side confirms, either side
 * pastes a meeting link once booked. No external Calendar API dependency;
 * upgradeable later without changing this UI's contract.
 */
function MeetingSchedulerPanel({ preAssignmentId }: { preAssignmentId: string }) {
  const [meetings, setMeetings] = useState<PreAssignmentMeeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [proposedAt, setProposedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({});

  async function load() {
    setIsLoading(true);
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) { setIsLoading(false); return; }
    const res = await fetch(`/api/pre-assignments/${preAssignmentId}/meetings`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    if (res.ok) setMeetings(body.meetings ?? []);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preAssignmentId]);

  async function propose(e: React.FormEvent) {
    e.preventDefault();
    if (!proposedAt) return;
    setIsSubmitting(true);
    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(`/api/pre-assignments/${preAssignmentId}/meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scheduled_at: new Date(proposedAt).toISOString(), notes }),
      });
      if (res.ok) {
        setProposedAt("");
        setNotes("");
        await load();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function patchMeeting(meetingId: string, payload: Record<string, unknown>) {
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData.session?.access_token;
    const res = await fetch(`/api/pre-assignments/${preAssignmentId}/meetings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ meeting_id: meetingId, ...payload }),
    });
    if (res.ok) await load();
  }

  return (
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
        <button type="submit" disabled={isSubmitting} className="rounded-md bg-[#849b34] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#71852c] disabled:opacity-50">
          {isSubmitting ? "Proposing..." : "Propose meeting"}
        </button>
      </form>

      {isLoading ? (
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
                <a href={m.meeting_link} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-[#849b34] hover:underline">
                  Join: {m.meeting_link}
                </a>
              ) : null}
              {m.status !== "cancelled" ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {!m.confirmed_by_corporate_at ? (
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
  );
}

function PreAssignmentMessageModal({ preAssignmentId, ngoName, onClose }: { preAssignmentId: string; ngoName: string; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<"messages" | "meetings">("messages");
  const [messages, setMessages] = useState<{ id: string; sender_type: string; body: string; created_at: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  async function load() {
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;
    const res = await fetch(`/api/pre-assignments/${preAssignmentId}/messages`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    if (res.ok) setMessages(body.messages ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    if (!draft.trim()) return;
    setSending(true);
    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(`/api/pre-assignments/${preAssignmentId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body: draft }),
      });
      if (res.ok) {
        setDraft("");
        await load();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="flex h-[70vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h3 className="font-bold text-slate-900">{ngoName}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex border-b border-slate-200 px-4">
          <button
            onClick={() => setActiveTab("messages")}
            className={`border-b-2 px-3 py-2 text-xs font-semibold ${activeTab === "messages" ? "border-[#849b34] text-[#849b34]" : "border-transparent text-slate-400"}`}
          >
            Messages
          </button>
          <button
            onClick={() => setActiveTab("meetings")}
            className={`border-b-2 px-3 py-2 text-xs font-semibold ${activeTab === "meetings" ? "border-[#849b34] text-[#849b34]" : "border-transparent text-slate-400"}`}
          >
            Schedule meeting
          </button>
        </div>
        {activeTab === "meetings" ? (
          <MeetingSchedulerPanel preAssignmentId={preAssignmentId} />
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 ? (
                <p className="text-center text-sm text-slate-400">No messages yet.</p>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`max-w-[80%] rounded-lg p-3 text-sm ${m.sender_type === "corporate" ? "ml-auto bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}>
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
                className="h-10 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#849b34]"
                placeholder="Type a message..."
              />
              <button onClick={send} disabled={sending} className="rounded-md bg-[#849b34] px-4 text-sm font-semibold text-white hover:bg-[#71852c] disabled:opacity-50">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const WORKSPACE_MODULES: { key: string; label: string; fields: { name: string; label: string; type: "text" | "textarea" | "number" | "date" }[] }[] = [
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
 * Additive, generic UI for Step 9's workspace modules — one panel drives all
 * 14 modules via the permission-enforced /api/project-workspace/:projectId/:module
 * route, rather than 14 bespoke pages. Renders inline wherever a signed
 * project already appears; doesn't touch or replace any existing component.
 */
function WorkspaceModulesPanel({ projectId }: { projectId: string }) {
  const [activeModule, setActiveModule] = useState(WORKSPACE_MODULES[0].key);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [permission, setPermission] = useState<"read" | "edit" | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeConfig = WORKSPACE_MODULES.find((m) => m.key === activeModule)!;

  async function load() {
    setIsLoading(true);
    setError(null);
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) { setIsLoading(false); return; }
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
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) { setIsSubmitting(false); return; }
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
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap gap-1.5">
        {WORKSPACE_MODULES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setActiveModule(m.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              activeModule === m.key ? "bg-[#849b34] text-white" : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{activeConfig.label} entries</p>
          {isLoading ? (
            <p className="mt-2 text-sm text-slate-400">Loading…</p>
          ) : error ? (
            <p className="mt-2 text-sm text-rose-600">{error}</p>
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
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Add entry</p>
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
              className="rounded-md bg-[#849b34] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#71852c] disabled:opacity-50"
            >
              {isSubmitting ? "Saving…" : "Add"}
            </button>
          </form>
        ) : permission === "read" ? (
          <p className="text-sm text-slate-400">You have read-only access to this module.</p>
        ) : null}
      </div>
    </div>
  );
}

function ApplicantsAndSuggestions({ opportunityId, corporateSlug }: { opportunityId: string; corporateSlug: string }) {
  const [applicants, setApplicants] = useState<PreAssignmentCandidate[]>([]);
  const [adminSuggested, setAdminSuggested] = useState<PreAssignmentCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [shortlistingId, setShortlistingId] = useState<string | null>(null);
  const [messageTarget, setMessageTarget] = useState<{ id: string; name: string } | null>(null);

  async function load() {
    setIsLoading(true);
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) { setIsLoading(false); return; }
    const res = await fetch(`/api/corporates/opportunities/${opportunityId}/pre-assignments`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    if (res.ok) {
      setApplicants(body.applicants ?? []);
      setAdminSuggested(body.adminSuggested ?? []);
    }
    setIsLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId]);

  async function shortlist(id: string) {
    setShortlistingId(id);
    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData.session?.access_token;
      await fetch(`/api/corporates/opportunities/${opportunityId}/pre-assignments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pre_assignment_id: id, status: "shortlisted" }),
      });
      await load();
    } finally {
      setShortlistingId(null);
    }
  }

  if (isLoading) {
    return <div className="mt-5 h-20 animate-pulse rounded-lg bg-slate-100" />;
  }

  return (
    <div className="mt-5 space-y-5 border-t border-slate-100 pt-4">
      {/* Path (a): NGO-initiated applications — kept visibly separate from admin suggestions */}
      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Applicants ({applicants.length})</p>
        {applicants.length ? (
          <div className="grid gap-3">
            {applicants.map((c) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                corporateSlug={corporateSlug}
                showScore={false}
                onShortlist={() => shortlist(c.id)}
                onMessage={() => setMessageTarget({ id: c.id, name: c.ngoName })}
                isShortlisting={shortlistingId === c.id}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
            No NGO applicants yet. This project is visible to NGOs while it remains published.
          </div>
        )}
      </div>

      {/* Path (b): admin-recommended candidates — separate section, not merged into Applicants */}
      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Admin Suggested ({adminSuggested.length})</p>
        {adminSuggested.length ? (
          <div className="grid gap-3">
            {adminSuggested.map((c) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                corporateSlug={corporateSlug}
                showScore
                onShortlist={() => shortlist(c.id)}
                onMessage={() => setMessageTarget({ id: c.id, name: c.ngoName })}
                isShortlisting={shortlistingId === c.id}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
            No admin suggestions yet.
          </div>
        )}
      </div>

      {messageTarget ? (
        <PreAssignmentMessageModal preAssignmentId={messageTarget.id} ngoName={messageTarget.name} onClose={() => setMessageTarget(null)} />
      ) : null}
    </div>
  );
}

function MyProjectsPage({
  navigateTo,
  onReviewProposal,
  onOpenWorkspace,
  postedOpportunities,
  projectConnections,
  onPublished,
  corporateSlug,
}: {
  navigateTo: (destination: Destination) => void;
  onReviewProposal: (prop: ProjectConnection, opp: CsrOpportunity) => void;
  onOpenWorkspace: (connection: ProjectConnection) => void;
  postedOpportunities: CsrOpportunity[];
  projectConnections: ProjectConnection[];
  onPublished: (updated: CsrOpportunity) => void;
  corporateSlug: string;
}) {
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [expandedWorkspaceId, setExpandedWorkspaceId] = useState<string | null>(null);

  async function handlePublish(oppId: string) {
    setPublishingId(oppId);
    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/corporates/opportunities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: oppId, action: "publish" }),
      });
      const result = await res.json();
      if (res.ok) onPublished(result.opportunity as CsrOpportunity);
    } finally {
      setPublishingId(null);
    }
  }
  const proposals = projectConnections.filter((connection) => connection.status === "proposal");
  const activeConnections = projectConnections.filter(
    (connection) => connection.status === "active" || connection.status === "completed",
  );
  const activeByProjectName = new Map(
    activeConnections.map((connection) => [connection.project_name.toLowerCase(), connection]),
  );
  const postedProjectNames = new Set(postedOpportunities.map((opp) => opp.title.toLowerCase()));
  const activeConnectionsWithoutOpportunity = activeConnections.filter(
    (connection) => !postedProjectNames.has(connection.project_name.toLowerCase()),
  );

  const getApplicantsForOpportunity = (title: string) =>
    proposals.filter((connection) => connection.project_name.toLowerCase() === title.toLowerCase());

  const totalPosted = postedOpportunities.length + activeConnectionsWithoutOpportunity.length;
  const totalApplicants = proposals.length;
  const totalActive = activeConnections.length;

  if (!totalPosted && !totalApplicants && !totalActive) {
    return (
      <div className="space-y-6">
        <PageHero
          eyebrow="My Projects"
          title="Start with your first CSR project"
          text="Post a project, receive NGO applications, assign the right partner, and then continue into the full project workspace."
          actions={
            <ActionButton icon={PlusCircle} onClick={() => navigateTo("Post CSR Project")}>
              Post Project
            </ActionButton>
          }
        />

        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: PlusCircle, title: "Post", text: "Create an opportunity with budget, location, SDGs, and beneficiary details." },
            { icon: Users, title: "Review", text: "NGOs apply from their dashboard and appear here as applicants." },
            { icon: FolderKanban, title: "Manage", text: "Assigned projects open the existing admin workspace for execution." },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <Card className="p-5 text-center" key={item.title}>
                <div className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-blue-50 text-blue-600">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-bold text-slate-900">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.text}</p>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="My Projects"
        title="Posted projects and active workspaces"
        text="Review NGO applicants for unassigned projects, or open the full admin dashboard for assigned and current projects."
        actions={
          <ActionButton icon={PlusCircle} onClick={() => navigateTo("Post CSR Project")}>
            Post Project
          </ActionButton>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Posted Projects" value={String(totalPosted)} meta="Open, assigned, and current" tone="blue" />
        <MetricCard label="NGO Applicants" value={String(totalApplicants)} meta="Waiting for review" tone="amber" />
        <MetricCard label="Current Workspaces" value={String(totalActive)} meta="Assigned or live projects" tone="green" />
      </section>

      <div className="space-y-4">
        {postedOpportunities.map((opp) => {
          const applicants = getApplicantsForOpportunity(opp.title);
          const assignedConnection = activeByProjectName.get(opp.title.toLowerCase());
          const statusLabel = assignedConnection
            ? assignedConnection.status === "completed"
              ? "Completed"
              : assignedConnection.progress > 0
                ? "Current Project"
                : "Assigned"
            : "Yet to assign";

          return (
            <Card className="p-5" key={opp.id}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold tracking-tight text-slate-900">{opp.title}</h3>
                    <ProjectStatusPill status={statusLabel} />
                    {opp.lifecycle_status ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {opp.lifecycle_status.replace("_", "-")}
                      </span>
                    ) : null}
                    {opp.lifecycle_status === "draft" ? (
                      <button
                        type="button"
                        onClick={() => handlePublish(opp.id)}
                        disabled={publishingId === opp.id}
                        className="rounded-full bg-[#849b34] px-3 py-0.5 text-[11px] font-semibold text-white hover:bg-[#71852c] disabled:opacity-50"
                      >
                        {publishingId === opp.id ? "Publishing..." : "Publish"}
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {opp.focus_area} {opp.state ? `· ${opp.state}` : ""} {opp.district ? `· ${opp.district}` : ""} · {formatINR(opp.budget)}
                  </p>
                  {opp.description ? (
                    <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">{opp.description}</p>
                  ) : null}
                </div>

                {assignedConnection ? (
                  <button
                    className="inline-flex shrink-0 flex-col items-end gap-0.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                    onClick={() => onOpenWorkspace(assignedConnection)}
                    type="button"
                    title="Document requests and partner progress updates"
                  >
                    <span className="inline-flex items-center gap-2">
                      Open Workspace
                      <ChevronRight className="h-4 w-4" />
                    </span>
                    <span className="text-[10px] font-normal text-slate-300">Documents &amp; updates</span>
                  </button>
                ) : null}
              </div>

              {!assignedConnection ? (
                <ApplicantsAndSuggestions opportunityId={opp.id} corporateSlug={corporateSlug} />
              ) : (
                <div className="mt-5 rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
                  Assigned to <strong>{assignedConnection.ngo_name}</strong>. Open the workspace to manage budgets, milestones, impact, reports, and compliance.
                </div>
              )}

              {opp.lifecycle_status === "signed" ? (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setExpandedWorkspaceId(expandedWorkspaceId === opp.id ? null : opp.id)}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-[#849b34] hover:text-[#71852c]"
                    title="Campaigns, funds, budget, tasks, reports, audits, and more"
                  >
                    <FolderKanban className="h-4 w-4" />
                    {expandedWorkspaceId === opp.id ? "Hide live workspace modules" : "Open live workspace modules"}
                    <span className="text-[11px] font-normal text-slate-400">— campaigns, funds, tasks, reports &amp; more</span>
                  </button>
                  {expandedWorkspaceId === opp.id ? <WorkspaceModulesPanel projectId={opp.id} /> : null}
                </div>
              ) : null}
            </Card>
          );
        })}

        {activeConnectionsWithoutOpportunity.map((connection) => (
          <Card className="p-5" key={connection.id}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold tracking-tight text-slate-900">{connection.project_name}</h3>
                  <ProjectStatusPill status={connection.status === "completed" ? "Completed" : "Current Project"} />
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {connection.focus_area} · {connection.ngo_name} · {formatINR(connection.budget)}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{connection.latest_update}</p>
              </div>
              <button
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                onClick={() => onOpenWorkspace(connection)}
                type="button"
              >
                Open Workspace
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function RecommendedNgosPage({
  recommendations,
  actionId,
  onDecision,
}: {
  recommendations: CorporateRecommendation[];
  actionId: string;
  onDecision: (recommendation: CorporateRecommendation, decision: "accept" | "reject" | "request_more") => void;
}) {
  const grouped = recommendations.reduce((map, recommendation) => {
    const key = recommendation.opportunity_id;
    const existing = map.get(key) ?? [];
    existing.push(recommendation);
    map.set(key, existing);
    return map;
  }, new Map<string, CorporateRecommendation[]>());

  if (!recommendations.length) {
    return (
      <div className="space-y-6">
        <PageHero
          eyebrow="Recommended NGOs"
          title="Admin recommendations will appear here"
          text="Once the platform team reviews your posted CSR projects, shortlisted NGOs with project-specific trust scores will be sent here for your decision."
        />
        <Card className="p-6 text-sm text-slate-500">
          No recommendations have been sent yet.
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Recommended NGOs"
        title="Review AI-ranked NGO recommendations"
        text="Compare trust score breakdowns, strengths, similar project evidence, budget fit, and compliance status before accepting an NGO."
      />

      {[...grouped.entries()].map(([opportunityId, items]) => {
        const project = items[0]?.opportunities;
        const accepted = items.find((item) => item.decision === "accepted");

        return (
          <Card className="p-5" key={opportunityId}>
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Project</p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">{project?.title ?? "CSR Project"}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {project?.focus_area ?? "CSR"} {project?.state ? `· ${project.state}` : ""} {project?.district ? `· ${project.district}` : ""} {project?.budget ? `· ${formatINR(project.budget)}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={Boolean(accepted) || actionId === items[0]?.id}
                onClick={() => onDecision(items[0], "request_more")}
              >
                <MessageSquare className="h-4 w-4" />
                Request More Recommendations
              </button>
            </div>

            <div className="mt-4 grid gap-4">
              {items
                .slice()
                .sort((a, b) => a.rank - b.rank)
                .map((recommendation) => {
                  const strengths = Array.isArray(recommendation.key_strengths)
                    ? recommendation.key_strengths
                    : [];
                  const isBusy = actionId === recommendation.id;

                  return (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4" key={recommendation.id}>
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">#{recommendation.rank}</span>
                            <h4 className="text-base font-bold text-slate-900">{recommendation.ngos?.ngo_name ?? "NGO Partner"}</h4>
                            <DecisionPill decision={recommendation.decision} />
                          </div>
                          <p className="mt-2 text-sm leading-relaxed text-slate-600">{recommendation.why_recommended}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {strengths.map((strength) => (
                              <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700" key={strength}>
                                {strength}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="shrink-0 rounded-xl border border-blue-100 bg-white p-4 text-center">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Trust Score</p>
                          <p className="mt-1 text-3xl font-black text-blue-700">{recommendation.trust_score}</p>
                          <p className="text-xs text-slate-400">out of 100</p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <MiniStat label="Past Similar Projects" value={recommendation.past_similar_projects || "Admin review required"} />
                        <MiniStat label="Budget Experience" value={recommendation.budget_experience || "Admin review required"} />
                        <MiniStat label="Compliance" value={recommendation.compliance_status || "Admin review required"} />
                      </div>

                      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                        {Object.entries(recommendation.score_breakdown ?? {}).map(([factor, score]) => (
                          <div className="rounded-lg border border-slate-200 bg-white p-3" key={factor}>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{trustFactorLabel(factor)}</p>
                            <div className="mt-2 flex items-center gap-2">
                              <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                                <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${Math.max(0, Math.min(100, Number(score)))}%` }} />
                              </div>
                              <span className="w-8 text-right text-xs font-bold tabular-nums text-slate-700">{score}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={isBusy || recommendation.decision !== "pending"}
                          onClick={() => onDecision(recommendation, "reject")}
                        >
                          <X className="h-4 w-4" />
                          Reject
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={isBusy || Boolean(accepted) || recommendation.decision !== "pending"}
                          onClick={() => onDecision(recommendation, "accept")}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {isBusy ? "Allocating..." : "Accept NGO"}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function DecisionPill({ decision }: { decision: CorporateRecommendation["decision"] }) {
  const styles = {
    pending: "border-amber-200 bg-amber-50 text-amber-700",
    accepted: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rejected: "border-slate-200 bg-slate-100 text-slate-500",
  }[decision];

  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${styles}`}>{decision}</span>;
}

function trustFactorLabel(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function ProjectStatusPill({ status }: { status: "Yet to assign" | "Assigned" | "Current Project" | "Completed" }) {
  const styles = {
    "Yet to assign": "border-amber-200 bg-amber-50 text-amber-700",
    Assigned: "border-blue-200 bg-blue-50 text-blue-700",
    "Current Project": "border-emerald-200 bg-emerald-50 text-emerald-700",
    Completed: "border-slate-200 bg-slate-100 text-slate-600",
  }[status];

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${styles}`}>
      {status}
    </span>
  );
}

function DashboardPage({
  companyName,
  navigateTo,
  postedOpportunities,
  projectConnections,
  onReviewProposal,
  viewerPosition,
  viewerAllowedPages,
}: {
  companyName: string;
  navigateTo: (destination: Destination, focus?: { campaignId?: string; ngoId?: string; approvalId?: string }) => void;
  postedOpportunities: CsrOpportunity[];
  projectConnections: ProjectConnection[];
  onReviewProposal: (prop: ProjectConnection, opp: CsrOpportunity) => void;
  viewerPosition: string;
  viewerAllowedPages: string[];
}) {
  const { data: overview, isLoading: overviewLoading } = useWorkspaceOverview();
  const landingRole = inferCorporateLandingRole(viewerPosition, viewerAllowedPages);
  const metricLabels = metricLabelsForRole(landingRole);
  const realTotals = overview?.totals;
  const signedProjectCount = overview?.projects?.length ?? 0;
  const hasProjects = postedOpportunities.length > 0 || signedProjectCount > 0;
  const criticalItems =
    overview?.approvals
      ?.filter((a) => a.status === "pending")
      .slice(0, 6)
      .map((a) => ({
        id: a.id,
        title: `${a.itemType}${a.itemRef ? `: ${a.itemRef}` : ""}`,
        owner: a.projectTitle ?? "Signed project",
        priority: "High" as const,
        campaignId: a.projectId,
        ngoId: a.ngoId ?? "",
      })) ?? [];

  if (!hasProjects && !overviewLoading) {
    return (
      <div className="space-y-6">
        <PageHero
          eyebrow="Welcome to CorpoGN"
          title={`Hello, ${companyName}!`}
          text="Your CSR command center is ready. Start by posting your first CSR project to connect with NGOs."
          actions={
            <ActionButton icon={PlusCircle} onClick={() => navigateTo("Post CSR Project")}>
              Post Your First CSR Project
            </ActionButton>
          }
        />

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100"><PlusCircle className="h-6 w-6 text-blue-600" /></div>
            <p className="font-semibold text-slate-800">1. Post a CSR Project</p>
            <p className="text-xs text-slate-500">Define your project scope, budget, location, and target SDGs.</p>
          </div>
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100"><Users className="h-6 w-6 text-violet-600" /></div>
            <p className="font-semibold text-slate-800">2. NGOs Apply</p>
            <p className="text-xs text-slate-500">Registered NGOs will browse your project and submit proposals.</p>
          </div>
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100"><CheckCircle2 className="h-6 w-6 text-emerald-600" /></div>
            <p className="font-semibold text-slate-800">3. Manage & Track</p>
            <p className="text-xs text-slate-500">Once an NGO is assigned, your full workspace unlocks automatically.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!hasProjects && overviewLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        Loading your CSR portfolio…
      </div>
    );
  }

  // Find proposals for each opportunity
  const getProposalsForOpp = (title: string) => {
    return projectConnections.filter(
      (conn) => conn.status === "proposal" && conn.project_name.toLowerCase() === title.toLowerCase()
    );
  };

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Connected CSR command center"
        title={`Welcome back, ${companyName}`}
        text="Your live CSR programs, campaigns, and NGO partnerships — all in one place."
        actions={
          <>
            <ActionButton icon={PlusCircle} onClick={() => navigateTo("Post CSR Project")}>
              Post CSR Project
            </ActionButton>
            <GhostButton icon={FileText} onClick={() => navigateTo("Reports & Approvals")}>
              Review Approvals
            </GhostButton>
            <GhostButton icon={Bot} onClick={() => navigateTo("AI Insights")}>
              Open AI Signals
            </GhostButton>
          </>
        }
      />

      <CorporateRoleHomeSection
        role={landingRole}
        position={viewerPosition}
        allowedPages={viewerAllowedPages}
        navigateTo={(dest) => navigateTo(dest as Destination)}
      />

      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label={metricLabels.budget} value={formatINR(realTotals?.projectBudget ?? 0)} meta={`${realTotals?.campaignCount ?? 0} live program${(realTotals?.campaignCount ?? 0) !== 1 ? "s" : ""}`} tone="blue" />
        <MetricCard label={metricLabels.released} value={formatINR(realTotals?.released ?? 0)} meta={`${realTotals?.releaseRate ?? 0}% of budget`} tone="green" />
        <MetricCard label={metricLabels.utilized} value={formatINR(realTotals?.spent ?? 0)} meta="UC and evidence linked" tone="violet" />
        <MetricCard label={metricLabels.pending} value={String(realTotals?.pendingApprovals ?? 0)} meta="Across funds, NGO, reports" tone="amber" />
        <MetricCard label={metricLabels.audits} value={String(realTotals?.openAudits ?? 0)} meta="From signed project workspaces" tone="red" />
      </section>

      <section className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <div className="space-y-6">
          {(overview?.projects?.length ?? 0) > 0 && (
            <Card>
              <SectionHeading
                icon={Workflow}
                title="Signed project portfolio"
                text="Live totals from workspace modules in Supabase — same data as Campaign Management and Master Analytics."
              />
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Project</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">NGO</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Budget</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 min-w-[120px]">Utilization</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Approvals</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Next Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(overview?.projects ?? []).map((project) => (
                      <tr
                        className="cursor-pointer transition-colors hover:bg-blue-50/40"
                        key={project.id}
                        onClick={() => navigateTo("Campaign Management", { campaignId: project.id })}
                      >
                        <td className="px-3 py-3.5 align-top">
                          <p className="font-semibold text-slate-900 leading-snug">{project.title}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {project.focusArea ?? "—"} · {project.district ?? project.state ?? "—"}
                          </p>
                        </td>
                        <td className="px-3 py-3.5 align-top text-sm text-slate-600 whitespace-nowrap">{project.ngo?.name ?? "—"}</td>
                        <td className="px-3 py-3.5 align-top text-sm font-semibold text-slate-900 whitespace-nowrap">
                          {formatINR(project.totals.projectBudget)}
                        </td>
                        <td className="px-3 py-3.5 align-top min-w-[130px]">
                          <Progress value={project.totals.utilizationRate} />
                        </td>
                        <td className="px-3 py-3.5 align-top text-sm text-slate-600">{project.counts.pendingApprovals}</td>
                        <td className="px-3 py-3.5 align-top text-sm text-slate-600 max-w-[180px]">
                          {project.counts.pendingApprovals > 0 ? "Review approvals" : "Open workspace"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {postedOpportunities.length > 0 && shouldShowPostedProjectsTable(landingRole) && (
            <Card>
              <SectionHeading
                icon={PlusCircle}
                title="Posted CSR Projects & NGO Applications"
                text="Track applications and assign registered NGOs to initiate signed projects."
              />
              <div className="grid gap-4 mt-4">
                {postedOpportunities.map((opp) => {
                  const proposals = getProposalsForOpp(opp.title);
                  return (
                    <div key={opp.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 space-y-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <h3 className="text-base font-bold text-slate-900 leading-snug">{opp.title}</h3>
                          <p className="text-xs text-slate-500 mt-1">
                            {opp.focus_area} {opp.state ? `· ${opp.state}` : ""} · Budget: {formatINR(opp.budget)}
                          </p>
                        </div>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize border ${opp.status === "open" ? "bg-blue-50 text-blue-700 border-blue-200" :
                            opp.status === "assigned" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                              "bg-slate-100 text-slate-600 border-slate-200"
                          }`}>
                          {opp.status}
                        </span>
                      </div>

                      {proposals.length > 0 ? (
                        <div className="pt-3 border-t border-slate-200/80 space-y-3">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">NGO Applications ({proposals.length})</p>
                          <div className="space-y-2.5">
                            {proposals.map((prop) => (
                              <div key={prop.id} className="rounded-lg border border-slate-200 bg-white p-3.5 space-y-2">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">{prop.ngo_name}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">Proposed Budget: {formatINR(prop.budget)}</p>
                                  </div>
                                  {opp.status !== "assigned" && (
                                    <button
                                      onClick={() => onReviewProposal(prop, opp)}
                                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm active:scale-95 transition shrink-0"
                                    >
                                      <MessageSquare className="h-3.5 w-3.5" />
                                      Review & Calibrate
                                    </button>
                                  )}
                                </div>
                                <p className="text-xs text-slate-600 italic bg-slate-50 rounded border border-slate-100 p-2.5 leading-relaxed">
                                  {prop.latest_update?.replace("Proposal submitted: ", "") || "No proposal summary provided."}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic pt-1">
                          {opp.status === "assigned" ? "This project has been assigned to an NGO." : "No NGO applications received for this project yet."}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <SectionHeading icon={AlertCircle} title="Priority Queue" text="Click any item to jump to its workflow." />
            {criticalItems.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-400">
                Nothing needs attention right now.
              </p>
            ) : null}
            <div className="space-y-3">
              {criticalItems.map((item) => (
                <button
                  className="w-full min-w-0 rounded-md border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50"
                  key={item.id}
                  onClick={() =>
                    navigateTo("Reports & Approvals", {
                      campaignId: item.campaignId,
                      ngoId: item.ngoId,
                      approvalId: item.id,
                    })
                  }
                  type="button"
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <p className="min-w-0 break-words text-sm font-semibold text-slate-900">{item.title}</p>
                    <RiskBadge value={item.priority} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{item.owner}</p>
                </button>
              ))}
            </div>
          </Card>
          <Card>
            <SectionHeading icon={Activity} title="Recent workspace activity" text="From the platform activity log for signed projects." />
            {(overview?.activity?.length ?? 0) === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-400">
                Activity appears when teams update milestones, funds, approvals, or M&amp;E in the project workspace.
              </p>
            ) : (
              <div className="space-y-3">
                {(overview?.activity ?? []).slice(0, 5).map((log) => (
                  <div key={log.id} className="rounded-md border border-slate-200 bg-white p-3 text-left">
                    <p className="text-sm font-semibold text-slate-900">{titleCase(log.action)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {log.projectTitle} · {log.module} · {formatDate(log.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Corporate-wide workspace overview — real data for the portfolio pages.
//
// The per-project route (/api/project-workspace/:projectId/:module) answers
// one module for one project; these pages are portfolio-wide, so they read
// the aggregate at /api/corporates/workspace-overview instead. Same auth
// convention as WorkspaceModulesPanel above: Supabase session access token
// in an Authorization: Bearer header.
// ═══════════════════════════════════════════════════════════════════════════

type OverviewContext = {
  projectId: string;
  projectTitle: string;
  ngoId: string | null;
  ngoName: string | null;
};

type OverviewProject = {
  id: string;
  title: string;
  description: string | null;
  focusArea: string | null;
  state: string | null;
  district: string | null;
  sdgTargets: string[];
  targetBeneficiaries: string[];
  expectedStartDate: string | null;
  durationMonths: number | null;
  status: string | null;
  lifecycleStatus: string | null;
  createdAt: string | null;
  ngo: { id: string; name: string; slug: string | null; logoUrl: string | null; trustScore: number } | null;
  totals: {
    projectBudget: number;
    budgeted: number;
    spent: number;
    released: number;
    fundsPending: number;
    remaining: number;
    allocationRate: number;
    releaseRate: number;
    utilizationRate: number;
  };
  counts: {
    campaigns: number;
    budgetLines: number;
    funds: number;
    approvals: number;
    pendingApprovals: number;
    audits: number;
    reports: number;
    metrics: number;
  };
};

type OverviewPartnerNgo = {
  id: string;
  slug: string | null;
  name: string;
  logoUrl: string | null;
  trustScore: number;
  overallTrustScore: number;
  scoreBreakdown: {
    transparency: number;
    verification: number;
    documentation: number;
    financialCompleteness: number;
    projectCompleteness: number;
    profileCompleteness: number;
  };
  sectorPrimary: string | null;
  csrFocusAreas: string[];
  state: string | null;
  district: string | null;
  accessStatus: string | null;
  legalStatus: string | null;
  website: string | null;
  email: string | null;
  registrationValidity: string | null;
  documents: { name: string; value: string | null; status: string }[];
  documentsOnFile: number;
  documentsTotal: number;
  projectIds: string[];
  projectCount: number;
};

type OverviewCampaign = OverviewContext & {
  id: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string | null;
};

type OverviewBudgetLine = OverviewContext & {
  id: string;
  lineItem: string;
  budgeted: number;
  spent: number;
  createdAt: string | null;
};

type OverviewFund = OverviewContext & {
  id: string;
  amount: number;
  purpose: string | null;
  releasedAt: string | null;
  createdAt: string | null;
};

type OverviewMetric = OverviewContext & {
  id: string;
  metricName: string;
  metricValue: number;
  unit: string | null;
  period: string | null;
  createdAt: string | null;
};

type OverviewReport = OverviewContext & {
  id: string;
  title: string;
  reportType: string;
  url: string | null;
  createdAt: string | null;
};

type OverviewApproval = OverviewContext & {
  id: string;
  itemType: string;
  itemRef: string | null;
  status: string;
  approvedBy: string | null;
  createdAt: string | null;
};

type OverviewAudit = OverviewContext & {
  id: string;
  auditType: string;
  findings: string | null;
  status: string;
  auditDate: string | null;
  createdAt: string | null;
};

type OverviewActivity = OverviewContext & {
  id: string;
  module: string;
  action: string;
  actorType: string;
  detail: Record<string, unknown>;
  createdAt: string | null;
};

type OverviewMatch = OverviewContext & {
  id: string;
  ngoId: string;
  ngoName: string;
  ngoSlug: string | null;
  ngoState: string | null;
  ngoSector: string | null;
  ngoTrustScore: number;
  matchScore: number;
  sectorFit: number;
  locationFit: number;
  capacityFit: number;
  capacityGatePassed: boolean;
  capacityGateReason: string | null;
  breakdown: Record<string, string>;
  computedAt: string | null;
};

type OverviewScoringRun = OverviewContext & {
  id: string;
  triggeredAt: string | null;
  scoringVersion: string | null;
  candidatePoolSize: number;
  capacityGateExcludedCount: number;
  adminAction: string | null;
};

type WorkspaceOverview = {
  corporateId: string;
  projects: OverviewProject[];
  ngos: OverviewPartnerNgo[];
  campaigns: OverviewCampaign[];
  budgetLines: OverviewBudgetLine[];
  funds: OverviewFund[];
  metrics: OverviewMetric[];
  reports: OverviewReport[];
  approvals: OverviewApproval[];
  audits: OverviewAudit[];
  activity: OverviewActivity[];
  matching: { runs: OverviewScoringRun[]; topMatches: OverviewMatch[] };
  totals: {
    projectCount: number;
    ngoCount: number;
    projectBudget: number;
    budgeted: number;
    spent: number;
    released: number;
    remaining: number;
    allocationRate: number;
    releaseRate: number;
    utilizationRate: number;
    campaignCount: number;
    campaignsByStatus: Record<string, number>;
    pendingApprovals: number;
    approvalsByStatus: Record<string, number>;
    openAudits: number;
    reportCount: number;
    metricCount: number;
  };
};

function useWorkspaceOverview() {
  const [data, setData] = useState<WorkspaceOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        if (!cancelled) {
          setError("Your session has expired. Please sign in again.");
          setIsLoading(false);
        }
        return;
      }
      const res = await fetch("/api/corporates/workspace-overview", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (cancelled) return;
      if (res.ok) {
        setData(body as WorkspaceOverview);
      } else {
        setData(null);
        setError(body.error ?? "Could not load workspace data.");
      }
      setIsLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return { data, isLoading, error, reload: () => setReloadToken((n) => n + 1) };
}

/** Shared loading / error / no-signed-projects shell for the portfolio pages. */
function OverviewGate({
  isLoading,
  error,
  isEmpty,
  icon: Icon,
  emptyTitle,
  emptyText,
  children,
}: {
  isLoading: boolean;
  error: string | null;
  isEmpty: boolean;
  icon: React.ElementType;
  emptyTitle: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  if (isLoading) {
    return (
      <Card className="p-8 text-center max-w-xl mx-auto">
        <p className="text-sm text-slate-500">Loading workspace data…</p>
      </Card>
    );
  }
  if (error) {
    return (
      <Card className="p-8 text-center max-w-xl mx-auto space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">Could not load workspace data</h3>
        <p className="text-sm text-rose-600">{error}</p>
      </Card>
    );
  }
  if (isEmpty) {
    return (
      <Card className="p-8 text-center max-w-xl mx-auto space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Icon className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">{emptyTitle}</h3>
        <p className="text-sm text-slate-500">{emptyText}</p>
      </Card>
    );
  }
  return <>{children}</>;
}

// Scraped NGO text (mission/vision/description from the discovery pipeline)
// sometimes has literal HTML-entity sequences baked into the stored text
// (e.g. "SAFA&#x27;s mission" instead of "SAFA's mission") — decode the
// common ones before rendering as plain text, since React doesn't do this
// automatically for interpolated strings.
const HTML_ENTITY_MAP: Record<string, string> = {
  "&#x27;": "'", "&#39;": "'", "&apos;": "'",
  "&#x22;": '"', "&#34;": '"', "&quot;": '"',
  "&amp;": "&", "&nbsp;": " ", "&#8217;": "'", "&#8216;": "'",
  "&#8220;": '"', "&#8221;": '"', "&#8211;": "-", "&#8212;": "-",
};
function decodeScrapedText(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/&#x27;|&#39;|&apos;|&#x22;|&#34;|&quot;|&amp;|&nbsp;|&#8217;|&#8216;|&#8220;|&#8221;|&#8211;|&#8212;/g, (m) => HTML_ENTITY_MAP[m] ?? m);
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function MasterAnalyticsPage({
  navigateTo,
}: {
  navigateTo: (destination: Destination, focus?: { campaignId?: string; ngoId?: string }) => void;
}) {
  const { data, isLoading, error } = useWorkspaceOverview();
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({
    state: "All states",
    ngo: "All NGOs",
    focus: "All focus areas",
  });

  const projects = data?.projects ?? [];

  const STATE_OPTIONS = ["All states", ...Array.from(new Set(projects.map((p) => p.state).filter((s): s is string => Boolean(s))))];
  const NGO_OPTIONS = ["All NGOs", ...Array.from(new Set(projects.map((p) => p.ngo?.name).filter((n): n is string => Boolean(n))))];
  const FOCUS_OPTIONS = ["All focus areas", ...Array.from(new Set(projects.map((p) => p.focusArea).filter((f): f is string => Boolean(f))))];

  const FILTER_DEFS = [
    { key: "state", label: "All states" },
    { key: "ngo", label: "All NGOs" },
    { key: "focus", label: "All focus areas" },
  ];

  const FILTER_OPTIONS: Record<string, string[]> = {
    state: STATE_OPTIONS,
    ngo: NGO_OPTIONS,
    focus: FOCUS_OPTIONS,
  };

  function handleFilterChange(key: string, value: string) {
    setActiveFilters((prev) => ({ ...prev, [key]: value }));
  }

  const filtered = projects.filter((project) => {
    if (activeFilters.state !== "All states" && project.state !== activeFilters.state) return false;
    if (activeFilters.ngo !== "All NGOs" && project.ngo?.name !== activeFilters.ngo) return false;
    if (activeFilters.focus !== "All focus areas" && project.focusArea !== activeFilters.focus) return false;
    return true;
  });

  const filteredIds = new Set(filtered.map((p) => p.id));
  const metrics = (data?.metrics ?? []).filter((m) => filteredIds.has(m.projectId));

  function handleExport() {
    const rows = [
      ["Project", "Focus area", "State", "NGO partner", "Project budget", "Budgeted", "Spent", "Released", "Campaigns", "Approvals pending"].join(","),
      ...filtered.map((p) =>
        [
          `"${p.title}"`,
          `"${p.focusArea ?? ""}"`,
          `"${p.state ?? ""}"`,
          `"${p.ngo?.name ?? ""}"`,
          p.totals.projectBudget,
          p.totals.budgeted,
          p.totals.spent,
          p.totals.released,
          p.counts.campaigns,
          p.counts.pendingApprovals,
        ].join(","),
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "corpogn-portfolio-analytics.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Master analytics"
        title="Portfolio CSR intelligence"
        text="Every signed project, its partner NGO, and its real budget, campaign, and outcome-metric activity."
        actions={
          projects.length ? <GhostButton icon={Download} onClick={handleExport}>Export Analytics</GhostButton> : null
        }
      />

      <OverviewGate
        isLoading={isLoading}
        error={error}
        isEmpty={projects.length === 0}
        icon={BarChart3}
        emptyTitle="No analytics data available"
        emptyText="Analytics appear once a posted project is signed and its workspace begins recording campaigns, budget lines, and outcome metrics."
      >
        <section className="grid min-w-0 gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Signed Projects" value={String(data?.totals.projectCount ?? 0)} meta="Active workspaces" tone="blue" />
          <MetricCard label="NGO Partners" value={String(data?.totals.ngoCount ?? 0)} meta="Connected NGOs" tone="green" />
          <MetricCard label="Project Budget" value={formatINR(data?.totals.projectBudget ?? 0)} meta="Committed across projects" tone="violet" />
          <MetricCard label="Budget Lines" value={formatINR(data?.totals.budgeted ?? 0)} meta={`${data?.totals.allocationRate ?? 0}% allocated`} tone="blue" />
          <MetricCard label="Spent" value={formatINR(data?.totals.spent ?? 0)} meta={`${data?.totals.utilizationRate ?? 0}% of allocation`} tone="amber" />
          <MetricCard label="Campaigns" value={String(data?.totals.campaignCount ?? 0)} meta="Across all projects" tone="green" />
        </section>

        <div className="mt-6">
          <FilterBar
            filters={FILTER_DEFS}
            activeFilters={activeFilters}
            onFilterChange={handleFilterChange}
            filterOptions={FILTER_OPTIONS}
          />
        </div>

        {filtered.length === 0 ? (
          <Card className="mt-6">
            <div className="flex flex-col items-center py-16 text-center">
              <Filter className="h-10 w-10 text-slate-300 mb-3" />
              <p className="text-sm font-semibold text-slate-600">No projects match current filters</p>
              <button
                type="button"
                onClick={() => setActiveFilters({ state: "All states", ngo: "All NGOs", focus: "All focus areas" })}
                className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Clear all filters
              </button>
            </div>
          </Card>
        ) : (
          <section className="mt-6 grid min-w-0 gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            {filtered.map((project) => (
              <Card key={project.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 break-words">{project.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {project.focusArea ?? "Focus area not set"} - {project.state ?? "State not set"}
                    </p>
                  </div>
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  <MetricLine label="Budget allocated" value={project.totals.allocationRate} />
                  <MetricLine label="Allocation utilized" value={project.totals.utilizationRate} />
                  <MetricLine label="Funds released" value={project.totals.releaseRate} />
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
                  <span className="text-slate-500">NGO partner</span>
                  <span className="font-bold text-slate-900">{project.ngo?.name ?? "-"}</span>
                </div>
                <button
                  className="mt-4 w-full rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                  onClick={() => navigateTo("Campaign Management", { campaignId: project.id })}
                  type="button"
                >
                  Open campaigns
                </button>
              </Card>
            ))}
          </section>
        )}

        <section className="mt-6 grid min-w-0 items-start gap-5 lg:grid-cols-[1fr_1fr]">
          <Card>
            <SectionHeading icon={BarChart3} title="Portfolio Financial Flow" text="Recorded budget lines and spend against each project's committed budget." />
            <div className="space-y-4">
              {filtered.map((project) => (
                <div key={project.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-700">{project.title}</span>
                    <span className="text-slate-500">{formatINR(project.totals.spent)} spent</span>
                  </div>
                  <div className="mt-2 grid h-3 grid-cols-12 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="bg-blue-500"
                      style={{
                        gridColumnEnd: `span ${Math.min(12, Math.max(1, Math.round((project.totals.spent / Math.max(1, project.totals.projectBudget)) * 12)))}`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatINR(project.totals.budgeted)} allocated of {formatINR(project.totals.projectBudget)} committed
                  </p>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <SectionHeading icon={LineChart} title="Outcome Metrics" text="Values logged by partner NGOs in each project's Monitoring & Evaluation module." />
            {metrics.length === 0 ? (
              <p className="text-sm text-slate-400">
                No outcome metrics logged yet. They appear here as soon as a partner records Monitoring &amp; Evaluation entries in the project workspace.
              </p>
            ) : (
              <div className="space-y-3">
                {metrics.slice(0, 10).map((metric) => (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3" key={metric.id}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-slate-900">{metric.metricName}</span>
                      <span className="text-slate-500">
                        {metric.metricValue.toLocaleString("en-IN")} {metric.unit ?? ""}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {metric.projectTitle}
                      {metric.period ? ` - ${metric.period}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      </OverviewGate>
    </div>
  );
}

function CampaignManagementPage({
  activeCampaignId,
  campaignDetailTab,
  navigateTo,
  setActiveCampaignId,
  setCampaignDetailTab,
}: {
  activeCampaignId: string;
  campaignDetailTab: string;
  navigateTo: (destination: Destination, focus?: { campaignId?: string; ngoId?: string }) => void;
  setActiveCampaignId: (campaignId: string) => void;
  setCampaignDetailTab: (tab: string) => void;
}) {
  const { data, isLoading, error, reload } = useWorkspaceOverview();
  const [actionState, setActionState] = useState<{ busy: boolean; message: string | null; tone: "ok" | "error" }>({
    busy: false,
    message: null,
    tone: "ok",
  });

  const campaigns = data?.campaigns ?? [];
  // `activeCampaignId` may arrive from another page as either a campaign id or
  // a project id (Master Analytics links by project), so resolve both.
  const activeCampaign =
    campaigns.find((campaign) => campaign.id === activeCampaignId) ||
    campaigns.find((campaign) => campaign.projectId === activeCampaignId) ||
    campaigns[0];

  const project = data?.projects.find((p) => p.id === activeCampaign?.projectId) ?? null;
  const partner = data?.ngos.find((n) => n.id === project?.ngo?.id) ?? null;
  const projectBudgetLines = (data?.budgetLines ?? []).filter((line) => line.projectId === activeCampaign?.projectId);
  const projectApprovals = (data?.approvals ?? []).filter((a) => a.projectId === activeCampaign?.projectId);
  const projectReports = (data?.reports ?? []).filter((r) => r.projectId === activeCampaign?.projectId);
  const projectAudits = (data?.audits ?? []).filter((a) => a.projectId === activeCampaign?.projectId);
  const projectMetrics = (data?.metrics ?? []).filter((m) => m.projectId === activeCampaign?.projectId);

  const tabs = ["Overview", "Budget", "Milestones", "NGO", "Approvals", "Reports", "Audits", "Impact"];

  /**
   * Real write: raises a fund-release approval row on the campaign's project
   * through the existing permission-enforced workspace module route.
   */
  async function requestFundReleaseForCampaign() {
    if (!activeCampaign) return;
    setActionState({ busy: true, message: null, tone: "ok" });
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setActionState({ busy: false, message: "Your session has expired. Please sign in again.", tone: "error" });
      return;
    }
    const res = await fetch(`/api/project-workspace/${activeCampaign.projectId}/approvals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ item_type: "fund_release", item_ref: activeCampaign.id, status: "pending" }),
    });
    const body = await res.json();
    if (res.ok) {
      setActionState({ busy: false, message: "Fund release request raised for approval.", tone: "ok" });
      reload();
    } else {
      setActionState({ busy: false, message: body.error ?? "Could not raise the request.", tone: "error" });
    }
  }

  async function submitCampaignReportDraft() {
    if (!activeCampaign) return;
    setActionState({ busy: true, message: null, tone: "ok" });
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setActionState({ busy: false, message: "Your session has expired. Please sign in again.", tone: "error" });
      return;
    }
    const res = await fetch(`/api/project-workspace/${activeCampaign.projectId}/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: `${activeCampaign.title} impact report`,
        report_type: "impact",
      }),
    });
    const body = await res.json();
    if (res.ok) {
      setActionState({ busy: false, message: "Report recorded in the project workspace.", tone: "ok" });
      reload();
    } else {
      setActionState({ busy: false, message: body.error ?? "Could not save the report.", tone: "error" });
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Campaign management"
        title="Campaigns, budget, partner, approvals, and reports"
        text="Every campaign here is a real record from a signed project's workspace."
        actions={
          activeCampaign ? (
            <>
              <ActionButton icon={CircleDollarSign} onClick={requestFundReleaseForCampaign}>
                {actionState.busy ? "Requesting…" : "Request Fund Release"}
              </ActionButton>
              <GhostButton icon={FileText} onClick={submitCampaignReportDraft}>
                Add impact report
              </GhostButton>
              <GhostButton icon={FolderKanban} onClick={() => navigateTo("My Projects")}>
                Open Project Workspace
              </GhostButton>
            </>
          ) : null
        }
      />

      {actionState.message ? (
        <p className={`text-sm ${actionState.tone === "ok" ? "text-emerald-600" : "text-rose-600"}`}>{actionState.message}</p>
      ) : null}

      <OverviewGate
        isLoading={isLoading}
        error={error}
        isEmpty={campaigns.length === 0}
        icon={HandHeart}
        emptyTitle="No campaigns yet"
        emptyText="Campaigns are created inside a signed project's workspace (My Projects → Campaigns). Once created they appear here across your whole portfolio."
      >
        {activeCampaign ? (
          <section className="grid min-w-0 items-start gap-5 lg:grid-cols-[0.95fr_1.45fr]">
            <Card>
              <SectionHeading icon={HandHeart} title="Campaign List" text="Every campaign across your signed projects." />
              <div className="space-y-3">
                {campaigns.map((campaign) => (
                  <button
                    className={`w-full min-w-0 rounded-md border p-4 text-left transition ${
                      activeCampaign.id === campaign.id
                        ? "border-blue-300 bg-blue-50"
                        : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/60"
                    }`}
                    key={campaign.id}
                    onClick={() => {
                      setActiveCampaignId(campaign.id);
                      setCampaignDetailTab("Overview");
                    }}
                    type="button"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 break-words">{campaign.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {campaign.projectTitle}
                          {campaign.ngoName ? ` - ${campaign.ngoName}` : ""}
                        </p>
                      </div>
                      <StatusBadge value={titleCase(campaign.status)} />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>Created {formatDate(campaign.createdAt)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            <Card>
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-slate-900 break-words">{activeCampaign.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {activeCampaign.projectTitle}
                    {project?.district ? ` - ${project.district}` : ""}
                    {project?.state ? `, ${project.state}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge value={titleCase(activeCampaign.status)} />
                </div>
              </div>

              <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
                {tabs.map((tab) => (
                  <button
                    className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold ${
                      campaignDetailTab === tab ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                    key={tab}
                    onClick={() => setCampaignDetailTab(tab)}
                    type="button"
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="mt-6">
                {campaignDetailTab === "Overview" ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <MetricCard label="Status" value={titleCase(activeCampaign.status)} meta={`Created ${formatDate(activeCampaign.createdAt)}`} tone="blue" />
                      <MetricCard label="Focus Area" value={project?.focusArea ?? "-"} meta={project?.state ?? "State not set"} tone="green" />
                      <MetricCard
                        label="Project Budget"
                        value={formatINR(project?.totals.projectBudget ?? 0)}
                        meta={`${formatINR(project?.totals.released ?? 0)} released`}
                        tone="violet"
                      />
                      <MetricCard
                        label="NGO Partner"
                        value={partner?.name ?? "-"}
                        meta={`${partner?.trustScore ?? 0}/100 trust score`}
                        tone="amber"
                      />
                    </div>
                    {activeCampaign.description ? (
                      <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">{activeCampaign.description}</p>
                    ) : null}
                  </div>
                ) : null}

                {campaignDetailTab === "Budget" ? (
                  projectBudgetLines.length ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-3">
                        <MiniStat label="Allocated" value={formatINR(project?.totals.budgeted ?? 0)} />
                        <MiniStat label="Spent" value={formatINR(project?.totals.spent ?? 0)} />
                        <MiniStat label="Released" value={formatINR(project?.totals.released ?? 0)} />
                      </div>
                      <SimpleTable
                        headers={["Line item", "Budgeted", "Spent", "Utilization"]}
                        rows={projectBudgetLines.map((line) => [
                          line.lineItem,
                          formatINR(line.budgeted),
                          formatINR(line.spent),
                          `${line.budgeted > 0 ? Math.round((line.spent / line.budgeted) * 100) : 0}%`,
                        ])}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">No budget lines recorded on this project yet.</p>
                  )
                ) : null}

                {campaignDetailTab === "Milestones" && activeCampaign ? (
                  <WorkspaceMilestonesPanel
                    projectId={activeCampaign.projectId}
                    canEdit={false}
                    getToken={async () => {
                      const { data: sessionData } = await supabaseBrowser.auth.getSession();
                      return sessionData.session?.access_token ?? null;
                    }}
                    title="Shared milestones"
                    description="Updates made by the NGO in the project workspace appear here after refresh."
                  />
                ) : null}

                {campaignDetailTab === "NGO" ? (
                  partner ? (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-600">
                        {partner.name} is the signed delivery partner for {activeCampaign.projectTitle}. Trust score {partner.trustScore}/100;{" "}
                        {partner.documentsOnFile} of {partner.documentsTotal} registration documents on file.
                      </p>
                      <button
                        className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700"
                        onClick={() => navigateTo("NGO Management", { ngoId: partner.id })}
                        type="button"
                      >
                        Open NGO profile
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">No NGO partner resolved for this project.</p>
                  )
                ) : null}

                {campaignDetailTab === "Approvals" ? (
                  projectApprovals.length ? (
                    <SimpleTable
                      headers={["Item type", "Reference", "Status", "Raised"]}
                      rows={projectApprovals.map((a) => [titleCase(a.itemType), a.itemRef ?? "-", titleCase(a.status), formatDate(a.createdAt)])}
                    />
                  ) : (
                    <p className="text-sm text-slate-400">No approvals raised on this project yet.</p>
                  )
                ) : null}

                {campaignDetailTab === "Reports" ? (
                  projectReports.length ? (
                    <SimpleTable
                      headers={["Report", "Type", "Link", "Added"]}
                      rows={projectReports.map((r) => [r.title, titleCase(r.reportType), r.url ?? "-", formatDate(r.createdAt)])}
                    />
                  ) : (
                    <p className="text-sm text-slate-400">No reports submitted on this project yet.</p>
                  )
                ) : null}

                {campaignDetailTab === "Audits" ? (
                  projectAudits.length ? (
                    <SimpleTable
                      headers={["Audit", "Status", "Date", "Findings"]}
                      rows={projectAudits.map((a) => [titleCase(a.auditType), titleCase(a.status), formatDate(a.auditDate), a.findings ?? "-"])}
                    />
                  ) : (
                    <p className="text-sm text-slate-400">No audits recorded on this project yet.</p>
                  )
                ) : null}

                {campaignDetailTab === "Impact" ? (
                  projectMetrics.length ? (
                    <SimpleTable
                      headers={["Metric", "Value", "Unit", "Period"]}
                      rows={projectMetrics.map((m) => [
                        m.metricName,
                        m.metricValue.toLocaleString("en-IN"),
                        m.unit ?? "-",
                        m.period ?? "-",
                      ])}
                    />
                  ) : (
                    <p className="text-sm text-slate-400">No monitoring &amp; evaluation metrics logged on this project yet.</p>
                  )
                ) : null}
              </div>
            </Card>
          </section>
        ) : null}
      </OverviewGate>
    </div>
  );
}

type DiscoverableNgo = {
  id: string;
  slug: string;
  name: string;
  status: string;
  trustScore: number;
  sectorPrimary: string | null;
  logoUrl: string | null;
  ngoType: string;
  state: string;
  website: string;
  mission: string;
  focusAreas: string[];
};

function DiscoverNgosPage({ corporateSlug }: { corporateSlug: string }) {
  const [ngos, setNgos] = useState<DiscoverableNgo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [sortBy, setSortBy] = useState<"trust" | "name">("trust");
  const [errorMessage, setErrorMessage] = useState("");
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  async function load(q?: string, state?: string) {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setErrorMessage("Not signed in.");
        setIsLoading(false);
        return;
      }
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (state) params.set("state", state);
      const res = await fetch(`/api/corporates/discover-ngos?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await res.json()) as {
        ngos?: DiscoverableNgo[];
        error?: string;
        ai?: { summary?: string };
      };
      if (!res.ok) {
        setErrorMessage(result.error ?? "Could not load NGOs.");
        setIsLoading(false);
        return;
      }
      setNgos(result.ngos ?? []);
      setAiSummary(result.ai?.summary ?? AI_PRODUCT_COPY.discovery);
    } catch {
      setErrorMessage("Could not load NGOs.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => {
    const list = [...ngos];
    if (sortBy === "trust") list.sort((a, b) => b.trustScore - a.trustScore);
    else list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [ngos, sortBy]);

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Discover NGOs"
        title="Search and vet verified NGO partners"
        text="Browse the full NGO directory, filter by state or focus, and open a complete profile — registration, financials, project history, and trust signals — before reaching out."
      />
      <div className="flex flex-wrap items-center gap-2">
        <AiAssistBadge label="AI-ranked directory" />
        {aiSummary ? (
          <p className="text-xs text-slate-600 max-w-3xl">{aiSummary}</p>
        ) : null}
      </div>

      <Card className="p-5">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            load(query, stateFilter);
          }}
        >
          <TextField label="Search" value={query} onChange={setQuery} />
          <TextField label="State" value={stateFilter} onChange={setStateFilter} />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Sort by
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as "trust" | "name")}
              className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-[#849b34]"
            >
              <option value="trust">Trust score</option>
              <option value="name">Name</option>
            </select>
          </label>
          <button
            type="submit"
            className="h-11 rounded-md bg-[#849b34] px-5 text-sm font-semibold text-white hover:bg-[#71852c]"
          >
            Search
          </button>
        </form>
      </Card>

      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">No NGOs found. Try a different search.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((ngo) => (
            <a
              key={ngo.id}
              href={`/corporate/${corporateSlug}/ngo/${ngo.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#849b34] hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">{ngo.name}</h3>
                <span className="shrink-0 rounded-full bg-[#eef0e0] px-2 py-0.5 text-[11px] font-semibold text-[#4c5a1c]">
                  Trust {ngo.trustScore}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{ngo.sectorPrimary ?? (ngo.ngoType || "Sector unknown")} · {ngo.state || "State unknown"}</p>
              {ngo.mission ? <p className="mt-2 line-clamp-2 text-xs text-slate-600">{decodeScrapedText(ngo.mission)}</p> : null}
              {ngo.focusAreas?.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {ngo.focusAreas.slice(0, 3).map((f) => (
                    <span key={f} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{f}</span>
                  ))}
                </div>
              ) : null}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function NgoManagementPage({
  activeNgoId,
  assigningNgoId,
  candidates,
  connections,
  navigateTo,
  onAssignProject,
  setActiveNgoId,
}: {
  activeNgoId: string;
  assigningNgoId: string;
  candidates: NgoCandidate[];
  connections: ProjectConnection[];
  navigateTo: (destination: Destination, focus?: { campaignId?: string; ngoId?: string }) => void;
  onAssignProject: (candidate: NgoCandidate) => void;
  setActiveNgoId: (ngoId: string) => void;
}) {
  const { data, isLoading, error } = useWorkspaceOverview();
  const [showRegister, setShowRegister] = useState(false);

  const partners = data?.ngos ?? [];
  const activeNgo = partners.find((ngo) => ngo.id === activeNgoId) || partners[0];
  const partnerProjects = (data?.projects ?? []).filter((project) => project.ngo?.id === activeNgo?.id);
  const partnerCampaigns = (data?.campaigns ?? []).filter((campaign) => campaign.ngoId === activeNgo?.id);

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="NGO management"
        title="Partner profiles connected to projects, budgets, and compliance records"
        text="These are the NGOs you currently have signed project workspaces with — pulled from the signed workspace record, not a directory listing."
        actions={
          activeNgo ? (
            <ActionButton icon={showRegister ? Table2 : Clock} onClick={() => setShowRegister((current) => !current)}>
              {showRegister ? "Hide Register" : "Open Document Register"}
            </ActionButton>
          ) : undefined
        }
      />

      <OverviewGate
        isLoading={isLoading}
        error={error}
        isEmpty={partners.length === 0}
        icon={Users}
        emptyTitle="No Connected NGO Partners Yet"
        emptyText="Once a project is signed and its workspace is unlocked, the partner NGO appears here with its live trust score and compliance record."
      >
        {activeNgo ? (
          <section className="grid min-w-0 items-start gap-5 lg:grid-cols-[0.9fr_1.5fr]">
            <Card>
              <SectionHeading icon={Users} title="NGO Directory" text="Partners on your signed projects." />
              <div className="space-y-3">
                {partners.map((ngo) => (
                  <button
                    className={`w-full min-w-0 rounded-md border p-4 text-left ${
                      activeNgo.id === ngo.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200"
                    }`}
                    key={ngo.id}
                    onClick={() => setActiveNgoId(ngo.id)}
                    type="button"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 break-words">{ngo.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {ngo.sectorPrimary ?? "Sector not set"} - {ngo.state ?? "State not set"}
                        </p>
                      </div>
                      <StatusBadge value={titleCase(ngo.accessStatus ?? "unknown")} />
                    </div>
                    <div className="mt-3">
                      <MetricLine label="Trust score" value={ngo.trustScore} />
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            <Card>
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-slate-900 break-words">{activeNgo.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {activeNgo.sectorPrimary ?? "Sector not set"} partner - {activeNgo.state ?? "State not set"}
                  </p>
                </div>
                <StatusBadge value={titleCase(activeNgo.accessStatus ?? "unknown")} />
              </div>

              <section className="mt-5 grid min-w-0 gap-4 md:grid-cols-4">
                <MetricCard label="Trust Score" value={`${activeNgo.trustScore}/100`} meta="Registration + external verification data" tone="blue" />
                <MetricCard
                  label="Documents On File"
                  value={`${activeNgo.documentsOnFile}/${activeNgo.documentsTotal}`}
                  meta="Self-uploaded to this platform"
                  tone="green"
                />
                <MetricCard label="Signed Projects" value={String(partnerProjects.length)} meta="Active workspaces" tone="violet" />
                <MetricCard label="Campaigns" value={String(partnerCampaigns.length)} meta="Recorded in workspace" tone="amber" />
              </section>

              {showRegister ? (
                <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Document register</p>
                  <SimpleTable
                    headers={["Document", "Reference on file", "Status"]}
                    rows={activeNgo.documents.map((document) => [document.name, document.value ?? "-", document.status])}
                  />
                  <p className="mt-3 text-xs text-slate-400">
                    Registration validity: {activeNgo.registrationValidity ?? "not recorded"} - Legal status:{" "}
                    {activeNgo.legalStatus ?? "not recorded"}
                  </p>
                </div>
              ) : null}

              <section className="mt-6 grid min-w-0 gap-5 lg:grid-cols-2">
                <div>
                  <SectionHeading icon={FileCheck2} title="Compliance Documents" text="Documents the partner has uploaded to this platform — separate from their trust score above." />
                  <div className="space-y-2">
                    {activeNgo.documents.map((document) => (
                      <div
                        className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm"
                        key={document.name}
                      >
                        <span className="min-w-0 break-words font-medium text-slate-800">{document.name}</span>
                        <StatusBadge value={document.status} />
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <SectionHeading icon={HandHeart} title="Connected Projects" text="Signed projects this partner is delivering." />
                  <div className="space-y-2">
                    {partnerProjects.map((project) => (
                      <button
                        className="w-full min-w-0 rounded-md border border-slate-200 bg-white p-3 text-left text-sm hover:border-blue-200 hover:bg-blue-50"
                        key={project.id}
                        onClick={() => navigateTo("Campaign Management", { campaignId: project.id, ngoId: activeNgo.id })}
                        type="button"
                      >
                        <div className="flex min-w-0 items-center justify-between gap-3">
                          <span className="min-w-0 break-words font-semibold text-slate-900">{project.title}</span>
                          <span className="shrink-0 text-slate-500">{formatINR(project.totals.released)} released</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {project.counts.campaigns} campaign(s) - {project.counts.pendingApprovals} approval(s) pending
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            </Card>
          </section>
        ) : null}
      </OverviewGate>

      {/* Available NGO Partners table */}
      <Card>
        <SectionHeading
          icon={HeartHandshake}
          title="Available NGO Partners"
          text="Assign a CSR project to establish a new connected workspace."
        />
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">NGO Partner</th>
                <th className="px-4 py-3">Focus Area</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3 text-right">Trust Score</th>
                <th className="px-4 py-3 text-right">Rating</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {candidates.map((candidate) => {
                const connected =
                  connections.some((conn) => conn.ngo_id === candidate.id) ||
                  connections.some((conn) => conn.ngo_name === candidate.name);
                const disabled =
                  connected ||
                  assigningNgoId === candidate.id ||
                  candidate.status === "Suspended";

                return (
                  <tr className="hover:bg-slate-50/50" key={candidate.id}>
                    <td className="px-4 py-3.5 font-medium text-slate-900">
                      {candidate.name}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      {candidate.focusArea}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      {candidate.state}
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold text-slate-700">
                      {candidate.trustScore}/100
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold text-blue-600">
                      {candidate.rating}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold shadow-sm transition active:scale-95 ${connected
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                          }`}
                        disabled={disabled}
                        onClick={() => onAssignProject(candidate)}
                        type="button"
                      >
                        {connected ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 animate-pulse" />
                            Connected
                          </>
                        ) : assigningNgoId === candidate.id ? (
                          "Assigning..."
                        ) : (
                          <>
                            <HeartHandshake className="h-3.5 w-3.5" />
                            Assign Project
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ProjectWorkspace({
  connections,
  onRequestDocument,
}: {
  connections: ProjectConnection[];
  onRequestDocument: (connectionId: string, documentName: string) => Promise<void>;
}) {
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [customDocName, setCustomDocName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeConnectionId || !customDocName.trim()) return;

    setError("");
    setIsSubmitting(true);
    try {
      await onRequestDocument(activeConnectionId, customDocName.trim());
      setActiveConnectionId(null);
      setCustomDocName("");
    } catch (err: unknown) {
      setError(errorMessageFrom(err, "Could not request document."));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!connections.length) {
    return (
      <Card className="p-8">
        <div className="mx-auto max-w-xl text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <HeartHandshake className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-900 tracking-tight">
            No NGO project connection yet
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Open NGO Management, choose a suitable registered NGO, and assign a
            CSR project. That unlocks the shared monitoring workspace for both
            sides.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Shared corporate + NGO execution layer"
        title="Project Workspace"
        text="Each assigned project now has one shared record. Corporate teams can request documents, review progress, and monitor the same milestones the NGO updates from its dashboard."
      />

      {connections.map((connection) => (
        <Card key={connection.id}>
          <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    {connection.focus_area}
                  </span>
                  <h3 className="mt-3 text-xl font-bold text-slate-900 tracking-tight">
                    {connection.project_name}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Assigned to{" "}
                    <span className="font-semibold text-slate-800">
                      {connection.ngo_name}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <span className="rounded-full bg-emerald-50 px-3 py-0.5 text-xs font-semibold uppercase text-emerald-700">
                    {connection.status}
                  </span>
                  {connection.uc_submitted && (
                    <span className="rounded-full bg-violet-50 px-3 py-0.5 text-xs font-semibold text-violet-700">
                      ✓ UC Submitted
                    </span>
                  )}
                  {connection.impact_report_submitted && (
                    <span className="rounded-full bg-teal-50 px-3 py-0.5 text-xs font-semibold text-teal-700">
                      ✓ Impact Report
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <MiniStat label="Approved Budget" value={formatINR(connection.budget)} />
                <MiniStat label="Completion progress" value={`${connection.progress}%`} />
                <MiniStat label="Current milestone" value={connection.milestone} />
              </div>

              <div className="mt-5">
                <span className="text-xs font-semibold text-slate-500">Shared progress</span>
                <Progress value={connection.progress} />
              </div>

              <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Latest NGO update
                </p>
                <p className="mt-1.5 text-sm text-blue-900 leading-relaxed">{connection.latest_update}</p>
              </div>
            </div>

            <div className="border-t border-slate-100 bg-slate-50/50 p-5 lg:border-l lg:border-t-0">
              <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 tracking-tight">
                <FileText className="h-4 w-4 text-blue-600" />
                Corporate document requests
              </h4>
              <div className="mt-4 space-y-3">
                {connection.document_requests.length ? (
                  connection.document_requests.map((request) => (
                    <div
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm"
                      key={request}
                    >
                      <span className="text-sm font-medium text-slate-700 truncate">
                        {request}
                      </span>
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 shrink-0">
                        Requested
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-500">
                    No pending requests.
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setActiveConnectionId(connection.id);
                  setCustomDocName("");
                  setError("");
                }}
                type="button"
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm transition active:scale-95"
              >
                <FileText className="h-4 w-4" />
                Request Document
              </button>
            </div>
          </div>
        </Card>
      ))}

      {activeConnectionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-base font-bold text-slate-900">Request Document</h3>
              <button
                type="button"
                onClick={() => {
                  setActiveConnectionId(null);
                  setCustomDocName("");
                  setError("");
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Select standard document
                  </label>
                  <div className="mt-2 grid grid-cols-1 gap-2">
                    {[
                      "CSR-1 Certificate",
                      "Latest audit report",
                      "Utilization Certificate (UC)",
                      "Detailed Project Report (DPR)",
                      "80G / 12A Registration"
                    ].map((doc) => {
                      const conn = connections.find(c => c.id === activeConnectionId);
                      const exists = conn?.document_requests.includes(doc);
                      return (
                        <button
                          key={doc}
                          type="button"
                          disabled={exists}
                          onClick={() => setCustomDocName(doc)}
                          className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-left text-sm font-medium transition ${customDocName === doc
                              ? "border-blue-600 bg-blue-50/50 text-blue-700"
                              : exists
                                ? "border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                        >
                          <span>{doc}</span>
                          {exists && (
                            <span className="text-xs font-semibold text-emerald-600">Already requested</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="relative flex items-center py-2">
                  <div className="flex-grow border-t border-slate-100"></div>
                  <span className="flex-shrink mx-4 text-xs font-semibold uppercase tracking-wider text-slate-400">OR</span>
                  <div className="flex-grow border-t border-slate-100"></div>
                </div>

                <div>
                  <label htmlFor="custom-doc" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Custom Document Request
                  </label>
                  <input
                    id="custom-doc"
                    type="text"
                    placeholder="e.g. Beneficiary Consent Forms - Q3"
                    value={customDocName}
                    onChange={(e) => setCustomDocName(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition"
                    maxLength={80}
                  />
                </div>

                {error && (
                  <p className="text-xs font-medium text-red-600 flex items-center gap-1.5 bg-red-50 p-2.5 rounded-lg border border-red-100">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {error}
                  </p>
                )}
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setActiveConnectionId(null);
                    setCustomDocName("");
                    setError("");
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !customDocName.trim()}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition shadow-sm"
                >
                  {isSubmitting ? "Requesting..." : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function BudgetPage({
  navigateTo,
}: {
  navigateTo: (destination: Destination, focus?: { campaignId?: string; approvalId?: string }) => void;
}) {
  const { data, isLoading, error, reload } = useWorkspaceOverview();
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [pendingProjectId, setPendingProjectId] = useState("");
  const [actionMessage, setActionMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  const totals = data?.totals;
  const projects = data?.projects ?? [];
  const fundApprovals = (data?.approvals ?? []).filter((approval) => approval.itemType === "fund_release");

  /** Real write: raises a fund-release approval row on the chosen project. */
  async function requestRelease(projectId: string) {
    setPendingProjectId(projectId);
    setActionMessage(null);
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setPendingProjectId("");
      setActionMessage({ text: "Your session has expired. Please sign in again.", tone: "error" });
      return;
    }
    const res = await fetch(`/api/project-workspace/${projectId}/approvals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ item_type: "fund_release", status: "pending" }),
    });
    const body = await res.json();
    setPendingProjectId("");
    if (res.ok) {
      setActionMessage({ text: "Fund release request raised for approval.", tone: "ok" });
      reload();
    } else {
      setActionMessage({ text: body.error ?? "Could not raise the request.", tone: "error" });
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Budget & fund tracking"
        title="Project-level fund control"
        text="Committed project budgets, recorded budget lines, actual spend, and released funds — all read from your signed project workspaces."
        actions={
          projects.length ? (
            <ActionButton icon={showAnalysis ? Table2 : BarChart3} onClick={() => setShowAnalysis((current) => !current)}>
              {showAnalysis ? "Hide Analysis" : "Open Analysis"}
            </ActionButton>
          ) : null
        }
      />

      {actionMessage ? (
        <p className={`text-sm ${actionMessage.tone === "ok" ? "text-emerald-600" : "text-rose-600"}`}>{actionMessage.text}</p>
      ) : null}

      <OverviewGate
        isLoading={isLoading}
        error={error}
        isEmpty={projects.length === 0}
        icon={Wallet}
        emptyTitle="No budget data yet"
        emptyText="Budget tracking appears once a project is signed. Line items and spend are recorded in the project workspace's Budget Tracking module."
      >
        <section className="grid min-w-0 gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Total Budget" value={formatINR(totals?.projectBudget ?? 0)} meta="Committed on signed projects" tone="blue" />
          <MetricCard label="Allocated" value={formatINR(totals?.budgeted ?? 0)} meta={`${totals?.allocationRate ?? 0}% allocated`} tone="violet" />
          <MetricCard label="Released" value={formatINR(totals?.released ?? 0)} meta={`${totals?.releaseRate ?? 0}% released`} tone="green" />
          <MetricCard label="Spent" value={formatINR(totals?.spent ?? 0)} meta="Recorded against line items" tone="blue" />
          <MetricCard label="Approvals Pending" value={String(totals?.pendingApprovals ?? 0)} meta="Release & other queues" tone="amber" />
          <MetricCard label="Remaining" value={formatINR(totals?.remaining ?? 0)} meta="Unspent budget" tone="green" />
        </section>

        {showAnalysis ? (
          <Card className="mt-6">
            <SectionHeading icon={BarChart3} title="Budget Line Analysis" text="Every line item recorded across your signed projects." />
            {(data?.budgetLines ?? []).length === 0 ? (
              <p className="text-sm text-slate-400">No budget line items recorded yet.</p>
            ) : (
              <SimpleTable
                headers={["Project", "Line item", "Budgeted", "Spent", "Utilization"]}
                rows={(data?.budgetLines ?? []).map((line) => [
                  line.projectTitle,
                  line.lineItem,
                  formatINR(line.budgeted),
                  formatINR(line.spent),
                  `${line.budgeted > 0 ? Math.round((line.spent / line.budgeted) * 100) : 0}%`,
                ])}
              />
            )}
          </Card>
        ) : null}

        <section className="mt-6 grid min-w-0 items-start gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <SectionHeading icon={Wallet} title="Project-wise Fund Flow" text="Raising a release request creates a real approval record on that project." />
            <div className="space-y-4">
              {projects.map((project) => (
                <div className="min-w-0 rounded-md border border-slate-200 bg-white p-4" key={project.id}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 break-words">{project.title}</p>
                      <p className="text-xs text-slate-500">
                        {project.focusArea ?? "Focus area not set"} - {project.ngo?.name ?? "No partner"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                        disabled={pendingProjectId === project.id}
                        onClick={() => requestRelease(project.id)}
                        type="button"
                      >
                        {pendingProjectId === project.id ? "Requesting…" : "Request Release"}
                      </button>
                      <button
                        className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        onClick={() => navigateTo("Campaign Management", { campaignId: project.id })}
                        type="button"
                      >
                        Details
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-4">
                    <MiniStat label="Budget" value={formatINR(project.totals.projectBudget)} />
                    <MiniStat label="Allocated" value={formatINR(project.totals.budgeted)} />
                    <MiniStat label="Released" value={formatINR(project.totals.released)} />
                    <MiniStat label="Spent" value={formatINR(project.totals.spent)} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionHeading icon={Clock} title="Fund Release Approvals" text="Approvals are decided in Reports & Approvals." />
            {fundApprovals.length === 0 ? (
              <p className="text-sm text-slate-400">No fund release requests raised yet.</p>
            ) : (
              <div className="space-y-3">
                {fundApprovals.map((approval) => (
                  <button
                    className="w-full min-w-0 rounded-md border border-slate-200 bg-slate-50 p-3 text-left hover:border-blue-200 hover:bg-blue-50"
                    key={approval.id}
                    onClick={() => navigateTo("Reports & Approvals", { approvalId: approval.id })}
                    type="button"
                  >
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <p className="min-w-0 break-words text-sm font-semibold text-slate-900">{titleCase(approval.itemType)}</p>
                      <StatusBadge value={titleCase(approval.status)} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {approval.projectTitle} - raised {formatDate(approval.createdAt)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </section>
      </OverviewGate>
    </div>
  );
}

function EsgImpactPage({
  navigateTo,
}: {
  navigateTo: (destination: Destination, focus?: { campaignId?: string }) => void;
}) {
  const { data, isLoading, error } = useWorkspaceOverview();
  const [showAnalysis, setShowAnalysis] = useState(false);

  const projects = data?.projects ?? [];
  const metrics = data?.metrics ?? [];
  const sdgSet = new Set(projects.flatMap((project) => project.sdgTargets));
  const metricsByProject = new Map<string, OverviewMetric[]>();
  for (const metric of metrics) {
    const list = metricsByProject.get(metric.projectId) ?? [];
    list.push(metric);
    metricsByProject.set(metric.projectId, list);
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="ESG & impact"
        title="Outcome tracking from partner-reported metrics"
        text="Every value here is an entry a partner NGO logged in the project workspace's Monitoring & Evaluation module. Nothing is estimated."
        actions={
          projects.length ? (
            <ActionButton icon={showAnalysis ? Table2 : PieChart} onClick={() => setShowAnalysis((current) => !current)}>
              {showAnalysis ? "Hide SDG Analysis" : "Open SDG Analysis"}
            </ActionButton>
          ) : null
        }
      />

      <OverviewGate
        isLoading={isLoading}
        error={error}
        isEmpty={projects.length === 0}
        icon={ShieldCheck}
        emptyTitle="No impact data yet"
        emptyText="Sign a project to start tracking SDG alignment and partner-reported outcome metrics."
      >
        <section className="grid min-w-0 gap-4 md:grid-cols-4">
          <MetricCard label="Signed Projects" value={String(projects.length)} meta="Being tracked for impact" tone="blue" />
          <MetricCard label="Metrics Logged" value={String(metrics.length)} meta="Monitoring & evaluation entries" tone="green" />
          <MetricCard label="SDGs Targeted" value={String(sdgSet.size)} meta="Declared on posted projects" tone="violet" />
          <MetricCard
            label="Projects Reporting"
            value={`${metricsByProject.size}/${projects.length}`}
            meta="Have logged at least one metric"
            tone="amber"
          />
        </section>

        {showAnalysis ? (
          <Card className="mt-6">
            <SectionHeading icon={PieChart} title="SDG Coverage" text="SDG targets declared on your signed projects." />
            {sdgSet.size === 0 ? (
              <p className="text-sm text-slate-400">No SDG targets were declared on these projects.</p>
            ) : (
              <SimpleTable
                headers={["Project", "Focus area", "SDG targets", "Target beneficiaries"]}
                rows={projects.map((project) => [
                  project.title,
                  project.focusArea ?? "-",
                  project.sdgTargets.length ? project.sdgTargets.join(", ") : "-",
                  project.targetBeneficiaries.length ? project.targetBeneficiaries.join(", ") : "-",
                ])}
              />
            )}
          </Card>
        ) : null}

        <AiTaskStreamPanel
          title="AI CSR impact report"
          description="Generate a streaming board narrative from logged M&E metrics across your signed projects."
          task="impact_report"
          portal="corporate"
          section="ESG & Impact"
          testId="corporate-ai-impact-btn"
          buttonLabel="Draft portfolio impact report"
          payload={{
            projects: projects.map((project) => ({
              title: project.title,
              focusArea: project.focusArea,
              sdgTargets: project.sdgTargets,
              targetBeneficiaries: project.targetBeneficiaries,
              metrics: (metricsByProject.get(project.id) ?? []).map((m) => ({
                name: m.metricName,
                value: m.metricValue,
                unit: m.unit,
                period: m.period,
              })),
            })),
            totals: {
              projectCount: projects.length,
              metricsLogged: metrics.length,
              sdgCount: sdgSet.size,
            },
          }}
        />

        <section className="mt-6 grid min-w-0 gap-5">
          {projects.map((project) => {
            const projectMetrics = metricsByProject.get(project.id) ?? [];
            return (
              <Card key={project.id}>
                <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 break-words">{project.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {project.focusArea ?? "Focus area not set"}
                      {project.sdgTargets.length ? ` - ${project.sdgTargets.join(", ")}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
                      onClick={() => navigateTo("Campaign Management", { campaignId: project.id })}
                      type="button"
                    >
                      Open Campaigns
                    </button>
                  </div>
                </div>
                {projectMetrics.length === 0 ? (
                  <p className="mt-5 text-sm text-slate-400">
                    No outcome metrics logged for this project yet. Partners record them in the project workspace&apos;s Monitoring &amp;
                    Evaluation module.
                  </p>
                ) : (
                  <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {projectMetrics.map((metric) => (
                      <div className="rounded-lg bg-slate-50 p-4" key={metric.id}>
                        <p className="text-sm font-semibold text-slate-900">{metric.metricName}</p>
                        <p className="mt-2 text-xl font-bold text-blue-600">
                          {metric.metricValue.toLocaleString("en-IN")}
                          {metric.unit ? <span className="text-xs font-medium text-slate-500"> {metric.unit}</span> : null}
                        </p>
                        <p className="text-xs text-slate-500">{metric.period ?? formatDate(metric.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </section>
      </OverviewGate>
    </div>
  );
}

function ReportsApprovalsPage({
  navigateTo,
  selectedApprovalId,
  setSelectedApprovalId,
}: {
  navigateTo: (destination: Destination, focus?: { campaignId?: string; ngoId?: string }) => void;
  selectedApprovalId: string;
  setSelectedApprovalId: (approvalId: string) => void;
}) {
  const { data, isLoading, error, reload } = useWorkspaceOverview();
  const [decidingId, setDecidingId] = useState("");
  const [decisionMessage, setDecisionMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  const approvals = data?.approvals ?? [];
  const reports = data?.reports ?? [];
  const selectedApproval = approvals.find((approval) => approval.id === selectedApprovalId) || approvals[0];
  const linkedProject = data?.projects.find((project) => project.id === selectedApproval?.projectId) ?? null;

  /** Real write against the approvals table, ownership re-checked server-side. */
  async function decide(approvalId: string, status: "approved" | "rejected" | "revision_requested") {
    setDecidingId(approvalId);
    setDecisionMessage(null);
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setDecidingId("");
      setDecisionMessage({ text: "Your session has expired. Please sign in again.", tone: "error" });
      return;
    }
    const res = await fetch(`/api/corporates/workspace-approvals/${approvalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    const body = await res.json();
    setDecidingId("");
    if (res.ok) {
      setDecisionMessage({ text: `Approval marked ${titleCase(status).toLowerCase()}.`, tone: "ok" });
      reload();
    } else {
      setDecisionMessage({ text: body.error ?? "Could not record the decision.", tone: "error" });
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Reports & approvals"
        title="Approval hub with linked project context"
        text="Approvals and reports raised inside your signed project workspaces, portfolio-wide."
      />

      {decisionMessage ? (
        <p className={`text-sm ${decisionMessage.tone === "ok" ? "text-emerald-600" : "text-rose-600"}`}>{decisionMessage.text}</p>
      ) : null}

      <OverviewGate
        isLoading={isLoading}
        error={error}
        isEmpty={approvals.length === 0 && reports.length === 0}
        icon={FileText}
        emptyTitle="No pending approvals"
        emptyText="You are all caught up. Once fund requests, utilization certificates, or reports are raised in a project workspace, they show up here."
      >
        {approvals.length ? (
          <section className="grid min-w-0 items-start gap-5 lg:grid-cols-[1fr_1fr]">
            <Card>
              <SectionHeading icon={FileText} title="Approval Queue" text="Every approval record across your signed projects." />
              <div className="space-y-3">
                {approvals.map((approval) => (
                  <button
                    className={`w-full rounded-lg border p-4 text-left ${
                      selectedApproval?.id === approval.id ? "border-blue-300 bg-blue-50" : "border-slate-100 bg-white hover:border-blue-200"
                    }`}
                    key={approval.id}
                    onClick={() => setSelectedApprovalId(approval.id)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-slate-900">{titleCase(approval.itemType)}</p>
                      <StatusBadge value={titleCase(approval.status)} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {approval.projectTitle} - {approval.ngoName ?? "No partner"} - {formatDate(approval.createdAt)}
                    </p>
                  </button>
                ))}
              </div>
            </Card>

            <Card>
              {selectedApproval ? (
                <>
                  <div className="border-b border-slate-100 pb-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h2 className="text-xl font-bold text-slate-900">{titleCase(selectedApproval.itemType)}</h2>
                        <p className="mt-1 text-sm text-slate-500">
                          Raised {formatDate(selectedApproval.createdAt)} on {selectedApproval.projectTitle}
                        </p>
                      </div>
                      <StatusBadge value={titleCase(selectedApproval.status)} />
                    </div>
                  </div>

                  <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2">
                    <MiniStat label="Linked Project" value={selectedApproval.projectTitle} />
                    <MiniStat label="Linked NGO" value={selectedApproval.ngoName ?? "Not linked"} />
                    <MiniStat label="Reference" value={selectedApproval.itemRef ?? "No reference"} />
                    <MiniStat label="Project Budget" value={formatINR(linkedProject?.totals.projectBudget ?? 0)} />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <ActionButton icon={CheckCircle2} onClick={() => decide(selectedApproval.id, "approved")}>
                      {decidingId === selectedApproval.id ? "Saving…" : "Approve"}
                    </ActionButton>
                    <GhostButton icon={AlertCircle} onClick={() => decide(selectedApproval.id, "revision_requested")}>
                      Request Revision
                    </GhostButton>
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100"
                      onClick={() => decide(selectedApproval.id, "rejected")}
                      type="button"
                    >
                      Reject
                    </button>
                    <GhostButton icon={Eye} onClick={() => navigateTo("Campaign Management", { campaignId: selectedApproval.projectId })}>
                      View Project
                    </GhostButton>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500">No approval selected.</p>
              )}
            </Card>
          </section>
        ) : (
          <Card>
            <SectionHeading icon={FileText} title="Approval Queue" text="Nothing awaiting your decision." />
            <p className="text-sm text-slate-400">No approvals have been raised on your signed projects yet.</p>
          </Card>
        )}

        <Card className="mt-6">
          <SectionHeading icon={FileCheck2} title="Reports Center" text="Reports submitted into your signed project workspaces." />
          {reports.length === 0 ? (
            <p className="text-sm text-slate-400">No reports submitted yet.</p>
          ) : (
            <SimpleTable
              headers={["Report", "Type", "Project", "NGO", "Added"]}
              rows={reports.map((report) => [
                report.title,
                titleCase(report.reportType),
                report.projectTitle,
                report.ngoName ?? "-",
                formatDate(report.createdAt),
              ])}
            />
          )}
        </Card>
      </OverviewGate>
    </div>
  );
}

/**
 * There is no AI insight generator on this platform, and no table backing one.
 * Rather than print invented "AI" prose, this page surfaces the signals that
 * ARE genuinely computed: the NGO matching engine's scores and its own
 * component explanations (ngo_match_scores / scoring_runs), plus the real
 * budget and approval pace of the signed portfolio.
 */
function AiInsightsPage({
  navigateTo,
}: {
  navigateTo: (destination: Destination, focus?: { campaignId?: string; ngoId?: string }) => void;
}) {
  const { data, isLoading, error } = useWorkspaceOverview();

  const matches = data?.matching.topMatches ?? [];
  const runs = data?.matching.runs ?? [];
  const totals = data?.totals;
  const hasAnything = (data?.projects.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Matching & scoring signals"
        title="Computed match scores, capacity gates, and portfolio pace"
        text="These are the platform's real, already-computed signals — the NGO matching engine's scores with its own reasoning, and live budget and approval pace. No generated commentary."
      />

      <OverviewGate
        isLoading={isLoading}
        error={error}
        isEmpty={!hasAnything}
        icon={Bot}
        emptyTitle="No signals yet"
        emptyText="Signals appear once you have a signed project. The matching engine's scores are computed when a posted project is scored for NGO recommendations."
      >
        <Card>
          <SectionHeading icon={TrendingUp} title="Portfolio Pace" text="Straight arithmetic over your signed projects — not a forecast." />
          <div className="grid min-w-0 gap-4 md:grid-cols-4">
            <MetricCard
              label="Budget Allocated"
              value={`${totals?.allocationRate ?? 0}%`}
              meta={`${formatINR(totals?.budgeted ?? 0)} of ${formatINR(totals?.projectBudget ?? 0)}`}
              tone="blue"
            />
            <MetricCard
              label="Allocation Utilized"
              value={`${totals?.utilizationRate ?? 0}%`}
              meta={`${formatINR(totals?.spent ?? 0)} spent`}
              tone="violet"
            />
            <MetricCard
              label="Funds Released"
              value={`${totals?.releaseRate ?? 0}%`}
              meta={`${formatINR(totals?.released ?? 0)} released`}
              tone="green"
            />
            <MetricCard
              label="Approvals Pending"
              value={String(totals?.pendingApprovals ?? 0)}
              meta={`${totals?.openAudits ?? 0} open audit(s)`}
              tone={(totals?.pendingApprovals ?? 0) > 0 ? "amber" : "green"}
            />
          </div>
        </Card>

        <Card className="mt-6">
          <SectionHeading
            icon={Bot}
            title="NGO Match Scores"
            text="Computed by the matching engine for your projects. Each card shows the engine's own component reasoning."
          />
          {matches.length === 0 ? (
            <p className="text-sm text-slate-400">
              No match scores computed for your signed projects yet. Scores are generated when a posted project is run through NGO
              recommendation scoring.
            </p>
          ) : (
            <section className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {matches.slice(0, 8).map((match) => (
                <button
                  className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-violet-200 hover:shadow-md"
                  key={match.id}
                  onClick={() => navigateTo("NGO Management", { ngoId: match.ngoId })}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-violet-50 text-violet-600">
                      <Bot className="h-5 w-5" />
                    </div>
                    <StatusBadge value={match.capacityGatePassed ? "Gate passed" : "Gate failed"} />
                  </div>
                  <p className="mt-4 font-semibold text-slate-900 break-words">{match.ngoName}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {match.projectTitle} - trust {match.ngoTrustScore}/100
                  </p>
                  <div className="mt-3 space-y-2">
                    <MetricLine label="Match score" value={Math.min(100, match.matchScore)} />
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-slate-500">
                    <p>
                      <span className="font-semibold text-slate-700">Sector {match.sectorFit}:</span> {match.breakdown.sectorFit ?? "-"}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-700">Location {match.locationFit}:</span> {match.breakdown.locationFit ?? "-"}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-700">Capacity {match.capacityFit}:</span> {match.breakdown.capacityFit ?? "-"}
                    </p>
                  </div>
                  <p className="mt-4 text-xs font-semibold text-blue-600">Open NGO profile</p>
                </button>
              ))}
            </section>
          )}
        </Card>

        <Card className="mt-6">
          <SectionHeading icon={Activity} title="Scoring Runs" text="When the matching engine last ran on your projects, and how wide the candidate pool was." />
          {runs.length === 0 ? (
            <p className="text-sm text-slate-400">No scoring runs recorded for your signed projects.</p>
          ) : (
            <SimpleTable
              headers={["Project", "Run at", "Version", "Candidate pool", "Excluded by capacity gate", "Admin action"]}
              rows={runs.map((run) => [
                run.projectTitle,
                formatDate(run.triggeredAt),
                run.scoringVersion ?? "-",
                String(run.candidatePoolSize),
                String(run.capacityGateExcludedCount),
                titleCase(run.adminAction ?? "-"),
              ])}
            />
          )}
        </Card>

        <Card className="mt-6">
          <SectionHeading icon={Sparkles} title="Predictive Insights" text="Status of automated risk and forecast generation." />
          <p className="text-sm text-slate-500">
            Automated risk alerts, anomaly detection, and ESG forecasting are not yet available — no insight generation engine is built on
            this platform. Rather than display estimated numbers, this page shows only computed and recorded values. The signals above will
            be extended here when that engine ships.
          </p>
        </Card>
      </OverviewGate>
    </div>
  );
}

function AuditCompliancePage({
  navigateTo,
}: {
  navigateTo: (destination: Destination, focus?: { campaignId?: string; ngoId?: string }) => void;
}) {
  const { data, isLoading, error } = useWorkspaceOverview();

  const audits = data?.audits ?? [];
  const activity = data?.activity ?? [];
  const partners = data?.ngos ?? [];
  const totals = data?.totals;
  const openAudits = audits.filter((audit) => audit.status !== "closed" && audit.status !== "completed");
  const missingDocs = partners.reduce((sum, ngo) => sum + (ngo.documentsTotal - ngo.documentsOnFile), 0);
  const totalDocs = partners.reduce((sum, ngo) => sum + ngo.documentsTotal, 0);

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Audit & compliance"
        title="Audit records, partner document status, and the immutable action trail"
        text="Audits come from your project workspaces; the action trail is the platform's activity log for those projects."
      />

      <OverviewGate
        isLoading={isLoading}
        error={error}
        isEmpty={(data?.projects.length ?? 0) === 0}
        icon={ShieldCheck}
        emptyTitle="No compliance data yet"
        emptyText="Audit records and the action trail appear once a project is signed and its workspace starts recording activity."
      >
        <section className="grid min-w-0 gap-4 md:grid-cols-4">
          <MetricCard label="Open Audits" value={String(openAudits.length)} meta={`${audits.length} recorded in total`} tone="amber" />
          <MetricCard label="Logged Actions" value={String(activity.length)} meta="Most recent workspace actions" tone="blue" />
          <MetricCard
            label="Missing Documents"
            value={String(missingDocs)}
            meta={`Across ${partners.length} partner(s)`}
            tone={missingDocs > 0 ? "red" : "green"}
          />
          <MetricCard
            label="Document Completeness"
            value={`${totalDocs > 0 ? Math.round(((totalDocs - missingDocs) / totalDocs) * 100) : 0}%`}
            meta={`${totals?.pendingApprovals ?? 0} approval(s) pending`}
            tone="green"
          />
        </section>

        <section className="mt-6 grid min-w-0 items-start gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <SectionHeading icon={AlertCircle} title="Audit Register" text="Audit records raised inside your signed project workspaces." />
            {audits.length === 0 ? (
              <p className="text-sm text-slate-400">No audits recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {audits.map((audit) => (
                  <button
                    className="w-full rounded-lg border border-slate-100 bg-slate-50 p-3 text-left hover:border-blue-200 hover:bg-blue-50"
                    key={audit.id}
                    onClick={() => navigateTo("Campaign Management", { campaignId: audit.projectId })}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">{titleCase(audit.auditType)}</p>
                      <StatusBadge value={titleCase(audit.status)} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {audit.projectTitle} - {formatDate(audit.auditDate ?? audit.createdAt)}
                    </p>
                    {audit.findings ? <p className="mt-1 text-xs text-slate-600">{audit.findings}</p> : null}
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <SectionHeading icon={Activity} title="Immutable Action Trail" text="Workspace actions recorded in the platform activity log." />
            {activity.length === 0 ? (
              <p className="text-sm text-slate-400">No workspace actions logged yet.</p>
            ) : (
              <SimpleTable
                headers={["Action", "Module", "Actor", "Project", "Time"]}
                rows={activity.map((log) => [
                  titleCase(log.action),
                  titleCase(log.module),
                  titleCase(log.actorType),
                  log.projectTitle,
                  formatDate(log.createdAt),
                ])}
              />
            )}
          </Card>
        </section>

        <AiTaskStreamPanel
          title="AI partner compliance brief"
          description="Streaming summary across your partner NGOs — document completeness, open audits, and due-diligence priorities."
          task="compliance_summary"
          portal="corporate"
          section="Audit & Compliance"
          buttonLabel="Summarize compliance posture"
          testId="corporate-ai-compliance-btn"
          payload={{
            openAudits: openAudits.map((a) => ({
              type: a.auditType,
              status: a.status,
              project: a.projectTitle,
              findings: a.findings,
            })),
            partners: partners.map((ngo) => ({
              name: ngo.name,
              trustScore: ngo.trustScore,
              documentsOnFile: ngo.documentsOnFile,
              documentsTotal: ngo.documentsTotal,
              missing: ngo.documents.filter((d) => d.status === "missing" || d.status === "pending").map((d) => d.name),
            })),
            missingDocumentsCount: missingDocs,
            documentCompletenessPct: totalDocs > 0 ? Math.round(((totalDocs - missingDocs) / totalDocs) * 100) : 0,
          }}
        />

        <Card className="mt-6">
          <SectionHeading icon={ShieldCheck} title="Compliance Checklist" text="Registration and statutory documents held on file for each partner NGO." />
          {partners.length === 0 ? (
            <p className="text-sm text-slate-400">No partner NGOs yet.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {partners.flatMap((ngo) =>
                ngo.documents.map((document) => (
                  <div className="rounded-lg border border-slate-100 bg-white p-3" key={`${ngo.id}-${document.name}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">{document.name}</p>
                      <StatusBadge value={document.status} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{ngo.name}</p>
                  </div>
                )),
              )}
            </div>
          )}
        </Card>
      </OverviewGate>
    </div>
  );
}

function NotificationsPage({
  navigateTo,
}: {
  navigateTo: (destination: Destination, focus?: { campaignId?: string; ngoId?: string; approvalId?: string }) => void;
}) {
  const { data, isLoading, error } = useWorkspaceOverview();
  const pending = (data?.approvals ?? []).filter((a) => a.status === "pending");
  const activity = data?.activity ?? [];

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Notifications"
        title="Workflow queue from live project data"
        text="Pending approvals and recent workspace activity — no placeholder notification feed."
      />

      <OverviewGate isLoading={isLoading} error={error} isEmpty={pending.length === 0 && activity.length === 0} icon={Bell} emptyTitle="No pending workflow items" emptyText="When approvals are raised or workspace modules change, they appear here.">
      <Card>
        <SectionHeading icon={Bell} title="Pending approvals" text="Open the approval workflow for the related project." />
        <div className="space-y-3">
          {pending.map((approval) => (
            <button
              className="w-full rounded-lg border border-blue-200 bg-blue-50 p-4 text-left transition hover:border-blue-300"
              key={approval.id}
              onClick={() => {
                navigateTo("Reports & Approvals", {
                  campaignId: approval.projectId,
                  ngoId: approval.ngoId ?? undefined,
                  approvalId: approval.id,
                });
              }}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-slate-900">{approval.itemType}</p>
                <RiskBadge value="High" />
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {approval.projectTitle}
                {approval.itemRef ? ` — ${approval.itemRef}` : ""}
              </p>
            </button>
          ))}
        </div>
      </Card>

      <Card className="mt-6">
        <SectionHeading icon={Activity} title="Recent activity" text="Immutable workspace log entries." />
        <div className="space-y-3">
          {activity.slice(0, 12).map((log) => (
            <div key={log.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-900">{titleCase(log.action)}</p>
              <p className="mt-1 text-sm text-slate-600">{log.projectTitle} · {log.module}</p>
              <p className="mt-2 text-xs text-slate-400">{formatDate(log.createdAt)}</p>
            </div>
          ))}
        </div>
      </Card>
      </OverviewGate>
    </div>
  );
}

function RolePermissions({
  canManageEmployees,
  employees,
  onCreateEmployee,
}: {
  canManageEmployees: boolean;
  employees: RoleAccess[];
  onCreateEmployee: (draft: RoleDraft) => Promise<{
    employee?: RoleAccess;
    error?: string;
  }>;
}) {
  const [isRoleFormOpen, setIsRoleFormOpen] = useState(false);
  const [roleDraft, setRoleDraft] = useState<RoleDraft>({
    name: "",
    email: "",
    position: "",
    password: "",
    pages: ["Dashboard"],
  });
  const [formError, setFormError] = useState("");
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);

  function toggleDraftPage(page: string) {
    setRoleDraft((current) => {
      const pages = current.pages.includes(page)
        ? current.pages.filter((item) => item !== page)
        : [...current.pages, page];

      return { ...current, pages: pages.length ? pages : ["Dashboard"] };
    });
  }

  async function submitRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    const name = roleDraft.name.trim();
    const email = roleDraft.email.trim();
    const position = roleDraft.position.trim();

    if (!name || !email || !position || !roleDraft.password) {
      setFormError("Name, email, position, and password are required.");
      return;
    }

    setIsSavingEmployee(true);
    const result = await onCreateEmployee({ ...roleDraft, name, email, position });
    setIsSavingEmployee(false);

    if (result.error) {
      setFormError(result.error);
      return;
    }

    setRoleDraft({ name: "", email: "", position: "", password: "", pages: ["Dashboard"] });
    setIsRoleFormOpen(false);
  }

  const roleExamples = [
    ["CSR Head", "Approves campaigns and final reports", "Campaign + Report approvals"],
    ["Finance Manager", "Approves budget allocations and fund releases", "Budget + Fund Tracking"],
    ["Compliance Officer", "Verifies NGO documents and UCs", "Audit + Compliance"],
    ["ESG Officer", "Verifies outcome metrics and ESG reports", "ESG + Reports"],
    ["Field Auditor", "Checks evidence, beneficiaries, and milestones", "Campaign + Evidence"],
  ];

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Employees & access"
        title="Role-based workflow ownership"
        text="Employee access is preserved, with examples that show how people map to CSR operations."
        actions={
          canManageEmployees ? (
            <ActionButton icon={Plus} onClick={() => setIsRoleFormOpen((current) => !current)}>
              Add Employee
            </ActionButton>
          ) : undefined
        }
      />

      {isRoleFormOpen && canManageEmployees ? (
        <Card>
          <form className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]" onSubmit={submitRole}>
            <div className="space-y-4">
              <TextField label="User Name" value={roleDraft.name} onChange={(value) => setRoleDraft((current) => ({ ...current, name: value }))} />
              <TextField label="Email" type="email" value={roleDraft.email} onChange={(value) => setRoleDraft((current) => ({ ...current, email: value }))} />
              <TextField label="Position" value={roleDraft.position} onChange={(value) => setRoleDraft((current) => ({ ...current, position: value }))} />
              <TextField label="Temporary Password" type="password" value={roleDraft.password} onChange={(value) => setRoleDraft((current) => ({ ...current, password: value }))} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Allowed Pages</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {roleAccessPages.map((page) => (
                  <label
                    className={`flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium ${roleDraft.pages.includes(page)
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-700"
                      }`}
                    key={page}
                  >
                    <input
                      checked={roleDraft.pages.includes(page)}
                      className="h-4 w-4 accent-blue-600"
                      onChange={() => toggleDraftPage(page)}
                      type="checkbox"
                    />
                    {page}
                  </label>
                ))}
              </div>
              {formError ? (
                <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  {formError}
                </p>
              ) : null}
              <div className="mt-4 flex justify-end gap-3">
                <GhostButton onClick={() => setIsRoleFormOpen(false)}>Cancel</GhostButton>
                <ActionButton disabled={isSavingEmployee} type="submit">
                  {isSavingEmployee ? "Saving..." : "Create Login"}
                </ActionButton>
              </div>
            </div>
          </form>
        </Card>
      ) : null}

      <section className="grid min-w-0 items-start gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <SectionHeading icon={Users} title="Employee Directory" text="Real employee access from the existing backend API." />
          <SimpleTable
            headers={["Employee", "Email", "Position", "Pages", "Status"]}
            rows={
              employees.length
                ? employees.map((employee) => [
                  employee.name,
                  employee.email,
                  employee.position,
                  `${employee.pages.length} pages`,
                  employee.isActive === false ? "Suspended" : "Active",
                ])
                : [["No employee logins yet", "Add an employee to create backend access", "-", "-", "-"]]
            }
          />
        </Card>
        <div className="space-y-6">
          <Card>
            <SectionHeading icon={Workflow} title="Role Workflow Map" text="Who owns what in the connected CSR operating model." />
            <div className="space-y-3">
              {roleExamples.map(([role, responsibility, pages]) => (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3" key={role}>
                  <p className="font-semibold text-slate-900">{role}</p>
                  <p className="mt-1 text-sm text-slate-600">{responsibility}</p>
                  <p className="mt-1 text-xs font-semibold text-blue-600">{pages}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionHeading icon={Lock} title="Seeded Employee Logins" text="Demo credentials for the separate 'Corporate Giant' test org — not employees of this corporate account." />
            <div className="space-y-3">
              {[
                { name: "Ananya Sharma", position: "CSR Manager", email: "ananya.sharma@corporate-giant.example", password: "Employee@2026" },
                { name: "Rohan Mehta", position: "Finance Manager", email: "rohan.mehta@corporate-giant.example", password: "Employee@2026" },
                { name: "Priya Nair", position: "Compliance Officer", email: "priya.nair@corporate-giant.example", password: "Employee@2026" },
                { name: "Kabir Khan", position: "NGO Manager", email: "kabir.khan@corporate-giant.example", password: "Employee@2026" },
                { name: "Sara Iyer", position: "ESG Officer", email: "sara.iyer@corporate-giant.example", password: "Employee@2026" },
              ].map((emp) => (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs" key={emp.email}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{emp.name}</p>
                      <p className="text-slate-500 font-medium">{emp.position}</p>
                    </div>
                    <span className="rounded bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">Seeded</span>
                  </div>
                  <div className="mt-2.5 space-y-1 font-mono text-slate-600">
                    <p><span className="font-semibold text-slate-500">Email:</span> {emp.email}</p>
                    <p><span className="font-semibold text-slate-500">Password:</span> {emp.password}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}

function ChatPanel({
  errorMessage,
  isSending,
  messageBody,
  messages,
  onMessageBodyChange,
  onSendMessage,
  unlocked,
}: {
  errorMessage: string;
  isSending: boolean;
  messageBody: string;
  messages: Message[];
  onMessageBodyChange: (value: string) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  unlocked: boolean;
}) {
  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Support / Chat"
        title={unlocked ? "Workspace support is available" : "Chat with admin to unlock dashboard"}
        text="Support can reference specific campaigns, approvals, fund releases, NGO documents, and compliance issues."
      />

      <section className="grid min-w-0 items-start gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <div className="flex min-h-[420px] flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4">
              {messages.length ? (
                messages.map((message) => (
                  <div
                    className={`max-w-[82%] rounded-lg p-3 text-sm ${message.sender_type === "corporate"
                        ? "ml-auto bg-blue-600 text-white"
                        : "bg-white text-slate-700 shadow-sm"
                      }`}
                    key={message.id}
                  >
                    {message.body}
                  </div>
                ))
              ) : (
                <div className="grid h-full place-items-center text-center text-sm text-slate-500">
                  <div>
                    <MessageCircle className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 font-medium">No messages yet.</p>
                    <p>Ask for access or reference a specific CSR workflow.</p>
                  </div>
                </div>
              )}
            </div>
            <form className="mt-4 flex gap-3" onSubmit={onSendMessage}>
              <textarea
                className="min-h-20 flex-1 resize-none rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none focus:border-blue-400"
                onChange={(event) => onMessageBodyChange(event.target.value)}
                placeholder="Example: Please unlock the workspace and review the healthcare fund release issue."
                value={messageBody}
              />
              <button
                className="h-20 rounded-md bg-blue-600 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!messageBody.trim() || isSending}
                type="submit"
              >
                {isSending ? "Sending..." : "Send"}
              </button>
            </form>
            {errorMessage ? <p className="mt-3 text-sm font-medium text-red-600">{errorMessage}</p> : null}
          </div>
        </Card>

        <Card>
          <SectionHeading
            icon={MessageCircle}
            title="Workflow context"
            text="Reference a project by name in your message. Pending approvals and audit items live under Reports & Approvals and Audit & Compliance."
          />
          <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            No separate support-ticket feed is stored here. Use Notifications for pending approvals from live workspace data.
          </p>
        </Card>
      </section>
    </div>
  );
}


function PageHero({
  actions,
  eyebrow,
  text,
  title,
}: {
  actions?: React.ReactNode;
  eyebrow: string;
  text: string;
  title: string;
}) {
  return (
    <section className="flex min-w-0 flex-col justify-between gap-4 rounded-xl border border-slate-200/80 bg-white px-5 py-4 shadow-sm lg:flex-row lg:items-center">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-500">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl tracking-tight">{title}</h2>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-500">{text}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

function SectionHeading({
  icon: Icon,
  text,
  title,
}: {
  icon: React.ElementType;
  text: string;
  title: string;
}) {
  return (
    <div className="mb-4 min-w-0">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 sm:text-[15px]">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50">
          <Icon className="h-3.5 w-3.5 text-blue-500" />
        </span>
        {title}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-400 ml-8">{text}</p>
    </div>
  );
}

function MetricCard({
  label,
  meta,
  tone,
  value,
}: {
  label: string;
  meta: string;
  tone: Tone;
  value: string;
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    green: "bg-emerald-50 text-emerald-600 border-emerald-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    red: "bg-red-50 text-red-600 border-red-100",
    violet: "bg-violet-50 text-violet-600 border-violet-100",
    slate: "bg-slate-100 text-slate-600 border-slate-200",
  }[tone];

  const iconBg = {
    blue: "bg-blue-500",
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    violet: "bg-violet-500",
    slate: "bg-slate-400",
  }[tone];

  return (
    <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500 tracking-tight">{label}</p>
      <p className="mt-2 break-words text-xl font-bold text-slate-900 sm:text-2xl tracking-tight">{value}</p>
      <div className={`mt-3 inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${toneClass}`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${iconBg}`} />
        <span className="truncate">{meta}</span>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1.5 break-words text-sm font-semibold text-slate-800 leading-snug">{value}</p>
    </div>
  );
}

function ActionButton({
  children,
  disabled,
  icon: Icon,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  icon?: React.ElementType;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  );
}

function GhostButton({
  children,
  icon: Icon,
  onClick,
}: {
  children: React.ReactNode;
  icon?: React.ElementType;
  onClick?: () => void;
}) {
  return (
    <button
      className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98]"
      onClick={onClick}
      type="button"
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  );
}

function FilterBar({
  filters,
  activeFilters,
  onFilterChange,
  filterOptions,
}: {
  filters: { key: string; label: string }[];
  activeFilters: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
  filterOptions: Record<string, string[]>;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenKey(null);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <Card>
      <div className="flex min-w-0 flex-wrap gap-2" ref={ref}>
        <div className="flex h-9 items-center gap-2 rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-600">
          <Filter className="h-3.5 w-3.5" />
          Filters
        </div>
        {filters.map((f) => {
          const isActive = activeFilters[f.key] !== f.label;
          const isOpen = openKey === f.key;
          const options = filterOptions[f.key] ?? [];
          return (
            <div key={f.key} className="relative">
              <button
                type="button"
                onClick={() => setOpenKey(isOpen ? null : f.key)}
                className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition ${isActive
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                  }`}
              >
                {activeFilters[f.key]}
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""} ${isActive ? "text-blue-400" : "text-slate-400"
                  }`} />
              </button>
              {isOpen && (
                <div className="absolute left-0 top-10 z-50 min-w-[160px] rounded-xl border border-slate-200 bg-white shadow-xl">
                  {options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => { onFilterChange(f.key, opt); setOpenKey(null); }}
                      className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition first:rounded-t-xl last:rounded-b-xl ${activeFilters[f.key] === opt
                          ? "bg-blue-50 font-semibold text-blue-700"
                          : "text-slate-700 hover:bg-slate-50"
                        }`}
                    >
                      {activeFilters[f.key] === opt && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {Object.values(activeFilters).some((v, i) => v !== Object.values(filterOptions).map(opts => opts[0])[i]) && (
          <button
            type="button"
            onClick={() => filters.forEach(f => onFilterChange(f.key, filterOptions[f.key][0]))}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-600 transition hover:bg-red-100"
          >
            Clear filters ✕
          </button>
        )}
      </div>
    </Card>
  );
}

function Progress({ value }: { value: number }) {
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

function MetricLine({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-slate-900">{value}%</span>
      </div>
      <Progress value={value} />
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  const tone =
    value === "Approved" ||
      value === "Verified" ||
      value === "Valid" ||
      value === "Complete" ||
      value === "Active" ||
      value === "Completed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : value === "Pending" ||
        value === "Submitted" ||
        value === "Review" ||
        value === "Under Review" ||
        value === "Expiring" ||
        value === "Needs Renewal" ||
        value === "In Progress"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : value === "Rejected" ||
          value === "Flagged" ||
          value === "Delayed" ||
          value === "Missing"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-slate-200 bg-slate-100 text-slate-600";

  return (
    <span className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold leading-5 ${tone}`}>
      {value}
    </span>
  );
}

function RiskBadge({ value }: { value: string }) {
  const tone =
    value === "Critical" || value === "High"
      ? "border-red-200 bg-red-50 text-red-700"
      : value === "Medium" || value === "Normal"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <span className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold leading-5 ${tone}`}>
      {value}
    </span>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-sm">
      <table className="w-full min-w-[560px] table-auto border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {headers.map((header) => (
              <th
                className="px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap"
                key={header}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr className="transition-colors hover:bg-slate-50/80" key={`${row[0]}-${index}`}>
              {row.map((cell, cellIndex) => (
                <td
                  className={`px-3.5 py-3 align-top leading-relaxed ${cellIndex === 0
                      ? "font-semibold text-slate-800 max-w-[200px]"
                      : "text-slate-600 max-w-[200px]"
                    }`}
                  key={`${cell}-${cellIndex}`}
                >
                  <span className="block break-words">{cell}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TextField({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</span>
      <input
        className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        onChange={(event) => onChange(event.target.value)}
        required
        type={type}
        value={value}
      />
    </label>
  );
}

function PostCsrProjectPage({
  corporate,
  onPosted,
}: {
  corporate: Corporate;
  onPosted: (opp: CsrOpportunity) => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [selectedSdgs, setSelectedSdgs] = useState<string[]>([]);
  const [selectedBeneficiaries, setSelectedBeneficiaries] = useState<string[]>([]);

  const inputCls =
    "h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const areaCls =
    "rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-y min-h-28";
  const selectCls =
    "h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-blue-500";

  function toggleChip(arr: string[], setArr: (x: string[]) => void, val: string) {
    if (arr.includes(val)) setArr(arr.filter((v) => v !== val));
    else setArr([...arr, val]);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    const fd = new FormData(e.currentTarget);
    const budget = parseFloat(String(fd.get("budget") || "0"));

    if (!budget || budget <= 0) {
      setError("Please enter a valid budget amount.");
      setIsSubmitting(false);
      return;
    }

    try {
      const session = await supabaseBrowser.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Not authenticated.");

      const body = {
        title: String(fd.get("title") || "").trim(),
        focus_area: String(fd.get("focus_area") || "").trim(),
        state: String(fd.get("state") || "").trim() || null,
        district: String(fd.get("district") || "").trim() || null,
        budget,
        description: String(fd.get("description") || "").trim() || null,
        expected_start_date: String(fd.get("expected_start_date") || "").trim() || null,
        duration_months: fd.get("duration_months") ? parseInt(String(fd.get("duration_months"))) : null,
        min_trust_score: fd.get("min_trust_score") ? parseInt(String(fd.get("min_trust_score"))) : 0,
        sdg_targets: selectedSdgs,
        target_beneficiaries: selectedBeneficiaries,
      };

      const res = await fetch("/api/corporates/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to post project.");

      onPosted(data.opportunity as CsrOpportunity);
    } catch (err: unknown) {
      setError(errorMessageFrom(err, "Failed to post project."));
    } finally {
      setIsSubmitting(false);
    }
  }

  const sdgOptions = [
    "No Poverty", "Zero Hunger", "Good Health and Well-being", "Quality Education",
    "Gender Equality", "Clean Water and Sanitation", "Affordable and Clean Energy",
    "Decent Work and Economic Growth", "Industry Innovation and Infrastructure",
    "Reduced Inequalities", "Sustainable Cities", "Climate Action",
    "Life Below Water", "Life on Land", "Peace and Justice",
  ];

  const beneficiaryOptions = [
    "Children", "Women", "Farmers", "Tribal Communities", "Rural Households",
    "Persons with Disabilities", "Senior Citizens", "Youth", "Self-Help Groups",
    "School Students", "Healthcare Workers", "Artisans",
  ];

  const focusAreas = [
    "Education", "Healthcare", "Environment", "Women Empowerment",
    "Rural Development", "Skill Development", "Child Welfare", "Animal Welfare",
    "Disaster Relief", "Food & Nutrition", "Sanitation", "Water Conservation",
    "Climate Action", "Employment Generation", "Digital Literacy",
  ];

  const indianStates = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
    "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
    "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
    "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
    "Delhi", "Jammu & Kashmir", "Ladakh", "Pan India",
  ];

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Post a CSR Project"
        title="Define Your CSR Initiative"
        text={`Fill in the project details for ${corporate.company_name}. Once posted, NGOs registered on the platform will see your project in their Opportunities section.`}
        actions={null}
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <form className="space-y-6" onSubmit={handleSubmit}>
        {/* Core Details */}
        <Card>
          <SectionHeading icon={FileText} title="Project Basics" text="Required information for the project listing." />
          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                Project Title <span className="text-red-500">*</span>
                <input className={inputCls} name="title" required placeholder="e.g. Rural Digital Education Mission in Bihar" />
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
              Focus Area / Sector <span className="text-red-500">*</span>
              <select className={selectCls} name="focus_area" required>
                <option value="">Select a sector</option>
                {focusAreas.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
              CSR Budget (INR) <span className="text-red-500">*</span>
              <input className={inputCls} name="budget" type="number" min="100000" step="50000" required placeholder="e.g. 5000000" />
              <span className="text-xs text-slate-400">Enter amount in full rupees. e.g. 5000000 = Rs 50L</span>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
              Target State
              <select className={selectCls} name="state">
                <option value="">Select state or Pan India</option>
                {indianStates.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
              District / Location
              <input className={inputCls} name="district" placeholder="e.g. Gaya, Nalanda, or Multiple Districts" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
              Expected Start Date
              <input className={inputCls} name="expected_start_date" type="date" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
              Duration (months)
              <input className={inputCls} name="duration_months" type="number" min="1" max="60" placeholder="e.g. 12" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
              Minimum NGO Trust Score Required
              <input className={inputCls} name="min_trust_score" type="number" min="0" max="100" defaultValue="0" placeholder="0 = Any NGO accepted" />
            </label>
            <div className="md:col-span-2">
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                Project Description <span className="text-red-500">*</span>
                <textarea className={areaCls} name="description" required placeholder="Describe the problem you want to solve, the activities planned, expected outcomes, and how you will measure success..." />
              </label>
            </div>
          </div>
        </Card>

        {/* SDG Targets */}
        <Card>
          <SectionHeading icon={ShieldCheck} title="Sustainable Development Goals (SDGs)" text="Select the UN SDGs this project aligns with. Click to toggle." />
          <div className="flex flex-wrap gap-2">
            {sdgOptions.map((sdg) => {
              const active = selectedSdgs.includes(sdg);
              return (
                <button
                  type="button"
                  key={sdg}
                  onClick={() => toggleChip(selectedSdgs, setSelectedSdgs, sdg)}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition border ${active ? "bg-blue-700 border-blue-700 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700"
                    }`}
                >
                  {sdg}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Target Beneficiaries */}
        <Card>
          <SectionHeading icon={Users} title="Target Beneficiaries" text="Who will directly benefit from this project? Click to toggle." />
          <div className="flex flex-wrap gap-2">
            {beneficiaryOptions.map((b) => {
              const active = selectedBeneficiaries.includes(b);
              return (
                <button
                  type="button"
                  key={b}
                  onClick={() => toggleChip(selectedBeneficiaries, setSelectedBeneficiaries, b)}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition border ${active ? "bg-violet-700 border-violet-700 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700"
                    }`}
                >
                  {b}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <p className="text-xs text-slate-400">
            This project will be listed as <strong>Open</strong> and visible to all NGOs immediately after posting.
          </p>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-xl bg-blue-700 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-50"
          >
            <PlusCircle className="h-4 w-4" />
            {isSubmitting ? "Posting..." : "Post CSR Project"}
          </button>
        </div>
      </form>
    </div>
  );
}

function formatINR(value: number | null | undefined) {
  if (value == null || isNaN(value)) return "Rs 25L";  // fallback for pre-migration rows
  if (value >= 10000000) {
    return `Rs ${(value / 10000000).toFixed(1)} Cr`;
  }

  if (value >= 100000) {
    return `Rs ${(value / 100000).toFixed(1)}L`;
  }

  return `Rs ${value.toLocaleString("en-IN")}`;
}

function CorporateProfilePage({
  corporate,
  onUpdate,
}: {
  corporate: Corporate;
  onUpdate: (updated: Partial<Corporate>) => void;
}) {
  const [activeTab, setActiveTab] = useState<"basic" | "csr" | "compliance" | "account">("basic");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const rd = corporate.registration_data ?? {};

  // Local Form state
  const [companyName, setCompanyName] = useState(corporate.company_name);
  const [companyEmail, setCompanyEmail] = useState(corporate.company_email);
  const [contactNumber, setContactNumber] = useState(rd.contactNumber || "");
  const [websiteUrl, setWebsiteUrl] = useState(rd.websiteUrl || "");
  const [industryType, setIndustryType] = useState(rd.industryType || "");
  const [companySize, setCompanySize] = useState(rd.companySize || "");
  const [annualTurnover, setAnnualTurnover] = useState(rd.annualTurnover || "");
  const [headquartersAddress, setHeadquartersAddress] = useState(rd.headquartersAddress || "");

  const [csrVisionMission, setCsrVisionMission] = useState(rd.csrVisionMission || "");
  const [csrFocusAreas, setCsrFocusAreas] = useState<string[]>(
    Array.isArray(rd.csrFocusAreas)
      ? rd.csrFocusAreas
      : typeof rd.csrFocusAreas === "string"
        ? [rd.csrFocusAreas]
        : []
  );
  const [preferredSdgs, setPreferredSdgs] = useState<string[]>(
    Array.isArray(rd.preferredSdgs)
      ? rd.preferredSdgs
      : typeof rd.preferredSdgs === "string"
        ? [rd.preferredSdgs]
        : []
  );
  const [preferredLocations, setPreferredLocations] = useState<string[]>(
    Array.isArray(rd.preferredLocations)
      ? rd.preferredLocations
      : typeof rd.preferredLocations === "string"
        ? [rd.preferredLocations]
        : []
  );
  const [csrBudgetCapacity, setCsrBudgetCapacity] = useState(rd.csrBudgetCapacity || "");

  const [cinNumber, setCinNumber] = useState(rd.cinNumber || "");
  const [gstNumber, setGstNumber] = useState(rd.gstNumber || "");
  const [panNumber, setPanNumber] = useState(rd.panNumber || "");
  const [csrRegistrationNumber, setCsrRegistrationNumber] = useState(rd.csrRegistrationNumber || "");
  const [authorizedSignatoryName, setAuthorizedSignatoryName] = useState(rd.authorizedSignatoryName || "");
  const [authorizedSignatoryDesignation, setAuthorizedSignatoryDesignation] = useState(rd.authorizedSignatoryDesignation || "");
  const [esgReportingFramework, setEsgReportingFramework] = useState<string[]>(
    Array.isArray(rd.esgReportingFramework)
      ? rd.esgReportingFramework
      : typeof rd.esgReportingFramework === "string"
        ? [rd.esgReportingFramework]
        : []
  );
  const [netZeroGoalYear, setNetZeroGoalYear] = useState(rd.netZeroGoalYear || "");
  const [sustainabilityGoals, setSustainabilityGoals] = useState(rd.sustainabilityGoals || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const inputCls = "h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-700 disabled:opacity-60 disabled:bg-slate-50";
  const areaCls = "min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-slate-700 disabled:opacity-60 disabled:bg-slate-50";

  async function handleSave() {
    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      const sessionRes = await supabaseBrowser.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      if (!token) throw new Error("No session found.");

      const extra_profile = {
        contactNumber,
        websiteUrl,
        industryType,
        companySize,
        annualTurnover,
        headquartersAddress,
        csrVisionMission,
        csrFocusAreas,
        preferredSdgs,
        preferredLocations,
        csrBudgetCapacity,
        cinNumber,
        gstNumber,
        panNumber,
        csrRegistrationNumber,
        authorizedSignatoryName,
        authorizedSignatoryDesignation,
        esgReportingFramework,
        netZeroGoalYear,
        sustainabilityGoals,
      };

      const res = await fetch("/api/corporates/profile", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          company_name: companyName,
          company_email: companyEmail,
          extra_profile,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update profile.");

      onUpdate(data.corporate);
      setIsEditing(false);
      setMessage("✓ Profile updated successfully!");
      setTimeout(() => setMessage(""), 3500);
    } catch (err: unknown) {
      setError(errorMessageFrom(err, "Failed to save profile."));
    } finally {
      setIsSaving(false);
    }
  }

  function toggleArrayItem(arr: string[], setArr: (x: string[]) => void, val: string) {
    if (!isEditing) return;
    if (arr.includes(val)) {
      setArr(arr.filter((i) => i !== val));
    } else {
      setArr([...arr, val]);
    }
  }

  async function handlePasswordUpdate() {
    setMessage("");
    setError("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Password confirmation does not match.");
      return;
    }

    setIsUpdatingPassword(true);

    try {
      const { error: updateError } = await supabaseBrowser.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password updated successfully.");
      setTimeout(() => setMessage(""), 3500);
    } catch (err: unknown) {
      setError(errorMessageFrom(err, "Failed to update password."));
    } finally {
      setIsUpdatingPassword(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Organization Profile"
        title="Manage Corporate CSR Profile & Settings"
        text="Keep your legal identifiers, focus sectors, budget capacity, and ESG preferences up to date."
        actions={
          isEditing ? (
            <div className="flex gap-2">
              <ActionButton icon={CheckCircle2} onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </ActionButton>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setError("");
                }}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
            </div>
          ) : (
            <ActionButton icon={FileText} onClick={() => setIsEditing(true)}>
              Edit Profile
            </ActionButton>
          )
        }
      />

      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab("basic")}
          className={`pb-3 text-sm font-semibold transition ${activeTab === "basic" ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-500 hover:text-slate-800"
            }`}
        >
          Basic Information
        </button>
        <button
          onClick={() => setActiveTab("csr")}
          className={`pb-3 text-sm font-semibold transition ${activeTab === "csr" ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-500 hover:text-slate-800"
            }`}
        >
          CSR Vision & Preferences
        </button>
        <button
          onClick={() => setActiveTab("compliance")}
          className={`pb-3 text-sm font-semibold transition ${activeTab === "compliance" ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-500 hover:text-slate-800"
            }`}
        >
          Compliance & ESG Settings
        </button>
        <button
          onClick={() => setActiveTab("account")}
          className={`pb-3 text-sm font-semibold transition ${activeTab === "account" ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-500 hover:text-slate-800"
            }`}
        >
          Account Security
        </button>
      </div>

      <Card>
        {activeTab === "basic" && (
          <div className="grid gap-5 md:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
              Company Name
              <input
                className={inputCls}
                disabled={!isEditing}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
              Corporate Email Address
              <input
                className={inputCls}
                disabled={!isEditing}
                value={companyEmail}
                onChange={(e) => setCompanyEmail(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
              Contact Number
              <input
                className={inputCls}
                disabled={!isEditing}
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
              Website URL
              <input
                className={inputCls}
                disabled={!isEditing}
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
              Industry Type
              <input
                className={inputCls}
                disabled={!isEditing}
                value={industryType}
                onChange={(e) => setIndustryType(e.target.value)}
                placeholder="e.g. Technology, Finance, Energy"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
              Company Size
              <input
                className={inputCls}
                disabled={!isEditing}
                value={companySize}
                onChange={(e) => setCompanySize(e.target.value)}
                placeholder="e.g. Startup, Medium, Large Enterprise"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
              Annual Turnover (INR)
              <input
                type="number"
                className={inputCls}
                disabled={!isEditing}
                value={annualTurnover}
                onChange={(e) => setAnnualTurnover(e.target.value)}
              />
            </label>
            <div className="md:col-span-2">
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                Headquarters Address
                <textarea
                  className={areaCls}
                  disabled={!isEditing}
                  value={headquartersAddress}
                  onChange={(e) => setHeadquartersAddress(e.target.value)}
                />
              </label>
            </div>
          </div>
        )}

        {activeTab === "csr" && (
          <div className="space-y-6">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                  CSR Vision & Mission Statement
                  <textarea
                    className={areaCls}
                    disabled={!isEditing}
                    value={csrVisionMission}
                    onChange={(e) => setCsrVisionMission(e.target.value)}
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                CSR Budget Capacity (INR)
                <input
                  type="number"
                  className={inputCls}
                  disabled={!isEditing}
                  value={csrBudgetCapacity}
                  onChange={(e) => setCsrBudgetCapacity(e.target.value)}
                />
              </label>
            </div>

            {/* Select tags */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Focus Sectors & Regions</h4>

              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">CSR Focus Areas (Click to Toggle)</p>
                <div className="flex flex-wrap gap-2">
                  {["Education", "Healthcare", "Environment", "Women Empowerment", "Rural Development", "Skill Development", "Water Conservation", "Climate Action"].map((area) => {
                    const active = csrFocusAreas.includes(area);
                    return (
                      <button
                        type="button"
                        key={area}
                        onClick={() => toggleArrayItem(csrFocusAreas, setCsrFocusAreas, area)}
                        className={`rounded-full px-4.5 py-1.5 text-xs font-bold transition border ${active
                            ? "bg-slate-900 border-slate-900 text-white"
                            : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                          }`}
                      >
                        {area}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">Preferred Geographic Locations (Click to Toggle)</p>
                <div className="flex flex-wrap gap-2">
                  {["Pan India", "North India", "South India", "East India", "West India", "Central India"].map((loc) => {
                    const active = preferredLocations.includes(loc);
                    return (
                      <button
                        type="button"
                        key={loc}
                        onClick={() => toggleArrayItem(preferredLocations, setPreferredLocations, loc)}
                        className={`rounded-full px-4.5 py-1.5 text-xs font-bold transition border ${active
                            ? "bg-slate-900 border-slate-900 text-white"
                            : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                          }`}
                      >
                        {loc}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">Target Sustainable Development Goals (SDGs) (Click to Toggle)</p>
                <div className="flex flex-wrap gap-2">
                  {["No Poverty", "Zero Hunger", "Good Health and Well-being", "Quality Education", "Gender Equality", "Clean Water and Sanitation", "Climate Action"].map((sdg) => {
                    const active = preferredSdgs.includes(sdg);
                    return (
                      <button
                        type="button"
                        key={sdg}
                        onClick={() => toggleArrayItem(preferredSdgs, setPreferredSdgs, sdg)}
                        className={`rounded-full px-4.5 py-1.5 text-xs font-bold transition border ${active
                            ? "bg-slate-900 border-slate-900 text-white"
                            : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                          }`}
                      >
                        {sdg}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "compliance" && (
          <div className="space-y-6">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                Corporate Identification Number (CIN)
                <input
                  className={inputCls}
                  disabled={!isEditing}
                  value={cinNumber}
                  onChange={(e) => setCinNumber(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                GST Identification Number
                <input
                  className={inputCls}
                  disabled={!isEditing}
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                PAN Number
                <input
                  className={inputCls}
                  disabled={!isEditing}
                  value={panNumber}
                  onChange={(e) => setPanNumber(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                CSR Registration Number
                <input
                  className={inputCls}
                  disabled={!isEditing}
                  value={csrRegistrationNumber}
                  onChange={(e) => setCsrRegistrationNumber(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                Authorized Signatory Name
                <input
                  className={inputCls}
                  disabled={!isEditing}
                  value={authorizedSignatoryName}
                  onChange={(e) => setAuthorizedSignatoryName(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                Authorized Signatory Designation
                <input
                  className={inputCls}
                  disabled={!isEditing}
                  value={authorizedSignatoryDesignation}
                  onChange={(e) => setAuthorizedSignatoryDesignation(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                Net Zero Target Goal Year
                <input
                  type="number"
                  className={inputCls}
                  disabled={!isEditing}
                  value={netZeroGoalYear}
                  onChange={(e) => setNetZeroGoalYear(e.target.value)}
                  placeholder="e.g. 2030, 2045"
                />
              </label>
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">ESG Reporting Frameworks (Click to Toggle)</p>
                <div className="flex flex-wrap gap-2">
                  {["GRI", "BRSR", "SASB", "TCFD", "CDP", "Integrated Reporting"].map((fw) => {
                    const active = esgReportingFramework.includes(fw);
                    return (
                      <button
                        type="button"
                        key={fw}
                        onClick={() => toggleArrayItem(esgReportingFramework, setEsgReportingFramework, fw)}
                        className={`rounded-full px-4.5 py-1.5 text-xs font-bold transition border ${active
                            ? "bg-slate-900 border-slate-900 text-white"
                            : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                          }`}
                      >
                        {fw}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                Sustainability & Carbon Reduction Goals
                <textarea
                  className={areaCls}
                  disabled={!isEditing}
                  value={sustainabilityGoals}
                  onChange={(e) => setSustainabilityGoals(e.target.value)}
                />
              </label>
            </div>
          </div>
        )}

        {activeTab === "account" && (
          <div className="max-w-2xl space-y-5">
            <SectionHeading
              icon={Lock}
              title="Password & Account Access"
              text="Update the password used to sign in to this corporate account."
            />
            <div className="grid gap-5 md:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                New Password
                <input
                  className={inputCls}
                  minLength={8}
                  onChange={(event) => setNewPassword(event.target.value)}
                  type="password"
                  value={newPassword}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                Confirm New Password
                <input
                  className={inputCls}
                  minLength={8}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  type="password"
                  value={confirmPassword}
                />
              </label>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isUpdatingPassword || !newPassword || !confirmPassword}
              onClick={handlePasswordUpdate}
              type="button"
            >
              <Lock className="h-4 w-4" />
              {isUpdatingPassword ? "Updating..." : "Update Password"}
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

function NgoComparisonModal({
  opp,
  proposal,
  allProposals,
  onClose,
  onAssign,
  onSwitchProposal,
}: {
  opp: CsrOpportunity;
  proposal: ProjectConnection;
  allProposals: ProjectConnection[];
  onClose: () => void;
  onAssign: (
    candidate: { id: string; name: string; focusArea: string },
    customProjectName?: string,
    customBudget?: number,
    proposalId?: string
  ) => void;
  onSwitchProposal: (prop: ProjectConnection) => void;
}) {
  const [ngoProfile, setNgoProfile] = useState<NgoReviewProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [chatMessages, setChatMessages] = useState<ProjectMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const messageEndRef = useRef<HTMLDivElement>(null);

  function profileText(key: string) {
    const value = ngoProfile?.registration_data?.[key];
    return typeof value === "string" || typeof value === "number"
      ? String(value)
      : "";
  }

  // Fetch NGO profile and chat history when selected proposal changes
  useEffect(() => {
    async function fetchNgoProfile() {
      setLoadingProfile(true);
      try {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        const res = await fetch(`/api/ngo/profile?ngoId=${proposal.ngo_id}`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setNgoProfile(data.ngo);
        }
      } catch (err) {
        console.error("Error fetching NGO profile:", err);
      } finally {
        setLoadingProfile(false);
      }
    }

    async function fetchChatMessages() {
      try {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        const res = await fetch(`/api/ngo/messages?connectionId=${proposal.id}`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setChatMessages(data.messages || []);
        }
      } catch (err) {
        console.error("Error fetching chat messages:", err);
      }
    }

    fetchNgoProfile();
    fetchChatMessages();

    // Poll for new chat messages every 3 seconds
    const interval = setInterval(fetchChatMessages, 3000);
    return () => clearInterval(interval);
  }, [proposal.id, proposal.ngo_id]);

  // Scroll to bottom of chat
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function handleSendMessage(e: FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || sendingMessage) return;

    setSendingMessage(true);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      const res = await fetch("/api/ngo/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          connectionId: proposal.id,
          body: newMessage.trim(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setChatMessages((prev) => [...prev, data.message]);
        setNewMessage("");
      }
    } catch (err) {
      console.error("Error sending message:", err);
    } finally {
      setSendingMessage(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 md:p-6">
      <div className="w-full max-w-6xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100 flex flex-col h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                Opportunity Review
              </span>
              <h3 className="font-bold text-slate-900 text-lg leading-tight">
                Review Applicants: {opp.title}
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Compare applicants, chat to calibrate requirements, and approve when aligned.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Multi-Panel Body */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[250px_1fr_1fr] divide-y md:divide-y-0 md:divide-x divide-slate-200 min-h-0 bg-white">
          {/* Panel 1: Applicants List (Left) */}
          <div className="p-4 flex flex-col gap-3 min-h-0 overflow-y-auto bg-slate-50/50">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              All Applicants ({allProposals.length})
            </h4>
            <div className="space-y-2 flex-1">
              {allProposals.map((prop) => {
                const isSelected = prop.id === proposal.id;
                return (
                  <button
                    key={prop.id}
                    onClick={() => onSwitchProposal(prop)}
                    className={`w-full text-left p-3 rounded-xl border text-sm font-semibold transition ${isSelected
                        ? "border-blue-500 bg-blue-50/50 text-blue-800"
                        : "border-slate-100 bg-white hover:bg-slate-50 text-slate-700"
                      }`}
                  >
                    <p className="truncate">{prop.ngo_name}</p>
                    <p className="text-xs text-slate-400 font-medium mt-1">
                      Budget: {formatINR(prop.budget)}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Panel 2: NGO Profile (Middle) */}
          <div className="p-6 overflow-y-auto flex flex-col min-h-0 bg-slate-50/10">
            {loadingProfile ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-2">
                <Users className="h-8 w-8 animate-pulse" />
                <p className="text-sm font-medium">Loading profile details...</p>
              </div>
            ) : ngoProfile ? (
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 leading-tight">{ngoProfile.ngo_name}</h3>
                  <p className="text-xs font-semibold text-blue-600 mt-1.5 uppercase tracking-wider">
                    {ngoProfile.ngo_type || "Registered NGO"}
                  </p>
                </div>

                {/* Profile Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Trust Score</p>
                    <p className="text-lg font-black text-slate-800 mt-0.5">
                      {ngoProfile.trust_score ?? 0}/100
                    </p>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Established</p>
                    <p className="text-lg font-black text-slate-800 mt-0.5">
                      {ngoProfile.year_of_establishment || profileText("year_of_establishment") || "N/A"}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Employees</p>
                    <p className="text-lg font-black text-slate-800 mt-0.5">
                      {ngoProfile.employee_count || profileText("number_of_employees") || "N/A"}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Volunteers</p>
                    <p className="text-lg font-black text-slate-800 mt-0.5">
                      {ngoProfile.volunteer_count || profileText("number_of_volunteers") || "N/A"}
                    </p>
                  </div>
                </div>

                {/* Focus Sectors */}
                {ngoProfile.focus_areas && ngoProfile.focus_areas.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Focus Areas</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ngoProfile.focus_areas.map((fa: string) => (
                        <span key={fa} className="rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                          {fa}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mission Statement */}
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Mission Statement</p>
                  <p className="text-sm leading-relaxed text-slate-600 bg-white rounded-xl border border-slate-100 p-4 shadow-sm whitespace-pre-line">
                    {decodeScrapedText(ngoProfile.mission || profileText("mission")) || "No mission statement defined."}
                  </p>
                </div>

                {ngoProfile.beneficiary_types?.length ? (
                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Beneficiary Groups</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ngoProfile.beneficiary_types.map((beneficiary: string) => (
                        <span key={beneficiary} className="rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                          {beneficiary}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Legal compliance */}
                <div className="space-y-3 bg-white border border-slate-200/60 rounded-xl p-4 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Compliance & Registry</p>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between border-b border-slate-50 pb-1.5">
                      <span className="text-slate-400 font-medium">PAN Card</span>
                      <span className="font-bold text-slate-800 uppercase">{ngoProfile.pan_number || profileText("pan_number") || "N/A"}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-50 pb-1.5">
                      <span className="text-slate-400 font-medium">Registration ID</span>
                      <span className="font-bold text-slate-800">{ngoProfile.registration_number || profileText("registration_number") || "N/A"}</span>
                    </div>
                    {ngoProfile.website && (
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Website</span>
                        <a href={ngoProfile.website.startsWith("http") ? ngoProfile.website : `https://${ngoProfile.website}`} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 hover:underline">
                          {ngoProfile.website}
                        </a>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-slate-50 pt-1.5">
                      <span className="text-slate-400 font-medium">Email</span>
                      <span className="font-semibold text-slate-700">{ngoProfile.ngo_email}</span>
                    </div>
                    {(ngoProfile.contact_number || profileText("contact_number")) && (
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Phone</span>
                        <span className="font-semibold text-slate-700">{ngoProfile.contact_number || profileText("contact_number")}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                <Users className="h-8 w-8" />
                <p className="text-sm font-medium mt-2">No NGO profile loaded.</p>
              </div>
            )}
          </div>

          {/* Panel 3: Chat Calibration (Right) */}
          <div className="overflow-hidden flex flex-col min-h-0 bg-white">
            {/* Chat message list */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/10">
              {chatMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2 text-slate-400">
                  <MessageSquare className="h-8 w-8 text-slate-300" />
                  <p className="text-sm font-semibold">Start calibration chat</p>
                  <p className="text-xs max-w-[250px] leading-relaxed">
                    Message the NGO to discuss budget alignment, milestone plans, and requirements before approving.
                  </p>
                </div>
              ) : (
                chatMessages.map((msg, index) => {
                  const isCorporate = msg.sender_type === "corporate";
                  return (
                    <div key={msg.id || index} className={`flex ${isCorporate ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${isCorporate
                          ? "bg-slate-900 text-white rounded-tr-none"
                          : "bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200/60"
                        }`}>
                        <p className="whitespace-pre-wrap">{msg.body}</p>
                        <p className={`text-[10px] mt-1.5 text-right font-medium ${isCorporate ? "text-slate-400" : "text-slate-500"}`}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messageEndRef} />
            </div>

            {/* Message input */}
            <form onSubmit={handleSendMessage} className="border-t border-slate-200 p-3 bg-white flex gap-2">
              <input
                type="text"
                placeholder="Type your calibration message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                disabled={sendingMessage}
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-slate-400 focus:bg-white transition"
              />
              <button
                type="submit"
                disabled={!newMessage.trim() || sendingMessage}
                className="rounded-xl bg-slate-900 text-white p-2.5 hover:bg-slate-800 transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 flex justify-end gap-3 items-center">
          <span className="text-xs text-slate-400 font-bold mr-auto">
            Proposing: {formatINR(proposal.budget)}
          </span>
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Close Review
          </button>
          <button
            onClick={() => {
              onAssign(
                { id: proposal.ngo_id, name: proposal.ngo_name, focusArea: opp.focus_area },
                opp.title,
                proposal.budget,
                proposal.id
              );
              onClose();
            }}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 hover:shadow transition flex items-center gap-1.5"
          >
            <CheckCircle2 className="h-4 w-4" />
            Approve & Assign Project
          </button>
        </div>
      </div>
    </div>
  );
}
