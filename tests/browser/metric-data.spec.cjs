/* eslint-disable @typescript-eslint/no-require-imports -- Playwright uses the local Node test runner. */
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

test("KPI evidence preserves filters, assessments and merged CRM histories", async ({ page, context }, testInfo) => {
  const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, "../../.env.local"), "utf8").split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z_]+)=(.*)$/); return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, "")]] : [];
  }));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.request.post("/api/login", { form: { username: env.AUTH_USERNAME, password: env.AUTH_PASSWORD, next: "/kommo" } });
  await page.goto("/kommo");
  await expect(page.getByRole("heading", { name: "Sales & Marketing Analytics", exact: true })).toBeVisible({ timeout: 15000 });
  const headers = ["ID", "Lead title", "Lead stage", "Date Created", "Last Modified", "Work email (contact)", "Qualified service", "Marketing Source", "Relevancy", "Lead resp. user", "Reason for Rejection"];
  const rows = [
    ["100", "Original record", "New", "30.09.2026 09:00:00", "01.10.2026 10:00:00", "same@example.com", "LT citizenship", "Google Ads", "Not Relevant", "Mariana", "Double"],
    ["101", "Working record", "In work", "04.10.2026 09:00:00", "21.10.2026 15:00:00", "same@example.com", "LT citizenship", "", "Relevant", "Oleh", ""],
    ["102", "Pending A", "New", "10.10.2026 09:00:00", "21.10.2026 15:00:00", "a@example.com", "LT citizenship", "Google Ads", "", "Sheila", ""],
    ["103", "Not relevant", "First contact", "11.10.2026 09:00:00", "21.10.2026 15:00:00", "b@example.com", "LT citizenship", "Facebook", "Not Relevant", "Mariana", ""],
    ["104", "Relevant lead", "In work", "12.10.2026 09:00:00", "21.10.2026 15:00:00", "c@example.com", "LT citizenship", "Google Ads", "Relevant", "Oleh", ""],
    ["105", "Pending B", "New", "13.10.2026 09:00:00", "21.10.2026 15:00:00", "d@example.com", "LV citizenship", "", "", "Sheila", ""],
  ];
  const csv = [headers, ...rows].map((row) => row.map((value) => `"${value}"`).join(",")).join("\r\n");
  await page.getByLabel("Kommo CRM file", { exact: true }).setInputFiles({ name: "evidence.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("5 clean leads", { exact: true })).toBeVisible();
  const card = page.locator("[data-active-report] [data-metric-card='Relevant strict rate']");
  const button = card.getByRole("button", { name: "Data", exact: true });
  await button.click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  await expect(panel.locator("[data-evidence-count]")).toHaveText("2 / 5");
  await expect(panel.locator("[data-evidence-row]")).toHaveCount(2);
  const working = panel.locator("[data-evidence-row]").filter({ hasText: "Working record" });
  await working.locator(":scope > summary").click();
  await expect(working).toContainText("100, 101");
  await expect(working).toContainText("Google Ads");
  await panel.getByRole("button", { name: /Calculation base/ }).click();
  await expect(panel.locator("[data-evidence-row]")).toHaveCount(5);
  await panel.getByRole("button", { name: /^Unassessed/ }).click();
  await expect(panel.locator("[data-evidence-row]")).toHaveCount(2);
  await expect(panel).toContainText("Pending A");
  await expect(panel).toContainText("Pending B");
  await panel.getByRole("button", { name: /^Not relevant/ }).click();
  await expect(panel.locator("[data-evidence-row]")).toHaveCount(1);
  await expect(panel).toContainText("Mariana");
  await panel.getByRole("button", { name: /Original CRM records/ }).click();
  await expect(panel.locator("[data-evidence-row]")).toHaveCount(6);
  await panel.getByRole("searchbox").fill("102");
  await expect(panel.locator("[data-evidence-row]")).toHaveCount(1);
  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Export CSV", exact: true }).click();
  const file = await download;
  const exported = fs.readFileSync(await file.path(), "utf8");
  expect(exported).toContain("Pending A");
  expect(exported).not.toContain("Pending B");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(button).toBeFocused();
  await page.getByRole("button", { name: "Date range", exact: true }).click();
  const dates = page.getByRole("dialog", { name: "Date range", exact: true });
  await dates.getByLabel("From date", { exact: true }).fill("2026-10-01");
  await dates.getByLabel("To date", { exact: true }).fill("2026-10-21");
  await dates.getByRole("button", { name: "Apply dates", exact: true }).click();
  await button.click();
  await expect(panel.locator("[data-evidence-count]")).toHaveText("1 / 4");
  await expect(panel.locator("[data-evidence-row]")).toHaveCount(1);
  await expect(panel).not.toContainText("Working record");
  await page.keyboard.press("Escape");
  await page.getByLabel("Interface language", { exact: true }).selectOption("ru");
  await card.getByRole("button", { name: "Данные", exact: true }).click();
  await expect(panel).toContainText("Как считается");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await panel.screenshot({ path: testInfo.outputPath("metric-data-mobile.png") });
  await panel.getByRole("button", { name: "Закрыть панель данных", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await card.getByRole("button", { name: "Данные", exact: true }).click();
  await panel.screenshot({ path: testInfo.outputPath("metric-data-desktop.png") });
  await page.keyboard.press("Escape");
  await page.getByLabel("Язык интерфейса", { exact: true }).selectOption("en");
  await page.getByRole("link", { name: "Old Report for PlanFix", exact: true }).click();
  await expect(page.getByRole("heading", { name: "CRM reports dashboard", exact: true })).toBeVisible({ timeout: 30000 });
  const oldRelevant = page.locator("[data-metric-card='Relevant rate']").first();
  await oldRelevant.getByRole("button", { name: "Data", exact: true }).click();
  await expect(panel).toBeVisible();
  const countText = await panel.locator("[data-evidence-count]").innerText();
  expect(countText).toMatch(/\d[\d,]* \/ \d[\d,]*/);
  await expect(panel.getByRole("button", { name: /Calculation base/ })).toBeVisible();
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});
