-- CorpoGN CSR facilitation lifecycle
-- Additive migration. Run after supabase-production-migration.sql.

create extension if not exists pgcrypto;

alter table public.opportunities
  add column if not exists admin_status text not null default 'pending_recommendation',
  add column if not exists recommendation_sent_at timestamptz,
  add column if not exists corporate_decision_status text not null default 'awaiting_admin',
  add column if not exists required_skills jsonb not null default '[]'::jsonb,
  add column if not exists csr_focus_area text;

alter table public.opportunities
  drop constraint if exists opportunities_admin_status_check;

alter table public.opportunities
  add constraint opportunities_admin_status_check
  check (admin_status in (
    'pending_recommendation',
    'recommendations_sent',
    'corporate_reviewing',
    'allocated',
    'in_progress',
    'completed',
    'cancelled'
  ));

alter table public.opportunities
  drop constraint if exists opportunities_corporate_decision_status_check;

alter table public.opportunities
  add constraint opportunities_corporate_decision_status_check
  check (corporate_decision_status in (
    'awaiting_admin',
    'reviewing',
    'accepted',
    'rejected',
    'requested_more'
  ));

create table if not exists public.ngo_project_trust_scores (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  ngo_id uuid not null references public.ngos(id) on delete cascade,
  overall_score integer not null check (overall_score >= 0 and overall_score <= 100),
  score_breakdown jsonb not null default '{}'::jsonb,
  rank integer not null default 0,
  why_recommended text not null default '',
  key_strengths jsonb not null default '[]'::jsonb,
  past_similar_projects text not null default '',
  budget_experience text not null default '',
  compliance_status text not null default '',
  recalculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, ngo_id)
);

create table if not exists public.project_recommendation_batches (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  corporate_id uuid not null references public.corporates(id) on delete cascade,
  sent_by uuid references public.admin_users(id) on delete set null,
  status text not null default 'sent'
    check (status in ('draft', 'sent', 'reviewing', 'accepted', 'rejected', 'requested_more', 'superseded')),
  notes text,
  sent_at timestamptz not null default now(),
  decision_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_recommendations (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.project_recommendation_batches(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  corporate_id uuid not null references public.corporates(id) on delete cascade,
  ngo_id uuid not null references public.ngos(id) on delete cascade,
  trust_score_id uuid references public.ngo_project_trust_scores(id) on delete set null,
  rank integer not null default 0,
  trust_score integer not null default 0 check (trust_score >= 0 and trust_score <= 100),
  score_breakdown jsonb not null default '{}'::jsonb,
  why_recommended text not null default '',
  key_strengths jsonb not null default '[]'::jsonb,
  past_similar_projects text not null default '',
  budget_experience text not null default '',
  compliance_status text not null default '',
  decision text not null default 'pending'
    check (decision in ('pending', 'accepted', 'rejected')),
  decision_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, ngo_id)
);

create table if not exists public.project_allocations (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  recommendation_id uuid references public.project_recommendations(id) on delete set null,
  connection_id uuid references public.project_connections(id) on delete set null,
  corporate_id uuid not null references public.corporates(id) on delete cascade,
  ngo_id uuid not null references public.ngos(id) on delete cascade,
  status text not null default 'allocated'
    check (status in ('allocated', 'in_progress', 'completed', 'cancelled')),
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  allocation_date timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id)
);

alter table public.ngo_project_trust_scores enable row level security;
alter table public.project_recommendation_batches enable row level security;
alter table public.project_recommendations enable row level security;
alter table public.project_allocations enable row level security;

drop policy if exists "corporates read own trust scores" on public.ngo_project_trust_scores;
create policy "corporates read own trust scores"
on public.ngo_project_trust_scores for select
to authenticated
using (
  exists (
    select 1 from public.opportunities o
    join public.corporates c on c.id = o.corporate_id
    where o.id = ngo_project_trust_scores.opportunity_id
      and c.auth_user_id = auth.uid()
  )
);

drop policy if exists "corporates read own recommendation batches" on public.project_recommendation_batches;
create policy "corporates read own recommendation batches"
on public.project_recommendation_batches for select
to authenticated
using (
  exists (
    select 1 from public.corporates c
    where c.id = project_recommendation_batches.corporate_id
      and c.auth_user_id = auth.uid()
  )
);

drop policy if exists "corporates read own recommendations" on public.project_recommendations;
create policy "corporates read own recommendations"
on public.project_recommendations for select
to authenticated
using (
  exists (
    select 1 from public.corporates c
    where c.id = project_recommendations.corporate_id
      and c.auth_user_id = auth.uid()
  )
);

drop policy if exists "corporates read own allocations" on public.project_allocations;
create policy "corporates read own allocations"
on public.project_allocations for select
to authenticated
using (
  exists (
    select 1 from public.corporates c
    where c.id = project_allocations.corporate_id
      and c.auth_user_id = auth.uid()
  )
);

drop policy if exists "ngos read own allocations" on public.project_allocations;
create policy "ngos read own allocations"
on public.project_allocations for select
to authenticated
using (
  exists (
    select 1 from public.ngos n
    where n.id = project_allocations.ngo_id
      and n.auth_user_id = auth.uid()
  )
  or project_allocations.ngo_id = ((auth.jwt() -> 'user_metadata' ->> 'ngo_id')::uuid)
);

create index if not exists idx_trust_scores_opportunity on public.ngo_project_trust_scores(opportunity_id, rank);
create index if not exists idx_recommendation_batches_opportunity on public.project_recommendation_batches(opportunity_id);
create index if not exists idx_recommendations_corporate on public.project_recommendations(corporate_id, decision);
create index if not exists idx_allocations_corporate on public.project_allocations(corporate_id, status);
create index if not exists idx_allocations_ngo on public.project_allocations(ngo_id, status);

drop trigger if exists touch_ngo_project_trust_scores_updated_at on public.ngo_project_trust_scores;
create trigger touch_ngo_project_trust_scores_updated_at
before update on public.ngo_project_trust_scores
for each row execute function public.touch_updated_at();

drop trigger if exists touch_recommendation_batches_updated_at on public.project_recommendation_batches;
create trigger touch_recommendation_batches_updated_at
before update on public.project_recommendation_batches
for each row execute function public.touch_updated_at();

drop trigger if exists touch_project_recommendations_updated_at on public.project_recommendations;
create trigger touch_project_recommendations_updated_at
before update on public.project_recommendations
for each row execute function public.touch_updated_at();

drop trigger if exists touch_project_allocations_updated_at on public.project_allocations;
create trigger touch_project_allocations_updated_at
before update on public.project_allocations
for each row execute function public.touch_updated_at();
