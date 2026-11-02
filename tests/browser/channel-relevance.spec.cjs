/* eslint-disable @typescript-eslint/no-require-imports -- Browser regression fixtures use Node. */
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

test("paid Meta and chat channels have separate relevance denominators", async ({ page, context }, testInfo) => {
  const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, "../../.env.local"), "utf8").split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z_]+)=(.*)$/); return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, "")]] : [];
  }));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.request.post("/api/login", { form: { username: env.AUTH_USERNAME, password: env.AUTH_PASSWORD, next: "/kommo" } });
  await page.goto("/kommo");
  const headers = ["ID", "Lead stage", "Created on", "Modified on", "Marketing Source", "utm_source", "utm_medium", "Relevancy", "Qualified service"];
  const records = [
    ["1", "New", "01.10.2026 10:00:00", "21.10.2026 15:00:00", "Facebook Ads", "facebook", "paid_social", "Relevant", "LT citizenship"],
    ["2", "New", "02.10.2026 10:00:00", "21.10.2026 15:00:00", "Facebook Ads", "facebook", "paid_social", "", "LT citizenship"],
    ["3", "New", "03.10.2026 10:00:00", "21.10.2026 15:00:00", "Facebook Messenger", "", "", "Relevant", "LT citizenship"],
    ["4", "New", "04.10.2026 10:00:00", "21.10.2026 15:00:00", "Instagram DM", "", "", "Not Relevant", "LT citizenship"],
    ["5", "New", "05.10.2026 10:00:00", "21.10.2026 15:00:00", "Google Ads", "", "", "", "LT citizenship"],
    ["6", "New", "06.10.2026 10:00:00", "21.10.2026 15:00:00", "Facebook", "", "", "Relevant", "LT citizenship"],
  ];
  const csv = [headers, ...records].map((row) => row.map((value) => `"${value}"`).join(",")).join("\r\n");
  await page.getByLabel("Kommo CRM file", { exact: true }).setInputFiles({ name: "channel-evidence.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("6 clean leads", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Channels & Services", exact: true }).click();
  const table = page.getByRole("heading", { name: "Channel performance", exact: false }).first().locator("../..").getByRole("table");
  await expect(table.getByRole("columnheader", { name: "Relevant / assessed", exact: true })).toBeVisible();
  const ads = table.getByRole("row").filter({ has: page.getByRole("cell", { name: "Facebook / Instagram Ads", exact: true }) });
  const chat = table.getByRole("row").filter({ has: page.getByRole("cell", { name: "Facebook / Instagram chat", exact: true }) });
  await expect(ads).toHaveCount(1);
  await expect(chat).toHaveCount(1);
  await expect(ads.getByRole("cell").nth(2)).toContainText("50%");
  await expect(ads.getByRole("cell").nth(3)).toContainText("100%");
  await expect(ads.getByRole("cell").nth(3)).toContainText("1 / 1");
  await expect(chat.getByRole("cell").nth(2)).toContainText("50%");
  await expect(chat.getByRole("cell").nth(3)).toContainText("50%");
  await expect(chat.getByRole("cell").nth(3)).toContainText("1 / 2");
  const unresolved = table.getByRole("row").filter({ has: page.getByRole("cell", { name: "Facebook / Instagram (source unknown)", exact: true }) });
  await expect(unresolved).toHaveCount(1);
  await expect(unresolved.getByRole("cell").nth(1)).toHaveText("1");
  await expect(unresolved.getByRole("cell").nth(2)).toContainText("100%");
  const google = table.getByRole("row").filter({ has: page.getByRole("cell", { name: "Google Ads", exact: true }) });
  await expect(google.getByRole("cell").nth(3)).toContainText("n/a");
  await expect(google.getByRole("cell").nth(3)).toContainText("0 / 0");
  await table.screenshot({ path: testInfo.outputPath("channel-relevance-desktop.png") });
  await page.getByLabel("Interface language", { exact: true }).selectOption("ru");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.locator("[data-active-report] table").first().screenshot({ path: testInfo.outputPath("channel-relevance-mobile.png") });
  expect(errors).toEqual([]);
});
