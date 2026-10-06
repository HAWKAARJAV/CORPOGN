/**
 * Corporate Dashboard — End-to-end Playwright Tests
 *
 * Strategy
 * ────────
 * • A single corporate account is created via the registration API in
 *   test.beforeAll (avoids the 5-page form bug; see Suite 7).
 * • The account starts LOCKED (default).
 * • Suites 2 & 3 test the locked / chat state.
 * • Before Suite 4 the account is unlocked via Supabase admin REST API so
 *   navigation tests don't need to replay the chat flow in every beforeEach.
 * • Sign-in helper uses a generous timeout to handle cold Supabase starts.
 *
 * KNOWN BUG (Suite 7): the 5-page registration form unmounts previous pages
 * when the user advances, so FormData on final Submit only contains ESG fields.
 * The API returns 400 "Company name, admin email, and password are required."
 */

import { test, expect, Page } from "@playwright/test";

// ─── Constants ────────────────────────────────────────────────────────────────
const BASE_URL = "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const CORP_PASS = "TestCorp@2026!";
let CORP_EMAIL  = "";
let CORP_SLUG   = "";

// ─── Supabase helpers (used outside the browser) ──────────────────────────────
async function supabasePatch(table: string, filter: string, body: object) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`PATCH ${table} failed: ${await res.text()}`);
  }
}

// ─── Create the test account once before all tests ───────────────────────────
test.beforeAll(async ({ request }) => {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — load from .env.local for E2E.",
    );
  }

  const ts = Date.now();
  CORP_EMAIL = `corp+${ts}@testcorp.com`;

  const fields: Record<string, string> = {
    companyName:                    `Test Corporation ${ts}`,
    industryType:                   "Technology",
    cinNumber:                      `U72900MH${ts}`.slice(0, 21),
    panNumber:                      "AABCT1234D",
    companyEmail:                   CORP_EMAIL,
    contactNumber:                  "9876543210",
    state:                          "Maharashtra",
    country:                        "India",
    headquartersAddress:            "123 Test Street, Mumbai 400001",
    csrFocusAreas:                  "Education",
    authorizedSignatoryName:        "Test Admin",
    authorizedSignatoryDesignation: "CEO",
    fullName:                       "Test Admin",
    designation:                    "Super Admin",
    workEmail:                      CORP_EMAIL,
    phoneNumber:                    "9876543210",
    password:                       CORP_PASS,
    confirmPassword:                CORP_PASS,
  };

  const res  = await request.post(`${BASE_URL}/api/corporates/register`, {
    multipart: Object.fromEntries(Object.entries(fields)),
  });
  const body = (await res.json()) as { slug?: string; error?: string };
  if (!body.slug) throw new Error(`Registration failed: ${body.error}`);
  CORP_SLUG = body.slug;
});

// ─── Sign-in helper ───────────────────────────────────────────────────────────
async function signIn(page: Page) {
  await page.goto(`${BASE_URL}/signin`);
  await page.getByRole("button", { name: "Sign in as Corporate" }).click();
  await page.getByRole("button", { name: "Login as Firm / Admin" }).click();
  await page.getByLabel("Email address").fill(CORP_EMAIL);
  await page.getByLabel("Password").fill(CORP_PASS);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // 40 s – generous enough for cold Supabase start
  await page.waitForURL(`**/corporate/${CORP_SLUG}/dashboard`, { timeout: 40_000 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 1 — Sign-in page
// ═══════════════════════════════════════════════════════════════════════════════
//
test.describe("Sign-In Page", () => {
  test("shows Corporate / NGO select buttons", async ({ page }) => {
    await page.goto(`${BASE_URL}/signin`);
    await expect(page.getByRole("button", { name: "Sign in as Corporate" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in as NGO" })).toBeVisible();
  });

  test("wrong mode shows error message for corporate credentials", async ({ page }) => {
    await page.goto(`${BASE_URL}/signin`);
    await page.getByRole("button", { name: "Sign in as NGO" }).click();
    await page.getByRole("button", { name: "Login as Firm / Admin" }).click();
    await page.getByLabel("Email address").fill(CORP_EMAIL);
    await page.getByLabel("Password").fill(CORP_PASS);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByText(/not an ngo|not a corporate|account type|invalid/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("signs in successfully and lands on corporate dashboard", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(`${BASE_URL}/corporate/${CORP_SLUG}/dashboard`);
    await expect(page.getByText("CorpoGN")).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 2 — Locked dashboard (account just created, access_status = 'locked')
// ═══════════════════════════════════════════════════════════════════════════════
test.describe("Locked Dashboard", () => {
  test.beforeEach(async ({ page }) => { await signIn(page); });

  test("sidebar shows 'Chat required' badge", async ({ page }) => {
    await expect(page.getByText("Chat required")).toBeVisible();
  });

  test("Support / Chat is selected by default", async ({ page }) => {
    // The active sidebar item is Support / Chat
    await expect(
      page.locator("aside button.bg-blue-600").filter({ hasText: "Support / Chat" }),
    ).toBeVisible();
  });

  test("clicking a locked nav item keeps chat panel visible", async ({ page }) => {
    await page.getByRole("button", { name: "Dashboard" }).click();
    // Redirected back to chat — header stays on Support / Chat
    await expect(page.locator("header h1")).toContainText("Support / Chat");
  });

  test("locked buttons show a Lock icon", async ({ page }) => {
    // Wait for the sidebar to fully render (dashboard finishes loading)
    await expect(page.locator("aside")).toBeVisible({ timeout: 30_000 });
    // Wait until at least one sidebar nav button appears
    await expect(page.locator("aside button").first()).toBeVisible({ timeout: 15_000 });
    // At least one Lucide lock icon is rendered in the sidebar
    const locked = page.locator("aside button").filter({
      has: page.locator("svg"),
    });
    const count = await locked.count();
    expect(count).toBeGreaterThan(0);
    // The sidebar itself mentions "Dashboard" (one of the locked items)
    await expect(page.locator("aside")).toContainText("Dashboard");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 3 — Support / Chat panel (account still locked)
// ═══════════════════════════════════════════════════════════════════════════════
test.describe("Support / Chat panel", () => {
  test.beforeEach(async ({ page }) => { await signIn(page); });

  test("renders a message textarea and Send button", async ({ page }) => {
    await expect(page.locator("textarea").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /send/i })).toBeVisible();
  });

  test("Send is disabled when textarea is empty", async ({ page }) => {
    await expect(page.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  test("typing into textarea enables Send", async ({ page }) => {
    await page.locator("textarea").first().fill("Hello, requesting access.");
    await expect(page.getByRole("button", { name: /send/i })).toBeEnabled();
  });

  test("sending a message shows it in the thread", async ({ page }) => {
    const msg = "Please grant me dashboard access.";
    await page.locator("textarea").first().fill(msg);
    await page.getByRole("button", { name: /send/i }).click();
    await expect(page.getByText(msg)).toBeVisible({ timeout: 12_000 });
  });

  test("sidebar badge flips to 'Unlocked' after first message", async ({ page }) => {
    await page.locator("textarea").first().fill("Unlock me");
    await page.getByRole("button", { name: /send/i }).click();
    await expect(page.getByText("Unlocked")).toBeVisible({ timeout: 12_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 4 — Navigation (unlock via API first, then sign in once per test)
// ═══════════════════════════════════════════════════════════════════════════════
test.describe("Dashboard Navigation (unlocked)", () => {
  // Unlock the account via Supabase admin PATCH — no browser needed
  test.beforeAll(async () => {
    await supabasePatch(
      "corporates",
      `slug=eq.${CORP_SLUG}`,
      { access_status: "active" },
    );
  });

  test.beforeEach(async ({ page }) => { await signIn(page); });

  const sections = [
    "Dashboard",
    "Master Analytics",
    "Campaign Management",
    "NGO Management",
    "Project Workspace",
    "Budget & Fund Tracking",
    "ESG & Impact",
    "Reports & Approvals",
    "AI Insights",
    "Audit & Compliance",
    "Employees & Access",
    "Notifications",
  ];

  for (const section of sections) {
    test(`"${section}" panel loads`, async ({ page }) => {
      await page.getByRole("button", { name: section }).click();
      await expect(
        page.locator("header h1").filter({ hasText: section }),
      ).toBeVisible({ timeout: 6_000 });
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 5 — Dashboard home content
// ═══════════════════════════════════════════════════════════════════════════════
test.describe("Dashboard Home Content", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Dashboard" }).click();
    await expect(page.getByText(/Welcome back/i)).toBeVisible({ timeout: 8_000 });
  });

  test("4 KPI cards are visible", async ({ page }) => {
    await expect(page.getByText("Annual CSR Budget")).toBeVisible();
    await expect(page.getByText("Released")).toBeVisible();
    await expect(page.getByText("Utilized")).toBeVisible();
    await expect(page.getByText("Pending Approvals")).toBeVisible();
  });

  test("Campaign Operating Board table is visible", async ({ page }) => {
    await expect(page.getByText("Campaign Operating Board")).toBeVisible();
  });

  test("Priority Signals card is visible", async ({ page }) => {
    await expect(page.getByText("Priority Signals")).toBeVisible();
  });

  test("Priority Queue feed is visible", async ({ page }) => {
    await expect(page.getByText("Priority Queue")).toBeVisible();
  });

  test("top-bar shows company email prefix and bell button", async ({ page }) => {
    await expect(page.getByText(CORP_EMAIL.split("@")[0])).toBeVisible();
    await expect(
      page.locator("header button").filter({ has: page.locator("svg") }).first(),
    ).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 6 — Header breadcrumb updates on sidebar click
// ═══════════════════════════════════════════════════════════════════════════════
test.describe("Header breadcrumb", () => {
  test.beforeEach(async ({ page }) => { await signIn(page); });

  const spot: [string, string][] = [
    ["Dashboard",        "Dashboard"],
    ["ESG & Impact",     "ESG & Impact"],
    ["Notifications",    "Notifications"],
    ["Reports & Approvals", "Reports & Approvals"],
  ];

  for (const [btnName, heading] of spot) {
    test(`header shows "${heading}" after clicking "${btnName}"`, async ({ page }) => {
      await page.getByRole("button", { name: btnName }).click();
      await expect(
        page.locator("header h1").filter({ hasText: heading }),
      ).toBeVisible({ timeout: 5_000 });
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 7 — Sign-up form UI (documents the multi-page data-loss bug)
// ═══════════════════════════════════════════════════════════════════════════════
test.describe("Sign-Up Form UI", () => {
  test("Back link goes to /signup", async ({ page }) => {
    await page.goto(`${BASE_URL}/signup/corporate`);
    await page.getByRole("link", { name: "Back" }).click();
    await expect(page).toHaveURL(`${BASE_URL}/signup`);
  });

  test("page indicator starts at 'Page 1 of 5'", async ({ page }) => {
    await page.goto(`${BASE_URL}/signup/corporate`);
    await expect(page.getByText("Page 1 of 5")).toBeVisible();
  });

  test("Previous button is disabled on page 1", async ({ page }) => {
    await page.goto(`${BASE_URL}/signup/corporate`);
    await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  test("empty required fields block advance to page 2", async ({ page }) => {
    await page.goto(`${BASE_URL}/signup/corporate`);
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText("Page 1 of 5")).toBeVisible();
  });

  test("filling page 1 advances to page 2", async ({ page }) => {
    await page.goto(`${BASE_URL}/signup/corporate`);
    await page.locator('[name="companyName"]').fill("ACME Corp");
    await page.locator('[name="industryType"]').selectOption("Technology");
    await page.locator('[name="cinNumber"]').fill("U72900MH2020PTC000001");
    await page.locator('[name="panNumber"]').fill("AABCT1234D");
    await page.locator('[name="companyEmail"]').fill("acme@example.com");
    await page.locator('[name="contactNumber"]').fill("9876543210");
    await page.locator('[name="state"]').selectOption("Maharashtra");
    await page.locator('[name="country"]').selectOption("India");
    await page.locator('[name="headquartersAddress"]').fill("123 Street, Mumbai");
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText("Page 2 of 5")).toBeVisible({ timeout: 4_000 });
  });

  /**
   * BUG: React conditionally renders each page — previous pages unmount when
   * the user advances, dropping their fields from the DOM. On the final Submit
   * (page 5) FormData only contains ESG fields; the API rejects with 400.
   */
  test("BUG ⚠ — submitting from page 5 fails (previous pages unmounted)", async ({ page }) => {
    await page.goto(`${BASE_URL}/signup/corporate`);

    // Page 1
    await page.locator('[name="companyName"]').fill("Bug Corp");
    await page.locator('[name="industryType"]').selectOption("Finance");
    await page.locator('[name="cinNumber"]').fill("U72900MH2020PTC000099");
    await page.locator('[name="panNumber"]').fill("AABCT0099X");
    await page.locator('[name="companyEmail"]').fill("bug@corp.com");
    await page.locator('[name="contactNumber"]').fill("9000000099");
    await page.locator('[name="state"]').selectOption("Delhi");
    await page.locator('[name="country"]').selectOption("India");
    await page.locator('[name="headquartersAddress"]').fill("99 Test St, Delhi");
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText("Page 2 of 5")).toBeVisible();

    // Page 2
    await page.locator('[name="csrFocusAreas"]').selectOption(["Education"]);
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText("Page 3 of 5")).toBeVisible();

    // Page 3
    await page.locator('[name="authorizedSignatoryName"]').fill("Bug Admin");
    await page.locator('[name="authorizedSignatoryDesignation"]').fill("CEO");
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText("Page 4 of 5")).toBeVisible();

    // Page 4 (fields will be unmounted when we move to page 5)
    await page.locator('[name="fullName"]').fill("Bug Admin");
    await page.locator('[name="designation"]').fill("Admin");
    await page.locator('[name="workEmail"]').fill("bug@corp.com");
    await page.locator('[name="phoneNumber"]').fill("9000000099");
    await page.locator('[name="password"]').fill("BugTest@123");
    await page.locator('[name="confirmPassword"]').fill("BugTest@123");
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText("Page 5 of 5")).toBeVisible();

    // Page 5 — Submit → only ESG fields are in FormData → API rejects
    await page.locator('button[type="submit"]').click();
    await expect(
      page.getByText(/company name.*required|admin email.*required|required/i),
    ).toBeVisible({ timeout: 10_000 });
  });
});
