import { defineConfig, devices } from "@playwright/test";
import path from "path";
import fs from "fs";

const envLocal = path.join(__dirname, ".env.local");
if (fs.existsSync(envLocal)) {
  for (const line of fs.readFileSync(envLocal, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const AUTH = (name: string) =>
  path.join(__dirname, `playwright/.auth/${name}.json`);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,        // sequential — avoids Supabase auth rate limits
  retries: 1,
  timeout: 45_000,
  reporter: [["list"], ["html", { open: "never" }]],

  // Global setup runs ONCE before all tests — creates all auth state files
  globalSetup: require.resolve("./playwright/global-setup.ts"),

  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    viewport: { width: 1280, height: 800 },
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    // ── Main NGO admin dashboard tests ───────────────────────────────────────
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: AUTH("ngo-admin"),
      },
      testMatch: /ngo-dashboard\.spec\.ts/,
    },

    // ── Role dashboard + cross-sync tests ─────────────────────────────────────
    {
      name: "chromium-roles",
      use: {
        ...devices["Desktop Chrome"],
        storageState: AUTH("ngo-admin"), // default; overridden per-describe with test.use()
      },
      testMatch: /ngo-role-dashboards\.spec\.ts/,
    },

    // ── Corporate dashboard tests (manages its own auth) ──────────────────────
    {
      name: "chromium-corporate",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /corporate-dashboard\.spec\.ts/,
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
