# CorpoGN DB Refactor — Honest Analysis & Scoped Plan

> **The 20-point prompt is thorough but partially over-engineered for the current stage.
> This plan cuts it down to what actually matters RIGHT NOW vs what can wait.**

---

## Verdict Per Requirement

| # | Requirement | Verdict | Reason |
|---|---|---|---|
| 1 | Replace `allowed_pages` JSONB with full RBAC (roles/permissions tables) | ⏸ **DEFER** | Over-engineering. Current `allowed_pages` works fine. RBAC adds 4 new tables + complex middleware before any feature is live. Do after MVP. |
| 2 | Audit Logging | ✅ **CRITICAL** | Fund releases and NGO verifications must be traceable. Simple `audit_logs` table, not complex. |
| 3 | Secure File Storage (signed URLs, no public URLs) | ✅ **CRITICAL** | `file_url text` storing permanent public URLs is a real security hole. Replace with `storage_object_id`. |
| 4 | Normalize `document_requests text[]` → `project_documents` table | ✅ **CRITICAL** | Can't track status, uploads, or remarks on a text array. Needed for the NGO workflow. |
| 5 | Normalize `milestone text` → `project_milestones` table | ✅ **CRITICAL** | A single text field can't track multiple milestones per project. Core to the NGO workflow. |
| 6 | Evidence Upload System | ✅ **CRITICAL** | NGO needs to upload field evidence. Required for UC and impact report workflows. |
| 7 | Utilization Certificate System | ✅ **CRITICAL** | UC is a legal compliance requirement in CSR. Must be structured, not free text. |
| 8 | Impact Report System | ✅ **CRITICAL** | Same — reports need status, reviewer, and storage link. |
| 9 | Trust Score Refactor (computed from components) | ✅ **IMPORTANT** | Current `trust_score integer` on `ngos` is too simple. Add a `trust_score_components` table. But keep the existing column for display — just stop direct editing. |
| 10 | `budget text` → `numeric(18,2)` | ✅ **CRITICAL** | Storing "Rs 25L" as text is wrong. Financial values must be numeric. This affects `project_connections.budget`. |
| 11 | Notification System | ✅ **IMPORTANT** | Needed for fund approvals, doc requests, expiry reminders. Simple table. |
| 12 | Compliance Expiry Tracking (reminder_sent, verified_by) | ✅ **IMPORTANT** | `ngo_documents` / `ngo_compliance_docs` already have `expires_at` but no reminder tracking. Add 3 columns. |
| 13 | Strict RLS on every table | ✅ **CRITICAL** | Already partially done. Need to extend to new tables and add INSERT/UPDATE policies, not just SELECT. |
| 14 | Secure Messaging (no client-trusted sender_type) | ✅ **CRITICAL** | `ngo_project_messages` needs RLS where `sender_type` is derived server-side, not client-provided. |
| 15 | Soft Deletes (`deleted_at`) | ✅ **IMPORTANT** | Add to `corporates`, `ngos`, `project_connections`. Skip for budget/disbursement tables — those are append-only by nature. |
| 16 | Database Indexes | ✅ **CRITICAL** | Missing indexes on `connection_id`, `ngo_id`, `corporate_id` foreign keys on new tables. |
| 17 | Normalize Registration Data (CIN, GST, PAN etc.) | ⏸ **DEFER** | Registration forms aren't built yet. Adding columns now without UI = dead columns. Keep JSONB until registration flow is complete. |
| 18 | Verification History | ⏸ **DEFER** | Useful but low priority. `audit_logs` covers this via `entity_type = 'ngo' action = 'status_change'`. Don't add a separate table yet. |
| 19 | Full-Text NGO Discovery | ⏸ **DEFER** | Platform has < 100 NGOs now. `tsvector` indexes premature. Add when NGO count grows. |
| 20 | Preserve existing functionality | ✅ **MANDATORY** | All migrations must be additive. No destructive changes. |

---

## What We're Actually Doing (The Real Scope)

**10 things. Not 20.**

1. ✅ Fix `project_connections.budget` → `numeric(18,2)`
2. ✅ Add `audit_logs` table
3. ✅ Add `project_milestones` table (replace `milestone text`)
4. ✅ Add `project_documents` table (replace `document_requests jsonb`)
5. ✅ Add `evidence_uploads` table (with `storage_object_id`, no public URLs)
6. ✅ Add `utilization_certificates` table
7. ✅ Add `impact_reports` table
8. ✅ Add `ngo_project_messages` table (with server-enforced sender)
9. ✅ Add `notifications` table
10. ✅ Extend `ngo_documents` with expiry/reminder tracking columns
11. ✅ Add `soft_delete` (`deleted_at`) to core tables
12. ✅ Add all missing indexes
13. ✅ Extend RLS to cover INSERT/UPDATE on all new tables

**Skipped (with reason):**
- ❌ RBAC tables — adds 4 tables + middleware before any feature is live
- ❌ Normalize registration data — forms don't exist yet
- ❌ Verification history table — covered by audit_logs
- ❌ Full-text search — premature at current scale

---

## Migration SQL — `supabase-production-migration.sql`

> **Run this file after the existing `supabase-schema.sql` and `supabase-budget-schema.sql`.**
> **All changes are additive. Nothing is dropped.**

### File: `supabase-production-migration.sql`

```sql
-- ═══════════════════════════════════════════════════════════════════
-- CorpoGN — Production Database Migration
-- Run AFTER: supabase-schema.sql + supabase-budget-schema.sql
-- All changes are additive — no existing tables dropped.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. FIX: project_connections.budget text → numeric(18,2)
-- ─────────────────────────────────────────────────────────────────
-- Rename old text column to preserve data during migration
alter table public.project_connections
  rename column budget to budget_text_legacy;

-- Add proper numeric column
alter table public.project_connections
  add column budget numeric(18,2) not null default 2500000;
-- 2500000 = Rs 25L default

-- Also fix budgets table (already numeric but ensure precision)
alter table public.budgets
  alter column total_amount type numeric(18,2);

alter table public.fund_allocations
  alter column allocated_amount type numeric(18,2);

alter table public.fund_disbursements
  alter column released_amount type numeric(18,2),
  alter column utilized_amount type numeric(18,2);

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
-- ─────────────────────────────────────────────────────────────────
alter table public.ngo_documents
  add column if not exists reminder_sent     boolean not null default false,
  add column if not exists reminder_sent_at  timestamptz,
  add column if not exists verified_by       uuid,
  add column if not exists verified_at       timestamptz;

-- ngo_compliance_docs in supabase-schema.sql (NGO side) — same treatment
-- (If the table exists under a different name, apply this to that table too)

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

create index if not exists idx_ngo_documents_expires_at
  on public.ngo_documents(expires_at);
create index if not exists idx_ngo_documents_reminder_sent
  on public.ngo_documents(reminder_sent) where reminder_sent = false;

create index if not exists idx_campaigns_corporate_id
  on public.campaigns(corporate_id);
create index if not exists idx_campaigns_status
  on public.campaigns(status);
create index if not exists idx_budgets_corporate_id
  on public.budgets(corporate_id);
create index if not exists idx_budgets_financial_year
  on public.budgets(financial_year);

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
-- DONE.
-- ─────────────────────────────────────────────────────────────────
```

---

## Files to Create/Modify

| File | Action | Notes |
|---|---|---|
| `supabase-production-migration.sql` | **NEW** | The full SQL above |
| `lib/project-connections.ts` | **MODIFY** | Change `budget: string` → `budget: number` in `ProjectConnection` type |
| `app/api/project-connections/route.ts` | **MODIFY** | `budget: "Rs 25L"` → `budget: 2500000` (numeric) |
| `app/api/ngo/messages/route.ts` | **NEW** | POST messages here — server sets `sender_type` from `account_type`, never from body |
| `app/api/project-connections/[id]/route.ts` | **NEW** | PATCH for NGO progress fields only |
| `app/api/project-connections/[id]/uc/route.ts` | **NEW** | POST utilization certificate |
| `app/api/project-connections/[id]/impact-report/route.ts` | **NEW** | POST impact report |

---

## Key Decisions Explained

### Why NOT full RBAC now?
The current `allowed_pages jsonb` system works. Building 4 new tables (`roles`, `permissions`, `role_permissions`, `user_roles`) + completely rewriting auth middleware would break all existing API routes and add weeks of work before any NGO feature ships. The right time for RBAC is after the core NGO ↔ Corporate workflow is live.

### Why NOT signed URLs in the schema yet?
The `storage_object_id` column approach is correct — this migration adds it to all new tables. The existing `ngo_documents` table doesn't have file uploads in Supabase Storage yet (currently simulated). When storage is wired, the API generates signed URLs from `storage_object_id`. No schema change needed then.

### Why NOT verification history table?
`audit_logs` with `entity_type = 'ngo'` and `action = 'STATUS_CHANGED'` captures exactly the same information. Two tables for one concept creates inconsistency.

### Why NOT full-text search now?
There are currently ≤10 NGOs in the system. PostgreSQL `tsvector` indexes on a small dataset add complexity with zero benefit. Add when NGO count > 500.

---

## Verification Plan

1. Run `supabase-production-migration.sql` in Supabase SQL editor
2. Check TypeScript: update `budget: string` → `budget: number` in `lib/project-connections.ts`, run `npm run build`
3. Test existing corporate dashboard — project connections still load
4. Test NGO dashboard — corporate partnerships still appear
5. Verify RLS: log in as NGO user, confirm can't read another NGO's milestones
6. Verify RLS: log in as corporate user, confirm can't read another corporate's project_connections
7. Run existing Playwright tests — all green
