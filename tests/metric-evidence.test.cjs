/* eslint-disable @typescript-eslint/no-require-imports -- Test the existing TypeScript modules in Node. */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path);
const { searchEvidence, evidenceCsv } = require("../lib/metric-evidence.ts");
const row = { key: "1", id: "10", name: "Original name", owner: "Sheila", service: "LT citizenship", source: "Google Ads", stage: "New", relevancy: "", created: "2026-10-01", mergedIds: ["9", "10"], fields: { Email: "person@example.com", Notes: '=HYPERLINK("https://example.com")', Zero: "0" } };

test("evidence search matches source IDs and field values without changing records", () => {
  assert.equal(searchEvidence([row], "  SHEILA  ")[0], row);
  assert.equal(searchEvidence([row], "9")[0], row);
  assert.equal(searchEvidence([row], "PERSON@EXAMPLE")[0], row);
  assert.equal(searchEvidence([row], "unmatched").length, 0);
  assert.equal(searchEvidence([row], "").length, 1);
});

test("evidence CSV preserves values and escapes spreadsheet expressions and quotes", () => {
  const csv = evidenceCsv([row, { ...row, key: "2", id: "11", name: "+formula", fields: { Extra: "first\nsecond" } }]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.com"")"'));
  assert.ok(csv.includes('"\'+formula"'));
  assert.ok(csv.includes('"0"'));
  assert.ok(csv.includes('"first\nsecond"'));
  assert.ok(csv.includes('"9; 10"'));
});
