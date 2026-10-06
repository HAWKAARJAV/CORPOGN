"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import {
  ArrowLeft, Building2, Leaf, ChevronDown, ChevronUp, Zap,
  Star, Shield, Wallet, Wrench, Camera, BarChart3, Heart, Users, Briefcase,
} from "lucide-react";

const inputClass =
  "h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-[#849b34] focus:ring-2 focus:ring-lime-100";

type Organization = "corporate" | "ngo";
type SignInMode =
  | "corporate_admin"
  | "corporate_employee"
  | "ngo_admin"
  | "ngo_employee";

const ORGANIZATION_OPTIONS: {
  id: Organization;
  label: string;
  description: string;
}[] = [
    {
      id: "corporate",
      label: "Sign in as Corporate",
      description: "For CSR firms, corporate admins, and corporate employees.",
    },
    {
      id: "ngo",
      label: "Sign in as NGO",
      description: "For NGO admins and NGO team members.",
    },
  ];

const MODE_OPTIONS: Record<
  Organization,
  { id: SignInMode; label: string; description: string }[]
> = {
  corporate: [
    {
      id: "corporate_admin",
      label: "Login as Firm / Admin",
      description: "Company owner, CSR head, or admin account.",
    },
    {
      id: "corporate_employee",
      label: "Login as Employee",
      description: "Team member with page-level access assigned by admin.",
    },
  ],
  ngo: [
    {
      id: "ngo_admin",
      label: "Login as Firm / Admin",
      description: "NGO owner, trustee, or super admin account.",
    },
    {
      id: "ngo_employee",
      label: "Login as Employee",
      description: "NGO member with an assigned operational role.",
    },
  ],
};

const MODE_TO_ACCOUNT_TYPE: Record<SignInMode, string> = {
  corporate_admin: "corporate",
  corporate_employee: "corporate_employee",
  ngo_admin: "ngo",
  ngo_employee: "ngo_member",
};

const supabaseHost = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  try {
    return new URL(url).host;
  } catch {
    return url || "the configured Supabase project";
  }
})();

function getAuthErrorMessage(error: unknown, fallback: string) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  if (/failed to fetch|network|name_not_resolved|err_name_not_resolved/i.test(message)) {
    return `Could not reach Supabase (${supabaseHost}). Check your internet/DNS connection, then restart the dev server if you changed .env.local.`;
  }

  return message || fallback;
}

// ─── Demo credentials ─────────────────────────────────────────────────────────

type DemoAccount = {
  label: string;
  sublabel: string;
  email: string;
  password: string;
  org: Organization;
  mode: SignInMode;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  iconBg: string;
};

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    label: "Corporate Super Admin",
    sublabel: "Demo Corporation",
    email: "demo@corpdemo.com",
    password: "CorpoGN@2026",
    org: "corporate",
    mode: "corporate_admin",
    icon: Building2,
    color: "text-[#121e56]",
    iconBg: "bg-[#eef5dc]",
  },
  {
    label: "NGO Super Admin",
    sublabel: "Green Earth Foundation",
    email: "admin@greenearthngo.in",
    password: "GreenEarth@2026",
    org: "ngo",
    mode: "ngo_admin",
    icon: Leaf,
    color: "text-[#6f842a]",
    iconBg: "bg-[#eef5dc]",
  },
];

const NGO_ROLE_CREDS: {
  label: string; sublabel: string; email: string; password: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
    { label: "Finance Officer", sublabel: "Funds & Expenses", icon: Wallet, email: "finance@greenearthngo.in", password: "Finance@2026" },
    { label: "Compliance Officer", sublabel: "Docs & Verification", icon: Shield, email: "compliance@greenearthngo.in", password: "Comply@2026" },
    { label: "Operations Manager", sublabel: "Projects & Milestones", icon: Wrench, email: "ops@greenearthngo.in", password: "Ops@2026" },
    { label: "Field Coordinator", sublabel: "Field & Media", icon: Camera, email: "field@greenearthngo.in", password: "Field@2026" },
    { label: "Reporting Executive", sublabel: "Analytics & Reports", icon: BarChart3, email: "reporter@greenearthngo.in", password: "Report@2026" },
    { label: "Volunteer", sublabel: "Tasks & Events", icon: Heart, email: "volunteer@greenearthngo.in", password: "Volunteer@2026" },
  ];

const CORP_ROLE_CREDS: {
  label: string; sublabel: string; email: string; password: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
    { label: "CSR Manager", sublabel: "Campaigns & Approvals", icon: Briefcase, email: "ananya.sharma@corporate-giant.example", password: "Employee@2026" },
    { label: "Finance Manager", sublabel: "Budget & Tracking", icon: Wallet, email: "rohan.mehta@corporate-giant.example", password: "Employee@2026" },
    { label: "Compliance Officer", sublabel: "Audit & Verification", icon: Shield, email: "priya.nair@corporate-giant.example", password: "Employee@2026" },
    { label: "NGO Manager", sublabel: "NGO Connections", icon: Users, email: "kabir.khan@corporate-giant.example", password: "Employee@2026" },
    { label: "ESG Officer", sublabel: "ESG & Impact", icon: Leaf, email: "sara.iyer@corporate-giant.example", password: "Employee@2026" },
  ];

// ─── Demo Panel ───────────────────────────────────────────────────────────────

function DemoPanel({
  onLogin,
  loading,
}: {
  onLogin: (acc: { email: string; password: string; org: Organization; mode: SignInMode }) => void;
  loading: string | null; // email of the account currently signing in
}) {
  const [open, setOpen] = useState(true);
  const [roleOpen, setRoleOpen] = useState(false);
  const [corpRoleOpen, setCorpRoleOpen] = useState(false);

  function DemoButton({
    email, password, org, mode, children,
    className = "",
  }: {
    email: string; password: string; org: Organization; mode: SignInMode;
    children: React.ReactNode; className?: string;
  }) {
    const isLoading = loading === email;
    return (
      <button
        type="button"
        disabled={loading !== null}
        onClick={() => onLogin({ email, password, org, mode })}
        className={`relative transition active:scale-[.97] disabled:cursor-not-allowed ${className}`}
      >
        {isLoading && (
          <span className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/80">
            <span className="h-4 w-4 rounded-full border-2 border-[#849b34] border-t-transparent animate-spin" />
          </span>
        )}
        {children}
      </button>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#eef5dc]">
            <Zap className="h-3.5 w-3.5 text-[#6f842a]" />
          </span>
          <div>
            <p className="text-sm font-bold text-[#121e56]">Try a Demo Account</p>
            <p className="text-[11px] text-slate-500">Click any card to log in instantly</p>
          </div>
        </div>
        {open
          ? <ChevronUp className="h-4 w-4 text-[#849b34] flex-shrink-0" />
          : <ChevronDown className="h-4 w-4 text-[#849b34] flex-shrink-0" />}
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-3">

          {/* ── Admin accounts ── */}
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-normal text-[#849b34]">
              Platform Admins — Shared project active
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <DemoButton
                  key={acc.email}
                  email={acc.email} password={acc.password}
                  org={acc.org} mode={acc.mode}
                  className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-left shadow-sm hover:border-[#849b34] hover:shadow-md"
                >
                  <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${acc.iconBg}`}>
                    <acc.icon className={`h-5 w-5 ${acc.color}`} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800">{acc.label}</p>
                    <p className="text-xs text-slate-500">{acc.sublabel}</p>
                    <p className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">{acc.email}</p>
                  </div>
                  <span className={`ml-auto shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${acc.org === "corporate" ? "bg-[#eef5dc] text-[#121e56]" : "bg-[#eef5dc] text-[#6f842a]"}`}>
                    {acc.org === "corporate" ? "Corp" : "NGO"}
                  </span>
                </DemoButton>
              ))}
            </div>
          </div>

          {/* ── Corporate role members ── */}
          <div>
            <button
              type="button"
              onClick={() => setCorpRoleOpen(!corpRoleOpen)}
              className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-[#f7f9f4] px-3 py-2 text-left"
            >
              <div className="flex items-center gap-2">
                <Star className="h-3.5 w-3.5 text-[#849b34]" />
                <p className="text-[11px] font-bold uppercase tracking-normal text-[#849b34]">
                  Corporate Role Members — 5 roles
                </p>
              </div>
              {corpRoleOpen
                ? <ChevronUp className="h-3.5 w-3.5 text-[#849b34]" />
                : <ChevronDown className="h-3.5 w-3.5 text-[#849b34]" />}
            </button>

            {corpRoleOpen && (
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {CORP_ROLE_CREDS.map((cred) => (
                  <DemoButton
                    key={cred.email}
                    email={cred.email} password={cred.password}
                    org="corporate" mode="corporate_employee"
                    className="flex flex-col items-start gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm hover:border-[#849b34]"
                  >
                    <div className="flex items-center gap-1.5">
                      <cred.icon className="h-3.5 w-3.5 text-[#849b34] flex-shrink-0" />
                      <p className="text-xs font-bold text-slate-800 leading-tight">{cred.label}</p>
                    </div>
                    <p className="text-[10px] text-slate-400">{cred.sublabel}</p>
                  </DemoButton>
                ))}
              </div>
            )}
          </div>

          {/* ── NGO role members ── */}
          <div>
            <button
              type="button"
              onClick={() => setRoleOpen(!roleOpen)}
              className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-[#f7f9f4] px-3 py-2 text-left"
            >
              <div className="flex items-center gap-2">
                <Star className="h-3.5 w-3.5 text-[#849b34]" />
                <p className="text-[11px] font-bold uppercase tracking-normal text-[#849b34]">
                  NGO Role Members — 6 roles
                </p>
              </div>
              {roleOpen
                ? <ChevronUp className="h-3.5 w-3.5 text-[#849b34]" />
                : <ChevronDown className="h-3.5 w-3.5 text-[#849b34]" />}
            </button>

            {roleOpen && (
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {NGO_ROLE_CREDS.map((cred) => (
                  <DemoButton
                    key={cred.email}
                    email={cred.email} password={cred.password}
                    org="ngo" mode="ngo_employee"
                    className="flex flex-col items-start gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm hover:border-[#849b34]"
                  >
                    <div className="flex items-center gap-1.5">
                      <cred.icon className="h-3.5 w-3.5 text-[#849b34] flex-shrink-0" />
                      <p className="text-xs font-bold text-slate-800 leading-tight">{cred.label}</p>
                    </div>
                    <p className="text-[10px] text-slate-400">{cred.sublabel}</p>
                  </DemoButton>
                ))}
              </div>
            )}
          </div>

          <p className="text-center text-[10px] text-slate-500">
            All demo accounts share a live project: <span className="font-semibold">Rural Education Mission</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main form ────────────────────────────────────────────────────────────────

function getDefaultMode(organization: Organization): SignInMode {
  return organization === "corporate" ? "corporate_admin" : "ngo_admin";
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered");

  const [organization, setOrganization] = useState<Organization | null>(() =>
    registered === "ngo" ? "ngo" : null,
  );
  const [activeMode, setActiveMode] = useState<SignInMode>(() =>
    registered === "ngo" ? "ngo_admin" : "corporate_admin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);

  function selectOrganization(nextOrganization: Organization) {
    setOrganization(nextOrganization);
    setActiveMode(getDefaultMode(nextOrganization));
    setEmail("");
    setPassword("");
    setErrorMessage("");
  }

  function switchMode(mode: SignInMode) {
    setActiveMode(mode);
    setEmail("");
    setPassword("");
    setErrorMessage("");
  }

  async function routeUser(
    accountType: string,
    metadata: Record<string, unknown>,
    userId: string,
    mode: SignInMode,
  ) {
    if (accountType !== MODE_TO_ACCOUNT_TYPE[mode]) {
      await supabaseBrowser.auth.signOut();
      setErrorMessage(`Account type mismatch. Please use the correct sign-in type.`);
      return;
    }

    if (accountType === "corporate") {
      const metadataSlug =
        typeof metadata.corporate_slug === "string"
          ? metadata.corporate_slug
          : typeof metadata.company_slug === "string"
            ? metadata.company_slug
            : "";

      if (metadataSlug) {
        router.push(`/corporate/${metadataSlug}/dashboard`);
        return;
      }

      const { data: corporate } = await supabaseBrowser
        .from("corporates")
        .select("slug")
        .eq("auth_user_id", userId)
        .maybeSingle();
      if (corporate) { router.push(`/corporate/${corporate.slug}/dashboard`); return; }
      setErrorMessage("Corporate profile not found.");
      return;
    }

    if (accountType === "corporate_employee") {
      const metadataSlug =
        typeof metadata.corporate_slug === "string"
          ? metadata.corporate_slug
          : typeof metadata.company_slug === "string"
            ? metadata.company_slug
            : "";

      if (metadataSlug) {
        router.push(`/corporate/${metadataSlug}/dashboard`);
        return;
      }

      const corporateId = typeof metadata.corporate_id === "string" ? metadata.corporate_id : "";
      const { data: corporate } = await supabaseBrowser
        .from("corporates")
        .select("slug")
        .eq("id", corporateId)
        .maybeSingle();
      if (corporate) { router.push(`/corporate/${corporate.slug}/dashboard`); return; }
      router.push("/my-account");
      return;
    }

    if (accountType === "ngo") {
      const metadataSlug =
        typeof metadata.ngo_slug === "string"
          ? metadata.ngo_slug
          : typeof metadata.slug === "string"
            ? metadata.slug
            : "";

      if (metadataSlug) {
        router.push(`/ngo/${metadataSlug}/dashboard`);
        return;
      }

      const { data: ngo } = await supabaseBrowser
        .from("ngos")
        .select("slug")
        .eq("auth_user_id", userId)
        .maybeSingle();
      if (ngo) { router.push(`/ngo/${ngo.slug}/dashboard`); return; }
      setErrorMessage("NGO profile not found.");
      return;
    }

    if (accountType === "ngo_member") {
      const metadataSlug = typeof metadata.ngo_slug === "string" ? metadata.ngo_slug : "";

      if (metadataSlug) {
        router.push(`/ngo/${metadataSlug}/dashboard`);
        return;
      }

      const ngoId = typeof metadata.ngo_id === "string" ? metadata.ngo_id : "";
      const { data: ngo } = await supabaseBrowser
        .from("ngos")
        .select("slug")
        .eq("id", ngoId)
        .maybeSingle();
      if (ngo) { router.push(`/ngo/${ngo.slug}/dashboard`); return; }
      router.push("/my-account");
      return;
    }

    setErrorMessage("Unknown account type. Please contact support.");
  }

  async function loginWithDemo(acc: { email: string; password: string; org: Organization; mode: SignInMode }) {
    setDemoLoading(acc.email);
    setErrorMessage("");

    let signInData;
    let signInError;

    try {
      const result = await supabaseBrowser.auth.signInWithPassword({
        email: acc.email,
        password: acc.password,
      });
      signInData = result.data;
      signInError = result.error;
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error, "Could not sign in."));
      setDemoLoading(null);
      return;
    }

    if (signInError || !signInData.user) {
      setErrorMessage(getAuthErrorMessage(signInError, "Invalid credentials."));
      setDemoLoading(null);
      return;
    }

    const metadata = signInData.user.user_metadata ?? {};
    const accountType = metadata.account_type as string;

    // Sync form state so the sign-in card reflects the logged-in account
    setOrganization(acc.org);
    setActiveMode(acc.mode);
    setEmail(acc.email);
    setPassword(acc.password);

    await routeUser(accountType, metadata, signInData.user.id, acc.mode);
    setDemoLoading(null);
  }

  async function routeCorporateEmployee(
    userId: string,
    metadata: Record<string, unknown>,
    fallbackError: string,
  ) {
    const corporateSlug =
      typeof metadata.corporate_slug === "string"
        ? metadata.corporate_slug
        : typeof metadata.company_slug === "string"
          ? metadata.company_slug
          : typeof metadata.slug === "string"
            ? metadata.slug
            : "";

    if (corporateSlug) {
      router.push(`/corporate/${corporateSlug}/dashboard`);
      return true;
    }

    const corporateId =
      typeof metadata.corporate_id === "string" ? metadata.corporate_id : "";

    if (corporateId) {
      const { data: corporate, error: corporateError } = await supabaseBrowser
        .from("corporates")
        .select("slug")
        .eq("id", corporateId)
        .maybeSingle();

      if (!corporateError && corporate) {
        router.push(`/corporate/${corporate.slug}/dashboard`);
        return true;
      }
    }

    const { data: employee, error: employeeError } = await supabaseBrowser
      .from("corporate_employees")
      .select("corporate_id, is_active")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (!employeeError && employee?.is_active) {
      const { data: corporate, error: corporateError } = await supabaseBrowser
        .from("corporates")
        .select("slug")
        .eq("id", employee.corporate_id)
        .maybeSingle();

      if (!corporateError && corporate) {
        router.push(`/corporate/${corporate.slug}/dashboard`);
        return true;
      }
    }

    setErrorMessage(fallbackError);
    setIsSubmitting(false);
    return false;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organization) { setErrorMessage("Choose Corporate or NGO first."); return; }

    setIsSubmitting(true);
    setErrorMessage("");

    let signInData;
    let signInError;

    try {
      const result = await supabaseBrowser.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      signInData = result.data;
      signInError = result.error;
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error, "Could not sign in."));
      setIsSubmitting(false);
      return;
    }

    if (signInError || !signInData.user) {
      setErrorMessage(getAuthErrorMessage(signInError, "Invalid email or password."));
      setIsSubmitting(false);
      return;
    }

    const metadata = signInData.user.user_metadata ?? {};
    const accountType = metadata.account_type as string;

    await routeUser(accountType, metadata, signInData.user.id, activeMode);
    setIsSubmitting(false);
  }

  const modeOptions = organization ? MODE_OPTIONS[organization] : [];
  const selectedOrgLabel =
    organization === "corporate"
      ? "Corporate"
      : organization === "ngo"
        ? "NGO"
        : "";

  return (
    <main className="min-h-screen bg-[#f7f9f4] text-slate-950">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </Link>
        <Link
          className="text-xl font-bold tracking-normal text-[#121e56]"
          href="/"
        >
          CorpoGN
        </Link>
      </header>

      <section className="mx-auto flex min-h-[calc(100vh-92px)] w-full max-w-6xl items-center px-5 pb-12 sm:px-8">
        <div className="grid w-full items-center gap-10 lg:grid-cols-[0.82fr_1.18fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-normal text-[#849b34]">
              Welcome back
            </p>
            <h1 className="mt-4 max-w-lg text-4xl font-semibold leading-tight tracking-normal text-[#121e56] sm:text-5xl">
              Sign in to your CSR workspace
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
              Access the right workspace for your CSR role and continue to your
              dashboard.
            </p>
            <p className="mt-8 text-sm text-slate-600">
              New to CorpoGN?{" "}
              <Link
                className="font-semibold text-[#849b34] underline underline-offset-4 hover:text-[#6f842a]"
                href="/signup"
              >
                Create an account
              </Link>
            </p>
          </div>

          <div className="grid w-full gap-4">
            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 pb-5 pt-6">
                <p className="text-xs font-bold uppercase tracking-normal text-[#849b34]">
                  CorpoGN access
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-normal text-[#121e56]">
                  {organization ? `${selectedOrgLabel} sign in` : "Choose sign-in type"}
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {organization
                    ? "Select whether this is an admin account or an employee account."
                    : "Start by choosing the workspace you want to enter."}
                </p>
              </div>

              <div className="p-6">
                {registered === "ngo" && (
                  <p className="mb-5 rounded-md border border-lime-200 bg-lime-50 px-3 py-2 text-sm font-medium text-[#6f842a]">
                    NGO registered successfully. Sign in with your admin credentials.
                  </p>
                )}

                {!organization ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {ORGANIZATION_OPTIONS.map((option) => (
                      <button
                        className="rounded-lg border border-slate-200 bg-white p-5 text-left transition hover:border-[#849b34] hover:bg-[#f7f9f4]"
                        key={option.id}
                        onClick={() => selectOrganization(option.id)}
                        type="button"
                      >
                        <span className="text-base font-semibold text-[#121e56]">
                          {option.label}
                        </span>
                        <span className="mt-2 block text-sm leading-6 text-slate-500">
                          {option.description}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="mb-5 flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-600">
                        Signing in to:{" "}
                        <span className="font-semibold text-[#121e56]">{selectedOrgLabel}</span>
                      </p>
                      <button
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-950"
                        onClick={() => {
                          setOrganization(null);
                          setErrorMessage("");
                        }}
                        type="button"
                      >
                        Change
                      </button>
                    </div>

                    <div className="mb-6 grid gap-3 sm:grid-cols-2">
                      {modeOptions.map((mode) => (
                        <button
                          className={`rounded-lg border p-4 text-left transition ${activeMode === mode.id
                              ? "border-[#849b34] bg-[#f7f9f4] text-[#121e56]"
                              : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          key={mode.id}
                          onClick={() => switchMode(mode.id)}
                          type="button"
                        >
                          <span className="text-sm font-semibold">{mode.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-slate-500">
                            {mode.description}
                          </span>
                        </button>
                      ))}
                    </div>

                    <form className="space-y-5" onSubmit={handleSubmit}>
                      {errorMessage && (
                        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                          {errorMessage}
                        </p>
                      )}

                      <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                        Email address
                        <input
                          className={inputClass}
                          name="email"
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          required
                          type="email"
                          value={email}
                        />
                      </label>

                      <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                        Password
                        <input
                          className={inputClass}
                          name="password"
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter password"
                          required
                          type="password"
                          value={password}
                        />
                      </label>

                      <button
                        className="h-11 w-full rounded-md bg-[#121e56] text-sm font-semibold text-white transition hover:bg-[#17266d] disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSubmitting}
                        type="submit"
                      >
                        {isSubmitting ? "Signing in..." : "Sign in"}
                      </button>
                    </form>
                  </>
                )}

                <p className="mt-6 text-center text-sm text-slate-500">
                  Don&apos;t have an account?{" "}
                  <Link
                    className="font-semibold text-[#849b34] underline underline-offset-4 hover:text-[#6f842a]"
                    href="/signup"
                  >
                    Sign up
                  </Link>
                </p>
              </div>
            </section>
            <DemoPanel onLogin={loginWithDemo} loading={demoLoading} />
          </div>
        </div>
      </section>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
