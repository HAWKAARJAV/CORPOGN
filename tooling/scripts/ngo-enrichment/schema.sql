-- ═══════════════════════════════════════════════════════════════════════════
-- CorpoGN — NGO Data Enrichment Schema Extension
-- Branch: feature/ngo-data-enrichment
-- All changes are ADDITIVE — zero data loss, no existing columns removed.
-- Run once in the Supabase SQL editor before executing the enrichment pipeline.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. EXTEND public.ngos — Organisation Identity
-- ─────────────────────────────────────────────────────────────────────────
alter table public.ngos
  add column if not exists description         text,
  add column if not exists logo_url            text,
  add column if not exists history             text,
  add column if not exists founded_year        integer,
  add column if not exists founder_name        text,
  add column if not exists ceo_name            text,
  add column if not exists chairman_name       text,
  add column if not exists managing_director   text,
  add column if not exists leadership_team     jsonb not null default '[]'::jsonb,
  add column if not exists trustees            jsonb not null default '[]'::jsonb,
  add column if not exists board_members       jsonb not null default '[]'::jsonb,
  add column if not exists advisory_board      jsonb not null default '[]'::jsonb;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. EXTEND public.ngos — Registration & Compliance
--    (registration_number, pan_number, focus_areas, state already added by
--     supabase-production-migration.sql — use IF NOT EXISTS throughout)
-- ─────────────────────────────────────────────────────────────────────────
alter table public.ngos
  add column if not exists registration_type       text,
  add column if not exists ngo_darpan_id           text,
  add column if not exists tan_number              text,
  add column if not exists gst_number              text,
  add column if not exists csr1_number             text,
  add column if not exists cert_12a                text,
  add column if not exists cert_80g                text,
  add column if not exists fcra_number             text,
  add column if not exists legal_status            text,
  add column if not exists registration_validity   text;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. EXTEND public.ngos — Contact & Location
-- ─────────────────────────────────────────────────────────────────────────
alter table public.ngos
  add column if not exists email_public            text,
  add column if not exists phone                   text,
  add column if not exists phone_alt               text,
  add column if not exists address_head_office     text,
  add column if not exists address_regional        jsonb not null default '[]'::jsonb,
  add column if not exists district                text,
  add column if not exists pincode                 text,
  add column if not exists geo_lat                 double precision,
  add column if not exists geo_lng                 double precision;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. EXTEND public.ngos — Social Media
-- ─────────────────────────────────────────────────────────────────────────
alter table public.ngos
  add column if not exists linkedin_url    text,
  add column if not exists facebook_url   text,
  add column if not exists instagram_url  text,
  add column if not exists twitter_url    text,
  add column if not exists youtube_url    text,
  add column if not exists whatsapp       text;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. EXTEND public.ngos — Sectors & Operations
-- ─────────────────────────────────────────────────────────────────────────
alter table public.ngos
  add column if not exists sector_primary      text,
  add column if not exists sectors_secondary   text[] not null default '{}',
  add column if not exists sdgs               text[] not null default '{}',
  add column if not exists csr_focus_areas    text[] not null default '{}',
  add column if not exists states_served      text[] not null default '{}',
  add column if not exists districts_served   text[] not null default '{}',
  add column if not exists cities_served      text[] not null default '{}',
  add column if not exists villages_covered   integer,
  add column if not exists countries          text[] not null default '{}';

-- ─────────────────────────────────────────────────────────────────────────
-- 6. EXTEND public.ngos — Enrichment Pipeline State
-- ─────────────────────────────────────────────────────────────────────────
alter table public.ngos
  add column if not exists enrichment_status       text not null default 'pending'
    check (enrichment_status in ('pending', 'processing', 'done', 'failed')),
  add column if not exists enrichment_started_at   timestamptz,
  add column if not exists enrichment_completed_at timestamptz,
  add column if not exists enrichment_run_id       uuid,
  add column if not exists last_enriched_at        timestamptz,
  add column if not exists enrichment_error        text,
  add column if not exists enrichment_sources_used text[] not null default '{}';

-- ─────────────────────────────────────────────────────────────────────────
-- 7. EXTEND public.ngos — Computed Scores
-- ─────────────────────────────────────────────────────────────────────────
alter table public.ngos
  add column if not exists profile_completeness    integer not null default 0
    check (profile_completeness >= 0 and profile_completeness <= 100),
  add column if not exists transparency_score      integer not null default 0
    check (transparency_score >= 0 and transparency_score <= 100),
  add column if not exists verification_score      integer not null default 0
    check (verification_score >= 0 and verification_score <= 100),
  add column if not exists documentation_score     integer not null default 0
    check (documentation_score >= 0 and documentation_score <= 100),
  add column if not exists financial_completeness  integer not null default 0
    check (financial_completeness >= 0 and financial_completeness <= 100),
  add column if not exists project_completeness    integer not null default 0
    check (project_completeness >= 0 and project_completeness <= 100),
  add column if not exists overall_trust_score     integer not null default 0
    check (overall_trust_score >= 0 and overall_trust_score <= 100);

-- ─────────────────────────────────────────────────────────────────────────
-- 8. NGO PROJECTS — one row per major project
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.ngo_projects (
  id                  uuid primary key default gen_random_uuid(),
  ngo_id              uuid not null references public.ngos(id) on delete cascade,
  project_name        text not null,
  sector              text,
  description         text,
  location            text,
  states              text[] not null default '{}',
  budget_inr          numeric(18,2),
  duration_months     integer,
  start_date          date,
  end_date            date,
  completion_year     integer,
  current_status      text check (current_status in (
    'ongoing', 'completed', 'planned', 'paused', 'cancelled'
  )),
  corporate_partner   text,
  funding_agency      text,
  beneficiary_count   integer,
  beneficiary_types   text[] not null default '{}',
  outcomes            text,
  sdgs                text[] not null default '{}',
  document_urls       jsonb not null default '[]'::jsonb,
  -- Provenance
  source_url          text,
  confidence          numeric(3,2) default 0.5,
  verified            boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_ngo_projects_ngo_id on public.ngo_projects(ngo_id);

alter table public.ngo_projects enable row level security;

-- Service role has full access (enrichment pipeline)
-- Authenticated users can read (for trust scoring)
drop policy if exists "anyone authenticated reads ngo_projects" on public.ngo_projects;
create policy "anyone authenticated reads ngo_projects"
  on public.ngo_projects for select to authenticated using (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 9. NGO FINANCIALS — one row per financial year
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.ngo_financials (
  id                    uuid primary key default gen_random_uuid(),
  ngo_id                uuid not null references public.ngos(id) on delete cascade,
  financial_year        text not null,               -- e.g. '2023-24'
  income_total          numeric(18,2),
  expenses_total        numeric(18,2),
  assets_total          numeric(18,2),
  liabilities_total     numeric(18,2),
  corpus_fund           numeric(18,2),
  govt_grants           numeric(18,2),
  csr_funding           numeric(18,2),
  foreign_funding       numeric(18,2),
  donations             numeric(18,2),
  major_donors          jsonb not null default '[]'::jsonb,
  annual_report_url     text,
  audit_report_url      text,
  -- Provenance
  source_url            text,
  confidence            numeric(3,2) default 0.5,
  verified              boolean not null default false,
  created_at            timestamptz not null default now(),
  unique (ngo_id, financial_year)
);

create index if not exists idx_ngo_financials_ngo_id on public.ngo_financials(ngo_id);

alter table public.ngo_financials enable row level security;
drop policy if exists "anyone authenticated reads ngo_financials" on public.ngo_financials;
create policy "anyone authenticated reads ngo_financials"
  on public.ngo_financials for select to authenticated using (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 10. NGO IMPACT METRICS — measurable KPIs
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.ngo_impact_metrics (
  id              uuid primary key default gen_random_uuid(),
  ngo_id          uuid not null references public.ngos(id) on delete cascade,
  metric_name     text not null,      -- e.g. 'beneficiaries', 'schools', 'trees_planted'
  metric_value    numeric(18,2),
  metric_unit     text,               -- e.g. 'persons', 'schools', 'acres'
  metric_year     integer,
  category        text,               -- 'children', 'women', 'health', 'environment', etc.
  -- Provenance
  source_url      text,
  confidence      numeric(3,2) default 0.5,
  verified        boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (ngo_id, metric_name, metric_year)
);

create index if not exists idx_ngo_impact_metrics_ngo_id on public.ngo_impact_metrics(ngo_id);

alter table public.ngo_impact_metrics enable row level security;
drop policy if exists "anyone authenticated reads ngo_impact_metrics" on public.ngo_impact_metrics;
create policy "anyone authenticated reads ngo_impact_metrics"
  on public.ngo_impact_metrics for select to authenticated using (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 11. NGO PARTNERS
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.ngo_partners (
  id              uuid primary key default gen_random_uuid(),
  ngo_id          uuid not null references public.ngos(id) on delete cascade,
  partner_name    text not null,
  partner_type    text not null check (partner_type in (
    'corporate', 'government', 'academic', 'international', 'ngo', 'other'
  )),
  partnership_details text,
  since_year      integer,
  -- Provenance
  source_url      text,
  confidence      numeric(3,2) default 0.5,
  verified        boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (ngo_id, partner_name, partner_type)
);

create index if not exists idx_ngo_partners_ngo_id on public.ngo_partners(ngo_id);

alter table public.ngo_partners enable row level security;
drop policy if exists "anyone authenticated reads ngo_partners" on public.ngo_partners;
create policy "anyone authenticated reads ngo_partners"
  on public.ngo_partners for select to authenticated using (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 12. NGO AWARDS & RECOGNITION
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.ngo_awards (
  id              uuid primary key default gen_random_uuid(),
  ngo_id          uuid not null references public.ngos(id) on delete cascade,
  award_name      text not null,
  awarded_by      text,
  award_year      integer,
  description     text,
  award_url       text,
  -- Provenance
  source_url      text,
  confidence      numeric(3,2) default 0.5,
  verified        boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists idx_ngo_awards_ngo_id on public.ngo_awards(ngo_id);

alter table public.ngo_awards enable row level security;
drop policy if exists "anyone authenticated reads ngo_awards" on public.ngo_awards;
create policy "anyone authenticated reads ngo_awards"
  on public.ngo_awards for select to authenticated using (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 13. NGO ENRICHMENT SOURCES — field-level provenance log
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.ngo_enrichment_sources (
  id              uuid primary key default gen_random_uuid(),
  ngo_id          uuid not null references public.ngos(id) on delete cascade,
  run_id          uuid not null,
  source_type     text not null check (source_type in (
    'official_website',
    'give_discover',
    'csrbox',
    'fcra_online',
    'ngo_darpan',
    'linkedin',
    'annual_report',
    'manual'
  )),
  source_url      text,
  fields_updated  text[] not null default '{}',  -- which fields this source contributed
  raw_data        jsonb not null default '{}',    -- raw extracted data
  confidence      numeric(3,2) default 0.5,
  fetch_success   boolean not null default true,
  fetch_error     text,
  fetched_at      timestamptz not null default now()
);

create index if not exists idx_ngo_enrichment_sources_ngo_id on public.ngo_enrichment_sources(ngo_id);
create index if not exists idx_ngo_enrichment_sources_run_id on public.ngo_enrichment_sources(run_id);

alter table public.ngo_enrichment_sources enable row level security;
drop policy if exists "anyone authenticated reads ngo_enrichment_sources" on public.ngo_enrichment_sources;
create policy "anyone authenticated reads ngo_enrichment_sources"
  on public.ngo_enrichment_sources for select to authenticated using (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 14. NGO ENRICHMENT RUNS — pipeline audit log
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.ngo_enrichment_runs (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null unique,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  status          text not null default 'running'
    check (status in ('running', 'completed', 'failed', 'partial')),
  total_ngos      integer not null default 0,
  processed       integer not null default 0,
  succeeded       integer not null default 0,
  failed          integer not null default 0,
  dry_run         boolean not null default false,
  trigger_type    text not null default 'manual'
    check (trigger_type in ('manual', 'scheduled', 'api')),
  triggered_by    text,
  error           text,
  metadata        jsonb not null default '{}'
);

create index if not exists idx_ngo_enrichment_runs_started_at
  on public.ngo_enrichment_runs(started_at desc);

alter table public.ngo_enrichment_runs enable row level security;
drop policy if exists "anyone authenticated reads ngo_enrichment_runs" on public.ngo_enrichment_runs;
create policy "anyone authenticated reads ngo_enrichment_runs"
  on public.ngo_enrichment_runs for select to authenticated using (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 15. INDEXES on new ngo columns for dashboard queries
-- ─────────────────────────────────────────────────────────────────────────
create index if not exists idx_ngos_enrichment_status
  on public.ngos(enrichment_status);
create index if not exists idx_ngos_profile_completeness
  on public.ngos(profile_completeness);
create index if not exists idx_ngos_overall_trust_score
  on public.ngos(overall_trust_score);
create index if not exists idx_ngos_last_enriched_at
  on public.ngos(last_enriched_at);

-- ─────────────────────────────────────────────────────────────────────────
-- 16. TRIGGERS for updated_at on new tables
-- ─────────────────────────────────────────────────────────────────────────
drop trigger if exists touch_ngo_projects_updated_at on public.ngo_projects;
create trigger touch_ngo_projects_updated_at
  before update on public.ngo_projects
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- DONE
-- ─────────────────────────────────────────────────────────────────────────
