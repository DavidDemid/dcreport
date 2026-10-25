/* eslint-disable @typescript-eslint/no-require-imports -- Playwright configuration runs in Node. */
const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./tests/browser",
  timeout: 300_000,
  workers: 1,
  use: { baseURL: process.env.REPORT_TEST_URL || "http://localhost:3002", headless: true, viewport: { width: 1440, height: 1000 } },
  reporter: "list",
});
