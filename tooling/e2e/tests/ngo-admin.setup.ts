/**
 * Auth setup: Signs in ONCE as NGO super admin and saves cookies/localStorage
 * so subsequent tests can reuse the session without repeated sign-ins.
 */
import { test as setup, expect } from "@playwright/test";
import path from "path";

const BASE_URL = "http://localhost:3000";
const NGO_SLUG = "green-earth-foundation";
export const NGO_ADMIN_STATE = path.join(__dirname, "../playwright/.auth/ngo-admin.json");

setup("authenticate as NGO admin", async ({ page }) => {
  await page.goto(`${BASE_URL}/signin`);
  await page.getByRole("button", { name: "NGO Admin" }).click();
  await page.getByLabel("Email address").fill("admin@greenearthngo.in");
  await page.getByLabel("Password").fill("GreenEarth@2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`**/ngo/${NGO_SLUG}/dashboard`, { timeout: 30_000 });
  await expect(page.getByTestId("dashboard-main")).toBeVisible();
  // Save auth state (cookies + localStorage)
  await page.context().storageState({ path: NGO_ADMIN_STATE });
});
