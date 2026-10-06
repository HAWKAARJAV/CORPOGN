"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft, BadgeCheck, Building2, FileText, Loader2, ShieldCheck,
  TrendingUp, Users, AlertTriangle, CheckCircle2, HelpCircle, ExternalLink,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";

// Scraped NGO text sometimes has literal HTML-entity sequences baked into
// the stored string (e.g. "SAFA&#x27;s mission") — decode the common ones
// before rendering as plain text.
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

type FullProfile = {
  core: {
    id: string; slug: string; name: string; description: string | null; mission: string | null;
    logoUrl: string | null; website: string | null; foundedYear: number | null;
    state: string | null; district: string | null; addressHeadOffice: string | null;
    email: string | null; phone: string | null; sectorPrimary: string | null;
    sectorsSecondary: string[]; statesServed: string[];
    leadershipTeam: { name: string; linkedin_url: string | null }[];
    socials: Record<string, string | null>;
  };
  categories: { category: string; confidence: string; source: string }[];
  registration: Record<string, { value: string | null; verified: boolean; source?: string | null } | string | null>;
  projectHistory: {
    name: string; description: string | null; year: number | null;
    fundingAmountInr: number | null; fundingAmountSource: string | null;
    sourceUrl: string | null; confidence: string | null; verified: boolean;
  }[];
  csrDisclosureHistory: { note: string; disclosures: unknown[] };
  financials: {
    live: { financial_year: string; income_total: number | null; expenses_total: number | null }[];
    givedoLifetimeRaisedInr: number | null;
    givedoDonationCount: number | null;
    givedoSupporterCount: number | null;
    givedoActiveFundraisersCount: number | null;
  };
  trustSignals: { signal: string; present?: boolean; value?: unknown; confidence: string; source: string }[];
  scoreBreakdown: {
    overallTrustScore: number; profileCompleteness: number; verificationScore: number;
    transparencyScore: number; documentationScore: number; financialCompleteness: number;
    projectCompleteness: number; sourcesUsed: string[];
  };
  reports: {
    live: { doc_type: string; status: string; uploaded_at: string }[];
    compliancePdfs: { registration: string | null; fcra: string | null; annualReport: string | null } | null;
  };
  capacityFilter: {
    pass: boolean; confidence: string; needsManualReview: boolean;
    capacityMultiple?: number; note: string; maxHistoricalProject: number | null; source: string | null;
  } | null;
  dataLineage: { hasDiscoveryLink: boolean; discoveryLinkConfidence: string | null; lastGivedoSync: string | null };
};

function inr(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function confidenceBadge(confidence: string) {
  const styles: Record<string, string> = {
    high: "bg-emerald-50 text-emerald-700 border-emerald-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    low: "bg-orange-50 text-orange-700 border-orange-200",
    unknown: "bg-slate-100 text-slate-500 border-slate-200",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${styles[confidence] ?? styles.unknown}`}>
      {confidence}
    </span>
  );
}

export default function NgoFullProfile({ corporateSlug, ngoId }: { corporateSlug: string; ngoId: string }) {
  const [data, setData] = useState<FullProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [projectBudget, setProjectBudget] = useState("");

  async function load(budget?: string) {
    setIsLoading(true);
    setError("");
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Not signed in.");
      setIsLoading(false);
      return;
    }
    const query = budget ? `?projectBudget=${encodeURIComponent(budget)}` : "";
    const res = await fetch(`/api/ngos/${ngoId}/full-profile${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await res.json();
    if (!res.ok) {
      setError(result.error ?? "Could not load NGO profile.");
      setIsLoading(false);
      return;
    }
    setData(result);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ngoId]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f9f4]">
        <Loader2 className="size-6 animate-spin text-slate-400" aria-hidden="true" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-sm text-red-600">{error || "Could not load this profile."}</p>
        <Link href={`/corporate/${corporateSlug}/dashboard`} className="mt-4 inline-block text-sm font-semibold text-slate-700 underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const { core, registration, projectHistory, financials, trustSignals, scoreBreakdown, reports, capacityFilter, dataLineage, categories } = data;

  return (
    <main className="min-h-screen bg-[#f7f9f4] pb-20 text-slate-950">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link
            href={`/corporate/${corporateSlug}/dashboard`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Back
          </Link>
          {dataLineage.hasDiscoveryLink ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <BadgeCheck className="size-3.5" aria-hidden="true" /> Enriched from discovery pipeline
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
              <HelpCircle className="size-3.5" aria-hidden="true" /> No discovery pipeline link — core profile only
            </span>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {/* ── Identity ─────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-start">
          {core.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={core.logoUrl} alt={core.name} className="size-16 rounded-xl border border-slate-100 object-cover" />
          ) : (
            <div className="grid size-16 place-items-center rounded-xl bg-slate-100">
              <Building2 className="size-7 text-slate-400" aria-hidden="true" />
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900">{core.name}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {core.sectorPrimary ?? "Sector unknown"} · {core.state ?? "State unknown"}
              {core.foundedYear ? ` · Founded ${core.foundedYear}` : ""}
            </p>
            {core.description ? <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-700">{decodeScrapedText(core.description)}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {core.sectorsSecondary.slice(0, 6).map((s) => (
                <span key={s} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{s}</span>
              ))}
            </div>
          </div>
          <div className="text-right text-sm text-slate-600">
            {core.website ? (
              <a href={core.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#849b34] hover:underline">
                Website <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            ) : null}
            {core.email ? <p className="mt-1">{core.email}</p> : null}
            {core.phone ? <p>{core.phone}</p> : null}
          </div>
        </section>

        {/* ── Capacity filter result, if a budget context was supplied ──── */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Capacity check</h2>
          <form
            className="mt-3 flex flex-wrap items-center gap-3"
            onSubmit={(e) => { e.preventDefault(); load(projectBudget); }}
          >
            <label className="text-sm text-slate-600" htmlFor="budget">Project budget (₹)</label>
            <input
              id="budget"
              type="number"
              value={projectBudget}
              onChange={(e) => setProjectBudget(e.target.value)}
              placeholder="e.g. 20000000"
              className="h-9 w-48 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#849b34]"
            />
            <button type="submit" className="h-9 rounded-md bg-[#849b34] px-4 text-sm font-semibold text-white hover:bg-[#71852c]">
              Check
            </button>
          </form>

          {capacityFilter ? (
            <div className={`mt-4 flex items-start gap-3 rounded-lg border p-4 ${capacityFilter.pass ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
              {capacityFilter.pass ? (
                capacityFilter.needsManualReview
                  ? <HelpCircle className="mt-0.5 size-5 shrink-0 text-amber-500" aria-hidden="true" />
                  : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden="true" />
              ) : (
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden="true" />
              )}
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {capacityFilter.needsManualReview
                    ? "Needs manual review — no capacity data"
                    : capacityFilter.pass ? "Passes capacity check" : "Fails capacity check"}
                </p>
                <p className="mt-1 text-sm text-slate-700">{capacityFilter.note}</p>
                {capacityFilter.source ? (
                  <p className="mt-1 text-xs text-slate-500">Based on: {capacityFilter.source.replace(/_/g, " ")}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Enter a project budget to run the capacity hard-filter.</p>
          )}
        </section>

        {/* ── Trust signals ────────────────────────────────────────────── */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
            <ShieldCheck className="size-4" aria-hidden="true" /> Trust signals — components, not a score
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {trustSignals.map((signal) => (
              <div key={signal.signal} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-800">{signal.signal}</p>
                  <p className="text-xs text-slate-500">
                    {signal.value !== undefined && signal.value !== null
                      ? typeof signal.value === "number" ? (signal.signal.toLowerCase().includes("funding") ? inr(signal.value) : signal.value.toLocaleString("en-IN")) : String(signal.value)
                      : signal.present ? "Confirmed" : "Not found"}
                    {" · "}{signal.source}
                  </p>
                </div>
                {confidenceBadge(signal.confidence)}
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Score breakdown (composite, for reference)</p>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {[
                ["Overall", scoreBreakdown.overallTrustScore],
                ["Profile", scoreBreakdown.profileCompleteness],
                ["Verification", scoreBreakdown.verificationScore],
                ["Transparency", scoreBreakdown.transparencyScore],
                ["Financial", scoreBreakdown.financialCompleteness],
                ["Projects", scoreBreakdown.projectCompleteness],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-lg bg-slate-50 p-2 text-center">
                  <p className="text-lg font-bold text-slate-800">{value as number}</p>
                  <p className="text-[10px] uppercase text-slate-500">{label}</p>
                </div>
              ))}
            </div>
            {scoreBreakdown.sourcesUsed.length ? (
              <p className="mt-2 text-xs text-slate-400">Sources: {scoreBreakdown.sourcesUsed.join(", ")}</p>
            ) : null}
          </div>
        </section>

        {/* ── Registration & legal status ─────────────────────────────── */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Registration &amp; legal status</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {Object.entries(registration).filter(([k]) => k !== "legalStatus").map(([key, entry]) => {
              const e = entry as { value: string | null; verified: boolean };
              return (
                <div key={key} className="rounded-lg border border-slate-100 p-3">
                  <p className="text-xs font-semibold uppercase text-slate-400">{key.replace(/([A-Z])/g, " $1")}</p>
                  <p className="mt-1 text-sm font-medium text-slate-800">{e.value ?? "Not on record"}</p>
                  <p className={`mt-1 text-xs font-semibold ${e.verified ? "text-emerald-600" : "text-slate-400"}`}>
                    {e.verified ? "Confirmed" : "Unverified / not found"}
                  </p>
                </div>
              );
            })}
          </div>
          {categories.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {categories.map((c) => (
                <span key={c.category} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                  {c.category} {confidenceBadge(c.confidence)}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        {/* ── Funding / financials ─────────────────────────────────────── */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
            <TrendingUp className="size-4" aria-hidden="true" /> Funding diversity
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Give.do lifetime raised</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{inr(financials.givedoLifetimeRaisedInr)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Donations</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{financials.givedoDonationCount?.toLocaleString("en-IN") ?? "—"}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Supporters</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{financials.givedoSupporterCount?.toLocaleString("en-IN") ?? "—"}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Active fundraisers</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{financials.givedoActiveFundraisersCount ?? "—"}</p>
            </div>
          </div>
          {financials.live.length ? (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-400">
                  <th className="py-1">Year</th><th className="py-1">Income</th><th className="py-1">Expenses</th>
                </tr>
              </thead>
              <tbody>
                {financials.live.map((f) => (
                  <tr key={f.financial_year} className="border-t border-slate-100">
                    <td className="py-1.5">{f.financial_year}</td>
                    <td className="py-1.5">{inr(f.income_total)}</td>
                    <td className="py-1.5">{inr(f.expenses_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>

        {/* ── Project history ──────────────────────────────────────────── */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Project history</h2>
          {projectHistory.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No project-level history on record for this NGO yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {projectHistory.map((p, i) => (
                <li key={i} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                    {p.fundingAmountSource ? (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {p.fundingAmountSource.replace(/_/g, " ")}
                      </span>
                    ) : null}
                  </div>
                  {p.description ? <p className="mt-1 text-xs text-slate-500 line-clamp-2">{p.description.replace(/<[^>]+>/g, " ")}</p> : null}
                  <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-400">
                    {p.fundingAmountInr ? <span>{inr(p.fundingAmountInr)}</span> : null}
                    {p.confidence ? confidenceBadge(p.confidence) : null}
                    {p.sourceUrl ? (
                      <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#849b34] hover:underline">
                        Source <ExternalLink className="size-3" aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Reports / documents ──────────────────────────────────────── */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
            <FileText className="size-4" aria-hidden="true" /> Reports &amp; documents
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {reports.compliancePdfs?.registration ? (
              <a href={reports.compliancePdfs.registration} target="_blank" rel="noopener noreferrer" className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                Registration certificate
              </a>
            ) : null}
            {reports.compliancePdfs?.fcra ? (
              <a href={reports.compliancePdfs.fcra} target="_blank" rel="noopener noreferrer" className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                FCRA certificate
              </a>
            ) : null}
            {reports.compliancePdfs?.annualReport ? (
              <a href={reports.compliancePdfs.annualReport} target="_blank" rel="noopener noreferrer" className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                Annual report
              </a>
            ) : null}
            {reports.live.map((d) => (
              <span key={d.doc_type} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">
                {d.doc_type} — {d.status}
              </span>
            ))}
            {!reports.compliancePdfs?.registration && !reports.compliancePdfs?.fcra && !reports.compliancePdfs?.annualReport && reports.live.length === 0 ? (
              <p className="text-sm text-slate-500">No documents on file yet.</p>
            ) : null}
          </div>
        </section>

        {/* ── Team ──────────────────────────────────────────────────────── */}
        {core.leadershipTeam.length ? (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              <Users className="size-4" aria-hidden="true" /> Leadership
            </h2>
            <div className="mt-3 flex flex-wrap gap-3">
              {core.leadershipTeam.map((m) => (
                <span key={m.name} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                  {m.linkedin_url ? (
                    <a href={m.linkedin_url} target="_blank" rel="noopener noreferrer" className="hover:underline">{m.name}</a>
                  ) : m.name}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <p className="mt-6 text-center text-xs text-slate-400">
          {dataLineage.hasDiscoveryLink
            ? `Discovery data linked (${dataLineage.discoveryLinkConfidence}).`
            : "This NGO has no linked discovery-pipeline record yet — only its core profile is shown."}
          {" "}Government CSR disclosure matching per-NGO is not available yet.
        </p>
      </div>
    </main>
  );
}
