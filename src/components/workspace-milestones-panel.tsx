"use client";

import { useEffect, useState } from "react";

type MilestoneRow = {
  id: string;
  title: string;
  due_date?: string | null;
  status?: string | null;
  progress?: number | null;
};

/**
 * Shared milestone list backed by /api/project-workspace/:projectId/milestones.
 * Supports live demo: NGO updates progress → corporate reloads overview/workspace.
 */
export function WorkspaceMilestonesPanel({
  projectId,
  getToken,
  canEdit = true,
  title = "Milestones",
  description = "Progress and status are stored in the project workspace and visible to authorized corporate users.",
}: {
  projectId: string | null;
  getToken: () => Promise<string | null>;
  canEdit?: boolean;
  title?: string;
  description?: string;
}) {
  const [items, setItems] = useState<MilestoneRow[]>([]);
  const [permission, setPermission] = useState<"read" | "edit" | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    if (!projectId) return;
    setIsLoading(true);
    setError(null);
    const token = await getToken();
    if (!token) {
      setError("Your session has expired. Please sign in again.");
      setIsLoading(false);
      return;
    }
    const res = await fetch(`/api/project-workspace/${projectId}/milestones`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    if (res.ok) {
      setItems((body.items ?? []) as MilestoneRow[]);
      setPermission(body.permission ?? null);
    } else {
      setItems([]);
      setPermission(null);
      setError(body.error ?? "Could not load milestones.");
    }
    setIsLoading(false);
  }

  useEffect(() => {
    let ignore = false;
    void (async () => {
      if (!projectId || ignore) return;
      setIsLoading(true);
      setError(null);
      const token = await getToken();
      if (ignore) return;
      if (!token) {
        setError("Your session has expired. Please sign in again.");
        setIsLoading(false);
        return;
      }
      const res = await fetch(`/api/project-workspace/${projectId}/milestones`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (ignore) return;
      if (res.ok) {
        setItems((body.items ?? []) as MilestoneRow[]);
        setPermission(body.permission ?? null);
      } else {
        setItems([]);
        setPermission(null);
        setError(body.error ?? "Could not load milestones.");
      }
      setIsLoading(false);
    })();
    return () => {
      ignore = true;
    };
  }, [projectId, getToken]);

  async function saveProgress(row: MilestoneRow, progress: number) {
    if (!projectId) return;
    setSavingId(row.id);
    setError(null);
    const token = await getToken();
    if (!token) {
      setError("Your session has expired.");
      setSavingId(null);
      return;
    }
    const res = await fetch(`/api/project-workspace/${projectId}/milestones`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: row.id, progress, status: row.status ?? "in_progress" }),
    });
    const body = await res.json();
    if (res.ok) {
      await load();
    } else {
      setError(body.error ?? "Could not save milestone.");
    }
    setSavingId(null);
  }

  const editable = canEdit && permission === "edit";

  if (!projectId) {
    return (
      <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        Milestones appear once this organization has a signed project workspace.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500 mt-1">{description}</p>
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-400">Loading milestones…</p>
      ) : error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400">No milestones in this workspace yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((row) => {
            const progress = typeof row.progress === "number" ? row.progress : 0;
            return (
              <li key={row.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{row.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {row.due_date ? `Due ${row.due_date}` : "No due date"} · {row.status ?? "pending"}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-slate-800">{progress}%</span>
                </div>
                {editable ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={progress}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        setItems((prev) =>
                          prev.map((m) => (m.id === row.id ? { ...m, progress: next } : m)),
                        );
                      }}
                      className="flex-1 min-w-[120px]"
                    />
                    <button
                      type="button"
                      disabled={savingId === row.id}
                      onClick={() => {
                        const latest = items.find((m) => m.id === row.id);
                        const p = typeof latest?.progress === "number" ? latest.progress : progress;
                        void saveProgress(latest ?? row, p);
                      }}
                      className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      {savingId === row.id ? "Saving…" : "Save"}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
