-- ═══════════════════════════════════════════════════════════════════════════
-- CorpoGN — Workspace RLS hardening (additive, defense-in-depth)
--
-- Replaces broad `authenticated using (true)` SELECT policies on the 14-module
-- workspace tables (phase5-workspace-schema.sql) with tenant-scoped policies
-- tied to project_workspaces + corporate / NGO / employee / member membership.
--
-- Primary enforcement remains Next.js API routes (supabaseAdmin +
-- authorizeProjectAccess). Do NOT disable RLS.
-- Apply once on the target Supabase project after phase5 schema exists.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.user_can_access_workspace_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_workspaces pw
    join public.corporates c on c.id = pw.corporate_id
    where pw.opportunity_id = p_project_id
      and c.auth_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.project_workspaces pw
    join public.ngos n on n.id = pw.ngo_id
    where pw.opportunity_id = p_project_id
      and n.auth_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.project_workspaces pw
    join public.corporate_employees ce on ce.corporate_id = pw.corporate_id
    where pw.opportunity_id = p_project_id
      and ce.auth_user_id = auth.uid()
      and ce.is_active = true
  )
  or exists (
    select 1
    from public.project_workspaces pw
    join public.ngo_members nm on nm.ngo_id = pw.ngo_id
    where pw.opportunity_id = p_project_id
      and nm.auth_user_id = auth.uid()
      and nm.is_active = true
  )
  or exists (
    select 1 from public.admin_users au
    where au.auth_user_id = auth.uid()
      and au.is_active = true
  );
$$;

-- project_workspaces
drop policy if exists "authenticated reads project_workspaces" on public.project_workspaces;
create policy "tenant members read project_workspaces"
  on public.project_workspaces for select
  to authenticated
  using (public.user_can_access_workspace_project(opportunity_id));

-- activity_logs
drop policy if exists "authenticated reads activity_logs" on public.activity_logs;
create policy "tenant members read activity_logs"
  on public.activity_logs for select
  to authenticated
  using (public.user_can_access_workspace_project(project_id));

-- 14 module tables (project_id → opportunities.id)
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
    execute format('drop policy if exists "authenticated reads %s" on public.%I;', t, t);
    execute format(
      'create policy "tenant members read %s" on public.%I for select to authenticated using (public.user_can_access_workspace_project(project_id));',
      t, t
    );
  end loop;
end $$;
