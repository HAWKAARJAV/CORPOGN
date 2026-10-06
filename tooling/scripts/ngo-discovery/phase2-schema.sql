-- ═══════════════════════════════════════════════════════════════════════════
-- CorpoGN — NGO Discovery Pipeline Phase 2
-- Additive only. Adapted from a spec written against a schema that doesn't
-- match this repo's actual tables — see conversation for the reconciliation.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Give.do platform funding signals, directly on discovered_ngos ───────
-- Sourced from give.do/nonprofits/<slug> — an NGO-linked (no fuzzy matching
-- needed) aggregate of lifetime crowdfunding performance on the platform.
alter table public.discovered_ngos
  add column if not exists givedo_nonprofit_id          text,
  add column if not exists givedo_lifetime_raised_inr    numeric(18,2),
  add column if not exists givedo_donation_count         integer,
  add column if not exists givedo_supporter_count        integer,
  add column if not exists givedo_active_fundraisers_count integer,
  add column if not exists givedo_registration_doc_url   text,
  add column if not exists givedo_fcra_doc_url           text,
  add column if not exists givedo_annual_report_doc_url  text,
  add column if not exists givedo_last_synced_at         timestamptz;

-- ── 2. Project-level funding amount, extending the real project table ──────
-- (the spec called this table discovered_ngo_project_history; the real table
-- is discovered_ngo_projects — extending it in place rather than duplicating)
alter table public.discovered_ngo_projects
  add column if not exists funding_amount_inr    numeric(18,2),
  add column if not exists funding_amount_source text
    check (funding_amount_source in (
      'giveindia_campaign_disclosed',
      'corporate_partner_disclosed',
      'ngo_self_reported',
      'inferred'
    ));

-- ── 3. National CSR Data Portal / MCA CSR master data ───────────────────────
-- Company-level only — the bulk dataset has no implementing-agency name field
-- to match against discovered_ngos (verified: 16 real columns, only a
-- directly_by_company / other_implementing_agencies boolean-ish flag, no
-- agency name). Kept ngo_id nullable + unused for now; wire up later if a
-- source with real agency names is found.
create table if not exists public.discovered_ngo_csr_disclosures (
  id                  uuid primary key default gen_random_uuid(),
  company_name        text not null,
  company_cin         text,
  company_previous_cin text,
  roc                 text,
  financial_year      text not null,
  sector              text,
  state               text,
  district             text,
  csr_project_name    text,
  implementation_mode text,           -- 'directly_by_company' | 'other_implementing_agencies'
  amount_outlaid_inr  numeric(18,2),
  amount_spent_inr    numeric(18,2),
  notes               text,
  source_url          text,
  source_dataset      text not null default 'dataful_mca_csr_master',
  created_at          timestamptz not null default now()
);

create index if not exists idx_csr_disclosures_company on public.discovered_ngo_csr_disclosures(company_name);
create index if not exists idx_csr_disclosures_fy on public.discovered_ngo_csr_disclosures(financial_year);

alter table public.discovered_ngo_csr_disclosures enable row level security;
drop policy if exists "anyone authenticated reads csr_disclosures" on public.discovered_ngo_csr_disclosures;
create policy "anyone authenticated reads csr_disclosures"
  on public.discovered_ngo_csr_disclosures for select to authenticated using (true);

-- ── 4. Link discovered_ngos to the live production ngos table ──────────────
-- claimed_ngo_id already exists on discovered_ngos but has never been
-- populated — this is the join key the full-profile API needs.
create index if not exists idx_discovered_ngos_claimed_ngo_id
  on public.discovered_ngos(claimed_ngo_id) where claimed_ngo_id is not null;
