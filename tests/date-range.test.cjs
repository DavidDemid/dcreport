/* eslint-disable @typescript-eslint/no-require-imports -- Load TypeScript using the existing CJS test convention. */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, path) => {
  module._compile(ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, path);
};
const d = require("../lib/date-range.ts");

test("default today encodes the local calendar day, including just after midnight", () => {
  assert.equal(d.localISODate(new Date(2026, 9, 21, 0, 30)), "2026-10-21");
  assert.equal(d.localISODate(new Date(2026, 9, 21, 23, 30)), "2026-10-21");
  assert.equal(d.localISODate(new Date(NaN)), "");
});

test("ISO dates are strict, UTC-safe, and support years below 100", () => {
  for (const invalid of ["2026-02-29", "2024-02-30", "2026-13-01", "2026-00-01", "2026-04-31", "2026-1-01", "0000-01-01", "10/21/2026", "2026-10-21T00:00:00Z", ""]) assert.equal(d.parseISODate(invalid), null);
  assert.equal(d.parseISODate("2024-02-29").toISOString(), "2024-02-29T00:00:00.000Z");
  assert.equal(d.parseISODate("0099-01-01").toISOString(), "0099-01-01T00:00:00.000Z");
});

test("day arithmetic crosses DST, leap days, months and years without losing days", () => {
  assert.equal(d.addDays("2026-03-28", 2), "2026-03-30");
  assert.equal(d.addDays("2026-10-24", 2), "2026-10-26");
  assert.equal(d.addDays("2024-03-01", -1), "2024-02-29");
  assert.equal(d.addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(d.addDays("9999-12-31", 1), "");
  assert.equal(d.addDays("0001-01-01", -1), "");
});

test("month/year jumps clamp to valid dates", () => {
  assert.equal(d.addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(d.addMonths("2024-02-29", 12), "2025-02-28");
  assert.equal(d.addMonths("2026-01-31", -1), "2025-12-31");
  assert.equal(d.addMonths("9999-12-01", 1), "");
});

test("relative presets use inclusive days and the explicit anchor, not export bounds", () => {
  const anchor = "2026-10-21";
  const bounds = { from: "2026-10-10", to: "2026-10-20" };
  const expected = {
    today: [anchor, anchor], yesterday: ["2026-10-20", "2026-10-20"],
    last7: ["2026-10-15", anchor], last14: ["2026-10-08", anchor], last30: ["2026-09-22", anchor],
    thismonth: ["2026-10-01", anchor], lastmonth: ["2026-09-01", "2026-09-30"],
    last3months: ["2026-07-01", "2026-09-30"], thisyear: ["2026-01-01", anchor],
    alltime: [bounds.from, bounds.to],
  };
  for (const { id } of d.DATE_RANGE_PRESETS) {
    assert.deepEqual(d.presetDateRange(id, anchor, bounds), { from: expected[id][0], to: expected[id][1] });
  }
  assert.deepEqual(d.presetDateRange("alltime", anchor), { from: "", to: "" });
  const all = d.presetDateRange("alltime", anchor, bounds);
  all.from = "";
  assert.equal(bounds.from, "2026-10-10");
});

test("presets cross year boundaries and leap-year February", () => {
  assert.deepEqual(d.presetDateRange("lastmonth", "2024-03-31"), { from: "2024-02-01", to: "2024-02-29" });
  assert.deepEqual(d.presetDateRange("last3months", "2026-01-01"), { from: "2025-10-01", to: "2025-12-31" });
  assert.deepEqual(d.presetDateRange("last7", "2026-01-01"), { from: "2025-12-26", to: "2026-01-01" });
});

test("range validation permits same-day, unbounded, historical and future ranges", () => {
  for (const range of [{ from: "2026-10-21", to: "2026-10-21" }, { from: "", to: "" }, { from: "1900-01-01", to: "2099-12-31" }, { from: "", to: "2026-01-01" }]) assert.equal(d.dateRangeError(range), null);
  assert.match(d.dateRangeError({ from: "2026-11-01", to: "2026-10-21" }), /on or before/);
  assert.match(d.dateRangeError({ from: "2026-02-30", to: "" }), /valid date/);
});

test("Monday-first calendars contain each real date once in a stable 6-week grid", () => {
  const feb = d.calendarDays("2024-02-01");
  assert.equal(feb.length, 42);
  assert.deepEqual(feb.slice(0, 4), [null, null, null, "2024-02-01"]);
  assert.equal(feb.filter(Boolean).length, 29);
  assert.equal(new Set(feb.filter(Boolean)).size, 29);
  assert.equal(d.calendarDays("2026-06-01")[0], "2026-06-01");
  assert.equal(d.calendarDays("9999-12-01").filter(Boolean).length, 31);
});

test("display formatting uses UTC and does not shift a date to the previous day", () => {
  assert.equal(d.formatDateRange({ from: "2026-10-21", to: "2026-10-21" }), "21 Oct 2026");
  assert.equal(d.formatDateRange({ from: "", to: "" }), "All time");
  assert.equal(d.formatDateRange({ from: "2024-02-29", to: "2024-03-01" }), "29 Feb 2024 - 1 Mar 2024");
});
