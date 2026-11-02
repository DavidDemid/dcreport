/* eslint-disable @typescript-eslint/no-require-imports -- Browser tests use the existing local authentication convention. */
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

test.use({ timezoneId: "Europe/Sofia" });

async function loadHistoricalSnapshot(page, context) {
  const envFile = path.join(__dirname, "../../.env.local");
  const env = fs.existsSync(envFile) ? Object.fromEntries(fs.readFileSync(envFile, "utf8").split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z_]+)=(.*)$/); return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, "")]] : [];
  })) : process.env;
  await context.request.post("/api/login", { form: { username: env.AUTH_USERNAME, password: env.AUTH_PASSWORD, next: "/kommo" } });
  await page.goto("/kommo");
  const headers = ["ID", "Lead stage", "Date Created", "Last Modified", "Work email (contact)"];
  const created = ["01.10.2026 09:00:00", "21.10.2026 09:00:00", "21.10.2026 23:59:59"];
  const rows = created.map((date, index) => [String(index + 1), "New", date, "21.10.2026 15:00:00", `date-limit-${index}@example.com`]);
  const csv = [headers, ...rows].map((row) => row.map((value) => `"${value}"`).join(",")).join("\r\n");
  await page.getByLabel("Kommo CRM file", { exact: true }).setInputFiles({ name: "date-limit.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("3 clean leads", { exact: true })).toBeVisible();
}

async function openPicker(page) {
  await page.getByRole("button", { name: "Date range", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Date range", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("local today limits calendars, typed dates and keyboard focus without moving historical presets", async ({ page, context }) => {
  // Sofia is already October 27 while UTC is still October 26.
  await page.clock.setFixedTime(new Date("2026-10-26T22:30:00Z"));
  await loadHistoricalSnapshot(page, context);
  const today = "2026-10-27";
  const dialog = await openPicker(page);
  const from = dialog.getByLabel("From date", { exact: true });
  const to = dialog.getByLabel("To date", { exact: true });
  const apply = dialog.getByRole("button", { name: "Apply dates", exact: true });
  await expect(from).toHaveAttribute("max", today);
  await expect(to).toHaveAttribute("max", today);

  await dialog.getByRole("button", { name: "Last 7 days", exact: true }).click();
  await expect(from).toHaveValue("2026-10-15");
  await expect(to).toHaveValue("2026-10-21");
  await apply.click();
  await expect(page.getByText("2026-10-15 to 2026-10-21", { exact: true })).toBeVisible();
  await openPicker(page);

  await to.fill("2026-10-28");
  await expect(apply).toBeDisabled();
  await expect(dialog.getByText("Dates cannot be later than today.", { exact: true })).toBeVisible();
  await to.press("Enter");
  await expect(dialog).toBeVisible();
  await to.fill(today);
  await from.fill("2026-10-28");
  await expect(apply).toBeDisabled();
  await from.fill("2026-10-21");
  await expect(apply).toBeEnabled();

  const current = dialog.locator(`[data-date="${today}"]`);
  await expect(current).toBeEnabled();
  await expect(dialog.locator('[data-date="2026-10-28"]')).toBeDisabled();
  const future = await dialog.locator("button[data-date]").evaluateAll((buttons, maximum) => buttons
    .filter((button) => button.dataset.date > maximum)
    .map((button) => ({ disabled: button.disabled, tabIndex: button.tabIndex })), today);
  expect(future.length).toBeGreaterThan(0);
  expect(future.every((button) => button.disabled && button.tabIndex === -1)).toBe(true);
  await expect(dialog.getByRole("button", { name: "Next month, first calendar", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Next month, second calendar", exact: true })).toBeDisabled();
  const month = dialog.getByLabel("Month, first calendar", { exact: true });
  const year = dialog.getByLabel("Year, first calendar", { exact: true });
  expect(await month.locator("option").evaluateAll((options) => options.every((option) => Number(option.value) <= 9))).toBe(true);
  expect(await year.locator("option").evaluateAll((options) => options.every((option) => Number(option.value) <= 2026))).toBe(true);
  await current.focus();
  for (const key of ["ArrowRight", "ArrowDown", "End", "PageDown", "Shift+PageDown"]) {
    await current.press(key);
    await expect(current).toBeFocused();
  }
  await year.selectOption("2025");
  await month.selectOption("11");
  await year.selectOption("2026");
  await expect(month).toHaveValue("9");
  await expect(dialog.getByRole("grid", { name: "October 2026", exact: true })).toBeVisible();

  for (const preset of ["This month", "This year", "All time"]) {
    await dialog.getByRole("button", { name: preset, exact: true }).click();
    await expect(to).toHaveValue("2026-10-21");
    await expect(apply).toBeEnabled();
  }
  // An open end is applied as today rather than leaving a future-unbounded filter.
  await to.fill("");
  await apply.click();
  await openPicker(page);
  await expect(to).toHaveValue(today);
  await from.fill("2026-10-21");
  await to.fill("2026-10-21");
  await apply.click();
  await expect(page.getByText("2 clean leads", { exact: true })).toBeVisible();
});

test("year-end and mobile navigation never offer or focus a future date", async ({ page, context }) => {
  await page.clock.setFixedTime(new Date("2026-12-31T10:00:00Z"));
  await loadHistoricalSnapshot(page, context);
  const dialog = await openPicker(page);
  const today = "2026-12-31";
  await dialog.getByLabel("Month, first calendar", { exact: true }).selectOption("11");
  await expect(dialog.getByRole("grid", { name: "December 2026", exact: true })).toBeVisible();
  await expect(dialog.locator('[data-date="2027-01-01"]')).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Next month, first calendar", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Next month, second calendar", exact: true })).toBeDisabled();
  expect(await dialog.locator('select[aria-label^="Year,"] option').evaluateAll((options) => options.every((option) => Number(option.value) <= 2026))).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByLabel("From date", { exact: true })).toHaveAttribute("max", today);
  await expect(dialog.getByLabel("To date", { exact: true })).toHaveAttribute("max", today);
  const current = dialog.locator(`[data-date="${today}"]`);
  await current.focus();
  for (const key of ["ArrowRight", "ArrowDown", "End", "PageDown", "Shift+PageDown"]) {
    await current.press(key);
    await expect(current).toBeFocused();
  }
  await current.click();
  const to = dialog.getByLabel("To date", { exact: true });
  await to.fill("2027-01-01");
  await expect(dialog.getByRole("button", { name: "Apply dates", exact: true })).toBeDisabled();
  await dialog.getByLabel("Date preset", { exact: true }).selectOption("thisyear");
  await expect(to).toHaveValue("2026-10-21");
  await expect(dialog.getByRole("button", { name: "Apply dates", exact: true })).toBeEnabled();
  expect(await dialog.evaluate((node) => node.scrollWidth > node.clientWidth + 1)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});
