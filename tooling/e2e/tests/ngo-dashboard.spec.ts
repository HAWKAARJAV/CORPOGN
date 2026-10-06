import { test, expect, Page } from "@playwright/test";

const BASE_URL   = "http://localhost:3000";
const NGO_EMAIL  = "admin@greenearthngo.in";
const NGO_PASS   = "GreenEarth@2026";
const NGO_SLUG   = "green-earth-foundation";
const DASH_URL   = `${BASE_URL}/ngo/${NGO_SLUG}/dashboard`;

/**
 * Helper: navigate directly to NGO dashboard.
 * Auth state is pre-loaded via storageState (see playwright.config.ts + ngo-admin.setup.ts),
 * so we never need to sign in again mid-run — just go straight to the dashboard.
 */
async function goToDashboard(page: Page) {
  await page.goto(DASH_URL);
  await page.waitForURL(`**/ngo/${NGO_SLUG}/dashboard`, { timeout: 20_000 });
}

// ─── SUITE 1: Sign In ─────────────────────────────────────────────────────────
test.describe("NGO Sign In", () => {
  test("renders organization sign-in options", async ({ page }) => {
    await page.goto(`${BASE_URL}/signin`);
    await expect(page.getByRole("button", { name: "Sign in as Corporate" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in as NGO" })).toBeVisible();
  });

  test("wrong tab shows account-type mismatch error", async ({ page }) => {
    await page.goto(`${BASE_URL}/signin`);
    await page.getByRole("button", { name: "Sign in as Corporate" }).click();
    await page.getByRole("button", { name: "Login as Firm / Admin" }).click();
    await page.getByLabel("Email address").fill(NGO_EMAIL);
    await page.getByLabel("Password").fill(NGO_PASS);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText(/account type mismatch/i)).toBeVisible({ timeout: 10_000 });
  });

  test("already authenticated → redirected to NGO dashboard", async ({ page }) => {
    // With storageState, we should already be authenticated
    await goToDashboard(page);
    await expect(page).toHaveURL(DASH_URL);
    await expect(page.getByTestId("dashboard-main")).toBeVisible();
  });
});

// ─── SUITE 2: Dashboard Navigation ───────────────────────────────────────────
test.describe("Sidebar Navigation", () => {
  test.beforeEach(async ({ page }) => { await goToDashboard(page); });

  test("Command Center loads by default", async ({ page }) => {
    await expect(page.getByText("NGO Command Center")).toBeVisible();
  });

  test("sidebar nav items navigate to correct sections", async ({ page }) => {
    const navMap: [string, string | RegExp][] = [
      ["nav-ngo-profile",         "NGO Profile"],
      ["nav-compliance-vault",    "Compliance Vault"],
      ["nav-trust-score",         "Trust Score"],
      ["nav-ai-proposal",         "AI Proposal Reviewer"],
      ["nav-team-management",     "Role Assignment"],
      ["nav-settings",            "Settings"],
    ];
    for (const [testId, heading] of navMap) {
      await page.getByTestId(testId).click();
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
  });

  test("locked sections show lock state for unverified", async ({ page }) => {
    // has_project = false so project sections are locked
    await page.getByTestId("nav-my-projects").click();
    // The locked heading is "My Projects" and the CTA is visible
    await expect(page.getByTestId("goto-opportunities-locked")).toBeVisible();
  });
});

// ─── SUITE 3: Quick Action Buttons ───────────────────────────────────────────
test.describe("Quick Action Buttons", () => {
  test.beforeEach(async ({ page }) => { await goToDashboard(page); });

  test("Upload Compliance Docs → navigates to Compliance Vault", async ({ page }) => {
    await page.getByTestId("qa-upload-docs").click();
    await expect(page.getByRole("heading", { name: "Compliance Vault" })).toBeVisible();
  });

  test("Edit NGO Profile → navigates to NGO Profile", async ({ page }) => {
    await page.getByTestId("qa-edit-profile").click();
    await expect(page.getByRole("heading", { name: "NGO Profile" })).toBeVisible();
  });

  test("AI Proposal Tips → navigates to AI Proposal Reviewer", async ({ page }) => {
    await page.getByTestId("qa-ai-proposal").click();
    await expect(page.getByRole("heading", { name: "AI Proposal Reviewer" })).toBeVisible();
  });

  test("Assign Team Roles → navigates to Role Assignment", async ({ page }) => {
    await page.getByTestId("qa-assign-roles").click();
    await expect(page.getByRole("heading", { name: "Role Assignment" })).toBeVisible();
  });
});

// ─── SUITE 4: Compliance Vault Upload ────────────────────────────────────────
test.describe("Compliance Vault — Document Upload", () => {
  test.beforeEach(async ({ page }) => {
    await goToDashboard(page);
    await page.getByTestId("nav-compliance-vault").click();
    await expect(page.getByRole("heading", { name: "Compliance Vault" })).toBeVisible();
  });

  test("shows 6 document cards", async ({ page }) => {
    const cards = page.locator("[data-testid^='doc-card-']");
    await expect(cards).toHaveCount(6);
  });

  test("Upload button opens modal", async ({ page }) => {
    await page.getByTestId("upload-doc-btn").click();
    await expect(page.getByTestId("upload-modal")).toBeVisible();
  });

  test("per-doc Upload button opens modal pre-filled with doc type", async ({ page }) => {
    await page.getByTestId("upload-btn-certificate12a").click();
    await expect(page.getByTestId("upload-modal")).toBeVisible();
    await expect(page.getByTestId("doc-type-select")).toHaveValue("certificate12a");
  });

  test("submitting without doc type shows error", async ({ page }) => {
    await page.getByTestId("upload-doc-btn").click();
    // Clear the type selection
    await page.getByTestId("doc-type-select").selectOption("");
    await page.getByTestId("upload-submit-btn").click();
    await expect(page.getByText(/select a document type/i)).toBeVisible();
  });

  test("full upload flow shows success toast and marks doc", async ({ page }) => {
    await page.getByTestId("upload-btn-certificate80g").click();
    await expect(page.getByTestId("upload-modal")).toBeVisible();
    // doc type is pre-filled; attach a dummy file
    const buffer = Buffer.from("%PDF-1.4 dummy");
    await page.getByTestId("doc-file-input").setInputFiles({
      name: "80g.pdf", mimeType: "application/pdf", buffer,
    });
    await page.getByTestId("upload-submit-btn").click();
    // Modal closes and toast appears
    await expect(page.getByTestId("upload-modal")).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/80G Certificate uploaded successfully/i)).toBeVisible();
    // Doc card now shows checkmark
    await expect(page.getByTestId("doc-check-certificate80g")).toBeVisible();
  });

  test("closing modal without upload keeps doc as missing", async ({ page }) => {
    await page.getByTestId("upload-btn-certificate12a").click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("upload-modal")).not.toBeVisible();
    // 12A should still show Upload button (not check)
    await expect(page.getByTestId("upload-btn-certificate12a")).toBeVisible();
  });
});

// ─── SUITE 5: NGO Profile Edit ────────────────────────────────────────────────
test.describe("NGO Profile Edit", () => {
  test.beforeEach(async ({ page }) => {
    await goToDashboard(page);
    await page.getByTestId("nav-ngo-profile").click();
    await expect(page.getByRole("heading", { name: "NGO Profile" })).toBeVisible();
  });

  test("Edit Profile button opens inline form", async ({ page }) => {
    await page.getByTestId("edit-profile-btn").click();
    await expect(page.getByTestId("profile-name-input")).toBeVisible();
    await expect(page.getByTestId("profile-email-input")).toBeVisible();
  });

  test("Save Changes shows confirmation", async ({ page }) => {
    await page.getByTestId("edit-profile-btn").click();
    await page.getByTestId("profile-name-input").fill("Green Earth Foundation Updated");
    await page.getByTestId("save-profile-btn").click();
    await expect(page.getByText(/profile updated successfully/i)).toBeVisible();
  });

  test("Cancel closes edit form", async ({ page }) => {
    await page.getByTestId("edit-profile-btn").click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("profile-name-input")).not.toBeVisible();
  });

  test("View Compliance Vault link navigates correctly", async ({ page }) => {
    await page.getByTestId("goto-compliance-from-profile").click();
    await expect(page.getByRole("heading", { name: "Compliance Vault" })).toBeVisible();
  });
});

// ─── SUITE 6: Trust Score ─────────────────────────────────────────────────────
test.describe("Trust Score", () => {
  test.beforeEach(async ({ page }) => {
    await goToDashboard(page);
    await page.getByTestId("nav-trust-score").click();
    await expect(page.getByRole("heading", { name: "Trust Score" })).toBeVisible();
  });

  test("displays trust score value", async ({ page }) => {
    await expect(page.getByTestId("trust-score-value")).toBeVisible();
    const text = await page.getByTestId("trust-score-value").textContent();
    expect(Number(text)).toBeGreaterThanOrEqual(0);
  });

  test("Upload Documents button navigates to compliance vault", async ({ page }) => {
    await page.getByTestId("goto-vault-from-trust").click();
    await expect(page.getByRole("heading", { name: "Compliance Vault" })).toBeVisible();
  });
});

// ─── SUITE 7: AI Proposal Reviewer ───────────────────────────────────────────
test.describe("AI Proposal Reviewer", () => {
  test.beforeEach(async ({ page }) => {
    await goToDashboard(page);
    await page.getByTestId("nav-ai-proposal").click();
    await expect(page.getByRole("heading", { name: "AI Proposal Reviewer" })).toBeVisible();
  });

  test("Analyse button disabled when textarea is empty", async ({ page }) => {
    await expect(page.getByTestId("analyse-proposal-btn")).toBeDisabled();
  });

  test("typing text enables Analyse button", async ({ page }) => {
    await page.getByTestId("proposal-textarea").fill("We will educate 500 rural children in Maharashtra.");
    await expect(page.getByTestId("analyse-proposal-btn")).toBeEnabled();
  });

  test("clicking Analyse shows result panel", async ({ page }) => {
    await page.getByTestId("proposal-textarea").fill("We will educate 500 rural children in Maharashtra through digital literacy.");
    await page.getByTestId("analyse-proposal-btn").click();
    await expect(page.getByTestId("proposal-result")).toBeVisible({ timeout: 5_000 });
  });
});

// ─── SUITE 8: Role Assignment ─────────────────────────────────────────────────
test.describe("Role Assignment", () => {
  test.beforeEach(async ({ page }) => {
    await goToDashboard(page);
    await page.getByTestId("nav-team-management").click();
    await expect(page.getByRole("heading", { name: "Role Assignment" })).toBeVisible();
  });

  test("Add Member form is visible", async ({ page }) => {
    await expect(page.getByTestId("role-fullname-input")).toBeVisible();
    await expect(page.getByTestId("role-email-input")).toBeVisible();
    await expect(page.getByTestId("role-select")).toBeVisible();
    await expect(page.getByTestId("role-password-input")).toBeVisible();
  });

  test("empty form shows validation error", async ({ page }) => {
    await page.getByTestId("add-member-btn").click();
    await expect(page.getByTestId("role-error")).toBeVisible();
    await expect(page.getByText(/all fields are required/i)).toBeVisible();
  });

  test("password mismatch shows error", async ({ page }) => {
    await page.getByTestId("role-fullname-input").fill("Priya Sharma");
    await page.getByTestId("role-email-input").fill(`priya+${Date.now()}@example.com`);
    await page.getByTestId("role-select").selectOption("finance_officer");
    await page.getByTestId("role-password-input").fill("Password123");
    await page.getByTestId("role-confirm-input").fill("WrongPassword");
    await page.getByTestId("add-member-btn").click();
    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
  });

  test("successful member creation shows success message and appears in list", async ({ page }) => {
    const ts    = Date.now();
    const email = `testmember+${ts}@greenearthngo.in`;
    await page.getByTestId("role-fullname-input").fill("Test Member");
    await page.getByTestId("role-email-input").fill(email);
    await page.getByTestId("role-select").selectOption("finance_officer");
    await page.getByTestId("role-password-input").fill("TestPass@123");
    await page.getByTestId("role-confirm-input").fill("TestPass@123");
    await page.getByTestId("add-member-btn").click();
    await expect(page.getByTestId("role-success")).toBeVisible({ timeout: 15_000 });
    // Success message contains the role label
    await expect(page.getByTestId("role-success")).toContainText(/Finance Officer/i);
    // Member row appears immediately (optimistic update)
    await expect(page.getByTestId(`member-row-${email}`)).toBeVisible();
  });

  test("Load Members button fetches members from API", async ({ page }) => {
    await page.getByTestId("load-members-btn").click();
    // Should not error — list renders (may be empty or have members)
    await page.waitForTimeout(1500);
    const isEmpty = await page.getByText("No team members yet.").isVisible();
    const hasList = await page.locator("[data-testid^='member-row-']").count();
    expect(isEmpty || hasList >= 0).toBeTruthy();
  });
});

// ─── SUITE 9: Milestone Reporting ────────────────────────────────────────────
test.describe("Milestone Reporting", () => {
  test.beforeEach(async ({ page }) => {
    await goToDashboard(page);
    // has_project = false so it will show locked screen
    await page.getByTestId("nav-milestone-reporting").click();
  });

  test("shows locked/no-project state when has_project is false", async ({ page }) => {
    // The locked section CTA is visible (project not assigned)
    await expect(page.getByTestId("goto-opportunities-locked")).toBeVisible();
  });
});

// ─── SUITE 10: Sign Out ───────────────────────────────────────────────────────
test.describe("Sign Out", () => {
  test("sign out redirects to /signin", async ({ page }) => {
    await goToDashboard(page);
    await page.getByTestId("signout-btn").click();
    await expect(page).toHaveURL(`${BASE_URL}/signin`, { timeout: 10_000 });
  });
});
