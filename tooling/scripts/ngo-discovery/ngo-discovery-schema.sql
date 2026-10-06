-- ═══════════════════════════════════════════════════════════════════
-- CorpoGN — NGO Auto-Discovery Pipeline Schema
-- Branch: feature/auto-ngo-discovery
--
-- Run AFTER the existing schema migrations.
-- All changes are ADDITIVE — no existing tables dropped or modified.
-- Safe to re-run (all CREATE TABLE IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- HELPER: ensure touch_updated_at trigger function exists
-- (already created in supabase-schema.sql, guard for standalone use)
-- ─────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 1. PIPELINE RUN LOG — every step of every run
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.research_logs (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null,             -- groups all entries for one pipeline execution
  step          text not null,             -- 'discover' | 'rank' | 'dedup' | 'enrich' | 'categorize' | 'score' | 'upload'
  entity_type   text,                      -- 'ngo' | 'pipeline' | 'source'
  entity_ref    text,                      -- slug or name of the NGO (not FK — might not exist yet)
  message       text not null,
  metadata      jsonb not null default '{}',
  severity      text not null default 'info'
    check (severity in ('debug', 'info', 'warn', 'error')),
  created_at    timestamptz not null default now()
);

alter table public.research_logs enable row level security;

-- Service role has full access (pipeline inserts via service role)
-- Authenticated users can read (for future admin UI)
create policy "authenticated read research_logs"
on public.research_logs for select
to authenticated
using (true);

-- Clients cannot insert (pipeline only, via service role)
create policy "no direct client insert on research_logs"
on public.research_logs for insert
to authenticated
with check (false);

create index if not exists idx_research_logs_run_id
  on public.research_logs(run_id);
create index if not exists idx_research_logs_step
  on public.research_logs(step);
create index if not exists idx_research_logs_created_at
  on public.research_logs(created_at desc);

-- ─────────────────────────────────────────────────────────────────
-- 2. DISCOVERED_NGOS — primary profile record (pipeline-managed)
--    NOTE: Separate from `ngos` (which requires auth_user_id).
--    Has a `claimed_ngo_id` FK → ngos.id for when the NGO registers.
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.discovered_ngos (
  id                      uuid primary key default gen_random_uuid(),

  -- Pipeline provenance
  pipeline_run_id         uuid not null,
  give_discover_slug      text unique,              -- give.do/ngo/<slug>/ — dedup key
  give_discover_url       text,

  -- Give Discover quality signals (sourced from listing + profile pages)
  certification_tier      text                      -- 'Gold' | 'Silver' | 'Bronze' | 'None'
    check (certification_tier in ('Gold', 'Silver', 'Bronze', 'None') or certification_tier is null),
  transparency_rating     numeric(3,1),             -- Give Discover's 0.0–5.0 rating

  -- Legal / registration identity
  name                    text not null,
  legal_name              text,
  org_type                text,                     -- 'Trust' | 'Society' | 'Section 8' | 'Other'
  registration_number     text,
  pan                     text,
  fcra_number             text,
  ngo_darpan_id           text,                     -- ALWAYS NULL from pipeline (admin fills later)
  founded_year            integer,
  csr_eligible            boolean,

  -- Location
  website                 text,
  website_domain          text,                     -- normalised apex domain for dedup
  city                    text,
  state                   text,
  headquarters_address    text,

  -- Discovery meta
  wikipedia_match         boolean not null default false,  -- found in Wikipedia NGO list
  wikipedia_name          text,

  -- Claimed by a registered NGO (future "claim this NGO" flow)
  claimed_ngo_id          uuid references public.ngos(id) on delete set null,

  -- Computed scores (all 0–100)
  impact_score            numeric(5,2),
  transparency_score      numeric(5,2),
  completeness_score      numeric(5,2),
  verification_score      numeric(5,2),
  composite_rank          numeric(5,2),

  -- Processing state
  enrich_status           text not null default 'pending'
    check (enrich_status in ('pending', 'enriched', 'failed', 'skipped')),
  enrich_error            text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.discovered_ngos enable row level security;

create policy "authenticated read discovered_ngos"
on public.discovered_ngos for select
to authenticated
using (true);

create policy "no direct client insert on discovered_ngos"
on public.discovered_ngos for insert
to authenticated
with check (false);

drop trigger if exists touch_discovered_ngos_updated_at on public.discovered_ngos;
create trigger touch_discovered_ngos_updated_at
before update on public.discovered_ngos
for each row execute function public.touch_updated_at();

create index if not exists idx_discovered_ngos_pipeline_run_id
  on public.discovered_ngos(pipeline_run_id);
create index if not exists idx_discovered_ngos_certification_tier
  on public.discovered_ngos(certification_tier);
create index if not exists idx_discovered_ngos_composite_rank
  on public.discovered_ngos(composite_rank desc nulls last);
create index if not exists idx_discovered_ngos_city
  on public.discovered_ngos(city);
create index if not exists idx_discovered_ngos_claimed_ngo_id
  on public.discovered_ngos(claimed_ngo_id) where claimed_ngo_id is not null;

-- ─────────────────────────────────────────────────────────────────
-- 3. DISCOVERED_NGO_CATEGORIES — multi-tag per NGO
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.discovered_ngo_categories (
  id          uuid primary key default gen_random_uuid(),
  ngo_id      uuid not null references public.discovered_ngos(id) on delete cascade,
  category    text not null,
    -- e.g. 'Education' | 'Healthcare' | 'Women Empowerment' | 'Environment' |
    --      'Child Welfare' | 'Disability' | 'Livelihood' | 'Rural Development' |
    --      'Water & Sanitation' | 'Disaster Relief' | 'Animal Welfare' | 'Arts & Culture'
  confidence  text not null default 'medium'
    check (confidence in ('high', 'medium', 'low')),
  source      text,                               -- 'give_discover_explicit' | 'program_text_inferred'
  created_at  timestamptz not null default now()
);

alter table public.discovered_ngo_categories enable row level security;

create policy "authenticated read discovered_ngo_categories"
on public.discovered_ngo_categories for select
to authenticated
using (true);

create policy "no direct client insert on discovered_ngo_categories"
on public.discovered_ngo_categories for insert
to authenticated
with check (false);

create index if not exists idx_discovered_ngo_categories_ngo_id
  on public.discovered_ngo_categories(ngo_id);
create index if not exists idx_discovered_ngo_categories_category
  on public.discovered_ngo_categories(category);

-- ─────────────────────────────────────────────────────────────────
-- 4. DISCOVERED_NGO_FINANCIALS — per-year financial data
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.discovered_ngo_financials (
  id                  uuid primary key default gen_random_uuid(),
  ngo_id              uuid not null references public.discovered_ngos(id) on delete cascade,
  year                integer not null,           -- financial year start (e.g. 2023 for FY 2023-24)
  total_income        numeric(18,2),
  total_expenditure   numeric(18,2),
  programme_expenses  numeric(18,2),
  admin_expenses      numeric(18,2),
  -- Provenance
  source_url          text,
  verified            boolean not null default false,
  last_checked        timestamptz not null default now(),
  confidence          text not null default 'medium'
    check (confidence in ('high', 'medium', 'low')),
  created_at          timestamptz not null default now(),
  unique (ngo_id, year)
);

alter table public.discovered_ngo_financials enable row level security;

create policy "authenticated read discovered_ngo_financials"
on public.discovered_ngo_financials for select
to authenticated
using (true);

create policy "no direct client insert on discovered_ngo_financials"
on public.discovered_ngo_financials for insert
to authenticated
with check (false);

create index if not exists idx_discovered_ngo_financials_ngo_id
  on public.discovered_ngo_financials(ngo_id);

-- ─────────────────────────────────────────────────────────────────
-- 5. DISCOVERED_NGO_PROJECTS — programs / schemes
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.discovered_ngo_projects (
  id              uuid primary key default gen_random_uuid(),
  ngo_id          uuid not null references public.discovered_ngos(id) on delete cascade,
  name            text not null,
  description     text,
  beneficiaries   text,                           -- free text: "5000 children" (NULL if not found)
  location        text,
  status          text,                           -- 'ongoing' | 'completed' | 'upcoming'
  source_url      text,
  confidence      text not null default 'medium'
    check (confidence in ('high', 'medium', 'low')),
  created_at      timestamptz not null default now()
);

alter table public.discovered_ngo_projects enable row level security;

create policy "authenticated read discovered_ngo_projects"
on public.discovered_ngo_projects for select
to authenticated
using (true);

create policy "no direct client insert on discovered_ngo_projects"
on public.discovered_ngo_projects for insert
to authenticated
with check (false);

create index if not exists idx_discovered_ngo_projects_ngo_id
  on public.discovered_ngo_projects(ngo_id);

-- ─────────────────────────────────────────────────────────────────
-- 6. DISCOVERED_NGO_SOURCES — audit trail of every URL fetched
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.discovered_ngo_sources (
  id              uuid primary key default gen_random_uuid(),
  ngo_id          uuid references public.discovered_ngos(id) on delete cascade,
  -- ngo_id may be null for pipeline-level discovery fetches (listing pages, Wikipedia)
  run_id          uuid not null,
  source_type     text not null
    check (source_type in (
      'give_discover_listing',
      'give_discover_profile',
      'wikipedia',
      'official_website',
      'robots_txt'
    )),
  url             text not null,
  fetched_at      timestamptz not null default now(),
  http_status     integer,
  content_length  bigint,
  raw_html_sha256 text,                           -- SHA-256 of response body for dedup
  parse_success   boolean not null default false,
  parse_error     text,
  robots_allowed  boolean,
  created_at      timestamptz not null default now()
);

alter table public.discovered_ngo_sources enable row level security;

create policy "authenticated read discovered_ngo_sources"
on public.discovered_ngo_sources for select
to authenticated
using (true);

create policy "no direct client insert on discovered_ngo_sources"
on public.discovered_ngo_sources for insert
to authenticated
with check (false);

create index if not exists idx_discovered_ngo_sources_ngo_id
  on public.discovered_ngo_sources(ngo_id);
create index if not exists idx_discovered_ngo_sources_run_id
  on public.discovered_ngo_sources(run_id);
create index if not exists idx_discovered_ngo_sources_source_type
  on public.discovered_ngo_sources(source_type);

-- ─────────────────────────────────────────────────────────────────
-- 7. DISCOVERED_NGO_CONTACTS — contact info with provenance
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.discovered_ngo_contacts (
  id            uuid primary key default gen_random_uuid(),
  ngo_id        uuid not null references public.discovered_ngos(id) on delete cascade,
  contact_type  text not null
    check (contact_type in ('email', 'phone', 'postal')),
  value         text not null,
  label         text,                             -- e.g. 'Main Office', 'CEO'
  source_url    text,
  verified      boolean not null default false,
  last_checked  timestamptz not null default now(),
  confidence    text not null default 'medium'
    check (confidence in ('high', 'medium', 'low')),
  created_at    timestamptz not null default now()
);

alter table public.discovered_ngo_contacts enable row level security;

create policy "authenticated read discovered_ngo_contacts"
on public.discovered_ngo_contacts for select
to authenticated
using (true);

create policy "no direct client insert on discovered_ngo_contacts"
on public.discovered_ngo_contacts for insert
to authenticated
with check (false);

create index if not exists idx_discovered_ngo_contacts_ngo_id
  on public.discovered_ngo_contacts(ngo_id);

-- ─────────────────────────────────────────────────────────────────
-- 8. DISCOVERED_NGO_SOCIALS — social media links
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.discovered_ngo_socials (
  id            uuid primary key default gen_random_uuid(),
  ngo_id        uuid not null references public.discovered_ngos(id) on delete cascade,
  platform      text not null
    check (platform in ('facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'other')),
  url           text not null,
  source_url    text,
  verified      boolean not null default false,
  last_checked  timestamptz not null default now(),
  confidence    text not null default 'medium'
    check (confidence in ('high', 'medium', 'low')),
  created_at    timestamptz not null default now(),
  unique (ngo_id, platform)
);

alter table public.discovered_ngo_socials enable row level security;

create policy "authenticated read discovered_ngo_socials"
on public.discovered_ngo_socials for select
to authenticated
using (true);

create policy "no direct client insert on discovered_ngo_socials"
on public.discovered_ngo_socials for insert
to authenticated
with check (false);

create index if not exists idx_discovered_ngo_socials_ngo_id
  on public.discovered_ngo_socials(ngo_id);

-- ─────────────────────────────────────────────────────────────────
-- 9. DISCOVERED_NGO_METRICS — impact metrics
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.discovered_ngo_metrics (
  id            uuid primary key default gen_random_uuid(),
  ngo_id        uuid not null references public.discovered_ngos(id) on delete cascade,
  metric_name   text not null,                   -- e.g. 'beneficiaries_reached', 'schools_built'
  metric_value  numeric,
  unit          text,                            -- e.g. 'people', 'schools', 'villages'
  year          integer,
  source_url    text,
  verified      boolean not null default false,
  last_checked  timestamptz not null default now(),
  confidence    text not null default 'medium'
    check (confidence in ('high', 'medium', 'low')),
  created_at    timestamptz not null default now()
);

alter table public.discovered_ngo_metrics enable row level security;

create policy "authenticated read discovered_ngo_metrics"
on public.discovered_ngo_metrics for select
to authenticated
using (true);

create policy "no direct client insert on discovered_ngo_metrics"
on public.discovered_ngo_metrics for insert
to authenticated
with check (false);

create index if not exists idx_discovered_ngo_metrics_ngo_id
  on public.discovered_ngo_metrics(ngo_id);

-- ─────────────────────────────────────────────────────────────────
-- 10. DISCOVERED_NGO_REPORTS — annual reports / PDFs
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.discovered_ngo_reports (
  id            uuid primary key default gen_random_uuid(),
  ngo_id        uuid not null references public.discovered_ngos(id) on delete cascade,
  report_type   text not null
    check (report_type in ('annual_report', 'audited_financials', 'impact_report', 'csr_report', 'other')),
  title         text,
  year          integer,
  url           text,                            -- direct URL to PDF/page (may be null if only title known)
  source_url    text,
  confidence    text not null default 'medium'
    check (confidence in ('high', 'medium', 'low')),
  created_at    timestamptz not null default now()
);

alter table public.discovered_ngo_reports enable row level security;

create policy "authenticated read discovered_ngo_reports"
on public.discovered_ngo_reports for select
to authenticated
using (true);

create policy "no direct client insert on discovered_ngo_reports"
on public.discovered_ngo_reports for insert
to authenticated
with check (false);

create index if not exists idx_discovered_ngo_reports_ngo_id
  on public.discovered_ngo_reports(ngo_id);

-- ═══════════════════════════════════════════════════════════════════
-- DONE — 10 new tables created.
-- No existing tables were dropped or modified.
-- ═══════════════════════════════════════════════════════════════════
