/* eslint-disable @typescript-eslint/no-require-imports -- Local browser fixtures use the Node test runner. */
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

test("monthly counts, cumulative percentages, Russian UI, alignment and PDF", async ({ page, context }, testInfo) => {
  const envFile = path.join(__dirname, "../../.env.local");
  const env = fs.existsSync(envFile) ? Object.fromEntries(fs.readFileSync(envFile, "utf8").split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z_]+)=(.*)$/); return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, "")]] : [];
  })) : process.env;
  const errors = [];
  const renderingErrors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /unique.*key|hydration|cannot appear|cannot be a descendant/i.test(message.text())) renderingErrors.push(message.text());
  });
  await context.request.post("/api/login", { form: { username: env.AUTH_USERNAME, password: env.AUTH_PASSWORD, next: "/kommo" } });
  await page.goto("/kommo");
  const headers = ["ID", "Lead stage", "Date Created", "Last Modified", "Work email (contact)", "Qualified service", "Relevancy", "First payment at", "Payment status"];
  const dates = ["15.08.2026", "05.09.2026", "06.10.2026", "10.10.2026"];
  const rows = Array.from({ length: 10 }, (_, i) => [String(i + 1), "New", "01.08.2026 09:00:00", "21.10.2026 15:00:00", `cohort-${i}@example.com`, "LT citizenship", "Relevant", dates[i] || "", i === 4 ? "Paid" : ""]);
  const csv = [headers, ...rows].map((row) => row.map((value) => `"${value}"`).join(",")).join("\r\n");
  await page.getByLabel("Kommo CRM file", { exact: true }).setInputFiles({ name: "cohort-example.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("10 clean leads", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cohorts", exact: true }).click();
  const table = page.locator("[data-active-report] table[data-cohort-service=all]");
  const row = table.locator("tr[data-cohort-month='2026-08']");
  await expect(row.locator("[data-cohort-offset='0']")).toContainText("10%");
  await expect(row.locator("[data-cohort-offset='1']")).toContainText("20%");
  await expect(row.locator("[data-cohort-offset='2']")).toContainText("40%");
  await page.getByRole("button", { name: "Monthly conversions, count", exact: true }).click();
  await expect(table).toHaveAttribute("data-cohort-mode", "monthly");
  for (const [offset, count] of [[0, "1"], [1, "1"], [2, "2"]]) {
    const text = await row.locator(`[data-cohort-offset='${offset}']`).innerText();
    expect(text.split("\n")[0].trim()).toBe(count);
    expect(text).not.toContain("%");
  }
  await expect(row.locator("[data-cohort-offset='3']")).toContainText("-");
  await page.getByLabel("Interface language", { exact: true }).selectOption("ru");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.getByRole("button", { name: "Cohorts", exact: true })).toHaveCount(0);
  await expect(table).toHaveAttribute("data-cohort-mode", "monthly");
  const aligned = await table.evaluate((node) => {
    const head = [...node.querySelectorAll("thead [data-cohort-offset]")];
    const cells = [...node.querySelectorAll("tbody tr:first-child [data-cohort-offset]")];
    return head.length === 6 && cells.length === 6 && head.every((h, i) => {
      const a = h.getBoundingClientRect(), b = cells[i].getBoundingClientRect();
      return Math.abs(a.left - b.left) < 1 && Math.abs(a.width - b.width) < 1;
    });
  });
  expect(aligned).toBe(true);
  await page.locator("[data-active-report]").screenshot({ path: testInfo.outputPath("ru-monthly-cohorts.png") });
  const download = page.waitForEvent("download", { timeout: 180000 });
  await page.getByRole("button", { name: "Экспорт страницы в PDF", exact: true }).click();
  await expect(page.locator(".kommo-pdf-root table[data-cohort-service=all]")).toHaveAttribute("data-cohort-mode", "monthly");
  const pdf = await download;
  await pdf.saveAs(testInfo.outputPath("ru-monthly-cohorts.pdf"));
  expect(fs.readFileSync(await pdf.path()).subarray(0, 4).toString()).toBe("%PDF");
  for (const name of ["Обзор", "Каналы и услуги", "Конверсии", "Когорты", "Финансы и сверка", "Качество данных"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator("[data-active-report]")).not.toBeEmpty();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
  }
  await page.getByRole("tab", { name: "Отчёт по продажам", exact: true }).click();
  for (const name of ["Обзор", "Менеджеры", "Воронка и скорость контакта", "Следующие действия"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator("[data-active-report]")).not.toBeEmpty();
  }
  await page.getByRole("tab", { name: "Отчёт по маркетингу", exact: true }).click();
  await page.getByRole("button", { name: "Когорты", exact: true }).click();
  await expect(table).toHaveAttribute("data-cohort-mode", "monthly");
  await page.reload();
  await expect(page.getByLabel("Язык интерфейса", { exact: true })).toHaveValue("ru");
  await page.getByRole("button", { name: "Когорты", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
  await page.locator("[data-active-report]").screenshot({ path: testInfo.outputPath("ru-cohorts-mobile.png") });
  await page.getByRole("link", { name: "Старый отчёт PlanFix", exact: true }).click();
  await expect(page.getByLabel("Язык интерфейса", { exact: true })).toHaveValue("ru");
  await page.getByLabel("Язык интерфейса", { exact: true }).selectOption("en");
  await expect(page.getByRole("heading", { name: "CRM reports dashboard", exact: true })).toBeVisible({ timeout: 30000 });
  expect(errors).toEqual([]);
  expect(renderingErrors).toEqual([]);
});
