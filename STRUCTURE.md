# Repository layout

All application code lives under **`src/`**. One Next.js app at the repo root (`npm run dev`).

```
src/
  app/           Pages, layouts, and /api route handlers
  components/    Shared React UI
  lib/
    client/      Browser Supabase, stores, UI helpers
    server/      Auth, admin DB, LLM, trust score, scoring
    *.ts         Short re-exports (@/lib/... keeps working)
  middleware.ts

tooling/         Scripts + Playwright e2e (not part of the web bundle)
docs/            Documentation + archive
supabase/        SQL migrations
public/          Static marketing assets (required at root by Next.js)
```

Config: `package.json`, `next.config.ts`, `tsconfig.json`, `playwright.config.ts`.
