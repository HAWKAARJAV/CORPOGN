"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Briefcase,
  KeyRound,
  Lock,
  LogOut,
  Send,
  UserRound,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { ProjectConnection } from "@/lib/project-connections";

type Profile = {
  id: string;
  email: string;
  fullName: string;
  accountType: string;
  orgType: "corporate" | "ngo" | "admin";
  orgSlug: string;
  orgName: string;
  roleLabel: string;
  allowedPages: string[] | null;
};

type AssignedProject = ProjectConnection & {
  assignment?: {
    role_in_project?: string;
    permissions?: Record<string, string>;
  } | null;
};

const inputClass =
  "h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";

function projectHref(profile: Profile, project: AssignedProject) {
  if (profile.orgType === "corporate") {
    return `/corporate/${profile.orgSlug}/dashboard?project=${project.id}`;
  }
  return `/ngo/${profile.orgSlug}/dashboard?project=${project.id}`;
}

export default function MyAccountPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<AssignedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [requestTargetType, setRequestTargetType] = useState<"project" | "tab">("project");
  const [requestTargetId, setRequestTargetId] = useState("");
  const [requestPermission, setRequestPermission] = useState<"read_only" | "edit">("read_only");
  const [requestReason, setRequestReason] = useState("");
  const [requestStatus, setRequestStatus] = useState("");

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();

      if (!session) {
        router.replace("/signin");
        return;
      }

      setToken(session.access_token);

      const res = await fetch("/api/employee/profile", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = (await res.json()) as {
        profile?: Profile;
        assignedProjects?: AssignedProject[];
        error?: string;
      };

      if (!res.ok || !data.profile) {
        setError(data.error ?? "Could not load your account.");
        setLoading(false);
        return;
      }

      if (data.profile.accountType === "corporate" || data.profile.accountType === "ngo") {
        router.replace(
          data.profile.orgType === "corporate"
            ? `/corporate/${data.profile.orgSlug}/dashboard`
            : `/ngo/${data.profile.orgSlug}/dashboard`,
        );
        return;
      }

      setProfile(data.profile);
      setFullName(data.profile.fullName);
      setProjects(data.assignedProjects ?? []);
      setRequestTargetId(data.assignedProjects?.[0]?.id ?? "");
      setLoading(false);
    }

    load();
  }, [router]);

  const availableTabs = useMemo(() => {
    if (profile?.orgType === "corporate") {
      return ["Dashboard", "My Projects", "Project Workspace", "Budget & Fund Tracking", "Reports & Approvals", "Audit & Compliance"];
    }

    return ["my-projects", "project-chat", "fund-tracking", "milestone-reporting", "impact-reporting", "utilization-cert"];
  }, [profile?.orgType]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    setSaving(true);
    setError("");

    const res = await fetch("/api/employee/profile", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName,
        ...(password ? { password } : {}),
      }),
    });
    const data = (await res.json()) as { error?: string };
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Could not save profile.");
      return;
    }

    setPassword("");
    setRequestStatus("Profile updated.");
  }

  async function submitAccessRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    setRequestStatus("");
    setError("");

    const res = await fetch("/api/access-requests", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        targetType: requestTargetType,
        targetId: requestTargetId,
        requestedPermission: requestPermission,
        reason: requestReason,
      }),
    });
    const data = (await res.json()) as { error?: string };

    if (!res.ok) {
      setError(data.error ?? "Could not submit access request.");
      return;
    }

    setRequestReason("");
    setRequestStatus("Access request submitted.");
  }

  async function signOut() {
    await supabaseBrowser.auth.signOut();
    router.replace("/signin");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
        <p className="text-sm text-slate-500">Loading your account...</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
        <p className="text-sm text-red-600">{error || "Account not found."}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600">My Account</p>
            <h1 className="text-xl font-bold">{profile.fullName}</h1>
          </div>
          <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-5 px-5 py-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-blue-50 text-blue-600">
                <UserRound className="h-5 w-5" />
              </span>
              <div>
                <p className="font-bold">{profile.fullName}</p>
                <p className="text-xs text-slate-500">{profile.email}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <p><span className="text-slate-400">Organization:</span> {profile.orgName}</p>
              <p><span className="text-slate-400">Role:</span> {profile.roleLabel}</p>
            </div>
          </section>

          <form onSubmit={saveProfile} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-blue-600" />
              <p className="text-sm font-bold">Profile & Security</p>
            </div>
            <label className="mb-3 flex flex-col gap-1.5 text-xs font-semibold text-slate-500">
              Full name
              <input className={inputClass} value={fullName} onChange={(event) => setFullName(event.target.value)} />
            </label>
            <label className="mb-4 flex flex-col gap-1.5 text-xs font-semibold text-slate-500">
              New password
              <input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Leave blank to keep current" />
            </label>
            <button className={buttonClass} disabled={saving} type="submit">
              {saving ? "Saving..." : "Save"}
            </button>
          </form>
        </aside>

        <div className="space-y-5">
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
          {requestStatus && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{requestStatus}</p>}

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-blue-600" />
              <h2 className="font-bold">Assigned Projects</h2>
            </div>
            {projects.length ? (
              <div className="grid gap-3">
                {projects.map((project) => (
                  <Link
                    key={project.id}
                    className="group rounded-lg border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-blue-50"
                    href={projectHref(profile, project)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{project.project_name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {project.corporate_name} + {project.ngo_name} · {project.status}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          {project.assignment?.role_in_project ?? "Project assignee"}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:text-blue-600" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <Lock className="mx-auto h-7 w-7 text-slate-300" />
                <p className="mt-2 text-sm font-semibold text-slate-500">No project assignments yet.</p>
              </div>
            )}
          </section>

          <form onSubmit={submitAccessRequest} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Send className="h-4 w-4 text-blue-600" />
              <h2 className="font-bold">Request Access</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-500">
                Target
                <select className={inputClass} value={requestTargetType} onChange={(event) => setRequestTargetType(event.target.value as "project" | "tab")}>
                  <option value="project">Project</option>
                  <option value="tab">Tab</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-500">
                {requestTargetType === "project" ? "Project" : "Tab"}
                {requestTargetType === "project" ? (
                  <select className={inputClass} value={requestTargetId} onChange={(event) => setRequestTargetId(event.target.value)}>
                    <option value="">Select project</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.project_name}</option>
                    ))}
                  </select>
                ) : (
                  <select className={inputClass} value={requestTargetId} onChange={(event) => setRequestTargetId(event.target.value)}>
                    <option value="">Select tab</option>
                    {availableTabs.map((tab) => (
                      <option key={tab} value={tab}>{tab}</option>
                    ))}
                  </select>
                )}
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-500">
                Permission
                <select className={inputClass} value={requestPermission} onChange={(event) => setRequestPermission(event.target.value as "read_only" | "edit")}>
                  <option value="read_only">Read only</option>
                  <option value="edit">Edit</option>
                </select>
              </label>
            </div>
            <label className="mt-3 flex flex-col gap-1.5 text-xs font-semibold text-slate-500">
              Reason
              <textarea className="min-h-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={requestReason} onChange={(event) => setRequestReason(event.target.value)} />
            </label>
            <button className={`${buttonClass} mt-4`} disabled={!requestTargetId || !requestReason.trim()} type="submit">
              Submit request
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
