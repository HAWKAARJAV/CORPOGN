"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard, Database, Briefcase, Building2, ScrollText,
  TrendingUp, Award, Search, Filter, RefreshCw, ChevronLeft,
  ChevronRight, ExternalLink, CheckCircle2, Clock, AlertCircle,
  XCircle, Globe, Users, Layers, Target, Activity, Zap,
  ArrowUpRight, BarChart3, Medal, Star, Circle,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { AiAssistBadge } from "@/components/ai-assist-badge";
import { DashboardCopilot } from "@/components/dashboard-copilot";
import { AI_PRODUCT_COPY } from "@/lib/ai-insights";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Stats {
  registeredNgos: number;
  discoveredNgos: number;
  totalProjects: number;
  activeProjects: number;
  corporates: number;
  pipelineRuns: number;
  totalBudgetInr: number;
}
interface TierBreakdown { Gold: number; Silver: number; Bronze: number; None: number }
interface ProjectStatus { count: number; totalBudget: number }
interface DiscoveredNgo {
  id: string; name: string; certification_tier: string; composite_rank: number;
  transparency_score: number; impact_score: number; completeness_score: number;
  verification_score: number; city: string; enrich_status: string;
  give_discover_url: string; pan: string; wikipedia_match: boolean;
}
interface Project {
  id: string; project_name: string; focus_area: string; budget: number;
  status: string; progress: number; corporate_name: string; ngo_name: string;
  created_at: string; uc_submitted: boolean; impact_report_submitted: boolean;
  ngo_beneficiary_count: number | null;
}
interface Log {
  id: string; run_id: string; step: string; message: string;
  severity: string; created_at: string; entity_ref: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  return `₹${n.toLocaleString("en-IN")}`;
}
function pct(n: number) { return `${Math.round(n)}%`; }
function ago(ts: string) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 60) return `${Math.round(d)}s ago`;
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  return `${Math.round(d / 86400)}d ago`;
}

const TIER_COLOR: Record<string, string> = {
  Gold: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  Silver: "text-slate-300 bg-slate-300/10 border-slate-300/30",
  Bronze: "text-orange-400 bg-orange-400/10 border-orange-400/30",
  None: "text-slate-500 bg-slate-500/10 border-slate-500/20",
};
const STATUS_COLOR: Record<string, string> = {
  active: "text-emerald-400 bg-emerald-400/10",
  proposal: "text-violet-400 bg-violet-400/10",
  completed: "text-sky-400 bg-sky-400/10",
};
const SEV_COLOR: Record<string, string> = {
  info: "text-sky-400 bg-sky-400/10",
  warn: "text-amber-400 bg-amber-400/10",
  error: "text-red-400 bg-red-400/10",
  debug: "text-slate-400 bg-slate-400/10",
};

// ─── Mini bar ──────────────────────────────────────────────────────────────────

function ScoreBar({ value, color = "bg-violet-500" }: { value: number; color?: string }) {
  return (
    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

function StatCard({
  label, value, sub, icon: Icon, accent = "violet",
}: { label: string; value: string | number; sub?: string; icon: any; accent?: string }) {
  const accents: Record<string, string> = {
    violet: "from-violet-500/20 to-purple-600/10 border-violet-500/20",
    emerald: "from-emerald-500/20 to-teal-600/10 border-emerald-500/20",
    sky: "from-sky-500/20 to-cyan-600/10 border-sky-500/20",
    amber: "from-amber-500/20 to-orange-600/10 border-amber-500/20",
    rose: "from-rose-500/20 to-pink-600/10 border-rose-500/20",
    indigo: "from-indigo-500/20 to-blue-600/10 border-indigo-500/20",
  };
  const iconAccents: Record<string, string> = {
    violet: "text-violet-400 bg-violet-500/20",
    emerald: "text-emerald-400 bg-emerald-500/20",
    sky: "text-sky-400 bg-sky-500/20",
    amber: "text-amber-400 bg-amber-500/20",
    rose: "text-rose-400 bg-rose-500/20",
    indigo: "text-indigo-400 bg-indigo-500/20",
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-5 ${accents[accent]}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-xl ${iconAccents[accent]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <ArrowUpRight className="w-4 h-4 text-white/20" />
      </div>
      <div className="text-2xl font-bold text-white mb-0.5">{value}</div>
      <div className="text-sm text-white/50">{label}</div>
      {sub && <div className="text-xs text-white/30 mt-1">{sub}</div>}
    </div>
  );
}

// ─── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",   label: "Overview",      icon: LayoutDashboard },
  { id: "directory",  label: "NGO Directory", icon: Database },
  { id: "matchmaker", label: "Matchmaker & Pre-Assign", icon: Target },
  { id: "projects",   label: "Projects",      icon: Briefcase },
  { id: "pending",    label: "Pending Confirmations", icon: AlertCircle },
  { id: "corporates", label: "Corporates",    icon: Building2 },
  { id: "logs",       label: "Pipeline Logs", icon: ScrollText },
];

// ─── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: any }) {
  const { stats, tierBreakdown, projectsByStatus, categoryBreakdown, topDiscoveredNgos, recentLogs } = data;
  const totalTiers = Object.values(tierBreakdown as TierBreakdown).reduce((a, b) => a + b, 0);

  const categories = Object.entries(categoryBreakdown as Record<string, number>)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <div className="space-y-8">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label="Registered NGOs" value={stats.registeredNgos} icon={Building2} accent="violet" />
        <StatCard label="Discovered NGOs" value={stats.discoveredNgos} icon={Database} accent="indigo" sub="from pipeline" />
        <StatCard label="Total Projects" value={stats.totalProjects} icon={Briefcase} accent="sky" />
        <StatCard label="Active Projects" value={stats.activeProjects} icon={Activity} accent="emerald" />
        <StatCard label="Corporates" value={stats.corporates} icon={Building2} accent="amber" />
        <StatCard label="Pipeline Runs" value={stats.pipelineRuns} icon={Zap} accent="rose" />
      </div>

      {/* Budget */}
      {stats.totalBudgetInr > 0 && (
        <div className="rounded-2xl border border-white/5 bg-gradient-to-r from-violet-900/30 to-indigo-900/20 p-5 flex items-center gap-6">
          <div className="p-3 rounded-2xl bg-violet-500/20 text-violet-400">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-white/40 mb-1 uppercase tracking-wider">Total CSR Portfolio Value</div>
            <div className="text-3xl font-bold text-white">{fmt(stats.totalBudgetInr)}</div>
          </div>
          <div className="ml-auto flex gap-6">
            {Object.entries(projectsByStatus as Record<string, ProjectStatus>).map(([s, v]) => (
              <div key={s} className="text-center">
                <div className="text-lg font-semibold text-white">{v.count}</div>
                <div className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_COLOR[s] ?? "text-white/40"}`}>{s}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tier breakdown */}
        <div className="rounded-2xl border border-white/5 bg-white/3 p-5">
          <div className="flex items-center gap-2 mb-5">
            <Medal className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-semibold text-white/80">Discovered NGOs by Tier</span>
          </div>
          <div className="space-y-3">
            {(["Gold", "Silver", "Bronze", "None"] as const).map((t) => {
              const n = (tierBreakdown as TierBreakdown)[t] ?? 0;
              const pctVal = totalTiers > 0 ? (n / totalTiers) * 100 : 0;
              return (
                <div key={t}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${TIER_COLOR[t]}`}>{t}</span>
                    <span className="text-white/60">{n}</span>
                  </div>
                  <ScoreBar value={pctVal} color={t === "Gold" ? "bg-yellow-400" : t === "Silver" ? "bg-slate-400" : t === "Bronze" ? "bg-orange-500" : "bg-slate-600"} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Category breakdown */}
        <div className="rounded-2xl border border-white/5 bg-white/3 p-5">
          <div className="flex items-center gap-2 mb-5">
            <Layers className="w-4 h-4 text-sky-400" />
            <span className="text-sm font-semibold text-white/80">NGO Focus Areas</span>
          </div>
          {categories.length === 0 ? (
            <p className="text-sm text-white/30 text-center mt-8">No categories yet — run full pipeline</p>
          ) : (
            <div className="space-y-2">
              {categories.map(([cat, cnt]) => (
                <div key={cat} className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full bg-sky-400 flex-shrink-0" />
                  <span className="text-white/70 flex-1 truncate">{cat}</span>
                  <span className="text-white/50 text-xs">{cnt}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent logs */}
        <div className="rounded-2xl border border-white/5 bg-white/3 p-5">
          <div className="flex items-center gap-2 mb-5">
            <ScrollText className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-semibold text-white/80">Recent Pipeline Activity</span>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
            {(recentLogs as Log[]).slice(0, 15).map((l) => (
              <div key={l.id} className="flex items-start gap-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded text-[10px] flex-shrink-0 ${SEV_COLOR[l.severity]}`}>
                  {l.step}
                </span>
                <span className="text-white/50 truncate flex-1">{l.message}</span>
                <span className="text-white/20 flex-shrink-0">{ago(l.created_at)}</span>
              </div>
            ))}
            {recentLogs.length === 0 && <p className="text-sm text-white/30 text-center mt-8">No logs yet</p>}
          </div>
        </div>
      </div>

      {/* Top discovered NGOs */}
      <div className="rounded-2xl border border-white/5 bg-white/3 p-5">
        <div className="flex items-center gap-2 mb-5">
          <Star className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-semibold text-white/80">Top Discovered NGOs (by Composite Rank)</span>
        </div>
        {(topDiscoveredNgos as DiscoveredNgo[]).length === 0 ? (
          <p className="text-sm text-white/30 text-center py-8">No NGOs in discovered_ngos yet — run the pipeline</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-xs text-white/30">
                  <th className="text-left pb-2 pr-4">Name</th>
                  <th className="text-left pb-2 pr-4">Tier</th>
                  <th className="text-left pb-2 pr-4">City</th>
                  <th className="text-right pb-2 pr-4">Rank</th>
                  <th className="text-right pb-2 pr-4">Impact</th>
                  <th className="text-right pb-2">Verification</th>
                </tr>
              </thead>
              <tbody>
                {(topDiscoveredNgos as DiscoveredNgo[]).map((n, i) => (
                  <tr key={n.id} className="border-b border-white/3 hover:bg-white/3 transition-colors">
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="text-white/30 text-xs w-4">{i + 1}</span>
                        <a href={n.give_discover_url} target="_blank" rel="noreferrer"
                          className="text-white/80 hover:text-violet-400 transition-colors truncate max-w-[200px]">
                          {n.name}
                        </a>
                        {n.wikipedia_match && <Globe className="w-3 h-3 text-sky-400 flex-shrink-0" aria-label="Wikipedia match" />}
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${TIER_COLOR[n.certification_tier]}`}>
                        {n.certification_tier}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-white/50 text-xs">{n.city ?? "—"}</td>
                    <td className="py-2 pr-4 text-right">
                      <span className="font-bold text-white">{n.composite_rank?.toFixed(1)}</span>
                    </td>
                    <td className="py-2 pr-4 text-right text-white/60">{n.impact_score?.toFixed(0)}</td>
                    <td className="py-2 text-right text-white/60">{n.verification_score?.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── NGO Directory Tab ──────────────────────────────────────────────────────────

function DirectoryTab() {
  const [ngos, setNgos] = useState<DiscoveredNgo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("composite_rank");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "25", sort });
    if (search) params.set("search", search);
    if (tier) params.set("tier", tier);
    if (status) params.set("status", status);
    const res = await fetch(`/api/admin/ngos?${params}`);
    const d = await res.json();
    setNgos(d.ngos ?? []);
    setTotal(d.total ?? 0);
    setLoading(false);
  }, [page, search, tier, status, sort]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / 25);

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search NGO name…"
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500/50" />
        </div>
        <select value={tier} onChange={(e) => { setTier(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none focus:border-violet-500/50">
          <option value="">All Tiers</option>
          <option value="Gold">Gold</option>
          <option value="Silver">Silver</option>
          <option value="Bronze">Bronze</option>
          <option value="None">None</option>
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none focus:border-violet-500/50">
          <option value="">All Statuses</option>
          <option value="enriched">Enriched</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none focus:border-violet-500/50">
          <option value="composite_rank">Sort: Rank</option>
          <option value="impact_score">Sort: Impact</option>
          <option value="transparency_score">Sort: Transparency</option>
          <option value="verification_score">Sort: Verification</option>
          <option value="name">Sort: Name</option>
        </select>
        <button onClick={load} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        <span className="text-sm text-white/30">{total} total</span>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-white/5 bg-white/3 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-white/3 text-xs text-white/30">
                {["NGO Name", "Tier", "City", "Rank", "T", "I", "V", "C", "PAN", "Status", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b border-white/3">
                    {[...Array(10)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-white/5 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : ngos.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-white/30">
                    No NGOs found — run the discovery pipeline first.
                  </td>
                </tr>
              ) : (
                ngos.map((n) => (
                  <tr key={n.id} className="border-b border-white/3 hover:bg-white/3 transition-colors group">
                    <td className="px-4 py-3 max-w-[220px]">
                      <a href={n.give_discover_url} target="_blank" rel="noreferrer"
                        className="text-white/80 hover:text-violet-400 transition-colors truncate block">
                        {n.name}
                      </a>
                      {n.wikipedia_match && <Globe className="w-3 h-3 text-sky-400 inline ml-1" aria-label="Wikipedia" />}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${TIER_COLOR[n.certification_tier]}`}>
                        {n.certification_tier}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/50 text-xs whitespace-nowrap">{n.city ?? "—"}</td>
                    <td className="px-4 py-3 font-bold text-white">{n.composite_rank?.toFixed(1) ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5 min-w-[40px]">
                        <span className="text-xs text-white/60">{n.transparency_score?.toFixed(0)}</span>
                        <ScoreBar value={n.transparency_score} color="bg-sky-500" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5 min-w-[40px]">
                        <span className="text-xs text-white/60">{n.impact_score?.toFixed(0)}</span>
                        <ScoreBar value={n.impact_score} color="bg-emerald-500" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5 min-w-[40px]">
                        <span className="text-xs text-white/60">{n.verification_score?.toFixed(0)}</span>
                        <ScoreBar value={n.verification_score} color="bg-violet-500" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5 min-w-[40px]">
                        <span className="text-xs text-white/60">{n.completeness_score?.toFixed(0)}</span>
                        <ScoreBar value={n.completeness_score} color="bg-amber-500" />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-white/40 font-mono">{n.pan ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        n.enrich_status === "enriched" ? "text-emerald-400 bg-emerald-400/10"
                        : n.enrich_status === "failed" ? "text-red-400 bg-red-400/10"
                        : "text-amber-400 bg-amber-400/10"
                      }`}>
                        {n.enrich_status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <a href={n.give_discover_url} target="_blank" rel="noreferrer"
                        className="text-white/20 hover:text-violet-400 transition-colors opacity-0 group-hover:opacity-100">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white disabled:opacity-30 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-white/40">Page {page} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white disabled:opacity-30 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Projects Tab ──────────────────────────────────────────────────────────────

function ProjectsTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    const res = await fetch(`/api/admin/projects?${params}`);
    const d = await res.json();
    setProjects(d.projects ?? []);
    setTotal(d.total ?? 0);
    setLoading(false);
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search project, corporate, or NGO…"
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500/50" />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="proposal">Proposal</option>
          <option value="completed">Completed</option>
        </select>
        <button onClick={load} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        <span className="text-sm text-white/30">{total} total</span>
      </div>

      <div className="grid gap-4">
        {loading ? [...Array(5)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/5 bg-white/3 p-5 h-28 animate-pulse" />
        )) : projects.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-white/3 p-12 text-center text-white/30">
            No projects found
          </div>
        ) : projects.map((p) => (
          <div key={p.id} className="rounded-2xl border border-white/5 bg-white/3 p-5 hover:border-violet-500/20 transition-colors">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap mb-2">
                  <h3 className="text-white font-semibold truncate">{p.project_name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${STATUS_COLOR[p.status]}`}>{p.status}</span>
                  <span className="text-xs text-white/30 bg-white/5 px-2 py-0.5 rounded-full">{p.focus_area}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-white/50 flex-wrap">
                  <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{p.corporate_name}</span>
                  <span>→</span>
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />{p.ngo_name}</span>
                  {p.ngo_beneficiary_count && (
                    <span className="text-emerald-400">{p.ngo_beneficiary_count.toLocaleString()} beneficiaries</span>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-lg font-bold text-white">{fmt(p.budget)}</div>
                <div className="text-xs text-white/30">{new Date(p.created_at).toLocaleDateString("en-IN")}</div>
              </div>
            </div>
            {/* Progress */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-white/40 mb-1.5">
                <span>Progress</span>
                <span>{p.progress}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full">
                <div className={`h-full rounded-full transition-all ${
                  p.status === "completed" ? "bg-sky-500" : p.progress >= 70 ? "bg-emerald-500" : p.progress >= 30 ? "bg-violet-500" : "bg-amber-500"
                }`} style={{ width: `${p.progress}%` }} />
              </div>
            </div>
            {/* Flags */}
            <div className="flex gap-3 mt-3">
              {p.uc_submitted && (
                <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" /> UC Submitted
                </span>
              )}
              {p.impact_report_submitted && (
                <span className="flex items-center gap-1 text-xs text-sky-400 bg-sky-400/10 px-2 py-0.5 rounded-full">
                  <BarChart3 className="w-3 h-3" /> Impact Report
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="px-4 py-2 rounded-xl border border-white/10 text-white/50 hover:text-white disabled:opacity-30 text-sm transition-colors">
            Previous
          </button>
          <span className="text-sm text-white/40">{page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="px-4 py-2 rounded-xl border border-white/10 text-white/50 hover:text-white disabled:opacity-30 text-sm transition-colors">
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Pending Confirmations Tab ─────────────────────────────────────────────────

type PreAssignmentLedgerRow = {
  id: string;
  ngo_name: string;
  corporate_name: string;
  opportunity_title: string;
  corporate_confirmed_at: string | null;
  ngo_confirmed_at: string | null;
  activated_at: string | null;
};

function PendingConfirmationsTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [readyToActivate, setReadyToActivate] = useState<PreAssignmentLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});
  const [successId, setSuccessId] = useState<string | null>(null);
  const [activateMsg, setActivateMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ status: "pending_admin", limit: "100" });
      const [legacyRes, preRes] = await Promise.all([
        fetch(`/api/admin/projects?${params}`),
        fetch("/api/admin/pre-assignments"),
      ]);
      const d = await legacyRes.json();
      if (!legacyRes.ok) throw new Error(d.error || `HTTP ${legacyRes.status}`);
      setProjects(d.projects ?? []);

      const pre = await preRes.json();
      const rows = (pre.pre_assignments ?? []) as PreAssignmentLedgerRow[];
      setReadyToActivate(
        rows.filter((p) => p.corporate_confirmed_at && p.ngo_confirmed_at && !p.activated_at),
      );
    } catch (e: any) {
      setError(e.message || "Failed to load pending confirmations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activatePreAssignment = async (id: string) => {
    setActionLoading(`pre-${id}`);
    setActivateMsg(null);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const res = await fetch(`/api/admin/pre-assignments/${id}/activate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Activation failed");
      setActivateMsg("Workspace activated — corporate and NGO unlock signed delivery modules.");
      await load();
    } catch (e: any) {
      setActivateMsg(e.message || "Could not activate");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecision = async (id: string, action: "approve" | "reject") => {
    setActionLoading(`${id}-${action}`);
    setActionError((prev) => ({ ...prev, [id]: "" }));
    setSuccessId(null);
    try {
      const res = await fetch("/api/admin/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setSuccessId(id);
      await load();
    } catch (e: any) {
      setActionError((prev) => ({ ...prev, [id]: e.message || "Action failed" }));
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 py-3 text-sm text-violet-100 leading-relaxed">
        <strong className="text-white">Two approval queues:</strong>{" "}
        <em>Legacy connections</em> below are <code className="text-violet-200">project_connections</code> in{" "}
        <code className="text-violet-200">pending_admin</code> (corporate used legacy assign).{" "}
        <em>Pre-assignment activation</em> is when both corporate and NGO confirmed in Matchmaker — use Activate there or in this tab.
      </div>

      <div className="flex items-center gap-3">
        <button onClick={load} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        <span className="text-sm text-white/30">
          {projects.length} legacy connection{projects.length === 1 ? "" : "s"} · {readyToActivate.length} pre-assign ready to activate
        </span>
      </div>

      {activateMsg ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{activateMsg}</div>
      ) : null}

      {readyToActivate.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white/80">Pre-assignments — both sides confirmed</h3>
          {readyToActivate.map((p) => (
            <div key={p.id} className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-white/70">
                <span className="font-semibold text-white">{p.ngo_name}</span> ↔ {p.corporate_name} · {p.opportunity_title}
              </div>
              <button
                type="button"
                onClick={() => activatePreAssignment(p.id)}
                disabled={actionLoading !== null}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-white"
              >
                {actionLoading === `pre-${p.id}` ? "Activating…" : "Activate workspace"}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <h3 className="text-sm font-semibold text-white/80 pt-2">Legacy project connections (pending admin)</h3>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-4">
        {loading ? [...Array(3)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/5 bg-white/3 p-5 h-28 animate-pulse" />
        )) : projects.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-white/3 p-12 text-center text-white/30">
            No connections pending admin approval.
          </div>
        ) : projects.map((p) => (
          <div key={p.id} className="rounded-2xl border border-white/5 bg-white/3 p-5 hover:border-violet-500/20 transition-colors">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap mb-2">
                  <h3 className="text-white font-semibold truncate">{p.project_name}</h3>
                  <span className="px-2 py-0.5 rounded-full text-xs text-amber-400 bg-amber-400/10 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> pending admin
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-white/50 flex-wrap">
                  <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{p.corporate_name}</span>
                  <span>→</span>
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />{p.ngo_name}</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-lg font-bold text-white">{fmt(p.budget)}</div>
                <div className="text-xs text-white/30">{new Date(p.created_at).toLocaleDateString("en-IN")}</div>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => handleDecision(p.id, "approve")}
                disabled={actionLoading !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white font-semibold text-xs transition-colors">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {actionLoading === `${p.id}-approve` ? "Approving…" : "Approve"}
              </button>
              <button
                onClick={() => handleDecision(p.id, "reject")}
                disabled={actionLoading !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 hover:bg-red-500/10 disabled:opacity-40 text-red-400 font-semibold text-xs transition-colors">
                <XCircle className="w-3.5 h-3.5" />
                {actionLoading === `${p.id}-reject` ? "Rejecting…" : "Reject"}
              </button>
              {successId === p.id && (
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Done
                </span>
              )}
              {actionError[p.id] && (
                <span className="text-xs text-red-400">{actionError[p.id]}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Logs Tab ──────────────────────────────────────────────────────────────────

function LogsTab() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [runs, setRuns] = useState<{ run_id: string; started_at: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [runId, setRunId] = useState("");
  const [severity, setSeverity] = useState("");
  const [step, setStep] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (runId) params.set("run_id", runId);
    if (severity) params.set("severity", severity);
    if (step) params.set("step", step);
    const res = await fetch(`/api/admin/logs?${params}`);
    const d = await res.json();
    setLogs(d.logs ?? []);
    setRuns(d.runs ?? []);
    setTotal(d.total ?? 0);
    setLoading(false);
  }, [page, runId, severity, step]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-center">
        <select value={runId} onChange={(e) => { setRunId(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none max-w-[260px]">
          <option value="">All Runs</option>
          {runs.map((r) => (
            <option key={r.run_id} value={r.run_id}>
              {r.run_id.slice(0, 8)}… ({new Date(r.started_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })})
            </option>
          ))}
        </select>
        <select value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none">
          <option value="">All Severities</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
        <select value={step} onChange={(e) => { setStep(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none">
          <option value="">All Steps</option>
          {["discover", "rank", "dedup", "enrich", "categorize", "score", "upload", "pipeline"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button onClick={load} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        <span className="text-sm text-white/30">{total} log entries</span>
      </div>

      <div className="rounded-2xl border border-white/5 bg-white/3 overflow-hidden font-mono">
        <div className="max-h-[600px] overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-white/30 text-sm">Loading logs…</div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-white/30 text-sm">No logs found — run the pipeline first</div>
          ) : logs.map((l) => (
            <div key={l.id} className={`flex items-start gap-3 px-4 py-2.5 border-b border-white/3 text-xs hover:bg-white/3 transition-colors ${
              l.severity === "error" ? "bg-red-500/3" : l.severity === "warn" ? "bg-amber-500/3" : ""
            }`}>
              <span className="text-white/20 flex-shrink-0 w-24 pt-0.5">{new Date(l.created_at).toLocaleTimeString("en-IN")}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] flex-shrink-0 uppercase font-semibold ${SEV_COLOR[l.severity]}`}>
                {l.severity}
              </span>
              <span className="text-white/40 flex-shrink-0 w-16">[{l.step}]</span>
              {l.entity_ref && <span className="text-violet-400 flex-shrink-0">{l.entity_ref}</span>}
              <span className="text-white/60 flex-1 break-all">{l.message}</span>
            </div>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white disabled:opacity-30 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-white/40">Page {page} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white disabled:opacity-30 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Corporates Tab (live from DB) ─────────────────────────────────────────────

function CorporatesTab() {
  const [corps, setCorps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/overview").then((r) => r.json()).then((d) => {
      // We reuse the overview endpoint — projects by corporate is computed client-side
      setLoading(false);
    });
    // Fetch corporates directly
    fetch("/api/admin/corporates")
      .then((r) => r.ok ? r.json() : { corporates: [] })
      .then((d) => setCorps(d.corporates ?? []))
      .catch(() => setCorps([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/5 bg-white/3 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-white/30">Loading…</div>
        ) : corps.length === 0 ? (
          <div className="p-12 text-center text-white/30 text-sm">
            No corporates data available yet.<br />
            <span className="text-xs text-white/20">Corporate accounts are created when companies sign up.</span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-xs text-white/30 bg-white/3">
                {["Company", "Industry", "Status", "Budget", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {corps.map((c: any) => (
                <tr key={c.id} className="border-b border-white/3 hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3 text-white/80">{c.company_name ?? c.name ?? "—"}</td>
                  <td className="px-4 py-3 text-white/50">{c.industry ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      c.access_status === "approved" ? "text-emerald-400 bg-emerald-400/10" : "text-amber-400 bg-amber-400/10"
                    }`}>{c.access_status ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-white/50">{c.annual_csr_budget ? fmt(Number(c.annual_csr_budget)) : "—"}</td>
                  <td className="px-4 py-3 text-white/20"><ExternalLink className="w-4 h-4" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Matchmaker Tab ────────────────────────────────────────────────────────────

interface Opportunity {
  id: string;
  title: string;
  description: string;
  focus_area: string;
  budget: number;
  state: string;
  corporate_name: string;
}

interface MatchResult {
  id: string;
  claimed_ngo_id?: string | null;
  name: string;
  certification_tier: string;
  city: string;
  state: string;
  give_discover_url: string;
  trust: {
    total: number;
    completeness: number;
    percentile: number;
    breakdown: Record<string, string>;
  };
  match: {
    total: number;
    percentile: number;
    breakdown: Record<string, string>;
    capacityGate: { pass: boolean; note: string; maxHistoricalProject: number | null; source: string | null };
  };
  finalScore: number;
  shortlist_status: string | null;
}

interface PreAssignment {
  id: string;
  match_score: number;
  status: string;
  corporate_confirmed_at?: string | null;
  ngo_confirmed_at?: string | null;
  activated_at?: string | null;
  created_at: string;
  opportunity_id: string;
  opportunity_title: string;
  focus_area: string;
  budget: number;
  state: string;
  corporate_name: string;
  discovered_ngo_id: string;
  ngo_name: string;
  ngo_tier: string;
  ngo_city: string;
  give_discover_url: string;
}

function MatchmakerTab() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [preAssignments, setPreAssignments] = useState<PreAssignment[]>([]);
  const [loadingOpps, setLoadingOpps] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [loadingPre, setLoadingPre] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [poolInfo, setPoolInfo] = useState<{ candidatePoolSize: number; capacityGateExcludedCount: number } | null>(null);
  const [scoringRunId, setScoringRunId] = useState<string | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isSendingTrustBatch, setIsSendingTrustBatch] = useState(false);
  const [suggestResult, setSuggestResult] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [overrideDraft, setOverrideDraft] = useState<{ ngoId: string; notes: string } | null>(null);
  const [activateMsg, setActivateMsg] = useState<string | null>(null);

  async function authHeader() {
    const { data } = await supabaseBrowser.auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
  }

  const loadOpps = useCallback(async () => {
    setLoadingOpps(true);
    try {
      const res = await fetch("/api/admin/opportunities");
      const d = await res.json();
      setOpportunities(d.opportunities ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingOpps(false);
    }
  }, []);

  const loadPre = useCallback(async () => {
    setLoadingPre(true);
    try {
      const res = await fetch("/api/admin/pre-assignments");
      const d = await res.json();
      setPreAssignments(d.pre_assignments ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPre(false);
    }
  }, []);

  useEffect(() => {
    loadOpps();
    loadPre();
  }, [loadOpps, loadPre]);

  const selectOpp = async (opp: Opportunity) => {
    setSelectedOpp(opp);
    setLoadingMatches(true);
    try {
      const headers = await authHeader();
      const res = await fetch(`/api/admin/matchmaking?opportunity_id=${opp.id}`, { headers });
      const d = await res.json();
      setMatches(d.matches ?? []);
      setScoringRunId(d.scoringRunId ?? null);
      setSuggestResult(null);
      setPoolInfo(
        d.candidatePoolSize !== undefined
          ? { candidatePoolSize: d.candidatePoolSize, capacityGateExcludedCount: d.capacityGateExcludedCount }
          : null,
      );
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMatches(false);
    }
  };

  const handleSuggest = async () => {
    if (!selectedOpp || !scoringRunId) return;
    setIsSuggesting(true);
    setSuggestResult(null);
    try {
      const headers = { "Content-Type": "application/json", ...(await authHeader()) };
      const res = await fetch("/api/admin/matchmaking/suggest", {
        method: "POST",
        headers,
        body: JSON.stringify({ opportunity_id: selectedOpp.id, scoring_run_id: scoringRunId }),
      });
      const result = await res.json();
      if (res.ok) {
        const merged = result.results.filter((r: { action: string }) => r.action === "merged").length;
        setSuggestResult(
          `Suggested ${result.suggested} NGO(s) — corporate sees them under My Projects → Admin Suggested and Recommended NGOs → Matchmaker suggestions (${merged} merged with an application).`,
        );
        loadPre();
      } else {
        setSuggestResult(result.error ?? "Could not suggest NGOs.");
      }
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSendTrustBatch = async () => {
    if (!selectedOpp || !matches.length) return;
    const ngoIds = [
      ...new Set(
        matches.map((m) => m.claimed_ngo_id).filter((id): id is string => Boolean(id)),
      ),
    ].slice(0, 10);
    if (!ngoIds.length) {
      setSuggestResult("No registered NGOs in the top ranks — link discovered NGOs to live accounts before sending a trust-score batch.");
      return;
    }
    setIsSendingTrustBatch(true);
    setSuggestResult(null);
    try {
      const headers = { "Content-Type": "application/json", ...(await authHeader()) };
      const res = await fetch("/api/admin/recommendations", {
        method: "POST",
        headers,
        body: JSON.stringify({ opportunityId: selectedOpp.id, ngoIds }),
      });
      const result = await res.json();
      if (res.ok) {
        setSuggestResult(
          `Trust-score batch sent to corporate Recommended NGOs (${result.recommendations?.length ?? ngoIds.length} NGOs).`,
        );
      } else {
        setSuggestResult(result.error ?? "Could not send recommendation batch.");
      }
    } finally {
      setIsSendingTrustBatch(false);
    }
  };

  const handleAssign = async (
    ngoId: string,
    score: number,
    status: "shortlisted" | "assigned" | "rejected",
    overrideNotes?: string,
  ) => {
    if (!selectedOpp) return;
    setActionLoading(`${ngoId}-${status}`);
    try {
      const headers = { "Content-Type": "application/json", ...(await authHeader()) };
      const res = await fetch("/api/admin/matchmaking", {
        method: "POST",
        headers,
        body: JSON.stringify({
          opportunity_id: selectedOpp.id,
          discovered_ngo_id: ngoId,
          match_score: score,
          status,
          override_notes: overrideNotes,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        setOverrideDraft(null);
        const updatedMatches = matches.map((m) => {
          if (m.id === ngoId) return { ...m, shortlist_status: status };
          return m;
        });
        setMatches(updatedMatches);
        loadPre();
      } else if (result.error) {
        // Override notes required — open the inline note field for this card.
        setOverrideDraft({ ngoId, notes: "" });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleActivate = async (preAssignmentId: string) => {
    setActionLoading(`activate-${preAssignmentId}`);
    setActivateMsg(null);
    try {
      const headers = { "Content-Type": "application/json", ...(await authHeader()) };
      const res = await fetch(`/api/admin/pre-assignments/${preAssignmentId}/activate`, {
        method: "POST",
        headers,
      });
      const result = await res.json();
      if (res.ok) {
        setActivateMsg("Project workspace activated — corporate and NGO dashboards can now unlock full delivery modules.");
        loadPre();
      } else {
        setActivateMsg(result.error ?? "Could not activate.");
      }
    } catch {
      setActivateMsg("Network error while activating.");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
      {/* Column 1: Opportunities List */}
      <div className="xl:col-span-1 space-y-6">
        <div className="rounded-2xl border border-white/5 bg-white/3 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-violet-400" />
              Corporate Requirements
            </h3>
            <button onClick={loadOpps} className="text-xs text-white/40 hover:text-white transition-colors">
              Refresh
            </button>
          </div>
          {loadingOpps ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 bg-white/5 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : opportunities.length === 0 ? (
            <p className="text-sm text-white/30 text-center py-6">No corporate requirements found.</p>
          ) : (
            <div className="space-y-3">
              {opportunities.map((opp) => (
                <div key={opp.id} onClick={() => selectOpp(opp)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    selectedOpp?.id === opp.id
                      ? "border-violet-500 bg-violet-500/10"
                      : "border-white/5 bg-white/3 hover:border-white/10"
                  }`}>
                  <div className="text-xs text-violet-400 font-medium mb-1">{opp.corporate_name}</div>
                  <h4 className="text-sm font-bold text-white mb-2">{opp.title}</h4>
                  <div className="flex justify-between items-center text-xs text-white/40">
                    <span>{opp.focus_area}</span>
                    <span>{opp.state}</span>
                    <span className="font-semibold text-white/70">{fmt(opp.budget)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pre-Assignments Ledger */}
        <div className="rounded-2xl border border-white/5 bg-white/3 p-5">
          <h3 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            Platform Pre-Assignments
            <AiAssistBadge label="AI scored" variant="dark" className="ml-2 normal-case" />
          </h3>
          {activateMsg ? (
            <p className="text-[11px] text-violet-300 mb-3 leading-relaxed">{activateMsg}</p>
          ) : null}
          {loadingPre ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : preAssignments.length === 0 ? (
            <p className="text-sm text-white/30 text-center py-6">No assignments yet.</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin">
              {preAssignments.map((p) => (
                <div key={p.id} className="p-3 rounded-xl border border-white/5 bg-white/2 hover:border-white/10 transition-all text-xs">
                  <div className="flex justify-between items-start mb-1.5">
                    <div>
                      <span className="font-semibold text-white">{p.ngo_name}</span>
                      <span className="text-white/40 block mt-0.5">Assigned to: {p.corporate_name}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${
                      p.status === "assigned"
                        ? "text-emerald-400 bg-emerald-400/10"
                        : p.status === "rejected"
                        ? "text-red-400 bg-red-400/10"
                        : "text-violet-400 bg-violet-400/10"
                    }`}>
                      {p.status}
                    </span>
                  </div>
                  <div className="text-[10px] text-white/30 mb-2 truncate">Project: {p.opportunity_title}</div>
                  <div className="flex justify-between items-center text-[10px] text-white/40 mb-2">
                    <span>Match Score: <span className="text-violet-400 font-bold">{p.match_score}%</span></span>
                    <span>{ago(p.created_at)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[9px] mb-2">
                    <span className={p.corporate_confirmed_at ? "text-emerald-400" : "text-amber-400"}>
                      Corp {p.corporate_confirmed_at ? "✓" : "pending"}
                    </span>
                    <span className={p.ngo_confirmed_at ? "text-emerald-400" : "text-amber-400"}>
                      NGO {p.ngo_confirmed_at ? "✓" : "pending"}
                    </span>
                    {p.activated_at ? (
                      <span className="text-emerald-400">Workspace live</span>
                    ) : null}
                  </div>
                  {!p.activated_at && p.corporate_confirmed_at && p.ngo_confirmed_at ? (
                    <button
                      type="button"
                      onClick={() => handleActivate(p.id)}
                      disabled={actionLoading === `activate-${p.id}`}
                      className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-1.5 text-[10px] font-bold text-white"
                    >
                      {actionLoading === `activate-${p.id}` ? "Activating…" : "Activate shared workspace"}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Column 2: Matchmaker Console */}
      <div className="xl:col-span-2 space-y-6">
        {selectedOpp ? (
          <div className="rounded-2xl border border-white/5 bg-white/3 p-5">
            <div className="border-b border-white/5 pb-4 mb-5">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <div className="text-xs text-violet-400 font-medium">Matchmaker Console</div>
                <AiAssistBadge label="CorpoGN AI" variant="dark" />
              </div>
              <p className="text-[11px] text-white/45 mb-2 max-w-2xl leading-relaxed">{AI_PRODUCT_COPY.matchmaker}</p>
              <h3 className="text-lg font-bold text-white mb-2">{selectedOpp.title}</h3>
              <p className="text-sm text-white/55 mb-4 leading-relaxed">{selectedOpp.description}</p>
              <div className="flex flex-wrap gap-3 text-xs text-white/60">
                <span className="bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">Focus Area: <b className="text-white">{selectedOpp.focus_area}</b></span>
                <span className="bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">Target State: <b className="text-white">{selectedOpp.state}</b></span>
                <span className="bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">Budget: <b className="text-white">{fmt(selectedOpp.budget)}</b></span>
                <span className="bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">Corporate: <b className="text-white">{selectedOpp.corporate_name}</b></span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm font-semibold text-white/80">
                <span>Ranked NGOs — Trust Score × Match Score</span>
                <div className="flex items-center gap-3">
                  {poolInfo ? (
                    <span className="text-xs text-white/40">
                      {poolInfo.candidatePoolSize} candidates · {poolInfo.capacityGateExcludedCount} excluded by capacity gate
                    </span>
                  ) : null}
                  {matches.length && scoringRunId ? (
                    <>
                      <button
                        onClick={handleSuggest}
                        disabled={isSuggesting}
                        className="rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-white transition-colors"
                      >
                        {isSuggesting ? "Suggesting..." : "Suggest Top 10 (pre-assign)"}
                      </button>
                      <button
                        onClick={handleSendTrustBatch}
                        disabled={isSendingTrustBatch}
                        className="rounded-lg border border-violet-400/40 hover:bg-violet-500/20 disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-violet-200 transition-colors"
                      >
                        {isSendingTrustBatch ? "Sending…" : "Send trust-score batch"}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              {suggestResult ? <p className="text-xs text-emerald-400">{suggestResult}</p> : null}

              {loadingMatches ? (
                <div className="space-y-3 py-4">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-24 bg-white/5 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : matches.length === 0 ? (
                <p className="text-sm text-white/30 text-center py-12">No matching NGOs found. Ensure you run the pipeline first.</p>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 scrollbar-thin">
                  {matches.map((m, index) => {
                    const isExpanded = expandedId === m.id;
                    const isOverrideDraft = overrideDraft?.ngoId === m.id;
                    return (
                    <div key={m.id} className="rounded-xl border border-white/5 bg-white/2 hover:bg-white/3 transition-all">
                      <div className="p-4 flex items-start gap-4">
                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center font-bold text-sm text-white/50 flex-shrink-0">
                          {index + 1}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h4 className="text-sm font-bold text-white truncate">{m.name}</h4>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] border ${TIER_COLOR[m.certification_tier]}`}>
                              {m.certification_tier}
                            </span>
                            <span className="text-[10px] text-white/40">{m.city ?? "—"}</span>
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : m.id)}
                              className="text-[10px] text-violet-400 hover:text-violet-300 ml-auto"
                            >
                              {isExpanded ? "Hide breakdown" : "Why this rank?"}
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-[10px] text-white/40 my-2">
                            <div>
                              Trust: <span className="text-white font-semibold">{m.trust.total}/100</span>
                              <span className="text-white/30"> ({m.trust.percentile}th pct, {m.trust.completeness}% data)</span>
                            </div>
                            <div>
                              Match: <span className="text-white font-semibold">{m.match.total}/100</span>
                              <span className="text-white/30"> ({m.match.percentile}th pct)</span>
                            </div>
                          </div>

                          <div className="text-[10px] text-white/30">{m.match.capacityGate.note}</div>

                          {isExpanded ? (
                            <div className="mt-3 space-y-2 rounded-lg bg-black/20 p-3 text-[11px] text-white/60">
                              <div>
                                <p className="font-semibold text-white/80 mb-1">Trust score components</p>
                                {Object.entries(m.trust.breakdown).map(([k, v]) => (
                                  <p key={k} className="leading-relaxed">· {v}</p>
                                ))}
                              </div>
                              <div>
                                <p className="font-semibold text-white/80 mb-1">Match score components</p>
                                {Object.entries(m.match.breakdown).map(([k, v]) => (
                                  <p key={k} className="leading-relaxed">· {v}</p>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {isOverrideDraft ? (
                            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                              <p className="text-[11px] text-amber-300 mb-2">
                                This NGO wasn&apos;t in the algorithm&apos;s top 10 for this project — explain why you&apos;re assigning it (required, this tunes future weights).
                              </p>
                              <textarea
                                value={overrideDraft.notes}
                                onChange={(e) => setOverrideDraft({ ngoId: m.id, notes: e.target.value })}
                                className="w-full rounded-md border border-white/10 bg-black/30 p-2 text-xs text-white outline-none focus:border-violet-500"
                                rows={2}
                                placeholder="e.g. Existing relationship with this NGO, corporate specifically requested them..."
                              />
                              <div className="mt-2 flex gap-2">
                                <button
                                  onClick={() => handleAssign(m.id, m.match.total, "assigned", overrideDraft.notes)}
                                  disabled={!overrideDraft.notes.trim() || actionLoading !== null}
                                  className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-bold text-2xs"
                                >
                                  Confirm override
                                </button>
                                <button onClick={() => setOverrideDraft(null)} className="px-2.5 py-1 rounded-lg border border-white/10 text-white/60 text-2xs">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div className="text-right flex-shrink-0 flex flex-col items-end justify-between self-stretch">
                          <div>
                            <div className="text-lg font-extrabold text-violet-400">{m.finalScore}</div>
                            <div className="text-[10px] text-white/30">Final (percentile blend)</div>
                          </div>

                          <div className="flex items-center gap-1.5 mt-4">
                            {m.shortlist_status === "shortlisted" ? (
                              <>
                                <button
                                  onClick={() => handleAssign(m.id, m.match.total, "assigned")}
                                  disabled={actionLoading !== null}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-2xs transition-colors flex items-center gap-1">
                                  {actionLoading === `${m.id}-assigned` ? "Assigning..." : "Assign Project"}
                                </button>
                                <button
                                  onClick={() => handleAssign(m.id, m.match.total, "rejected")}
                                  disabled={actionLoading !== null}
                                  className="px-2 py-1 rounded-lg border border-red-500/30 hover:bg-red-500/10 text-red-400 text-2xs transition-colors">
                                  {actionLoading === `${m.id}-rejected` ? "..." : "Reject"}
                                </button>
                              </>
                            ) : m.shortlist_status === "assigned" ? (
                              <span className="text-emerald-400 text-2xs font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Assigned
                              </span>
                            ) : m.shortlist_status === "rejected" ? (
                              <span className="text-red-400 text-2xs font-semibold flex items-center gap-1">
                                <XCircle className="w-3.5 h-3.5" /> Rejected
                              </span>
                            ) : (
                              <button
                                onClick={() => handleAssign(m.id, m.match.total, "shortlisted")}
                                disabled={actionLoading !== null}
                                className="px-3 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-bold text-2xs transition-colors">
                                {actionLoading === `${m.id}-shortlisted` ? "Shortlisting..." : "Shortlist NGO"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/5 bg-white/3 p-12 text-center text-white/30 flex flex-col items-center justify-center h-full min-h-[300px]">
            <Target className="w-12 h-12 text-white/10 mb-3 animate-pulse" />
            <h3 className="text-base font-semibold text-white/70 mb-1">No Requirement Selected</h3>
            <p className="text-sm text-white/40 max-w-sm">Select a corporate requirement from the left panel to trigger the Matchmaker calculations.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Root Dashboard ────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [tab, setTab] = useState("overview");
  const [overviewData, setOverviewData] = useState<any>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadOverview = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/overview");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setOverviewData(d);
      setOverviewError("");
    } catch (e: any) {
      setOverviewError(e.message);
    } finally {
      setOverviewLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  return (
    <div className="min-h-screen bg-[#080810] text-white">
      {/* Header */}
      <div className="border-b border-white/5 bg-white/2 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">CorpoGN Admin</div>
              <div className="text-[10px] text-white/30 -mt-0.5">Platform Control Center</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {overviewData && (
              <div className="hidden sm:flex items-center gap-1 text-xs text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-full border border-emerald-400/20">
                <Circle className="w-2 h-2 fill-emerald-400" />
                Live — {overviewData.stats.discoveredNgos} NGOs indexed
              </div>
            )}
            <button onClick={loadOverview}
              className="p-2 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-violet-500/50 transition-colors">
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-screen-2xl mx-auto px-6 flex gap-1 pb-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? "border-violet-500 text-violet-400"
                  : "border-transparent text-white/40 hover:text-white/70"
              }`}>
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-screen-2xl mx-auto px-6 py-8">
        {overviewError && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            Failed to load overview: {overviewError}
          </div>
        )}

        {tab === "overview" && (
          overviewLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
              {[...Array(6)].map((_, i) => <div key={i} className="rounded-2xl border border-white/5 bg-white/3 p-5 h-28 animate-pulse" />)}
            </div>
          ) : overviewData ? (
            <OverviewTab data={overviewData} />
          ) : null
        )}
        {tab === "directory" && <DirectoryTab />}
        {tab === "matchmaker" && <MatchmakerTab />}
        {tab === "projects" && <ProjectsTab />}
        {tab === "pending" && <PendingConfirmationsTab />}
        {tab === "corporates" && <CorporatesTab />}
        {tab === "logs" && <LogsTab />}
      </div>

      <DashboardCopilot
        portal="admin"
        orgName="CorpoGN Platform"
        section={TABS.find((t) => t.id === tab)?.label ?? tab}
        theme="dark"
      />
    </div>
  );
}
