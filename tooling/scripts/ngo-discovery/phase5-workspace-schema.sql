-- ═══════════════════════════════════════════════════════════════════════════
-- CorpoGN — Platform Core, Phase 5 (Step 9: Project Workspace)
-- All genuinely new — the prior audit confirmed no real backend existed for
-- any of these modules (frontend-only mock state). Additive only.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.project_workspaces (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null unique references public.opportunities(id) on delete cascade,
  pre_assignment_id uuid not null references public.pre_assignments(id),
  corporate_id   uuid not null references public.corporates(id),
  ngo_id         uuid not null references public.ngos(id),
  created_at     timestamptz not null default now()
);

alter table public.project_workspaces enable row level security;
drop policy if exists "authenticated reads project_workspaces" on public.project_workspaces;
create policy "authenticated reads project_workspaces" on public.project_workspaces for select to authenticated using (true);

-- ── Activity log — every workspace action writes here ──────────────────────
create table if not exists public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.opportunities(id) on delete cascade,
  module      text not null,
  action      text not null,
  actor_type  text not null check (actor_type in ('corporate', 'corporate_employee', 'ngo', 'ngo_worker', 'admin')),
  actor_id    uuid not null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_activity_logs_project on public.activity_logs(project_id);
alter table public.activity_logs enable row level security;
drop policy if exists "authenticated reads activity_logs" on public.activity_logs;
create policy "authenticated reads activity_logs" on public.activity_logs for select to authenticated using (true);

-- ── The 14 workspace modules — each scoped by project_id ────────────────────
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.opportunities(id) on delete cascade,
  title text not null, description text, status text not null default 'planned', created_by uuid, created_at timestamptz not null default now()
);
create table if not exists public.funds (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.opportunities(id) on delete cascade,
  amount_inr numeric(18,2) not null, purpose text, released_at timestamptz, released_by uuid, created_at timestamptz not null default now()
);
create table if not exists public.ngo_collaboration_notes (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.opportunities(id) on delete cascade,
  note text not null, created_by uuid, created_at timestamptz not null default now()
);
create table if not exists public.audits (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.opportunities(id) on delete cascade,
  audit_type text not null, findings text, status text not null default 'pending', audit_date date, created_by uuid, created_at timestamptz not null default now()
);
create table if not exists public.workspace_reports (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.opportunities(id) on delete cascade,
  report_type text not null, title text not null, url text, created_by uuid, created_at timestamptz not null default now()
);
create table if not exists public.workspace_documents (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.opportunities(id) on delete cascade,
  doc_type text not null, storage_path text, uploaded_by uuid, created_at timestamptz not null default now()
);
create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.opportunities(id) on delete cascade,
  title text not null, due_date date, status text not null default 'pending', created_by uuid, created_at timestamptz not null default now()
);
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.opportunities(id) on delete cascade,
  title text not null, assigned_to uuid, status text not null default 'open', due_date date, created_by uuid, created_at timestamptz not null default now()
);
create table if not exists public.project_timeline (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.opportunities(id) on delete cascade,
  event_title text not null, event_date date, description text, created_by uuid, created_at timestamptz not null default now()
);
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.opportunities(id) on delete cascade,
  title text not null, scheduled_at timestamptz, notes text, created_by uuid, created_at timestamptz not null default now()
);
create table if not exists public.workspace_messages (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.opportunities(id) on delete cascade,
  sender_type text not null, sender_user_id uuid not null, body text not null, created_at timestamptz not null default now()
);
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.opportunities(id) on delete cascade,
  item_type text not null, item_ref text, status text not null default 'pending', approved_by uuid, created_by uuid, created_at timestamptz not null default now()
);
create table if not exists public.budget_tracking (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.opportunities(id) on delete cascade,
  line_item text not null, budgeted_inr numeric(18,2), spent_inr numeric(18,2) default 0, created_by uuid, created_at timestamptz not null default now()
);
create table if not exists public.monitoring_evaluation (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.opportunities(id) on delete cascade,
  metric_name text not null, metric_value numeric(18,2), unit text, period text, created_by uuid, created_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array[
    'campaigns','funds','ngo_collaboration_notes','audits','workspace_reports',
    'workspace_documents','milestones','tasks','project_timeline','meetings',
    'workspace_messages','approvals','budget_tracking','monitoring_evaluation'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "authenticated reads %s" on public.%I;', t, t);
    execute format('create policy "authenticated reads %s" on public.%I for select to authenticated using (true);', t, t);
    execute format('create index if not exists idx_%s_project on public.%I(project_id);', t, t);
  end loop;
end $$;
