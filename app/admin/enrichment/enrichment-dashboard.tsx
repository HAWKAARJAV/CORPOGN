"use client";

import { useState, useEffect, useCallback } from "react";
import { AiAssistBadge } from "@/components/ai-assist-badge";
import { AI_PRODUCT_COPY } from "@/lib/ai-insights";

// ── Types ──────────────────────────────────────────────────────────────────
interface EnrichmentSummary {
  total: number;
  pending: number;
  processing: number;
  done: number;
  failed: number;
}

interface AverageScores {
  profileCompleteness: number;
  transparencyScore: number;
  verificationScore: number;
  documentationScore: number;
  financialCompleteness: number;
  projectCompleteness: number;
  overallTrustScore: number;
}

interface EnrichmentRun {
  id: string;
  run_id: string;
  started_at: string;
  completed_at: string | null;
  status: "running" | "completed" | "failed" | "partial";
  total_ngos: number;
  processed: number;
  succeeded: number;
  failed: number;
  dry_run: boolean;
}

interface NgoRow {
  id: string;
  ngo_name: string;
  state: string | null;
  enrichment_status: "pending" | "processing" | "done" | "failed";
  profile_completeness: number;
  overall_trust_score: number;
  last_enriched_at: string | null;
  enrichment_error: string | null;
  website: string | null;
}

interface ProgressData {
  summary: EnrichmentSummary;
  averageScores: AverageScores;
  sourceBreakdown: Record<string, { success: number; failed: number }>;
  recentRuns: EnrichmentRun[];
  ngos: NgoRow[];
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString("en-IN");
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending:    "bg-slate-800 text-slate-300 border border-slate-700",
    processing: "bg-violet-900/60 text-violet-300 border border-violet-700 animate-pulse",
    done:       "bg-emerald-900/60 text-emerald-300 border border-emerald-700",
    failed:     "bg-red-900/60 text-red-300 border border-red-700",
    running:    "bg-violet-900/60 text-violet-300 border border-violet-700 animate-pulse",
    completed:  "bg-emerald-900/60 text-emerald-300 border border-emerald-700",
    partial:    "bg-amber-900/60 text-amber-300 border border-amber-700",
  };
  return `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${map[status] ?? "bg-slate-800 text-slate-400"}`;
}

function ScoreBar({ value, color = "violet" }: { value: number; color?: string }) {
  const colorMap: Record<string, string> = {
    violet: "from-violet-600 to-violet-400",
    emerald: "from-emerald-600 to-emerald-400",
    amber: "from-amber-600 to-amber-400",
    blue: "from-blue-600 to-blue-400",
    rose: "from-rose-600 to-rose-400",
  };
  const grad = colorMap[color] ?? colorMap.violet;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${grad} rounded-full transition-all duration-700`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs text-slate-400 w-7 text-right">{value}</span>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────
export default function EnrichmentDashboard() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [activeTab, setActiveTab] = useState<"ngos" | "runs" | "sources">("ngos");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/enrichment/progress");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000); // auto-refresh every 15s
    return () => clearInterval(interval);
  }, [fetchData]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleTriggerAll() {
    setTriggering(true);
    try {
      const res = await fetch("/api/admin/enrichment/trigger", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batch: 50 }) });
      const json = await res.json();
      if (json.ok) { showToast(json.message, true); fetchData(); }
      else showToast(json.error ?? "Trigger failed", false);
    } catch { showToast("Network error", false); }
    finally { setTriggering(false); }
  }

  async function handleTriggerOne(ngoId: string) {
    try {
      const res = await fetch("/api/admin/enrichment/trigger", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ngoId }) });
      const json = await res.json();
      if (json.ok) { showToast(`Enrichment triggered`, true); fetchData(); }
      else showToast(json.error ?? "Trigger failed", false);
    } catch { showToast("Network error", false); }
  }

  async function handleRetry() {
    setRetrying(true);
    try {
      const res = await fetch("/api/admin/enrichment/retry", { method: "POST" });
      const json = await res.json();
      if (json.ok) { showToast(json.message, true); fetchData(); }
      else showToast(json.error ?? "Retry failed", false);
    } catch { showToast("Network error", false); }
    finally { setRetrying(false); }
  }

  const filteredNgos = (data?.ngos ?? []).filter(n => {
    const matchSearch = !search || n.ngo_name.toLowerCase().includes(search.toLowerCase()) || (n.state ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || n.enrichment_status === filterStatus;
    return matchSearch && matchStatus;
  });

  // ── Loading skeleton ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0b0f] p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="h-8 w-64 bg-slate-800 rounded-lg animate-pulse" />
          <div className="grid grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => <div key={i} className="h-28 bg-slate-800 rounded-2xl animate-pulse" />)}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0b0f] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-5xl">⚠️</div>
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={fetchData} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm hover:bg-slate-700 transition-colors">Retry</button>
        </div>
      </div>
    );
  }

  const { summary, averageScores, sourceBreakdown, recentRuns, ngos } = data!;
  const donePercent = summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#0a0b0f] text-slate-100 p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
              <span className="text-xs font-mono text-violet-400 uppercase tracking-widest">Admin Console</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">NGO Enrichment Pipeline</h1>
              <AiAssistBadge label="Autonomous AI" variant="dark" className="normal-case" />
            </div>
            <p className="text-slate-400 text-sm mt-1 max-w-2xl">{AI_PRODUCT_COPY.enrichment}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm text-slate-300 transition-all flex items-center gap-2"
            >
              <span>↻</span> Refresh
            </button>
            {summary.failed > 0 && (
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="px-4 py-2 bg-red-900/40 hover:bg-red-900/60 border border-red-800 rounded-xl text-sm text-red-300 transition-all disabled:opacity-50"
              >
                {retrying ? "Retrying…" : `Retry ${summary.failed} failed`}
              </button>
            )}
            <button
              onClick={handleTriggerAll}
              disabled={triggering}
              className="px-5 py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 rounded-xl text-sm font-medium text-white transition-all shadow-lg shadow-violet-900/40 disabled:opacity-50"
            >
              {triggering ? "Triggering…" : "▶ Enrich All Pending"}
            </button>
          </div>
        </div>

        {/* ── Progress Bar ───────────────────────────────────────────── */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Overall enrichment progress</span>
            <span className="font-semibold text-white">{donePercent}% complete</span>
          </div>
          <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-600 via-purple-500 to-violet-400 transition-all duration-1000 relative overflow-hidden"
              style={{ width: `${donePercent}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
            </div>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <span><span className="text-slate-300 font-medium">{fmt(summary.done)}</span> done</span>
            <span><span className="text-slate-300 font-medium">{fmt(summary.pending)}</span> pending</span>
            {summary.processing > 0 && <span><span className="text-violet-400 font-medium animate-pulse">{fmt(summary.processing)}</span> processing</span>}
            {summary.failed > 0 && <span><span className="text-red-400 font-medium">{fmt(summary.failed)}</span> failed</span>}
          </div>
        </div>

        {/* ── Stat Cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[
            { label: "Total NGOs",  value: summary.total,      icon: "🏢", color: "slate" },
            { label: "Enriched",    value: summary.done,        icon: "✅", color: "emerald" },
            { label: "Pending",     value: summary.pending,     icon: "⏳", color: "slate" },
            { label: "Processing",  value: summary.processing,  icon: "⚡", color: "violet" },
            { label: "Failed",      value: summary.failed,      icon: "❌", color: "red" },
          ].map(card => (
            <div key={card.label} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-colors">
              <div className="text-2xl mb-2">{card.icon}</div>
              <div className="text-2xl font-semibold">{fmt(card.value)}</div>
              <div className="text-slate-500 text-xs mt-1">{card.label}</div>
            </div>
          ))}
        </div>

        {/* ── Score Panel ────────────────────────────────────────────── */}
        {summary.done > 0 && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-slate-300 mb-5 uppercase tracking-wider">Average Scores Across Enriched NGOs</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-4">
              {[
                { label: "Profile Completeness",   value: averageScores.profileCompleteness,   color: "violet" },
                { label: "Verification Score",     value: averageScores.verificationScore,     color: "emerald" },
                { label: "Transparency Score",     value: averageScores.transparencyScore,     color: "blue" },
                { label: "Documentation Score",    value: averageScores.documentationScore,    color: "amber" },
                { label: "Financial Completeness", value: averageScores.financialCompleteness, color: "rose" },
                { label: "Project Completeness",   value: averageScores.projectCompleteness,   color: "violet" },
              ].map(s => (
                <div key={s.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{s.label}</span>
                  </div>
                  <ScoreBar value={s.value} color={s.color} />
                </div>
              ))}
            </div>
            <div className="mt-6 pt-5 border-t border-slate-800 flex items-center gap-3">
              <div className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-purple-300 bg-clip-text text-transparent">
                {averageScores.overallTrustScore}
              </div>
              <div>
                <div className="text-sm font-medium text-white">Average Overall Trust Score</div>
                <div className="text-xs text-slate-500">Across {fmt(summary.done)} enriched NGOs</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Source Breakdown ───────────────────────────────────────── */}
        {Object.keys(sourceBreakdown).length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Data Source Performance</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {Object.entries(sourceBreakdown).map(([src, stats]) => {
                const total = stats.success + stats.failed;
                const rate = total > 0 ? Math.round((stats.success / total) * 100) : 0;
                return (
                  <div key={src} className="bg-slate-800/60 rounded-xl p-4 space-y-2">
                    <div className="text-xs font-mono text-violet-400 uppercase">{src.replace(/_/g, " ")}</div>
                    <div className="flex items-end gap-1">
                      <span className="text-xl font-semibold">{rate}%</span>
                      <span className="text-xs text-slate-500 mb-0.5">success</span>
                    </div>
                    <div className="text-xs text-slate-500">{stats.success} ok · {stats.failed} failed</div>
                    <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-500 rounded-full" style={{ width: `${rate}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Tabs ───────────────────────────────────────────────────── */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
          {/* Tab Bar */}
          <div className="flex border-b border-slate-800">
            {(["ngos", "runs"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3.5 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "text-violet-300 border-b-2 border-violet-500 bg-violet-950/20"
                    : "text-slate-400 hover:text-slate-300"
                }`}
              >
                {tab === "ngos" ? `NGO Status (${ngos.length})` : `Recent Runs (${recentRuns.length})`}
              </button>
            ))}
          </div>

          {/* NGO Table */}
          {activeTab === "ngos" && (
            <div>
              {/* Filters */}
              <div className="p-4 flex flex-col sm:flex-row gap-3 border-b border-slate-800/50">
                <input
                  type="text"
                  placeholder="Search NGO name or state…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-600 transition-colors"
                />
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-violet-600 transition-colors"
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="done">Done</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                      <th className="px-5 py-3 font-medium">NGO Name</th>
                      <th className="px-4 py-3 font-medium">State</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Profile</th>
                      <th className="px-4 py-3 font-medium">Trust Score</th>
                      <th className="px-4 py-3 font-medium">Last Enriched</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {filteredNgos.map(ngo => (
                      <tr key={ngo.id} className="hover:bg-slate-800/30 transition-colors group">
                        <td className="px-5 py-3">
                          <div className="font-medium text-slate-200 group-hover:text-white transition-colors truncate max-w-52">{ngo.ngo_name}</div>
                          {ngo.website && (
                            <a href={ngo.website} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-400 hover:text-violet-300 truncate block max-w-52">
                              {ngo.website.replace(/^https?:\/\/(www\.)?/, "")}
                            </a>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{ngo.state ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={statusBadge(ngo.enrichment_status)}>
                            {ngo.enrichment_status}
                          </span>
                          {ngo.enrichment_error && (
                            <p className="text-red-400 text-[10px] mt-1 max-w-48 truncate" title={ngo.enrichment_error}>
                              {ngo.enrichment_error}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 min-w-28">
                            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full transition-all"
                                style={{ width: `${ngo.profile_completeness}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-400 w-7 text-right">{ngo.profile_completeness}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-sm font-semibold ${
                            ngo.overall_trust_score >= 70 ? "text-emerald-400" :
                            ngo.overall_trust_score >= 40 ? "text-amber-400" : "text-slate-400"
                          }`}>
                            {ngo.overall_trust_score}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{timeAgo(ngo.last_enriched_at)}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleTriggerOne(ngo.id)}
                            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-violet-900/40 border border-slate-700 hover:border-violet-700 text-slate-300 hover:text-violet-300 rounded-lg transition-all"
                          >
                            Enrich
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredNgos.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-5 py-10 text-center text-slate-500 text-sm">
                          No NGOs match the current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Runs Table */}
          {activeTab === "runs" && (
            <div className="overflow-x-auto">
              {recentRuns.length === 0 ? (
                <div className="p-10 text-center text-slate-500 text-sm">No enrichment runs recorded yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                      <th className="px-5 py-3 font-medium">Run ID</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Started</th>
                      <th className="px-4 py-3 font-medium">Duration</th>
                      <th className="px-4 py-3 font-medium">Total</th>
                      <th className="px-4 py-3 font-medium">Succeeded</th>
                      <th className="px-4 py-3 font-medium">Failed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {recentRuns.map(run => {
                      const dur = run.completed_at
                        ? Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)
                        : null;
                      return (
                        <tr key={run.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-5 py-3 font-mono text-xs text-slate-400">{run.run_id.slice(0, 8)}…</td>
                          <td className="px-4 py-3"><span className={statusBadge(run.status)}>{run.status}</span></td>
                          <td className="px-4 py-3 text-xs text-slate-400">{timeAgo(run.started_at)}</td>
                          <td className="px-4 py-3 text-xs text-slate-400">{dur != null ? `${dur}s` : "—"}</td>
                          <td className="px-4 py-3 text-slate-300">{run.total_ngos}</td>
                          <td className="px-4 py-3 text-emerald-400">{run.succeeded}</td>
                          <td className="px-4 py-3 text-red-400">{run.failed}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

      </div>

      {/* ── Toast ─────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl border text-sm font-medium transition-all
          ${toast.ok
            ? "bg-emerald-950 border-emerald-800 text-emerald-300"
            : "bg-red-950 border-red-800 text-red-300"
          }`}
        >
          <span>{toast.ok ? "✓" : "✗"}</span>
          {toast.msg}
        </div>
      )}

      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        .animate-shimmer { animation: shimmer 2s infinite; }
      `}</style>
    </div>
  );
}
