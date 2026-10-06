/**
 * Auth setup for all 6 NGO member roles.
 * Signs in as each role once and saves cookies/localStorage so the role
 * dashboard tests never need to re-authenticate (avoiding rate limits).
 */
import { test as setup } from "@playwright/test";
import path from "path";
import fs from "fs";

const BASE_URL = "http://localhost:3000";
const NGO_SLUG = "green-earth-foundation";
const AUTH_DIR = path.join(__dirname, "../playwright/.auth");

const MEMBER_ACCOUNTS = [
  { role: "finance",    email: "finance@greenearthngo.in",     password: "Finance@2026" },
  { role: "compliance", email: "compliance@greenearthngo.in",  password: "Comply@2026"  },
  { role: "ops",        email: "ops@greenearthngo.in",         password: "Ops@2026"     },
  { role: "field",      email: "field@greenearthngo.in",       password: "Field@2026"   },
  { role: "reporter",   email: "reporter@greenearthngo.in",    password: "Report@2026"  },
  { role: "volunteer",  email: "volunteer@greenearthngo.in",   password: "Volunteer@2026" },
];

// Ensure auth dir exists
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

for (const account of MEMBER_ACCOUNTS) {
  setup(`authenticate as ${account.role}`, async ({ page }) => {
    await page.goto(`${BASE_URL}/signin`);
    await page.getByRole("button", { name: "NGO Member" }).click();
    await page.getByLabel("Email address").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(`**/ngo/${NGO_SLUG}/dashboard`, { timeout: 30_000 });
    await page.context().storageState({
      path: path.join(AUTH_DIR, `${account.role}.json`),
    });
  });
}
