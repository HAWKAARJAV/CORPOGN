create extension if not exists pgcrypto;

create table if not exists public.corporates (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null,
  slug text unique not null,
  company_name text not null,
  company_email text not null,
  access_status text not null default 'locked'
    check (access_status in ('locked', 'active')),
  registration_data jsonb not null default '{}'::jsonb,
  unlocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.corporate_messages (
  id uuid primary key default gen_random_uuid(),
  corporate_id uuid not null references public.corporates(id) on delete cascade,
  sender_type text not null check (sender_type in ('corporate', 'admin')),
  body text not null,
  created_at timestamptz not null default now()
); 

create table if not exists public.corporate_employees (
  id uuid primary key default gen_random_uuid(),
  corporate_id uuid not null references public.corporates(id) on delete cascade,
  auth_user_id uuid unique not null,
  email text not null unique,
  full_name text not null,
  position text not null,
  allowed_pages jsonb not null default '["Dashboard"]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.corporate_messages replica identity full;

alter table public.corporates enable row level security;
alter table public.corporate_messages enable row level security;
alter table public.corporate_employees enable row level security;

drop policy if exists "corporates read own profile" on public.corporates;
create policy "corporates read own profile"
on public.corporates
for select
to authenticated
using (
  auth.uid() = auth_user_id
  or exists (
    select 1
    from public.corporate_employees
    where corporate_employees.corporate_id = corporates.id
      and corporate_employees.auth_user_id = auth.uid()
      and corporate_employees.is_active = true
  )
);

drop policy if exists "corporate employees read own record" on public.corporate_employees;
create policy "corporate employees read own record"
on public.corporate_employees
for select
to authenticated
using (auth.uid() = auth_user_id);

drop policy if exists "corporate admins read own employees" on public.corporate_employees;
create policy "corporate admins read own employees"
on public.corporate_employees
for select
to authenticated
using (
  exists (
    select 1
    from public.corporates
    where corporates.id = corporate_employees.corporate_id
      and corporates.auth_user_id = auth.uid()
  )
);

drop policy if exists "corporates read own messages" on public.corporate_messages;
create policy "corporates read own messages"
on public.corporate_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.corporates
    where corporates.id = corporate_messages.corporate_id
      and corporates.auth_user_id = auth.uid()
  )
);

drop policy if exists "corporates send own messages" on public.corporate_messages;
create policy "corporates send own messages"
on public.corporate_messages
for insert
to authenticated
with check (
  sender_type = 'corporate'
  and exists (
    select 1
    from public.corporates
    where corporates.id = corporate_messages.corporate_id
      and corporates.auth_user_id = auth.uid()
  )
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_corporates_updated_at on public.corporates;
create trigger touch_corporates_updated_at
before update on public.corporates
for each row
execute function public.touch_updated_at();

drop trigger if exists touch_corporate_employees_updated_at on public.corporate_employees;
create trigger touch_corporate_employees_updated_at
before update on public.corporate_employees
for each row
execute function public.touch_updated_at();

do $$
begin
  alter publication supabase_realtime add table public.corporate_messages;
exception
  when duplicate_object then null;
end;
$$;

-- ─────────────────────────────────────────────
-- NGO TABLES
-- ─────────────────────────────────────────────

create table if not exists public.ngos (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null,
  slug text unique not null,
  ngo_name text not null,
  ngo_email text not null,
  access_status text not null default 'pending'
    check (access_status in ('pending', 'verified', 'active')),
  has_project boolean not null default false,
  trust_score integer not null default 0,
  registration_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ngo_members (
  id uuid primary key default gen_random_uuid(),
  ngo_id uuid not null references public.ngos(id) on delete cascade,
  auth_user_id uuid unique not null,
  email text not null unique,
  full_name text not null,
  role text not null check (role in (
    'finance_officer',
    'compliance_officer',
    'operations_manager',
    'field_coordinator',
    'reporting_executive',
    'volunteer'
  )),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.project_connections (
  id uuid primary key default gen_random_uuid(),
  corporate_id uuid not null references public.corporates(id) on delete cascade,
  ngo_id uuid not null references public.ngos(id) on delete cascade,
  project_name text not null,
  focus_area text not null default 'Education',
  budget text not null default 'Rs 25L',
  status text not null default 'active'
    check (status in ('proposal', 'active', 'completed')),
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  milestone text not null default 'Kickoff',
  document_requests jsonb not null default '[]'::jsonb,
  latest_update text not null default 'Shared workspace opened.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (corporate_id, ngo_id, project_name)
);

alter table public.project_connections replica identity full;

alter table public.ngos replica identity full;
alter table public.ngo_members replica identity full;

alter table public.ngos enable row level security;
alter table public.ngo_members enable row level security;
alter table public.project_connections enable row level security;

drop policy if exists "ngos read own profile" on public.ngos;
create policy "ngos read own profile"
on public.ngos
for select
to authenticated
using (auth.uid() = auth_user_id);

drop policy if exists "ngo members read own record" on public.ngo_members;
create policy "ngo members read own record"
on public.ngo_members
for select
to authenticated
using (auth.uid() = auth_user_id);

-- Allow NGO members to look up the NGO they belong to (needed for routing after sign-in)
drop policy if exists "ngo members read their ngo" on public.ngos;
create policy "ngo members read their ngo"
on public.ngos
for select
to authenticated
using (
  id = ((auth.jwt() -> 'user_metadata' ->> 'ngo_id')::uuid)
);

drop policy if exists "corporates read own project connections" on public.project_connections;
create policy "corporates read own project connections"
on public.project_connections
for select
to authenticated
using (
  exists (
    select 1
    from public.corporates
    where corporates.id = project_connections.corporate_id
      and corporates.auth_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.corporate_employees
    where corporate_employees.corporate_id = project_connections.corporate_id
      and corporate_employees.auth_user_id = auth.uid()
      and corporate_employees.is_active = true
  )
);

drop policy if exists "ngos read own project connections" on public.project_connections;
create policy "ngos read own project connections"
on public.project_connections
for select
to authenticated
using (
  exists (
    select 1
    from public.ngos
    where ngos.id = project_connections.ngo_id
      and ngos.auth_user_id = auth.uid()
  )
  or project_connections.ngo_id = ((auth.jwt() -> 'user_metadata' ->> 'ngo_id')::uuid)
);

drop policy if exists "ngo super admin reads own members" on public.ngo_members;
create policy "ngo super admin reads own members"
on public.ngo_members
for select
to authenticated
using (
  exists (
    select 1
    from public.ngos
    where ngos.id = ngo_members.ngo_id
      and ngos.auth_user_id = auth.uid()
  )
);

drop trigger if exists touch_ngos_updated_at on public.ngos;
create trigger touch_ngos_updated_at
before update on public.ngos
for each row
execute function public.touch_updated_at();

drop trigger if exists touch_project_connections_updated_at on public.project_connections;
create trigger touch_project_connections_updated_at
before update on public.project_connections
for each row
execute function public.touch_updated_at();

do $$
begin
  alter publication supabase_realtime add table public.project_connections;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.ngos;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.ngo_members;
exception
  when duplicate_object then null;
end;
$$;
