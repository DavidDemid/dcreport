/* eslint-disable @typescript-eslint/no-require-imports -- Local regression fixtures use Node. */
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

async function signIn(page, context) {
  const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, "../../.env.local"), "utf8").split(/\r?\n/).flatMap((line) => {
    const m = line.match(/^([A-Z_]+)=(.*)$/); return m ? [[m[1], m[2].replace(/^['"]|['"]$/g, "")]] : [];
  }));
  await context.request.post("/api/login", { form: { username: env.AUTH_USERNAME, password: env.AUTH_PASSWORD, next: "/kommo" } });
  await page.goto("/kommo");
}

test("Meta audit preserves primary attribution and separates cohort dates from form evidence", async ({ page, context }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page, context);
  const headers = ["ID", "Lead title", "Lead stage", "Date Created", "Last Modified", "Marketing Source", "utm_source", "utm_medium", "FB lead id", "FB form id", "Fb ad id", "Fb is organic"];
  const rows = [
    ["1", "Meta creation cohort", "New", "10.10.2026 10:00:00", "28.10.2026 12:00:00", "Facebook ads", "", "", "9007199254740993", "form1", "ad1", "false"],
    ["2", "Older Google cohort", "In work", "01.08.2026 10:00:00", "28.10.2026 12:00:00", "Google Ads", "google", "cpc", "meta-old", "form2", "ad2", "false"],
    ["3", "Google primary with Meta form", "New", "11.10.2026 10:00:00", "28.10.2026 12:00:00", "Google Ads", "google", "cpc", "meta-conflict", "form3", "ad3", "false"],
    ["4", "Unresolved Meta platform", "New", "12.10.2026 10:00:00", "28.10.2026 12:00:00", "Facebook", "", "", "", "", "", ""],
    ["5", "Messenger only", "New", "12.10.2026 10:00:00", "28.10.2026 12:00:00", "Facebook Messenger", "", "", "", "", "", ""],
  ];
  const csv = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(",")).join("\r\n");
  await page.getByLabel("Kommo CRM file", { exact: true }).setInputFiles({ name: "crm-only-meta.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("5 clean leads", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Date range", exact: true }).click();
  const dates = page.getByRole("dialog", { name: "Date range", exact: true });
  await dates.getByLabel("From date", { exact: true }).fill("2026-10-01");
  await dates.getByLabel("To date", { exact: true }).fill("2026-10-28");
  await dates.getByRole("button", { name: "Apply dates", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Channels:" }).click();
  await page.getByLabel("Facebook / Instagram Ads", { exact: true }).check();
  await page.locator("summary").filter({ hasText: "Channels:" }).click();
  await page.getByRole("button", { name: "Channels & Services", exact: true }).click();
  const table = page.locator("[data-active-report] table[data-meta-audit]");
  const paid = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "CRM leads with a confirmed paid Meta form", exact: true }) });
  await expect(paid.getByRole("cell").nth(0)).toContainText("2");
  await expect(paid.getByRole("cell").nth(1)).toContainText("3");
  const conflicts = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Paid Meta forms under another acquisition source", exact: true }) });
  await expect(conflicts.getByRole("cell").nth(0)).toContainText("1");
  await expect(conflicts.getByRole("cell").nth(1)).toContainText("2");
  await conflicts.getByRole("cell").nth(0).getByRole("button", { name: "Data", exact: true }).click();
  const panel = page.getByRole("dialog");
  await expect(panel).toContainText("Google primary with Meta form");
  await expect(panel).not.toContainText("Older Google cohort");
  await panel.locator("[data-evidence-row] > summary").click();
  await expect(panel).toContainText("meta-conflict");
  await expect(panel).toContainText("Google Ads");
  await page.keyboard.press("Escape");
  const unresolved = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Meta leads: paid / organic / chat not established", exact: true }) });
  await expect(unresolved.getByRole("cell").nth(0)).toContainText("1");
  await unresolved.getByRole("cell").nth(0).getByRole("button", { name: "Data", exact: true }).click();
  await expect(panel).toContainText("Unresolved Meta platform");
  await expect(panel).not.toContainText("Messenger only");
  await panel.locator("[data-evidence-row] > summary").click();
  await expect(panel).toContainText("not established by the available fields");
  await page.keyboard.press("Escape");
  await page.getByLabel("Interface language", { exact: true }).selectOption("ru");
  await table.screenshot({ path: testInfo.outputPath("meta-audit-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await table.screenshot({ path: testInfo.outputPath("meta-audit-mobile.png") });
  expect(errors).toEqual([]);
});

test("October 28 CRM alone reproduces 732 source leads and exposes Meta evidence gaps", async ({ page, context }) => {
  const file = process.env.META_CRM_XLSX || "/Users/david/Downloads/kommo_export_leads_2026-10-28.xlsx";
  test.skip(!fs.existsSync(file), "Set META_CRM_XLSX to the October 28 reconciliation fixture.");
  await signIn(page, context);
  await page.getByLabel("Kommo CRM file", { exact: true }).setInputFiles(file);
  await expect(page.getByText("4,875 clean leads", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Date range", exact: true }).click();
  const dates = page.getByRole("dialog", { name: "Date range", exact: true });
  await dates.getByLabel("From date", { exact: true }).fill("2026-10-01");
  await dates.getByLabel("To date", { exact: true }).fill("2026-10-28");
  await dates.getByRole("button", { name: "Apply dates", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Channels:" }).click();
  await page.getByLabel("Facebook / Instagram Ads", { exact: true }).check();
  await page.locator("summary").filter({ hasText: "Channels:" }).click();
  await expect(page.getByText("732 clean leads", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Channels & Services", exact: true }).click();
  const table = page.locator("[data-active-report] table[data-meta-audit]");
  const row = (name) => table.getByRole("row").filter({ has: page.getByRole("rowheader", { name, exact: true }) });
  await expect(row("CRM leads with a confirmed paid Meta form").getByRole("cell").nth(0)).toContainText("730");
  await expect(row("Unique paid submissions (FB lead ID)").getByRole("cell").nth(0)).toContainText("730");
  await expect(row("Unique paid submissions (FB lead ID)").getByRole("cell").nth(1)).toContainText("1,975");
  await expect(row("Paid Meta forms under another acquisition source").getByRole("cell").nth(0)).toContainText("1");
  const collisions = row("CRM leads sharing a Meta ID across different contacts");
  await expect(collisions.getByRole("cell").nth(0)).toContainText("0");
  await expect(collisions.getByRole("cell").nth(1)).toContainText("13");
  await collisions.getByRole("cell").nth(1).getByRole("button", { name: "Data", exact: true }).click();
  await expect(page.getByRole("dialog").locator("[data-evidence-row]")).toHaveCount(13);
  await page.keyboard.press("Escape");
});

test("full export restores original XLSX and exposes unresolved Meta leads without inflating Ads", async ({ page, context }, testInfo) => {
  const file = process.env.META_FULL_CRM_XLSX;
  test.skip(!file, "Set META_FULL_CRM_XLSX to the verified full October 28 export (11).");
  await signIn(page, context);
  await page.getByLabel("Kommo CRM file", { exact: true }).setInputFiles(file);
  await expect(page.getByText("5,933 clean leads", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("5,933 clean leads", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Date range", exact: true }).click();
  const dates = page.getByRole("dialog", { name: "Date range", exact: true });
  await dates.getByLabel("From date", { exact: true }).fill("2026-10-01");
  await dates.getByLabel("To date", { exact: true }).fill("2026-10-28");
  await dates.getByRole("button", { name: "Apply dates", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Channels:" }).click();
  await page.getByLabel("Facebook / Instagram Ads", { exact: true }).check();
  await page.locator("summary").filter({ hasText: "Channels:" }).click();
  await expect(page.getByText("961 clean leads", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Channels & Services", exact: true }).click();
  const table = page.locator("[data-active-report] table[data-meta-audit]");
  const unresolved = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Meta leads: paid / organic / chat not established", exact: true }) });
  await expect(unresolved.getByRole("cell").nth(0)).toContainText("375");
  await unresolved.getByRole("cell").nth(0).getByRole("button", { name: "Data", exact: true }).click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("searchbox").fill("4757274");
  await expect(panel.locator("[data-evidence-row]")).toHaveCount(1);
  await expect(panel.locator("[data-evidence-row]")).toContainText("Facebook / Instagram (source unknown)");
  await panel.locator("[data-evidence-row] > summary").click();
  await expect(panel.locator("[data-evidence-row]")).toContainText("4757274");
  await expect(panel.locator("[data-evidence-row]")).toContainText("Marketing Source");
  await page.keyboard.press("Escape");
  await table.screenshot({ path: testInfo.outputPath("full-meta-audit-desktop.png") });
  await page.getByLabel("Interface language", { exact: true }).selectOption("ru");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await table.screenshot({ path: testInfo.outputPath("full-meta-audit-mobile.png") });
});
