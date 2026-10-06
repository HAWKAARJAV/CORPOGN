-- Lightweight meeting scheduling on a pre-signed deal — no external Calendar
-- API dependency. Either side proposes a time; either side can attach a
-- meeting link (Meet/Zoom/etc, pasted, not auto-generated) once booked.
create table if not exists public.pre_assignment_meetings (
  id                uuid primary key default gen_random_uuid(),
  pre_assignment_id uuid not null references public.pre_assignments(id) on delete cascade,
  proposed_by       text not null check (proposed_by in ('corporate', 'ngo')),
  proposed_by_user_id uuid not null,
  scheduled_at      timestamptz not null,
  status            text not null default 'proposed' check (status in ('proposed', 'confirmed', 'cancelled')),
  meeting_link      text,
  notes             text,
  confirmed_by_corporate_at timestamptz,
  confirmed_by_ngo_at timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists idx_pre_assignment_meetings_pa on public.pre_assignment_meetings(pre_assignment_id);
alter table public.pre_assignment_meetings enable row level security;
drop policy if exists "authenticated reads pre_assignment_meetings" on public.pre_assignment_meetings;
create policy "authenticated reads pre_assignment_meetings" on public.pre_assignment_meetings for select to authenticated using (true);
