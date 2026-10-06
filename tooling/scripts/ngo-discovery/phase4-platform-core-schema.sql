-- ═══════════════════════════════════════════════════════════════════════════
-- CorpoGN — Platform Core, Phase 4 (Steps 2-3 schema)
-- Additive only. Existing opportunities.status ('open'/'assigned'/'closed')
-- is left untouched since other code depends on it — lifecycle_status is a
-- new, separate column for the draft->published->pre-signed->signed->
-- completed pipeline this spec introduces.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Project lifecycle status (Step 3) ───────────────────────────────────────
alter table public.opportunities
  add column if not exists lifecycle_status text not null default 'draft'
    check (lifecycle_status in ('draft', 'published', 'pre_signed', 'signed', 'completed')),
  add column if not exists published_at timestamptz;

-- ── Employee/worker per-project module permissions (built now for Step 9) ──
create table if not exists public.project_module_permissions (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.opportunities(id) on delete cascade,
  assignee_type text not null check (assignee_type in ('corporate_employee', 'ngo_worker')),
  assignee_id   uuid not null, -- corporate_employees.id or ngo_members.id
  module        text not null, -- e.g. 'campaigns', 'funds', 'audits', 'reports'...
  permission    text not null default 'read' check (permission in ('read', 'edit')),
  granted_by    uuid, -- corporates.id or ngos.id of whoever granted it
  created_at    timestamptz not null default now(),
  unique (project_id, assignee_type, assignee_id, module)
);

create index if not exists idx_project_module_permissions_project on public.project_module_permissions(project_id);
create index if not exists idx_project_module_permissions_assignee on public.project_module_permissions(assignee_type, assignee_id);

alter table public.project_module_permissions enable row level security;
drop policy if exists "authenticated reads project_module_permissions" on public.project_module_permissions;
create policy "authenticated reads project_module_permissions"
  on public.project_module_permissions for select to authenticated using (true);

-- ── Bridge pre_assignments to the live ngos id space (Step 4 needs this — ──
-- ── applying NGOs are always real live ngos.id, but only 71/206 discovered ─
-- ── NGOs have a discovered_ngos link today) ─────────────────────────────────
alter table public.pre_assignments
  add column if not exists ngo_id       uuid references public.ngos(id),
  add column if not exists source       text[] not null default '{}',
  add column if not exists application_data jsonb; -- what the NGO submitted with their application, if source includes 'ngo_applied'

comment on column public.pre_assignments.source is
  'Array of intake paths this row came from: ngo_applied, admin_recommended. Same NGO via both paths merges into one row.';
