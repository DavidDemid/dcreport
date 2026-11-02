/* eslint-disable @typescript-eslint/no-require-imports -- Use the existing CJS TypeScript loader. */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");
const XLSX = require("xlsx");
require.extensions[".ts"] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path);
const k = require("../lib/kommo.ts");
const { summarizeMetaEvidence } = require("../lib/kommo-meta.ts");
const NOW = new Date("2026-10-29T18:00:00Z");

function rawRows(records) {
  const defaults = { "Lead stage": "New", "Date Created": "01.10.2026 10:00:00", "Last Modified": "21.10.2026 15:00:00" };
  const headers = [...new Set(["ID", ...Object.keys(defaults), ...records.flatMap(Object.keys)])];
  return [headers, ...records.map((record, index) => headers.map((header) => ({ ID: String(index + 1), ...defaults, ...record })[header] ?? ""))];
}
const dataset = (records) => k.normalizeKommoRows(rawRows(records), NOW);
const ids = (leads) => leads.map((lead) => lead.id);

test("full October 28 reconciliation export keeps lead counts and separates unproven Meta labels", {
  skip: !process.env.META_FULL_CRM_XLSX && "Set META_FULL_CRM_XLSX to the verified full October 28 export (11).",
}, async () => {
  const bytes = Uint8Array.from(fs.readFileSync(process.env.META_FULL_CRM_XLSX));
  const data = await k.parseKommoWorkbook(bytes.buffer);
  const clean = k.cleanKommoLeads(data.leads).records;
  const october = clean.filter((lead) => lead.createdAt && k.monthOf(lead.createdAt) === "2026-10");
  assert.equal(data.leads.length, 5950);
  assert.equal(clean.length, 5933);
  assert.equal(october.length, 1670);
  assert.equal(october.filter((lead) => lead.source === k.KOMMO_META_ADS_SOURCE).length, 961);
  assert.equal(october.filter((lead) => lead.source === k.KOMMO_META_UNKNOWN_SOURCE).length, 375);
  assert.equal(october.filter((lead) => lead.source === k.KOMMO_META_CHAT_SOURCE).length, 0);
  assert.equal(october.filter((lead) => lead.source === "Google Ads").length, 139);
  assert.equal(data.leads.find((lead) => lead.id === "4757274").source, k.KOMMO_META_UNKNOWN_SOURCE);
  assert.equal(data.leads.find((lead) => lead.id === "5464832").source, "Google Ads");
});
function withoutMeta(lead) {
  const copy = { ...lead };
  delete copy.metaSubmissions;
  return copy;
}

test("Meta IDs preserve large string values and normalize only whitespace / l: prefixes", () => {
  const d = dataset([{
    "FB lead id": "  l:10000000000000001  ", "FB form id": " 00000000000000201 ",
    "Fb ad id": " 10000000000000301 ", "Fb is organic": false,
  }]);
  assert.deepEqual(d.leads[0].metaSubmissions, [{
    leadId: "10000000000000001", formId: "00000000000000201", adId: "10000000000000301", isOrganic: false,
  }]);
  assert.deepEqual(summarizeMetaEvidence(d.leads).paidFormIds, ["10000000000000001"]);
});

test("organic flags distinguish false/0/no, true/1/yes, and unknown values", () => {
  const flags = [false, 0, "false", " FALSE ", "no", "0", true, 1, "true", "YES", "1", "", "unknown", null];
  const d = dataset(flags.map((flag, index) => ({ "FB lead id": `l:example-${index}`, "Fb is organic": flag })));
  assert.deepEqual(d.leads.map((lead) => lead.metaSubmissions[0].isOrganic), [false, false, false, false, false, false, true, true, true, true, true, null, null, null]);
  const audit = summarizeMetaEvidence(d.leads);
  assert.equal(audit.paidRecords.length, 6);
  assert.equal(audit.paidFormIds.length, 6);
  assert.equal(audit.unknownOrganicRecords.length, 3);
  assert.equal(audit.allFormIds.length, flags.length);
});

test("CSV and XLSX parsing retain typed Meta provenance without numeric ID conversion", async () => {
  const records = [{ "FB lead id": "l:10000000000000001", "FB form id": "00021", "Fb ad id": "00031", "Fb is organic": false },
    { "FB lead id": "l:10000000000000002", "Fb is organic": 0 }];
  const rows = rawRows(records);
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(book, sheet, "Leads");
  const xlsx = await k.parseKommoWorkbook(XLSX.write(book, { type: "array", bookType: "xlsx" }));
  const csv = await k.parseKommoWorkbook(new TextEncoder().encode(XLSX.utils.sheet_to_csv(sheet)).buffer);
  assert.deepEqual(xlsx.leads.map((lead) => lead.metaSubmissions), csv.leads.map((lead) => lead.metaSubmissions));
  assert.deepEqual(xlsx.leads.map((lead) => lead.metaSubmissions[0].leadId), ["10000000000000001", "10000000000000002"]);
  assert.ok(xlsx.leads.every((lead) => lead.metaSubmissions[0].isOrganic === false));
});

test("paid Meta evidence survives Google primary attribution without changing source or dates", () => {
  const record = { "utm_source*": "google", "utm_medium*": "cpc", "Marketing Source": "Website",
    "FB lead id": "l:12345678901234567", "FB form id": "form", "Fb ad id": "ad", "Fb is organic": false };
  const lead = dataset([record]).leads[0];
  const baseline = dataset([{ "utm_source*": "google", "utm_medium*": "cpc", "Marketing Source": "Website" }]).leads[0];
  for (const field of ["source", "sourceRaw", "sourceMethod", "captureMethod", "campaign", "medium"]) assert.equal(lead[field], baseline[field]);
  assert.deepEqual(lead.sourceEvidence, baseline.sourceEvidence);
  assert.equal(lead.createdAt.toISOString(), baseline.createdAt.toISOString());
  assert.equal(lead.importedAt.toISOString(), baseline.importedAt.toISOString());
  const audit = summarizeMetaEvidence([lead]);
  assert.equal(lead.source, "Google Ads");
  assert.equal(audit.paidRecords[0], lead);
  assert.equal(audit.otherSourceRecords[0], lead);
  assert.deepEqual(Object.keys(lead.metaSubmissions[0]).sort(), ["adId", "formId", "isOrganic", "leadId"]);
});

test("cleanup preserves two distinct submissions from a duplicate cluster without changing grouping", () => {
  const d = dataset([
    { "Work email (contact)": "example@example.com", "Qualified service": "LT citizenship", "Marketing Source": "Facebook ads", "FB lead id": "l:first", "FB form id": "same-template", "Fb ad id": "ad-one", "Fb is organic": false, "Last Modified": "02.10.2026" },
    { "Work email (contact)": "example@example.com", "Qualified service": "LT citizenship", "Marketing Source": "Instagram", "FB lead id": "second", "FB form id": "same-template", "Fb ad id": "ad-two", "Fb is organic": false, "Date Created": "05.10.2026" },
  ]);
  const cleaned = k.cleanKommoLeads(d.leads);
  const baseline = k.cleanKommoLeads(d.leads.map(withoutMeta));
  assert.equal(cleaned.records.length, 1);
  assert.equal(cleaned.merged, 1);
  assert.deepEqual(cleaned.records[0].mergedIds, ["1", "2"]);
  assert.deepEqual(cleaned.records[0].metaSubmissions.map((submission) => submission.leadId), ["first", "second"]);
  for (const field of ["source", "sourceRaw", "sourceMethod", "captureMethod", "campaign", "medium", "service", "relevancy"]) assert.equal(cleaned.records[0][field], baseline.records[0][field]);
  assert.equal(cleaned.records[0].createdAt.toISOString(), baseline.records[0].createdAt.toISOString());
  const audit = summarizeMetaEvidence(cleaned.records);
  assert.equal(audit.paidRecords.length, 1);
  assert.equal(audit.paidLinks, 2);
  assert.deepEqual(audit.paidFormIds, ["first", "second"], "IDs identify submissions, not the shared form template");
  assert.equal(audit.duplicatePaidLinks, 0);
});

test("same FB ID counts once per record, but repeated record/form links are visible", () => {
  const d = dataset([
    { "Marketing Source": "Facebook ads" }, { "utm_source*": "google" },
    { "Marketing Source": "Facebook ads" }, { "Marketing Source": "Facebook ads" }, { "Marketing Source": "Facebook" },
  ]);
  const form = (leadId, isOrganic) => ({ leadId, formId: "template", adId: "ad", isOrganic });
  d.leads[0].metaSubmissions = [form("l:one", false), form("one", false)];
  d.leads[1].metaSubmissions = [form("one", false), form("two", false)];
  d.leads[2].metaSubmissions = [];
  d.leads[3].metaSubmissions = [form("three", null)];
  d.leads[4].metaSubmissions = [form("four", true)];
  const audit = summarizeMetaEvidence(d.leads);
  assert.deepEqual(ids(audit.paidRecords), ["1", "2"]);
  assert.deepEqual(audit.paidFormIds, ["one", "two"]);
  assert.equal(audit.paidLinks, 3);
  assert.equal(audit.duplicatePaidLinks, 1);
  assert.deepEqual(ids(audit.otherSourceRecords), ["2"]);
  assert.deepEqual(ids(audit.adsWithoutPaidFormRecords), ["3", "4"]);
  assert.deepEqual(ids(audit.unknownOrganicRecords), ["4"]);
  assert.deepEqual(audit.allFormIds, ["one", "two", "three", "four"]);
  assert.equal(audit.paidRecords[0], d.leads[0]);
});

test("one person with two services repeats a submission without an identity collision", () => {
  const d = dataset([
    { "Work email (contact)": " Person@Example.com ", "Mobile phone (contact)": "+1 (202) 555-0100", "Qualified service": "LT citizenship", "FB lead id": "l:shared", "Fb is organic": false },
    { "Work email (contact)": "person@example.com", "Mobile phone (contact)": "12025550100", "Qualified service": "PL citizenship", "FB lead id": "shared", "Fb is organic": false },
  ]);
  const cleaned = k.cleanKommoLeads(d.leads).records;
  assert.equal(cleaned.length, 2);
  const audit = summarizeMetaEvidence(cleaned);
  assert.deepEqual(audit.repeatedIdRecords, cleaned);
  assert.equal(audit.repeatedIdRecords[0], cleaned[0]);
  assert.deepEqual(audit.identityCollisionRecords, []);
  assert.deepEqual(audit.suspiciousFormIds, []);
  assert.equal(audit.paidLinks, 2);
  assert.equal(audit.duplicatePaidLinks, 1);
});

test("different valid emails or normalized phones flag potential collisions regardless of organic status", () => {
  const d = dataset([
    { "Work email (contact)": "one@example.com", "FB lead id": "shared-email", "Fb is organic": true },
    { "Work email (contact)": "two@example.com", "FB lead id": "l:shared-email" },
    { "Mobile phone (contact)": "+1 202 555 0100", "FB lead id": "shared-phone", "Fb is organic": false },
    { "Mobile phone (contact)": "+1 202 555 0101", "FB lead id": "shared-phone", "Fb is organic": false },
    { "Work email (contact)": "invalid", "Mobile phone (contact)": "1234567", "FB lead id": "invalid-contacts" },
    { "Work email (contact)": "also-invalid", "Mobile phone (contact)": "7654321", "FB lead id": "invalid-contacts" },
    { "Work email (contact)": "three@example.com", "FB lead id": "unique" },
  ]);
  const before = JSON.stringify(d.leads);
  const audit = summarizeMetaEvidence(d.leads);
  assert.deepEqual(ids(audit.repeatedIdRecords), ["1", "2", "3", "4", "5", "6"]);
  assert.deepEqual(ids(audit.identityCollisionRecords), ["1", "2", "3", "4"]);
  assert.deepEqual(audit.suspiciousFormIds, ["shared-email", "shared-phone"]);
  assert.equal(audit.identityCollisionRecords[0], d.leads[0]);
  assert.equal(audit.paidLinks, 2, "diagnostic flags do not exclude paid links");
  assert.equal(JSON.stringify(d.leads), before);
});

test("repeated CRM IDs retain older submission provenance while still choosing the latest CRM record", () => {
  for (const reverse of [false, true]) {
    const records = [
      { ID: "same-crm", "Last Modified": "02.10.2026", "Marketing Source": "Facebook ads", "FB lead id": "older-form", "Fb is organic": false },
      { ID: "same-crm", "Last Modified": "20.10.2026", "utm_source*": "google", "Marketing Source": "Website", "FB lead id": "newer-form", "Fb is organic": false },
    ];
    const d = dataset(reverse ? records.reverse() : records);
    const cleaned = k.cleanKommoLeads(d.leads);
    assert.equal(cleaned.records.length, 1);
    assert.equal(cleaned.repeatedIds, 1);
    assert.equal(cleaned.records[0].source, "Google Ads");
    assert.equal(cleaned.records[0].modifiedAt.toISOString(), "2026-10-20T00:00:00.000Z");
    assert.deepEqual(new Set(cleaned.records[0].metaSubmissions.map((submission) => submission.leadId)), new Set(["older-form", "newer-form"]));
    const audit = summarizeMetaEvidence(cleaned.records);
    assert.equal(audit.paidLinks, 2);
    assert.equal(audit.otherSourceRecords.length, 1);
  }
});

test("contradictory organic flags in a merged cluster stay unknown in either order", () => {
  for (const secondFlag of [true, null]) {
    for (const flags of [[false, secondFlag], [secondFlag, false]]) {
      const d = dataset(flags.map((flag) => ({ "Work email (contact)": "example@example.com", "FB lead id": "same", "FB form id": "template", "Fb is organic": flag })));
      const cleaned = k.cleanKommoLeads(d.leads);
      assert.equal(cleaned.records.length, 1);
      assert.equal(cleaned.records[0].metaSubmissions.length, 1);
      assert.equal(cleaned.records[0].metaSubmissions[0].isOrganic, null);
      const audit = summarizeMetaEvidence(cleaned.records);
      assert.equal(audit.paidRecords.length, 0);
      assert.equal(audit.paidLinks, 0);
      assert.equal(audit.unknownOrganicRecords.length, 1);
    }
  }
});

test("contradictory flags for a shared FB ID across separate records also fail closed", () => {
  const d = dataset([{ "FB lead id": "same", "Fb is organic": false }, { "FB lead id": "l:same", "Fb is organic": true }]);
  const before = JSON.stringify(d.leads);
  const audit = summarizeMetaEvidence(d.leads);
  assert.equal(audit.paidRecords.length, 0);
  assert.equal(audit.paidFormIds.length, 0);
  assert.equal(audit.unknownOrganicRecords.length, 2);
  assert.equal(audit.allFormIds.length, 1);
  assert.equal(d.leads[0].metaSubmissions[0].isOrganic, false);
  assert.equal(JSON.stringify(d.leads), before);
});

test("unknown/organic flags and ad-only evidence never become confirmed-paid submissions", () => {
  const d = dataset([
    { "Marketing Source": "Facebook", "FB lead id": "unknown", "Fb ad id": "ad" },
    { "FB lead id": "organic", "Fb is organic": true },
    { "Fb ad id": "ad-only", "Marketing Source": "Facebook" },
    { "FB lead id": " l: " }, {},
  ]);
  assert.deepEqual(d.leads.slice(2).map((lead) => lead.metaSubmissions), [[], [], []]);
  const audit = summarizeMetaEvidence(d.leads);
  assert.equal(audit.paidRecords.length, 0);
  assert.deepEqual(ids(audit.unknownOrganicRecords), ["1"]);
  assert.deepEqual(audit.allFormIds, ["unknown", "organic"]);
});

test("summarizer handles absent optional metadata and frozen inputs without mutation", () => {
  const d = dataset([{ "Marketing Source": "Facebook ads", "FB lead id": "same", "Fb is organic": false }, { "FB lead id": "same", "Fb is organic": false }]);
  const before = JSON.stringify(d.leads);
  for (const lead of d.leads) {
    for (const submission of lead.metaSubmissions) Object.freeze(submission);
    Object.freeze(lead.metaSubmissions); Object.freeze(lead);
  }
  Object.freeze(d.leads);
  const audit = summarizeMetaEvidence(d.leads);
  assert.equal(audit.paidRecords.length, 2);
  assert.equal(audit.paidLinks, 2);
  assert.equal(audit.duplicatePaidLinks, 1);
  assert.equal(JSON.stringify(d.leads), before);
  assert.deepEqual(summarizeMetaEvidence([]), { paidRecords: [], paidFormIds: [], paidLinks: 0, duplicatePaidLinks: 0,
    otherSourceRecords: [], adsWithoutPaidFormRecords: [], unknownOrganicRecords: [], allFormIds: [],
    repeatedIdRecords: [], identityCollisionRecords: [], suspiciousFormIds: [] });
  assert.equal(summarizeMetaEvidence(d.leads.map(withoutMeta)).paidRecords.length, 0);
});
