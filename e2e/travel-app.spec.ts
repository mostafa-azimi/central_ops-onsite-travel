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
  await expect(page.getByText("Central Ops team", { exact: true })).toBeVisible();
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

test("ShipHero branding and text remain visible when returning to light mode", async ({ page }, testInfo) => {
  for (const path of ["/map", "/calendar", "/admin"]) {
    await page.goto(path);
    await page.evaluate(() => localStorage.setItem("central-ops-theme", "dark"));
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "Use light mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    const brand = page.locator(".shiphero-brand.surface-adaptive").first();
    const visibleNavyLogo = brand.locator(".logo-navy:visible");
    await expect(visibleNavyLogo).toHaveCount(1);
    await expect(brand.locator(".logo-white:visible")).toHaveCount(0);
    await expect(visibleNavyLogo.locator("path").first()).toHaveCSS("fill", "rgb(38, 52, 68)");
    await expect(brand.locator(".shiphero-product-name")).toHaveCSS("color", "rgb(42, 71, 115)");
    await expectAccessible(page);
  }
  await page.screenshot({ path: testInfo.outputPath("light-theme.png"), fullPage: true });
});

test("signed-out employee pages remain gated", async ({ page }) => {
  await page.goto("/map");
  await expect(page.getByRole("heading", { name: "Map view" })).toBeVisible();
  await expect(page.getByText("Sign in with a verified @shiphero.com Google account")).toBeVisible();

  await page.goto("/?view=submit");
  await expect(page.getByRole("heading", { name: "ShipHero sign-in required" })).toBeVisible();
  await expectAccessible(page);
});

test("administrator navigation is visible only to signed-in administrators", async ({ page }) => {
  const adminLinks = ["Approvals", "Admin settings", "Operations"];

  await page.goto("/");
  for (const name of adminLinks) await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);

  await authenticate(page, "employee");
  for (const path of ["/?view=submit", "/map", "/calendar", "/how-to-use"]) {
    await page.goto(path);
    for (const name of adminLinks) await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
  }
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Travel approvals" })).toBeVisible();
  await expect(page.getByText("Sign in with an authorized administrator account")).toBeVisible();
  for (const name of adminLinks) await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);

  await page.context().clearCookies();
  await authenticate(page, "admin");
  await page.goto("/how-to-use");
  for (const name of adminLinks) await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
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
  await expect(page.getByRole("link", { name: "Approvals", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin settings", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Operations", exact: true })).toBeVisible();
  await expectAccessible(page);
  await page.screenshot({ path: testInfo.outputPath("admin-health.png"), fullPage: true });
});

test("administrator can manage traveler and administrator access", async ({ page }) => {
  await authenticate(page, "admin");
  await page.route("**/api/admin/people", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON() as { email: string; name: string; isTraveler: boolean; isAdmin: boolean; color: string };
    await route.fulfill({ status: 200, json: { person: { ...body, active: true, createdAt: "2026-10-10T00:00:00.000Z", updatedAt: "2026-10-10T00:00:00.000Z", updatedByEmail: "mike.azimi@shiphero.com" } } });
  });
  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "Admin settings" })).toBeVisible();
  const mapColor = page.getByLabel("Map color");
  await expect(mapColor.locator("option")).toHaveCount(15);
  await expect(mapColor).toHaveValue("#008c95");
  await expect(mapColor.locator('option[value="#3281fd"]')).toHaveAttribute("disabled", "");
  await page.getByLabel("Full name").fill("Amanda Example");
  await page.getByLabel("ShipHero email").fill("amanda.example@shiphero.com");
  await page.getByRole("checkbox", { name: /Administrator/ }).check();
  await page.getByRole("button", { name: "Add person" }).click();
  await expect(page.getByRole("heading", { name: "Amanda Example" })).toBeVisible();
  await expect(page.getByText("amanda.example@shiphero.com")).toBeVisible();
  await expectAccessible(page);
});

test("administrator can review operational history and Calendar integrity", async ({ page }) => {
  await authenticate(page, "admin");
  await page.goto("/admin/operations");
  await expect(page.getByRole("heading", { name: "Operations", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reconciliation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Audit history" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run Calendar check" })).toBeVisible();
  await expectAccessible(page);
});

test("verified employee can open the map and traveler legend", async ({ page }) => {
  await authenticate(page, "employee");
  await page.goto("/map");
  await expect(page.getByLabel("Interactive customer visit map")).toBeVisible();
  await expect(page.getByLabel("Traveler map colors")).toContainText("Chris Haun");
  await expect(page.getByText("Pinch or scroll over the map to zoom.")).toBeVisible();
  await expectAccessible(page);
});

test("verified employee can explore visits in month and week calendar views", async ({ page }, testInfo) => {
  await authenticate(page, "employee");
  await page.goto("/calendar");

  await expect(page.getByRole("heading", { name: "Calendar view" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "October 2026" })).toBeVisible();
  await page.getByRole("button", { name: /Cane Brew/ }).first().click();
  const details = page.getByRole("dialog", { name: "Cane Brew" });
  await expect(details).toContainText("Oct 8, 2026 to Oct 9, 2026");
  await expect(details).toContainText("Mike Azimi");
  await expect(details).toContainText("Amanda Example");
  await expect(details.getByRole("button", { name: "Join and shadow" })).toBeEnabled();
  await details.getByRole("button", { name: "Close visit details" }).click();

  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.getByRole("button", { name: "Week", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Sam Armenia" }).click();
  await expect(page.getByRole("heading", { name: "No visits match this view" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("button", { name: /Cane Brew/ }).first()).toBeVisible();
  await expectAccessible(page);
  await page.screenshot({ path: testInfo.outputPath("calendar-view.png"), fullPage: true });
});

test("how-to guide includes the tutorial, captions, written steps, and FAQs", async ({ page, request }, testInfo) => {
  await page.goto("/how-to-use");
  await expect(page).toHaveTitle("How to use Central Ops Travel");
  await expect(page.getByRole("heading", { name: "Plan and join customer visits" })).toBeVisible();
  await expect(page.getByText("A verified ShipHero email address is required.")).toBeVisible();
  await expect(page.locator("video source")).toHaveAttribute("src", "/tutorial/central-ops-travel.mp4");
  await expect(page.locator("video track[kind='captions']")).toHaveAttribute("src", "/tutorial/central-ops-travel.vtt");
  await expect(page.getByRole("heading", { name: "How the workflow works" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Answers before you start" })).toBeVisible();
  await page.getByText("Who can use Central Ops Travel?").click();
  await expect(page.getByText("Only people signed in with a verified @shiphero.com Google account")).toBeVisible();

  const [videoResponse, captionResponse] = await Promise.all([
    request.get("/tutorial/central-ops-travel.mp4"),
    request.get("/tutorial/central-ops-travel.vtt"),
  ]);
  expect(videoResponse.ok()).toBe(true);
  expect(videoResponse.headers()["content-type"]).toContain("video/mp4");
  expect((await videoResponse.body()).byteLength).toBeGreaterThan(1_000_000);
  expect(captionResponse.ok()).toBe(true);
  expect(await captionResponse.text()).toContain("WEBVTT");
  await expectAccessible(page);
  await page.screenshot({ path: testInfo.outputPath("how-to-use.png"), fullPage: true });
});
