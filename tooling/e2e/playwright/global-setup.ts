/**
 * Playwright global setup — signs in once per account and saves auth state.
 *
 * By caching sessions, all tests navigate directly to the dashboard without
 * re-authenticating, which avoids Supabase auth rate limits.
 *
 * Auth state files are reused if < 55 min old (within Supabase token lifetime).
 */
import { chromium, FullConfig } from "@playwright/test";
import path from "path";
import fs   from "fs";

const BASE_URL = "http://localhost:3000";
const NGO_SLUG = "green-earth-foundation";
const AUTH_DIR = path.join(__dirname, ".auth");

if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

interface Account {
  file:     string;
  email:    string;
  password: string;
  tab:      "NGO Admin" | "NGO Member";
}

const ACCOUNTS: Account[] = [
  { file: "ngo-admin.json", email: "admin@greenearthngo.in",       password: "GreenEarth@2026", tab: "NGO Admin"  },
  { file: "finance.json",   email: "finance@greenearthngo.in",     password: "Finance@2026",    tab: "NGO Member" },
  { file: "compliance.json",email: "compliance@greenearthngo.in",  password: "Comply@2026",     tab: "NGO Member" },
  { file: "ops.json",       email: "ops@greenearthngo.in",         password: "Ops@2026",        tab: "NGO Member" },
  { file: "field.json",     email: "field@greenearthngo.in",       password: "Field@2026",      tab: "NGO Member" },
  { file: "reporter.json",  email: "reporter@greenearthngo.in",    password: "Report@2026",     tab: "NGO Member" },
  { file: "volunteer.json", email: "volunteer@greenearthngo.in",   password: "Volunteer@2026",  tab: "NGO Member" },
];

function isRecent(file: string): boolean {
  try {
    const age = Date.now() - fs.statSync(file).mtimeMs;
    return age < 55 * 60 * 1000; // 55 minutes
  } catch { return false; }
}

export default async function globalSetup(_config: FullConfig) {
  const browser = await chromium.launch({ headless: true });
  let signedInCount = 0;

  for (const account of ACCOUNTS) {
    const outFile = path.join(AUTH_DIR, account.file);

    if (isRecent(outFile)) {
      console.log(`[setup] ↩  Reusing ${account.file} (< 55min old)`);
      continue;
    }

    console.log(`[setup] 🔑 Signing in ${account.email}...`);

    // Add delay between sign-ins to avoid rate limits
    if (signedInCount > 0) {
      await new Promise((r) => setTimeout(r, 2000));
    }

    const context = await browser.newContext();
    const page    = await context.newPage();

    try {
      await page.goto(`${BASE_URL}/signin`);
      await page.getByRole("button", { name: "Sign in as NGO" }).click();
      if (account.tab === "NGO Admin") {
        await page.getByRole("button", { name: "Login as Firm / Admin" }).click();
      } else {
        await page.getByRole("button", { name: "Login as Employee" }).click();
      }
      await page.getByLabel("Email address").fill(account.email);
      await page.getByLabel("Password").fill(account.password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForURL(`**/ngo/${NGO_SLUG}/dashboard`, { timeout: 30_000 });
      await context.storageState({ path: outFile });
      signedInCount++;
      console.log(`[setup] ✓  Saved ${account.file}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[setup] ✗  Failed to sign in ${account.email}: ${msg}`);
      // Write empty state so project doesn't block
      fs.writeFileSync(outFile, JSON.stringify({ cookies: [], origins: [] }));
    } finally {
      await context.close();
    }
  }

  await browser.close();
  console.log(`[setup] ✓  Done — ${signedInCount} new session(s) created.\n`);
}
