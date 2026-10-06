-- ═══════════════════════════════════════════════════════════════════════════
-- CorpoGN — Trust Score / Match Score engine, Phase 3
-- Additive only. Keys on discovered_ngos.id (the id space the existing
-- Matchmaker tab / pre_assignments / research_logs flow already uses) —
-- NOT the live ngos.id space, per explicit decision.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Trust score — intrinsic to the NGO, computed by a weekly batch job ──
create table if not exists public.ngo_trust_scores (
  id                        uuid primary key default gen_random_uuid(),
  ngo_id                    uuid not null references public.discovered_ngos(id) on delete cascade,
  scoring_version           text not null default 'v1',
  computed_at               timestamptz not null default now(),
  compliance_score          numeric(5,2) not null check (compliance_score >= 0 and compliance_score <= 25),
  verification_score        numeric(5,2) not null check (verification_score >= 0 and verification_score <= 20),
  transparency_score        numeric(5,2) not null check (transparency_score >= 0 and transparency_score <= 20),
  csr_track_record_score    numeric(5,2) not null check (csr_track_record_score >= 0 and csr_track_record_score <= 20),
  track_record_depth_score  numeric(5,2) not null check (track_record_depth_score >= 0 and track_record_depth_score <= 15),
  trust_score_total         numeric(5,2) not null check (trust_score_total >= 0 and trust_score_total <= 100),
  component_breakdown       jsonb not null default '{}'::jsonb,
  data_completeness_pct     numeric(5,2) not null check (data_completeness_pct >= 0 and data_completeness_pct <= 100),
  is_current                boolean not null default true
);

create index if not exists idx_ngo_trust_scores_ngo_id on public.ngo_trust_scores(ngo_id);
create unique index if not exists idx_ngo_trust_scores_current
  on public.ngo_trust_scores(ngo_id) where is_current;

alter table public.ngo_trust_scores enable row level security;
drop policy if exists "authenticated reads ngo_trust_scores" on public.ngo_trust_scores;
create policy "authenticated reads ngo_trust_scores"
  on public.ngo_trust_scores for select to authenticated using (true);

-- ── 2. Match score — per (project, ngo) pair, computed on admin click ──────
create table if not exists public.ngo_match_scores (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references public.opportunities(id) on delete cascade,
  ngo_id                uuid not null references public.discovered_ngos(id) on delete cascade,
  scoring_version       text not null default 'v1',
  computed_at           timestamptz not null default now(),
  capacity_gate_passed  boolean not null,
  capacity_gate_reason  text not null,
  sector_fit_score      numeric(5,2) check (sector_fit_score >= 0 and sector_fit_score <= 40),
  location_fit_score    numeric(5,2) check (location_fit_score >= 0 and location_fit_score <= 30),
  capacity_fit_score    numeric(5,2) check (capacity_fit_score >= 0 and capacity_fit_score <= 30),
  match_score_total     numeric(5,2) check (match_score_total >= 0 and match_score_total <= 100),
  component_breakdown   jsonb not null default '{}'::jsonb,
  trust_score_used      uuid references public.ngo_trust_scores(id),
  unique (project_id, ngo_id, scoring_version, computed_at)
);

create index if not exists idx_ngo_match_scores_project on public.ngo_match_scores(project_id);
create index if not exists idx_ngo_match_scores_ngo on public.ngo_match_scores(ngo_id);

alter table public.ngo_match_scores enable row level security;
drop policy if exists "authenticated reads ngo_match_scores" on public.ngo_match_scores;
create policy "authenticated reads ngo_match_scores"
  on public.ngo_match_scores for select to authenticated using (true);

-- ── 3. Scoring runs — one row per admin "generate recommendations" click ───
create table if not exists public.scoring_runs (
  id                          uuid primary key default gen_random_uuid(),
  project_id                  uuid not null references public.opportunities(id) on delete cascade,
  run_by                      uuid references public.admin_users(id),
  triggered_at                timestamptz not null default now(),
  scoring_version             text not null default 'v1',
  candidate_pool_size         integer not null default 0,
  capacity_gate_excluded_count integer not null default 0,
  top_10_ngo_ids              uuid[] not null default '{}',
  admin_action                text not null default 'pending'
    check (admin_action in ('pending', 'recommended', 'overridden', 'rejected')),
  admin_override_notes        text
);

create index if not exists idx_scoring_runs_project on public.scoring_runs(project_id);
create index if not exists idx_scoring_runs_triggered_at on public.scoring_runs(triggered_at desc);

alter table public.scoring_runs enable row level security;
drop policy if exists "authenticated reads scoring_runs" on public.scoring_runs;
create policy "authenticated reads scoring_runs"
  on public.scoring_runs for select to authenticated using (true);

-- ── 4. Extend pre_assignments with the override-tracking signal ────────────
-- pre_assignments (opportunity_id, discovered_ngo_id, match_score, status)
-- already exists as the per-NGO admin action record from the Matchmaker tab.
alter table public.pre_assignments
  add column if not exists scoring_run_id  uuid references public.scoring_runs(id),
  add column if not exists was_in_top_10   boolean,
  add column if not exists override_notes  text;
