# Architecture findings

## Pattern

```
Browser → Next.js (RSC + client components)
       → middleware (session + coarse role)
       → API routes (getCaller / requirePlatformAdmin / authorizeProjectAccess)
       → supabaseAdmin (service role) → Postgres
       → Supabase Auth (JWT + cookies)
```

## Strengths

- Centralized **`lib/access-control.ts`**: org resolution from DB, project authorization, admin checks.
- **Tenant isolation** for project connections via `authorizeProjectAccess` (corporate_id / ngo_id / assignees).
- **Middleware** closes unauthenticated access to dashboard shells.
- AI proposal analysis degrades to **rule-based local analysis** without API keys.

## Gaps / debt

| Topic | Detail |
|-------|--------|
| ORM | Raw Supabase client; validation duplicated across routes |
| Admin `requireAdmin` | Duplicated in several admin route files; could consolidate on `requirePlatformAdmin` |
| Real-time | No Socket.IO; dashboards poll or refetch |
| Docker / Render | No container blueprint in repo; deploy likely Vercel/Render manual |
| Monolith UI | Corporate and NGO dashboards are single-file megacomponents — harder to test and refactor |
| Next.js 16 | `middleware` deprecation toward `proxy` — plan platform upgrade |

## API surface

47 route handlers under `app/api/` covering corporates, NGOs, projects, admin, enrichment triggers, access requests, pre-assignments.

## Data

- Core entities: `corporates`, `ngos`, `ngo_members`, `corporate_employees`, `project_connections`, `opportunities`, `pre_assignments`, `discovered_ngos`, `admin_users`.
- Enrichment pipeline: separate tables + `research_logs`.
