/* eslint-disable @typescript-eslint/no-require-imports -- Browser integration tests run in Node and read local fixtures. */
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const crmPath = process.env.KOMMO_CSV || "/Users/david/Downloads/kommo_export_leads_2026-10-21 - Sheet1.csv";
const financePath = process.env.FINANCE_XLSX || "/Users/david/Downloads/Finance data for DC report  (7).xlsx";

test("Kommo upload, scope, all pages, persistence, mobile, and PDF downloads", async ({ page, context }, testInfo) => {
  test.skip(!fs.existsSync(crmPath) || !fs.existsSync(financePath), "Set KOMMO_CSV and FINANCE_XLSX to local fixture files.");
  const envFile = path.join(__dirname, "../../.env.local");
  const env = fs.existsSync(envFile) ? Object.fromEntries(fs.readFileSync(envFile, "utf8").split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z_]+)=(.*)$/); return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, "")]] : [];
  })) : process.env;
  const errors = [];
  async function setDates(from, to) {
    await page.getByRole("button", { name: "Date range", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Date range", exact: true });
    await dialog.getByLabel("From date", { exact: true }).fill(from);
    await dialog.getByLabel("To date", { exact: true }).fill(to);
    await dialog.getByRole("button", { name: "Apply dates", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  page.on("pageerror", (error) => errors.push(error.message));
  await context.request.post("/api/login", { form: { username: env.AUTH_USERNAME, password: env.AUTH_PASSWORD, next: "/kommo" } });
  await page.goto("/kommo");
  await expect(page.getByRole("heading", { name: "Sales & Marketing Analytics" })).toBeVisible();
  await page.getByLabel("Kommo CRM file", { exact: true }).setInputFiles(crmPath);
  await expect(page.getByText("File: 5,459 rows", { exact: false })).toBeVisible({ timeout: 30000 });
  await page.getByLabel("Finance workbook", { exact: true }).setInputFiles(financePath);
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 30000 });
  await page.getByRole("button", { name: "Clean leads", exact: true }).click();
  await expect(page.getByText("5,459 CRM rows", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "All CRM rows", exact: true }).click();
  await expect(page.getByText("5,426 clean leads", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Date range", exact: true }).click();
  const dates = page.getByRole("dialog", { name: "Date range", exact: true });
  await dates.getByLabel("Year, first calendar", { exact: true }).selectOption("2024");
  await dates.getByLabel("Month, first calendar", { exact: true }).selectOption("4");
  await expect(dates.getByRole("grid", { name: "May 2024", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("desktop-date-picker.png") });
  await dates.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("5,426 clean leads", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Date range", exact: true }).click();
  await dates.getByRole("button", { name: "Last 7 days", exact: true }).click();
  await dates.getByRole("button", { name: "Apply dates", exact: true }).click();
  await expect(page.getByText("2026-10-15 to 2026-10-21", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset all filters", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("marketing-overview.png"), fullPage: true });
  for (const name of ["Channels & Services", "Conversions", "Cohorts", "Finance & Reconciliation", "Quality"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator("[data-active-report]")).not.toBeEmpty();
    await expect(page.locator("main [role=alert]")).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow, `${name}: page overflow`).toBe(false);
    if (name === "Channels & Services") {
      expect(await page.locator("[data-chart=acquisition]").count()).toBeGreaterThan(3);
      await expect(page.locator("[data-chart=cost]").first()).toBeVisible();
      await page.getByRole("heading", { name: /^Channel acquisition & lead quality/ }).first().locator("../..").screenshot({ path: testInfo.outputPath("channel-quality-chart.png") });
      await page.getByRole("heading", { name: /^Service conversion comparison/ }).first().locator("../..").screenshot({ path: testInfo.outputPath("service-conversion-chart.png") });
      await page.locator("[data-chart=cost]").first().locator("..").screenshot({ path: testInfo.outputPath("channel-cost-chart.png") });
      await page.screenshot({ path: testInfo.outputPath("channels-services.png"), fullPage: true });
    }
  }
  await page.getByRole("tab", { name: "Sales Report" }).click();
  for (const name of ["Overview", "Managers", "Pipeline & Response", "Next Actions"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator("[data-active-report]")).not.toBeEmpty();
  }
  await page.getByRole("button", { name: "Managers", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("sales-managers.png"), fullPage: true });
  await setDates("2026-10-21", "2026-10-21");
  await expect(page.getByText("2026-10-21", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Reset all filters", exact: true }).click();
  await setDates("2026-09-01", "2026-09-30");
  await page.locator("summary").filter({ hasText: "Services:" }).click();
  await page.getByLabel("Lithuanian citizenship by descent", { exact: true }).check();
  await page.locator("summary").filter({ hasText: "Services:" }).click();
  await page.locator("summary").filter({ hasText: "Channels:" }).click();
  await page.getByLabel("Google Ads", { exact: true }).check();
  await page.locator("summary").filter({ hasText: "Channels:" }).click();
  await page.getByRole("tab", { name: "Marketing Report" }).click();
  await page.getByRole("button", { name: "Cohorts", exact: true }).click();
  await page.getByRole("button", { name: "Full payment", exact: true }).click();
  const singleDownload = page.waitForEvent("download", { timeout: 180000 });
  await page.getByRole("button", { name: "Export this page to PDF", exact: true }).click();
  await expect(page.locator(".kommo-pdf-root button[aria-pressed=true]").filter({ hasText: /^Full payment$/ })).toHaveCount(1);
  const single = await singleDownload;
  expect(single.suggestedFilename()).toContain("2026-09-01_to_2026-09-30");
  await single.saveAs(testInfo.outputPath(single.suggestedFilename()));
  expect(fs.readFileSync(await single.path()).subarray(0, 4).toString()).toBe("%PDF");
  const fullDownload = page.waitForEvent("download", { timeout: 240000 });
  await page.getByRole("button", { name: "Export full PDF", exact: true }).click();
  const full = await fullDownload;
  expect(full.suggestedFilename()).toContain("full-report");
  await full.saveAs(testInfo.outputPath(full.suggestedFilename()));
  await page.reload();
  await expect(page.getByText("File: 5,459 rows", { exact: false })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(financePath.split("/").pop(), { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Finance & Reconciliation", exact: true }).click();
  await setDates("2024-05-01", "2024-05-31");
  await expect(page.getByRole("heading", { name: "Financial monthly results", exact: false })).toBeVisible();
  await expect(page.getByRole("cell", { name: "2024-05", exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Reset all filters", exact: true }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Date range", exact: true }).click();
  await expect(dates).toBeVisible();
  expect(await dates.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("mobile-date-picker.png") });
  await dates.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("mobile-overview.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
  await page.getByRole("button", { name: "Channels & Services", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("mobile-channels.png") });
  await page.getByRole("link", { name: "Old Report for PlanFix" }).click();
  await expect(page.getByRole("heading", { name: "CRM reports dashboard" })).toBeVisible({ timeout: 30000 });
  expect(errors).toEqual([]);
});
