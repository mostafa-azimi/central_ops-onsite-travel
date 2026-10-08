import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

async function authenticate(page: Page, role: "employee" | "admin") {
  await page.context().addCookies([{
    name: "central_ops_e2e_user",
    value: role,
    url: "http://127.0.0.1:3010",
    httpOnly: true,
    sameSite: "Lax",
  }]);
}

test("public schedule supports navigation, filtering, dark mode, and responsive rendering", async ({ page }, testInfo) => {
  await page.goto("/?view=submit");
  await expect(page.getByRole("heading", { name: "Request a customer visit" })).toBeVisible();
  await page.getByRole("link", { name: "Central Ops Travel" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: /upcoming trip/ })).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Search travel" });
  await search.fill("not-a-real-customer");
  await expect(page.getByRole("heading", { name: "No matching travel" })).toBeVisible();
  await search.fill("");

  await page.getByRole("button", { name: "Use dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectAccessible(page);

  await page.screenshot({ path: testInfo.outputPath("public-schedule.png"), fullPage: true });
});

test("signed-out employee pages remain gated", async ({ page }) => {
  await page.goto("/map");
  await expect(page.getByRole("heading", { name: "Map view" })).toBeVisible();
  await expect(page.getByText("Sign in with a verified @shiphero.com Google account")).toBeVisible();

  await page.goto("/?view=submit");
  await expect(page.getByRole("heading", { name: "ShipHero sign-in required" })).toBeVisible();
  await expectAccessible(page);
});

test("verified employee can submit a request and receives a clean next-entry form", async ({ page }, testInfo) => {
  await authenticate(page, "employee");
  await page.route("**/api/postal?*", async (route) => {
    await route.fulfill({ json: { match: { city: "Bay Minette", state: "AL" } } });
  });
  await page.route("**/api/requests", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const request = {
      id: "request-e2e",
      accountName: "Cane Brew",
      start: "2026-11-03",
      end: "2026-11-04",
      assignedTraveler: null,
      status: "pending",
      dateConfidence: "high",
      requesterEmail: "employee@shiphero.com",
      pendingChange: null,
      calendarEventId: null,
    };
    await route.fulfill({ status: 201, json: { requestId: request.id, status: request.status, request } });
  });

  await page.goto("/?view=submit");
  await expect(page.getByText("employee@shiphero.com")).toBeVisible();
  await page.getByLabel("Visit type").selectOption("Central Ops onsite");
  await page.getByLabel("Date confidence").selectOption("high");
  await page.getByLabel("Account name").fill("Cane Brew");
  await page.getByLabel("Customer link in CASH").fill("https://cash.shiphero.com/client/99542");
  await page.getByLabel("Full street address").fill("2109 N US Hwy 31");
  await page.getByLabel("ZIP or postal code").fill("36507");
  await expect(page.getByLabel("City")).toHaveValue("Bay Minette");
  await expect(page.getByLabel("State, province, or region")).toHaveValue("AL");
  await page.getByLabel("Start date").fill("2026-11-03");
  await page.getByLabel("End date").fill("2026-11-04");
  await page.getByLabel("Contact name").fill("Customer Contact");
  await page.getByLabel("Contact email").fill("contact@example.com");
  await page.getByLabel("Contact phone").fill("251-555-0100");
  await page.getByLabel("Start time at the warehouse").fill("09:00");
  await page.getByRole("button", { name: "Submit request" }).click();

  await expect(page.locator(".submit-status")).toContainText("ready for another request");
  await expect(page.getByLabel("Account name")).toHaveValue("");
  await expect(page.getByLabel("Visit type")).toHaveValue("");
  await expectAccessible(page);
  await page.screenshot({ path: testInfo.outputPath("request-complete.png"), fullPage: true });
});

test("administrator can open approvals and run non-mutating connection checks", async ({ page }, testInfo) => {
  await authenticate(page, "admin");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Travel approvals" })).toBeVisible();
  await expect(page.getByText("Signed in as mike.azimi@shiphero.com")).toBeVisible();
  await page.getByRole("button", { name: "Check connections" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Google sign-in" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Email notifications" })).toBeVisible();
  await expect(page.getByText("HubSpot", { exact: true })).toHaveCount(0);
  await expectAccessible(page);
  await page.screenshot({ path: testInfo.outputPath("admin-health.png"), fullPage: true });
});

test("verified employee can open the map and traveler legend", async ({ page }) => {
  await authenticate(page, "employee");
  await page.goto("/map");
  await expect(page.getByLabel("Interactive customer visit map")).toBeVisible();
  await expect(page.getByLabel("Traveler map colors")).toContainText("Chris Haun");
  await expect(page.getByText("Pinch or scroll over the map to zoom.")).toBeVisible();
  await expectAccessible(page);
});
