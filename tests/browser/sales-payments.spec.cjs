/* eslint-disable @typescript-eslint/no-require-imports -- Browser fixtures run in Node. */
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

test("sales receipt dates include older leads, preserve filters, evidence, mobile layout and PDF", async ({ page, context }, testInfo) => {
  const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, "../../.env.local"), "utf8").split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z_]+)=(.*)$/); return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, "")]] : [];
  }));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.request.post("/api/login", { form: { username: env.AUTH_USERNAME, password: env.AUTH_PASSWORD, next: "/kommo" } });
  await page.goto("/kommo");
  const headers = ["ID", "Lead title", "Lead stage", "Created on", "Modified on", "Respons. user", "Payment 1", "First payment at", "Payment 2", "Second payment at", "Payment 3", "Third payment at", "Marketing Source", "Qualified service"];
  const records = [
    ["1", "Old lead with first payment", "Initial payment received", "01.09.2026", "29.10.2026 10:00:00", "Mariana", "370", "07.10.2026", "", "", "", "", "Google Ads", "LT citizenship"],
    ["2", "Old lead with further installments", "3RD installment received", "01.03.2026", "29.10.2026 10:00:00", "Mariana", "370", "05.03.2026", "790", "20.10.2026", "790", "24.10.2026", "Google Ads", "LT citizenship"],
    ["3", "Another manager", "Initial payment received", "01.08.2026", "29.10.2026 10:00:00", "Sheila", "350", "10.10.2026", "", "", "", "", "Facebook ads", "LV citizenship"],
    ["4", "Paid but undated", "Initial payment received", "01.08.2026", "29.10.2026 10:00:00", "Mariana", "400", "", "", "", "", "", "Google Ads", "LT citizenship"],
  ];
  const csv = [headers, ...records].map((row) => row.map((v) => `"${v}"`).join(",")).join("\r\n");
  await page.getByLabel("Kommo CRM file", { exact: true }).setInputFiles({ name: "sales.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("4 clean leads", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Date range", exact: true }).click();
  const dates = page.getByRole("dialog", { name: "Date range", exact: true });
  await dates.getByLabel("From date", { exact: true }).fill("2026-10-01");
  await dates.getByLabel("To date", { exact: true }).fill("2026-10-28");
  await dates.getByRole("button", { name: "Apply dates", exact: true }).click();
  await expect(page.getByText("0 clean leads", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Sales Report", exact: true }).click();
  const active = page.locator("[data-active-report]");
  const card = (label) => active.locator(`[data-metric-card='${label}']`);
  await expect(card("First payments in period")).toContainText("2");
  await expect(card("Further payments in period")).toContainText("2");
  await expect(card("Paying leads in period")).toContainText("3");
  await page.locator("summary").filter({ hasText: "Managers:" }).click();
  await page.getByLabel("Mariana", { exact: true }).check();
  await page.locator("summary").filter({ hasText: "Managers:" }).click();
  await expect(card("First payments in period")).toContainText("1");
  await expect(card("Further payments in period")).toContainText("2");
  await expect(card("Known dated payment amounts")).toContainText("1,950");
  const createdOnly = page.getByRole("switch", { name: "Only leads created in selected dates", exact: true });
  await expect(createdOnly).not.toBeChecked();
  await createdOnly.check();
  await expect(card("First payments in period").locator(".text-2xl")).toHaveText("0");
  await expect(card("Further payments in period").locator(".text-2xl")).toHaveText("0");
  await expect(active).toContainText("Created in selected dates");
  await createdOnly.uncheck();
  await card("Further payments in period").getByRole("button", { name: "Data", exact: true }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.locator("[data-evidence-row]")).toHaveCount(2);
  await panel.locator("[data-evidence-row] > summary").first().click();
  await expect(panel).toContainText("790");
  await expect(panel).not.toContainText("Another manager");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Managers", exact: true }).click();
  await expect(createdOnly).not.toBeChecked();
  await expect(active).toContainText("Dated payment register");
  await expect(active).toContainText("Old lead with first payment");
  const milestones = active.getByRole("heading", { name: "Agreements and full-payment milestones / event dates", exact: false }).locator("../..").getByRole("table");
  await expect(milestones.getByRole("row").nth(1).getByRole("cell").nth(2)).toHaveText("n/a");
  await active.screenshot({ path: testInfo.outputPath("sales-payments-desktop.png") });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export this page to PDF", exact: true }).click();
  const file = await download;
  const pdf = testInfo.outputPath(file.suggestedFilename());
  await file.saveAs(pdf);
  expect(fs.statSync(pdf).size).toBeGreaterThan(15000);
  await page.getByLabel("Interface language", { exact: true }).selectOption("ru");
  await expect(active).toContainText("Первые оплаты за период");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await active.screenshot({ path: testInfo.outputPath("sales-payments-mobile.png") });
  expect(errors).toEqual([]);
});

test("fresh real export shows Mariana's nine paying leads rather than two creation-cohort clients", async ({ page, context }, testInfo) => {
  test.skip(!process.env.SALES_CRM_XLSX, "Set SALES_CRM_XLSX to the verified October 29 full export.");
  const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, "../../.env.local"), "utf8").split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z_]+)=(.*)$/); return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, "")]] : [];
  }));
  await context.request.post("/api/login", { form: { username: env.AUTH_USERNAME, password: env.AUTH_PASSWORD, next: "/kommo" } });
  await page.goto("/kommo");
  await page.getByLabel("Kommo CRM file", { exact: true }).setInputFiles(process.env.SALES_CRM_XLSX);
  await expect(page.getByText("5,967 clean leads", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Date range", exact: true }).click();
  const dates = page.getByRole("dialog", { name: "Date range", exact: true });
  await dates.getByLabel("From date", { exact: true }).fill("2026-10-01");
  await dates.getByLabel("To date", { exact: true }).fill("2026-10-28");
  await dates.getByRole("button", { name: "Apply dates", exact: true }).click();
  await page.getByRole("tab", { name: "Sales Report", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Managers:" }).click();
  await page.getByLabel("Mariana", { exact: true }).check();
  await page.locator("summary").filter({ hasText: "Managers:" }).click();
  const active = page.locator("[data-active-report]");
  const value = (label) => active.locator(`[data-metric-card='${label}']`).locator(".text-2xl");
  await expect(value("First payments in period")).toHaveText("3");
  await expect(value("Further payments in period")).toHaveText("6");
  await expect(value("Paying leads in period")).toHaveText("9");
  await expect(value("Clients in creation cohort")).toHaveText("2");
  const createdOnly = page.getByRole("switch", { name: "Only leads created in selected dates", exact: true });
  await createdOnly.check();
  await expect(value("Paying leads in period")).toHaveText("2");
  await expect(value("First payments in period")).toHaveText("1");
  await expect(value("Further payments in period")).toHaveText("1");
  await active.locator("[data-metric-card='Paying leads in period']").getByRole("button", { name: "Data", exact: true }).click();
  const evidence = page.getByRole("dialog");
  await expect(evidence.locator("[data-evidence-row]")).toHaveCount(2);
  await expect(evidence).not.toContainText("3473680");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Managers", exact: true }).click();
  await expect(createdOnly).toBeChecked();
  await expect(active).not.toContainText("2144428");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export this page to PDF", exact: true }).click();
  const pdf = await download;
  await pdf.saveAs(testInfo.outputPath(`creation-only-${pdf.suggestedFilename()}`));
  await page.getByLabel("Interface language", { exact: true }).selectOption("ru");
  await expect(page.getByRole("switch", { name: "Только лиды, созданные в выбранном периоде", exact: true })).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole("switch", { name: "Только лиды, созданные в выбранном периоде", exact: true }).locator("..").screenshot({ path: testInfo.outputPath("creation-only-control-mobile.png") });
  await page.screenshot({ path: testInfo.outputPath("creation-only-mobile.png") });
  await page.getByLabel("Язык интерфейса", { exact: true }).selectOption("en");
  await createdOnly.uncheck();
  await expect(active).toContainText("2144428");
  await expect(active).toContainText("2026-10-28");
  await active.screenshot({ path: testInfo.outputPath("real-sales-payments-desktop.png") });
});
