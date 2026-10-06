"use client";

import { useEffect, useState } from "react";
import type { NgoRole } from "@/lib/ngo";

type QueueModule = {
  module: string;
  label: string;
  navigateTo: string;
  /** When set, only count rows whose `status` matches (case-insensitive). */
  statusFilter?: string;
  /** Volunteer tasks — filter by assignee when set. */
  assigneeUserId?: string;
};

const ROLE_QUEUE_MODULES: Record<NgoRole, QueueModule[]> = {
  super_admin: [
    { module: "milestones", label: "Milestones", navigateTo: "milestone-reporting" },
    { module: "tasks", label: "Open tasks", navigateTo: "task-assignment", statusFilter: "open" },
    { module: "approvals", label: "Pending approvals", navigateTo: "compliance-workflow", statusFilter: "pending" },
    { module: "funds", label: "Fund releases", navigateTo: "fund-tracking" },
  ],
  finance_officer: [
    { module: "funds", label: "Fund releases", navigateTo: "funds" },
    { module: "budget_tracking", label: "Budget lines", navigateTo: "utilization-reports" },
    { module: "approvals", label: "Pending approvals", navigateTo: "compliance-workflow", statusFilter: "pending" },
  ],
  compliance_officer: [
    { module: "audits", label: "Audit items", navigateTo: "audit-requests" },
    { module: "approvals", label: "Compliance approvals", navigateTo: "compliance-workflow", statusFilter: "pending" },
    { module: "documents", label: "Workspace documents", navigateTo: "legal-documents" },
  ],
  operations_manager: [
    { module: "tasks", label: "Team tasks", navigateTo: "task-assignment" },
    { module: "milestones", label: "Milestones", navigateTo: "milestones" },
    { module: "approvals", label: "Pending approvals", navigateTo: "compliance-workflow", statusFilter: "pending" },
  ],
  field_coordinator: [
    { module: "tasks", label: "Field tasks", navigateTo: "assigned-tasks" },
    { module: "milestones", label: "Milestones due", navigateTo: "milestone-reporting" },
    { module: "timeline", label: "Field timeline", navigateTo: "field-updates" },
  ],
  reporting_executive: [
    { module: "monitoring_evaluation", label: "M&E metrics", navigateTo: "analytics-view" },
    { module: "reports", label: "Report drafts", navigateTo: "impact-reports" },
    { module: "documents", label: "Evidence files", navigateTo: "media-library" },
  ],
  volunteer: [{ module: "tasks", label: "Your tasks", navigateTo: "assigned-tasks" }],
};

type QueueRow = QueueModule & { count: number; preview: string; error?: string };

export function NgoRoleWorkQueue({
  role,
  projectId,
  token,
  onNavigate,
  viewerAuthUserId,
}: {
  role: NgoRole;
  projectId: string | null;
  token: string;
  onNavigate: (sectionId: string) => void;
  viewerAuthUserId?: string;
}) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadQueues() {
      if (!projectId || !token) {
        if (!ignore) setRows([]);
        return;
      }
      if (!ignore) setIsLoading(true);
      const specs = ROLE_QUEUE_MODULES[role].map((spec) => ({
        ...spec,
        assigneeUserId: role === "volunteer" ? viewerAuthUserId : spec.assigneeUserId,
      }));

      const results = await Promise.all(
        specs.map(async (spec): Promise<QueueRow> => {
          try {
            const res = await fetch(`/api/project-workspace/${projectId}/${spec.module}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const body = await res.json();
            if (!res.ok) {
              return { ...spec, count: 0, preview: "—", error: body.error ?? "Could not load" };
            }
            let items = (body.items ?? []) as Record<string, unknown>[];
            if (spec.statusFilter) {
              const want = spec.statusFilter.toLowerCase();
              items = items.filter((it) => String(it.status ?? "").toLowerCase() === want);
            }
            if (spec.assigneeUserId) {
              items = items.filter(
                (it) => it.assigned_to == null || it.assigned_to === spec.assigneeUserId,
              );
            }
            const preview =
              items.length === 0
                ? "Nothing queued"
                : items
                    .slice(0, 2)
                    .map((it) => String(it.title ?? it.metric_name ?? it.item_type ?? it.line_item ?? "Item"))
                    .join(" · ");
            return { ...spec, count: items.length, preview };
          } catch {
            return { ...spec, count: 0, preview: "—", error: "Network error" };
          }
        }),
      );
      if (!ignore) {
        setRows(results);
        setIsLoading(false);
      }
    }

    void loadQueues();
    return () => {
      ignore = true;
    };
  }, [projectId, token, role, viewerAuthUserId]);

  function refreshQueues() {
    if (!projectId || !token) return;
    setIsLoading(true);
    void (async () => {
      const specs = ROLE_QUEUE_MODULES[role].map((spec) => ({
        ...spec,
        assigneeUserId: role === "volunteer" ? viewerAuthUserId : spec.assigneeUserId,
      }));
      const results = await Promise.all(
        specs.map(async (spec): Promise<QueueRow> => {
          const res = await fetch(`/api/project-workspace/${projectId}/${spec.module}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const body = await res.json();
          if (!res.ok) return { ...spec, count: 0, preview: "—", error: body.error ?? "Could not load" };
          let items = (body.items ?? []) as Record<string, unknown>[];
          if (spec.statusFilter) {
            const want = spec.statusFilter.toLowerCase();
            items = items.filter((it) => String(it.status ?? "").toLowerCase() === want);
          }
          if (spec.assigneeUserId) {
            items = items.filter(
              (it) => it.assigned_to == null || it.assigned_to === spec.assigneeUserId,
            );
          }
          const preview =
            items.length === 0
              ? "Nothing queued"
              : items
                  .slice(0, 2)
                  .map((it) => String(it.title ?? it.metric_name ?? it.item_type ?? it.line_item ?? "Item"))
                  .join(" · ");
          return { ...spec, count: items.length, preview };
        }),
      );
      setRows(results);
      setIsLoading(false);
    })();
  }

  if (!projectId) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
        My Work queues unlock when your NGO has a signed CSR project workspace.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">My work</p>
          <p className="text-sm text-slate-500">Live counts from the shared project workspace API.</p>
        </div>
        <button
          type="button"
          onClick={refreshQueues}
          className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
        >
          Refresh
        </button>
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-400">Loading queues…</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {rows.map((row) => (
            <button
              key={`${row.module}-${row.label}`}
              type="button"
              onClick={() => onNavigate(row.navigateTo)}
              className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-left transition hover:border-emerald-200 hover:bg-emerald-50/50"
            >
              <p className="text-2xl font-bold text-slate-900">{row.count}</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{row.label}</p>
              <p className="mt-1 line-clamp-2 text-xs text-slate-500">{row.error ?? row.preview}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
