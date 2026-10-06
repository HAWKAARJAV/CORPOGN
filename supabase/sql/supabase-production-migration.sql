-- ═══════════════════════════════════════════════════════════════════
-- CorpoGN — Production Database Migration
-- Run AFTER: supabase-schema.sql + supabase-budget-schema.sql
-- All changes are additive — no existing tables dropped.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. FIX: project_connections.budget text → numeric(18,2)
-- ─────────────────────────────────────────────────────────────────
-- Rename old text column to preserve data during migration.
-- Guard: only rename if the old text column still exists (idempotent).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'project_connections'
      and column_name  = 'budget'
      and data_type    = 'text'
  ) then
    alter table public.project_connections rename column budget to budget_text_legacy;
  end if;
end
$$;

-- Add proper numeric column (if not already added)
alter table public.project_connections
  add column if not exists budget numeric(18,2) not null default 2500000;
-- 2500000 = Rs 25L default

-- Also fix budgets / fund tables (only if they exist — from supabase-budget-schema.sql)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'budgets') then
    execute 'alter table public.budgets alter column total_amount type numeric(18,2)';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'fund_allocations') then
    execute 'alter table public.fund_allocations alter column allocated_amount type numeric(18,2)';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'fund_disbursements') then
    execute 'alter table public.fund_disbursements alter column released_amount type numeric(18,2)';
    execute 'alter table public.fund_disbursements alter column utilized_amount type numeric(18,2)';
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────────
-- 2. SOFT DELETES — add deleted_at to core tables
-- ─────────────────────────────────────────────────────────────────
alter table public.corporates
  add column if not exists deleted_at timestamptz;

alter table public.ngos
  add column if not exists deleted_at timestamptz;

alter table public.corporate_employees
  add column if not exists deleted_at timestamptz;

alter table public.ngo_members
  add column if not exists deleted_at timestamptz;

alter table public.project_connections
  add column if not exists deleted_at timestamptz;

-- ─────────────────────────────────────────────────────────────────
-- 3. AUDIT LOGS — immutable ledger of every important action
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  actor_user_id   uuid not null,
  actor_role      text,                         -- e.g. 'corporate', 'ngo', 'admin'
  entity_type     text not null,                -- e.g. 'project_connection', 'ngo', 'milestone'
  entity_id       uuid,
  action          text not null,                -- e.g. 'FUND_RELEASED', 'STATUS_CHANGED'
  old_value       jsonb,
  new_value       jsonb,
  ip_address      text,
  user_agent      text,
  created_at      timestamptz not null default now()
);

-- Immutable: no UPDATE or DELETE allowed
alter table public.audit_logs enable row level security;

-- Only backend service role can insert
create policy "audit_logs insert via service role only"
on public.audit_logs for insert
to authenticated
with check (false);   -- client cannot insert; only supabaseAdmin (service_role) can

-- Corporate admins can read their own org's audit logs
create policy "corporates read own audit logs"
on public.audit_logs for select
to authenticated
using (
  actor_user_id = auth.uid()
  or exists (
    select 1 from public.corporates
    where corporates.auth_user_id = auth.uid()
      and audit_logs.entity_id = corporates.id
  )
);

-- ─────────────────────────────────────────────────────────────────
-- 4. PROJECT MILESTONES — replace single `milestone text` field
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.project_milestones (
  id              uuid primary key default gen_random_uuid(),
  connection_id   uuid not null references public.project_connections(id) on delete cascade,
  title           text not null,
  description     text,
  target_date     date,
  tranche_amount  numeric(18,2),               -- fund amount tied to this milestone (corporate sets)
  evidence_required text,                       -- what the NGO must submit
  status          text not null default 'PENDING'
    check (status in ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'VERIFIED', 'DELAYED')),
  progress        integer not null default 0
    check (progress >= 0 and progress <= 100),
  created_by      uuid not null,               -- corporate user who created
  updated_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.project_milestones enable row level security;

-- Corporate: full read of their milestones
create policy "corporates read own milestones"
on public.project_milestones for select
to authenticated
using (
  exists (
    select 1 from public.project_connections pc
    join public.corporates c on c.id = pc.corporate_id
    where pc.id = project_milestones.connection_id
      and c.auth_user_id = auth.uid()
  )
  or exists (
    select 1 from public.project_connections pc
    join public.corporate_employees ce on ce.corporate_id = pc.corporate_id
    where pc.id = project_milestones.connection_id
      and ce.auth_user_id = auth.uid()
      and ce.is_active = true
  )
);

-- Corporate: can insert milestones
create policy "corporates insert milestones"
on public.project_milestones for insert
to authenticated
with check (
  exists (
    select 1 from public.project_connections pc
    join public.corporates c on c.id = pc.corporate_id
    where pc.id = connection_id
      and c.auth_user_id = auth.uid()
  )
);

-- NGO: read their own project's milestones
create policy "ngos read own milestones"
on public.project_milestones for select
to authenticated
using (
  exists (
    select 1 from public.project_connections pc
    join public.ngos n on n.id = pc.ngo_id
    where pc.id = project_milestones.connection_id
      and n.auth_user_id = auth.uid()
  )
  or exists (
    select 1 from public.project_connections pc
    where pc.id = project_milestones.connection_id
      and pc.ngo_id = ((auth.jwt() -> 'user_metadata' ->> 'ngo_id')::uuid)
  )
);

-- NGO: can update status to IN_PROGRESS or SUBMITTED only (not VERIFIED)
create policy "ngos submit milestones"
on public.project_milestones for update
to authenticated
using (
  exists (
    select 1 from public.project_connections pc
    join public.ngos n on n.id = pc.ngo_id
    where pc.id = project_milestones.connection_id
      and n.auth_user_id = auth.uid()
  )
)
with check (
  status in ('IN_PROGRESS', 'SUBMITTED')  -- NGO cannot set VERIFIED or DELAYED
);

create index if not exists idx_project_milestones_connection_id
  on public.project_milestones(connection_id);

drop trigger if exists touch_project_milestones_updated_at on public.project_milestones;
create trigger touch_project_milestones_updated_at
before update on public.project_milestones
for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────
-- 5. PROJECT DOCUMENTS — replace document_requests jsonb array
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.project_documents (
  id                uuid primary key default gen_random_uuid(),
  connection_id     uuid not null references public.project_connections(id) on delete cascade,
  requested_by      uuid not null,             -- corporate user
  uploaded_by       uuid,                      -- ngo user (null until uploaded)
  document_type     text not null,             -- e.g. 'CSR-1', 'Annual Audit', 'UC'
  label             text not null,             -- human-readable description
  -- Secure storage (no public URLs)
  storage_object_id text,                      -- Supabase Storage object path
  bucket_name       text,                      -- storage bucket
  file_name         text,
  mime_type         text,
  file_size         bigint,
  -- Workflow
  status            text not null default 'REQUESTED'
    check (status in ('REQUESTED', 'UPLOADED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')),
  remarks           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.project_documents enable row level security;

-- Corporate: full access to their requests
create policy "corporates manage own project_documents"
on public.project_documents for all
to authenticated
using (
  exists (
    select 1 from public.project_connections pc
    join public.corporates c on c.id = pc.corporate_id
    where pc.id = project_documents.connection_id
      and c.auth_user_id = auth.uid()
  )
  or exists (
    select 1 from public.project_connections pc
    join public.corporate_employees ce on ce.corporate_id = pc.corporate_id
    where pc.id = project_documents.connection_id
      and ce.auth_user_id = auth.uid()
      and ce.is_active = true
  )
);

-- NGO: read requests + upload (update storage fields and status→UPLOADED)
create policy "ngos read and upload project_documents"
on public.project_documents for select
to authenticated
using (
  exists (
    select 1 from public.project_connections pc
    join public.ngos n on n.id = pc.ngo_id
    where pc.id = project_documents.connection_id
      and n.auth_user_id = auth.uid()
  )
  or exists (
    select 1 from public.project_connections pc
    where pc.id = project_documents.connection_id
      and pc.ngo_id = ((auth.jwt() -> 'user_metadata' ->> 'ngo_id')::uuid)
  )
);

create policy "ngos upload project_documents"
on public.project_documents for update
to authenticated
using (
  exists (
    select 1 from public.project_connections pc
    join public.ngos n on n.id = pc.ngo_id
    where pc.id = project_documents.connection_id
      and n.auth_user_id = auth.uid()
  )
)
with check (
  status in ('UPLOADED')                      -- NGO can only set UPLOADED, not APPROVED/REJECTED
);

create index if not exists idx_project_documents_connection_id
  on public.project_documents(connection_id);

drop trigger if exists touch_project_documents_updated_at on public.project_documents;
create trigger touch_project_documents_updated_at
before update on public.project_documents
for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────
-- 6. EVIDENCE UPLOADS — field proof, photos, invoices
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.evidence_uploads (
  id                    uuid primary key default gen_random_uuid(),
  connection_id         uuid not null references public.project_connections(id) on delete cascade,
  milestone_id          uuid references public.project_milestones(id),
  uploaded_by           uuid not null,
  title                 text not null,
  description           text,
  evidence_type         text not null,          -- 'GeoPhoto', 'Invoice', 'PDF', 'Consent', 'Finance'
  -- Secure storage
  storage_object_id     text,
  bucket_name           text,
  file_name             text,
  mime_type             text,
  file_size             bigint,
  -- Verification
  verification_status   text not null default 'PENDING'
    check (verification_status in ('PENDING', 'SUBMITTED', 'VERIFIED', 'FLAGGED', 'REJECTED')),
  verified_by           uuid,
  remarks               text,
  created_at            timestamptz not null default now(),
  verified_at           timestamptz
);

alter table public.evidence_uploads enable row level security;

-- NGO can insert and read their own
create policy "ngos manage own evidence_uploads"
on public.evidence_uploads for all
to authenticated
using (
  exists (
    select 1 from public.project_connections pc
    join public.ngos n on n.id = pc.ngo_id
    where pc.id = evidence_uploads.connection_id
      and n.auth_user_id = auth.uid()
  )
  or exists (
    select 1 from public.project_connections pc
    where pc.id = evidence_uploads.connection_id
      and pc.ngo_id = ((auth.jwt() -> 'user_metadata' ->> 'ngo_id')::uuid)
  )
);

-- Corporate can read and verify
create policy "corporates read and verify evidence_uploads"
on public.evidence_uploads for select
to authenticated
using (
  exists (
    select 1 from public.project_connections pc
    join public.corporates c on c.id = pc.corporate_id
    where pc.id = evidence_uploads.connection_id
      and c.auth_user_id = auth.uid()
  )
  or exists (
    select 1 from public.project_connections pc
    join public.corporate_employees ce on ce.corporate_id = pc.corporate_id
    where pc.id = evidence_uploads.connection_id
      and ce.auth_user_id = auth.uid()
      and ce.is_active = true
  )
);

-- Corporate can verify (update status, verified_by, remarks only)
create policy "corporates verify evidence"
on public.evidence_uploads for update
to authenticated
using (
  exists (
    select 1 from public.project_connections pc
    join public.corporates c on c.id = pc.corporate_id
    where pc.id = evidence_uploads.connection_id
      and c.auth_user_id = auth.uid()
  )
)
with check (
  verification_status in ('VERIFIED', 'FLAGGED', 'REJECTED')
);

create index if not exists idx_evidence_uploads_connection_id
  on public.evidence_uploads(connection_id);
create index if not exists idx_evidence_uploads_milestone_id
  on public.evidence_uploads(milestone_id);

-- ─────────────────────────────────────────────────────────────────
-- 7. UTILIZATION CERTIFICATES
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.utilization_certificates (
  id                uuid primary key default gen_random_uuid(),
  connection_id     uuid not null references public.project_connections(id) on delete cascade,
  milestone_id      uuid references public.project_milestones(id),
  submitted_by      uuid not null,              -- ngo user
  amount_certified  numeric(18,2) not null,
  period_from       date,
  period_to         date,
  -- Secure storage
  storage_object_id text,
  bucket_name       text,
  file_name         text,
  mime_type         text,
  file_size         bigint,
  -- Workflow
  status            text not null default 'SUBMITTED'
    check (status in ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')),
  reviewed_by       uuid,
  remarks           text,
  submitted_at      timestamptz not null default now(),
  reviewed_at       timestamptz
);

alter table public.utilization_certificates enable row level security;

create policy "ngos manage own utilization_certificates"
on public.utilization_certificates for all
to authenticated
using (
  exists (
    select 1 from public.project_connections pc
    join public.ngos n on n.id = pc.ngo_id
    where pc.id = utilization_certificates.connection_id
      and n.auth_user_id = auth.uid()
  )
  or exists (
    select 1 from public.project_connections pc
    where pc.id = utilization_certificates.connection_id
      and pc.ngo_id = ((auth.jwt() -> 'user_metadata' ->> 'ngo_id')::uuid)
  )
);

create policy "corporates review utilization_certificates"
on public.utilization_certificates for all
to authenticated
using (
  exists (
    select 1 from public.project_connections pc
    join public.corporates c on c.id = pc.corporate_id
    where pc.id = utilization_certificates.connection_id
      and c.auth_user_id = auth.uid()
  )
  or exists (
    select 1 from public.project_connections pc
    join public.corporate_employees ce on ce.corporate_id = pc.corporate_id
    where pc.id = utilization_certificates.connection_id
      and ce.auth_user_id = auth.uid()
      and ce.is_active = true
  )
);

create index if not exists idx_utilization_certificates_connection_id
  on public.utilization_certificates(connection_id);

-- ─────────────────────────────────────────────────────────────────
-- 8. IMPACT REPORTS
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.impact_reports (
  id                  uuid primary key default gen_random_uuid(),
  connection_id       uuid not null references public.project_connections(id) on delete cascade,
  submitted_by        uuid not null,
  title               text not null,
  period_from         date,
  period_to           date,
  beneficiary_count   integer not null default 0,
  key_outcomes        jsonb not null default '[]'::jsonb,  -- array of { metric, target, actual, unit }
  narrative           text,
  -- Secure storage (for PDF attachment)
  storage_object_id   text,
  bucket_name         text,
  file_name           text,
  mime_type           text,
  file_size           bigint,
  -- Workflow
  status              text not null default 'SUBMITTED'
    check (status in ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED')),
  reviewed_by         uuid,
  remarks             text,
  submitted_at        timestamptz not null default now(),
  reviewed_at         timestamptz
);

alter table public.impact_reports enable row level security;

create policy "ngos manage own impact_reports"
on public.impact_reports for all
to authenticated
using (
  exists (
    select 1 from public.project_connections pc
    join public.ngos n on n.id = pc.ngo_id
    where pc.id = impact_reports.connection_id
      and n.auth_user_id = auth.uid()
  )
  or exists (
    select 1 from public.project_connections pc
    where pc.id = impact_reports.connection_id
      and pc.ngo_id = ((auth.jwt() -> 'user_metadata' ->> 'ngo_id')::uuid)
  )
);

create policy "corporates review impact_reports"
on public.impact_reports for all
to authenticated
using (
  exists (
    select 1 from public.project_connections pc
    join public.corporates c on c.id = pc.corporate_id
    where pc.id = impact_reports.connection_id
      and c.auth_user_id = auth.uid()
  )
  or exists (
    select 1 from public.project_connections pc
    join public.corporate_employees ce on ce.corporate_id = pc.corporate_id
    where pc.id = impact_reports.connection_id
      and ce.auth_user_id = auth.uid()
      and ce.is_active = true
  )
);

create index if not exists idx_impact_reports_connection_id
  on public.impact_reports(connection_id);

-- ─────────────────────────────────────────────────────────────────
-- 9. NGO PROJECT MESSAGES — secure bi-directional chat
--    sender_type is NOT trusted from client; derived from session
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.ngo_project_messages (
  id              uuid primary key default gen_random_uuid(),
  connection_id   uuid not null references public.project_connections(id) on delete cascade,
  sender_user_id  uuid not null,               -- set server-side from auth.uid()
  sender_type     text not null                -- 'ngo' or 'corporate' — set server-side ONLY
    check (sender_type in ('ngo', 'corporate')),
  body            text not null check (char_length(body) > 0),
  -- Optional attachment (secure, no public URL)
  storage_object_id text,
  bucket_name     text,
  file_name       text,
  mime_type       text,
  created_at      timestamptz not null default now()
);

alter table public.ngo_project_messages replica identity full;
alter table public.ngo_project_messages enable row level security;

-- Only participants of the project can read messages
create policy "project participants read messages"
on public.ngo_project_messages for select
to authenticated
using (
  exists (
    select 1 from public.project_connections pc
    join public.corporates c on c.id = pc.corporate_id
    where pc.id = ngo_project_messages.connection_id
      and c.auth_user_id = auth.uid()
  )
  or exists (
    select 1 from public.project_connections pc
    join public.corporate_employees ce on ce.corporate_id = pc.corporate_id
    where pc.id = ngo_project_messages.connection_id
      and ce.auth_user_id = auth.uid()
      and ce.is_active = true
  )
  or exists (
    select 1 from public.project_connections pc
    join public.ngos n on n.id = pc.ngo_id
    where pc.id = ngo_project_messages.connection_id
      and n.auth_user_id = auth.uid()
  )
  or exists (
    select 1 from public.project_connections pc
    where pc.id = ngo_project_messages.connection_id
      and pc.ngo_id = ((auth.jwt() -> 'user_metadata' ->> 'ngo_id')::uuid)
  )
);

-- INSERT BLOCKED from client. Messages must be sent via API route
-- (API sets sender_user_id = auth.uid(), sender_type derived from account_type)
create policy "no direct client insert on messages"
on public.ngo_project_messages for insert
to authenticated
with check (false);

-- Enable realtime
do $$
begin
  alter publication supabase_realtime add table public.ngo_project_messages;
exception
  when duplicate_object then null;
end;
$$;

create index if not exists idx_ngo_project_messages_connection_id
  on public.ngo_project_messages(connection_id);

-- ─────────────────────────────────────────────────────────────────
-- 10. NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,                 -- recipient
  title         text not null,
  message       text not null,
  notification_type text not null,             -- 'FUND_APPROVAL', 'DOC_REQUESTED', 'MILESTONE_UPDATE', etc.
  is_read       boolean not null default false,
  entity_type   text,                          -- 'project_connection', 'milestone', etc.
  entity_id     uuid,                          -- ID of the related entity
  metadata      jsonb default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

alter table public.notifications enable row level security;

-- Users can only read and update their own notifications
create policy "users read own notifications"
on public.notifications for select
to authenticated
using (user_id = auth.uid());

create policy "users mark own notifications read"
on public.notifications for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Only service role inserts notifications (from API routes)
create policy "service role inserts notifications"
on public.notifications for insert
to authenticated
with check (false);

create index if not exists idx_notifications_user_id
  on public.notifications(user_id);
create index if not exists idx_notifications_is_read
  on public.notifications(is_read);

-- ─────────────────────────────────────────────────────────────────
-- 11. EXTEND ngo_documents WITH EXPIRY & VERIFICATION TRACKING
--     (ngo_documents is in supabase-budget-schema.sql)
--     Guard: only run if the table exists.
-- ─────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ngo_documents') then
    -- Add columns only if they don't already exist
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ngo_documents' and column_name = 'reminder_sent') then
      execute 'alter table public.ngo_documents add column reminder_sent boolean not null default false';
    end if;
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ngo_documents' and column_name = 'reminder_sent_at') then
      execute 'alter table public.ngo_documents add column reminder_sent_at timestamptz';
    end if;
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ngo_documents' and column_name = 'verified_by') then
      execute 'alter table public.ngo_documents add column verified_by uuid';
    end if;
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ngo_documents' and column_name = 'verified_at') then
      execute 'alter table public.ngo_documents add column verified_at timestamptz';
    end if;
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────────
-- 12. ADD NGO-SIDE PROGRESS FIELDS TO project_connections
--     (the new fields from the ER diagram plan)
-- ─────────────────────────────────────────────────────────────────
alter table public.project_connections
  add column if not exists ngo_progress_notes   text,
  add column if not exists ngo_milestone_status text
    check (ngo_milestone_status in ('on_track', 'delayed', 'completed') or ngo_milestone_status is null),
  add column if not exists ngo_beneficiary_count integer,
  add column if not exists uc_submitted          boolean not null default false,
  add column if not exists uc_submitted_at       timestamptz,
  add column if not exists impact_report_submitted boolean not null default false,
  add column if not exists impact_report_submitted_at timestamptz;

-- ─────────────────────────────────────────────────────────────────
-- 13. MISSING INDEXES on existing tables
-- ─────────────────────────────────────────────────────────────────
create index if not exists idx_project_connections_corporate_id
  on public.project_connections(corporate_id);
create index if not exists idx_project_connections_ngo_id
  on public.project_connections(ngo_id);
create index if not exists idx_project_connections_status
  on public.project_connections(status);
create index if not exists idx_project_connections_deleted_at
  on public.project_connections(deleted_at) where deleted_at is null;

create index if not exists idx_corporates_deleted_at
  on public.corporates(deleted_at) where deleted_at is null;
create index if not exists idx_ngos_deleted_at
  on public.ngos(deleted_at) where deleted_at is null;

create index if not exists idx_corporate_employees_corporate_id
  on public.corporate_employees(corporate_id);
create index if not exists idx_ngo_members_ngo_id
  on public.ngo_members(ngo_id);

-- ngo_documents indexes — only if that table exists (from supabase-budget-schema.sql)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ngo_documents') then
    execute 'create index if not exists idx_ngo_documents_expires_at on public.ngo_documents(expires_at)';
    execute 'create index if not exists idx_ngo_documents_reminder_sent on public.ngo_documents(reminder_sent) where reminder_sent = false';
  end if;
end
$$;

-- campaigns / budgets indexes — only if those tables exist (from supabase-budget-schema.sql)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'campaigns') then
    execute 'create index if not exists idx_campaigns_corporate_id on public.campaigns(corporate_id)';
    execute 'create index if not exists idx_campaigns_status on public.campaigns(status)';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'budgets') then
    execute 'create index if not exists idx_budgets_corporate_id on public.budgets(corporate_id)';
    execute 'create index if not exists idx_budgets_financial_year on public.budgets(financial_year)';
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────────
-- 14. RESTRICT NGO WRITES on project_connections
--     NGO can only update their own progress fields; not status/budget
-- ─────────────────────────────────────────────────────────────────
-- NOTE: Add RLS UPDATE policy for NGO on project_connections
drop policy if exists "ngos update own project connections" on public.project_connections;
create policy "ngos update own project connections"
on public.project_connections for update
to authenticated
using (
  exists (
    select 1 from public.ngos
    where ngos.id = project_connections.ngo_id
      and ngos.auth_user_id = auth.uid()
  )
  or project_connections.ngo_id = ((auth.jwt() -> 'user_metadata' ->> 'ngo_id')::uuid)
)
with check (
  -- NGO can only update these specific fields
  -- status, budget, corporate_id, ngo_id, project_name, focus_area CANNOT be changed by NGO
  -- (enforced at API layer; RLS allows row-level update if user owns it)
  true
);

-- Corporate can update project_connections
drop policy if exists "corporates update own project connections" on public.project_connections;
create policy "corporates update own project connections"
on public.project_connections for update
to authenticated
using (
  exists (
    select 1 from public.corporates
    where corporates.id = project_connections.corporate_id
      and corporates.auth_user_id = auth.uid()
  )
);

-- ─────────────────────────────────────────────────────────────────
-- 15. OPPORTUNITIES & SEED DATA
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  corporate_id uuid not null references public.corporates(id) on delete cascade,
  title text not null,
  description text not null,
  focus_area text not null,
  budget numeric(18,2) not null,
  state text not null,
  created_at timestamptz not null default now()
);

alter table public.opportunities enable row level security;

drop policy if exists "Anyone authenticated can select opportunities" on public.opportunities;
create policy "Anyone authenticated can select opportunities"
on public.opportunities for select
to authenticated
using (true);

-- Seed opportunities if empty
insert into public.opportunities (id, corporate_id, title, description, focus_area, budget, state)
values
  ('a1111111-1111-1111-1111-111111111111', 'b890460b-58be-4943-a8fb-61679960dbe8', 'Rural Primary Health Centers Upgrade', 'Looking for qualified healthcare NGOs to upgrade infrastructure, procure medical equipment, and run outpatient camps for 15 primary health centers (PHCs) in rural Rajasthan.', 'Healthcare', 7500000, 'Rajasthan'),
  ('a2222222-2222-2222-2222-222222222222', 'd4120ff7-5409-4334-8e3e-43874eca7d77', 'Digital Classrooms for Municipal Schools', 'Deploying interactive smartboards, certified teacher enablement programs, and science-lab kits across 30 municipal schools in Maharashtra.', 'Rural Education', 5000000, 'Maharashtra'),
  ('a3333333-3333-3333-3333-333333333333', 'b890460b-58be-4943-a8fb-61679960dbe8', 'Women Livelihood and Sewing Cooperatives', 'Establish 10 local skill-development and sewing cooperatives to train rural women in textile craft and link them with local retail markets.', 'Women Empowerment', 3500000, 'Uttar Pradesh'),
  ('a4444444-4444-4444-4444-444444444444', 'd4120ff7-5409-4334-8e3e-43874eca7d77', 'Clean Water Filtration and Sanitation Systems', 'Procurement and installation of commercial-grade RO water purifiers and toilet facilities in 25 high-need villages of Bihar.', 'Water Conservation', 4500000, 'Bihar')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────
-- 16. NGO Profile and Documents Schema Migration
-- ─────────────────────────────────────────────────────────────────

-- Add profile fields to public.ngos table
alter table public.ngos
  add column if not exists ngo_type text,
  add column if not exists state text,
  add column if not exists contact_number text,
  add column if not exists website text,
  add column if not exists mission text,
  add column if not exists registration_number text,
  add column if not exists pan_number text,
  add column if not exists year_of_establishment integer,
  add column if not exists employee_count integer,
  add column if not exists volunteer_count integer,
  add column if not exists focus_areas text[] not null default '{}'::text[],
  add column if not exists beneficiary_types text[] not null default '{}'::text[];

-- Create the ngo_documents table
create table if not exists public.ngo_documents (
  id uuid primary key default gen_random_uuid(),
  ngo_id uuid not null references public.ngos(id) on delete cascade,
  doc_type text not null,                      -- e.g. 'certificate12a', 'certificate80g'
  storage_path text not null,                  -- path in supabase storage bucket
  uploaded_at timestamptz not null default now(),
  status text not null default 'uploaded' check (status in ('uploaded', 'verified', 'rejected')),
  verified_at timestamptz,
  verified_by uuid,                            -- admin user id
  reminder_sent boolean not null default false,
  reminder_sent_at timestamptz,
  remarks text,
  unique (ngo_id, doc_type)
);

-- Enable RLS and add security policies
alter table public.ngo_documents enable row level security;

drop policy if exists "ngos read own documents" on public.ngo_documents;
create policy "ngos read own documents"
on public.ngo_documents for select
to authenticated
using (
  exists (
    select 1 from public.ngos
    where ngos.id = ngo_documents.ngo_id
      and ngos.auth_user_id = auth.uid()
  )
  or ngo_id = ((auth.jwt() -> 'user_metadata' ->> 'ngo_id')::uuid)
);

drop policy if exists "ngos insert own documents" on public.ngo_documents;
create policy "ngos insert own documents"
on public.ngo_documents for insert
to authenticated
with check (
  exists (
    select 1 from public.ngos
    where ngos.id = ngo_id
      and ngos.auth_user_id = auth.uid()
  )
);

drop policy if exists "ngos update own documents" on public.ngo_documents;
create policy "ngos update own documents"
on public.ngo_documents for update
to authenticated
using (
  exists (
    select 1 from public.ngos
    where ngos.id = ngo_documents.ngo_id
      and ngos.auth_user_id = auth.uid()
  )
)
with check (
  status = 'uploaded'
);

drop policy if exists "anyone authenticated can select ngo_documents" on public.ngo_documents;
create policy "anyone authenticated can select ngo_documents"
on public.ngo_documents for select
to authenticated
using (true);

-- Enable realtime for ngo_documents
do $$
begin
  alter publication supabase_realtime add table public.ngo_documents;
exception
  when duplicate_object then null;
end;
$$;

-- ─────────────────────────────────────────────────────────────────
-- OPPORTUNITIES EXTENSION & POLICIES
-- ─────────────────────────────────────────────────────────────────
alter table public.opportunities
  add column if not exists district text,
  add column if not exists sdg_targets text[] not null default '{}',
  add column if not exists target_beneficiaries text[] not null default '{}',
  add column if not exists expected_start_date date,
  add column if not exists duration_months integer,
  add column if not exists min_trust_score integer not null default 0,
  add column if not exists status text not null default 'open' check (status in ('open', 'assigned', 'closed')),
  add column if not exists assigned_ngo_id uuid references public.ngos(id);

alter table public.opportunities enable row level security;

-- Read policy: Anyone authenticated can view open opportunities
drop policy if exists "Anyone authenticated can select opportunities" on public.opportunities;
create policy "Anyone authenticated can select opportunities"
on public.opportunities for select
to authenticated
using (true);

-- Corporate owner: full CRUD on their own opportunities
drop policy if exists "Corporates manage own opportunities" on public.opportunities;
create policy "Corporates manage own opportunities"
on public.opportunities
for all
to authenticated
using (
  exists (
    select 1 from public.corporates
    where corporates.id = opportunities.corporate_id
      and corporates.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.corporates
    where corporates.id = opportunities.corporate_id
      and corporates.auth_user_id = auth.uid()
  )
);

-- Corporate employees: manage their corporate's opportunities
drop policy if exists "Corporate employees manage own opportunities" on public.opportunities;
create policy "Corporate employees manage own opportunities"
on public.opportunities
for all
to authenticated
using (
  exists (
    select 1 from public.corporate_employees ce
    where ce.corporate_id = opportunities.corporate_id
      and ce.auth_user_id = auth.uid()
      and ce.is_active = true
  )
)
with check (
  exists (
    select 1 from public.corporate_employees ce
    where ce.corporate_id = opportunities.corporate_id
      and ce.auth_user_id = auth.uid()
      and ce.is_active = true
  )
);

-- Indexes
create index if not exists idx_opportunities_corporate_id
  on public.opportunities(corporate_id);

create index if not exists idx_opportunities_status
  on public.opportunities(status);

-- ─────────────────────────────────────────────────────────────────
-- TARGET ARCHITECTURE MIGRATIONS
-- ─────────────────────────────────────────────────────────────────

-- 1. Extend project_connections status check constraint to include 'pending_admin'
alter table public.project_connections
  drop constraint if exists project_connections_status_check;

alter table public.project_connections
  add constraint project_connections_status_check
  check (status in ('proposal', 'pending_admin', 'active', 'completed'));

-- 2. Add opportunity_id column linking connections to specific opportunity postings
alter table public.project_connections
  add column if not exists opportunity_id uuid references public.opportunities(id) on delete set null;

-- 3. Extend corporates table with detailed metadata and contact fields
alter table public.corporates
  add column if not exists description text,
  add column if not exists website text,
  add column if not exists industry text,
  add column if not exists state text,
  add column if not exists csr_budget numeric(18,2),
  add column if not exists contact_name text,
  add column if not exists contact_phone text,
  add column if not exists logo_url text;

-- 4. Admin Users Table
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null,
  email text not null unique,
  full_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

drop policy if exists "Admins read own records" on public.admin_users;
create policy "Admins read own records"
  on public.admin_users for select
  to authenticated
  using (auth.uid() = auth_user_id);

-- 5. Project Assignees Table
create table if not exists public.project_assignees (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.project_connections(id) on delete cascade,
  user_id uuid not null, -- references auth.users(id)
  role_in_project text not null,
  permissions jsonb not null default '{}'::jsonb, -- e.g. {"milestones": "edit", "budgets": "read_only"}
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

alter table public.project_assignees enable row level security;

drop policy if exists "Assignees read project assignments" on public.project_assignees;
create policy "Assignees read project assignments"
  on public.project_assignees for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.project_connections pc
      join public.corporates c on c.id = pc.corporate_id
      where pc.id = project_assignees.project_id
        and c.auth_user_id = auth.uid()
    )
    or exists (
      select 1 from public.project_connections pc
      join public.ngos n on n.id = pc.ngo_id
      where pc.id = project_assignees.project_id
        and n.auth_user_id = auth.uid()
    )
  );

drop policy if exists "Admins manage project assignments" on public.project_assignees;
create policy "Admins manage project assignments"
  on public.project_assignees for all
  to authenticated
  using (
    exists (
      select 1 from public.project_connections pc
      join public.corporates c on c.id = pc.corporate_id
      where pc.id = project_assignees.project_id
        and c.auth_user_id = auth.uid()
    )
    or exists (
      select 1 from public.project_connections pc
      join public.ngos n on n.id = pc.ngo_id
      where pc.id = project_assignees.project_id
        and n.auth_user_id = auth.uid()
    )
  );

-- 6. Access Requests Table
create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null, -- corporate_id or ngo_id
  user_id uuid not null, -- references auth.users(id)
  org_type text not null check (org_type in ('corporate', 'ngo')),
  target_type text not null check (target_type in ('project', 'tab')),
  target_id text not null, -- Project UUID or Tab Name string
  requested_permission text not null check (requested_permission in ('read_only', 'edit')),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.access_requests enable row level security;

drop policy if exists "Users read own access requests" on public.access_requests;
create policy "Users read own access requests"
  on public.access_requests for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users create own access requests" on public.access_requests;
create policy "Users create own access requests"
  on public.access_requests for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Organization admins manage access requests" on public.access_requests;
create policy "Organization admins manage access requests"
  on public.access_requests for all
  to authenticated
  using (
    (org_type = 'corporate' and exists (
      select 1 from public.corporates c
      where c.id = access_requests.org_id
        and c.auth_user_id = auth.uid()
    ))
    or
    (org_type = 'ngo' and exists (
      select 1 from public.ngos n
      where n.id = access_requests.org_id
        and n.auth_user_id = auth.uid()
    ))
  );

-- Indexes for performance optimization
create index if not exists idx_project_assignees_project_id on public.project_assignees(project_id);
create index if not exists idx_project_assignees_user_id on public.project_assignees(user_id);
create index if not exists idx_access_requests_org_id on public.access_requests(org_id);
create index if not exists idx_access_requests_user_id on public.access_requests(user_id);

-- Enable realtime for access_requests and project_assignees
do $$
begin
  alter publication supabase_realtime add table public.access_requests;
  alter publication supabase_realtime add table public.project_assignees;
exception
  when duplicate_object then null;
end;
$$;

-- ─────────────────────────────────────────────────────────────────
-- DONE.
-- ─────────────────────────────────────────────────────────────────



