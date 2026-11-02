/* eslint-disable @typescript-eslint/no-require-imports -- Node's CJS test runner loads the existing TypeScript sources in memory. */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");
const XLSX = require("xlsx");

require.extensions[".ts"] = (module, path) => {
  const source = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(source, path);
};
const k = require("../lib/kommo.ts");
const a = require("../lib/kommo-analytics.ts");
const now = new Date("2026-10-21T23:00:00Z");
const scope = { from: "", to: "", services: [], sources: [], owners: [], origin: "all" };

function dataset(records) {
  const headers = [...new Set(["ID", "Lead stage", "Date Created", "Last Modified", ...records.flatMap(Object.keys)])];
  const rows = records.map((r, index) => headers.map((header) => ({
    ID: String(index + 1), "Lead stage": "New", "Date Created": "01.10.2026 10:00:00", "Last Modified": "21.10.2026 15:00:00", ...r,
  })[header] ?? ""));
  return k.normalizeKommoRows([headers, ...rows], now);
}

test("strict calendar dates reject impossible and ambiguous inputs", () => {
  assert.equal(k.parseKommoDate("31.02.2026"), null);
  assert.equal(k.parseKommoDate("03/04/2026"), null);
  assert.equal(k.parseKommoDate("2026-10-20T10:00:00+99:99"), null);
  assert.equal(k.parseKommoDate("21.10.2026 14:03:02").toISOString(), "2026-10-21T14:03:02.000Z");
});

test("migration uses original acquisition date, not batch import date", () => {
  const d = dataset([{ "Date Created": "17.09.2026 12:00:00", "Date Created(from Planfix)": "02.08.2026 09:00:00", "Old Lead ID": "123" }]);
  assert.equal(k.isoDay(d.leads[0].createdAt), "2026-08-02");
  assert.equal(d.leads[0].migrated, true);
  assert.equal(a.responseMinutes(d.leads[0]), null);
});

test("future original dates are quarantined and cannot create future cohorts", () => {
  const d = dataset([{ "Date Created(from Planfix)": "02.08.2028", "Old Lead ID": "123" }]);
  assert.equal(k.isoDay(d.leads[0].createdAt), "2026-10-01");
  assert.ok(d.leads[0].issues.some((i) => i.field === "Date Created(from Planfix)" && i.reason === "future"));
});

test("same-day negative contact timestamps are excluded but date-only payments are allowed", () => {
  const d = dataset([{ "First contact at": "01.10.2026 09:00:00", "First payment at": "01.10.2026" }]);
  assert.equal(d.leads[0].firstContactAt, null);
  assert.ok(d.leads[0].firstPaymentAt);
  assert.equal(a.summarize(d.leads).responseSample, 0);
});

test("future payment dates do not create timed or paid conversion on their own", () => {
  const d = dataset([{ "First payment at": "01.10.2028", "Full payment at": "01.10.2028" }]);
  assert.equal(d.leads[0].firstPaymentAt, null);
  assert.equal(a.isClient(d.leads[0]), false);
  assert.equal(a.cohortRows(d.leads, d.asOf, "firstPaymentAt")[0].cells[0], 0);
});

test("a future same-day modification cannot advance the trusted snapshot", () => {
  const d = k.normalizeKommoRows([
    ["ID", "Lead stage", "Date Created", "Last Modified", "First payment at"],
    ["1", "New", "21.10.2026 09:00:00", "21.10.2026 23:00:00", "21.10.2026 22:00:00"],
  ], new Date("2026-10-21T12:00:00Z"));
  assert.equal(d.asOf.toISOString(), "2026-10-21T09:00:00.000Z");
  assert.equal(d.leads[0].firstPaymentAt, null);
  assert.ok(d.leads[0].issues.some((i) => i.field === "Last Modified" && i.reason === "future"));
});

test("payment status Not paid never qualifies as a client", () => {
  const d = dataset([{ "Payment status": "Not paid" }, { "Payment status": "Paid" }]);
  assert.equal(a.isClient(d.leads[0]), false);
  assert.equal(a.isClient(d.leads[1]), true);
  assert.equal(a.summarize(d.leads).paidUnknown, 1);
});

test("strict relevance includes unassessed leads in denominator", () => {
  const d = dataset([{ Relevancy: "Relevant" }, { Relevancy: "Not Relevant" }, {}]);
  const s = a.summarize(d.leads);
  assert.equal(s.relevantRate, 1 / 3);
  assert.equal(s.relevantAmongAssessed, 1 / 2);
  assert.equal(s.unassessed, 1);
});

test("source priority preserves UTM Google over Calendly capture", () => {
  const l = dataset([{ "utm_source*": "google", "Marketing Source": "Calendly" }]).leads[0];
  assert.equal(l.source, "Google Ads");
  assert.equal(l.captureMethod, "Calendly");
});

test("unknown UTM token does not override recognized acquisition source", () => {
  const l = dataset([{ "utm_source*": "unmapped-token", "Marketing Source": "Google Ads" }]).leads[0];
  assert.equal(l.source, "Google Ads");
});

test("Meta form evidence maps source while mixed legacy source remains mixed", () => {
  const d = dataset([{ "FB lead id": "987", "Fb is organic": "false" }, { "Marketing Source": "Other (direct email, phone call, referral etc.)" }]);
  assert.equal(d.leads[0].source, "Facebook / Instagram Ads");
  assert.equal(d.leads[1].source, "Direct / email / referral (mixed)");
});

test("bare Meta labels remain unresolved while explicit chat and paid evidence stay separate", () => {
  const cases = [
    [{ "Marketing Source": "Facebook" }, k.KOMMO_META_UNKNOWN_SOURCE, "Not recorded"],
    [{ "Marketing Source": "Instagram" }, k.KOMMO_META_UNKNOWN_SOURCE, "Not recorded"],
    [{ "Marketing Source": "Facebook / Instagram" }, k.KOMMO_META_UNKNOWN_SOURCE, "Not recorded"],
    [{ "Marketing Source": "Facebook", Type: "Othe" }, k.KOMMO_META_UNKNOWN_SOURCE, "Othe"],
    [{ "Marketing Source": "Facebook / Instagram", Type: "Chat" }, k.KOMMO_META_CHAT_SOURCE, k.KOMMO_META_CHAT_SOURCE],
    [{ "Marketing Source": "Instagram", Type: "Chat" }, k.KOMMO_META_CHAT_SOURCE, "Instagram chat"],
    [{ "Marketing Source": "Facebook Messenger" }, k.KOMMO_META_CHAT_SOURCE, "Messenger"],
    [{ "Marketing Source": "Instagram DM" }, k.KOMMO_META_CHAT_SOURCE, "Instagram chat"],
    [{ Type: "Facebook Messenger" }, k.KOMMO_META_CHAT_SOURCE, "Messenger"],
    [{ "Marketing Source": "Facebook ads" }, k.KOMMO_META_ADS_SOURCE, "Not recorded"],
    [{ "Marketing Source": "Instagram advertising" }, k.KOMMO_META_ADS_SOURCE, "Not recorded"],
    [{ "utm_source*": "facebook" }, k.KOMMO_META_UNKNOWN_SOURCE, "Not recorded"],
    [{ first_touch_source: "instagram" }, k.KOMMO_META_UNKNOWN_SOURCE, "Not recorded"],
    [{ "utm_source*": "fb", "utm_medium*": "social" }, k.KOMMO_META_UNKNOWN_SOURCE, "Not recorded"],
    [{ "utm_source*": "ig", "utm_medium*": "paid_social" }, k.KOMMO_META_ADS_SOURCE, "Not recorded"],
    [{ "utm_source*": "fb", "utm_medium*": "cpc", "Marketing Source": "Instagram" }, k.KOMMO_META_ADS_SOURCE, "Not recorded"],
    [{ "utm_tag": "utm_source=ig&utm_medium=paid_social", "Marketing Source": "Facebook" }, k.KOMMO_META_ADS_SOURCE, "Not recorded"],
    [{ "FB lead id": "example-paid", "Fb is organic": "false" }, k.KOMMO_META_ADS_SOURCE, "Meta lead form"],
    [{ "FB lead id": "example-unknown" }, k.KOMMO_META_UNKNOWN_SOURCE, "Meta lead form"],
    [{ "FB lead id": "example-organic", "Fb is organic": "true", "Marketing Source": "Facebook ads" }, "Organic Social", "Meta lead form"],
  ];
  for (const [record, source, capture] of cases) {
    const lead = dataset([record]).leads[0];
    assert.equal(lead.source, source, JSON.stringify(record));
    assert.equal(lead.captureMethod, capture, JSON.stringify(record));
  }
});

test("paid acquisition retains independent chat capture, field priority and source evidence", () => {
  const cases = [
    [{ first_touch_source: "google", "utm_source*": "fb", "utm_medium*": "paid_social", "Marketing Source": "Instagram DM" }, "Google Ads", "first_touch_source", "google", "Instagram chat"],
    [{ "utm_source*": "google", "FB lead id": "paid-id", "Fb is organic": "false", "Marketing Source": "Facebook Messenger" }, "Google Ads", "utm_source", "google", "Messenger"],
    [{ first_touch_source: "fb", "FB lead id": "paid-id", "Fb is organic": "false", "Marketing Source": "Facebook", Type: "Chat" }, k.KOMMO_META_ADS_SOURCE, "first_touch_source", "fb", "Messenger"],
    [{ "utm_source*": "facebook", "utm_tag": "utm_source=fb&utm_medium=paid_social", "Marketing Source": "Instagram", Type: "Chat" }, k.KOMMO_META_ADS_SOURCE, "utm_source", "facebook", "Instagram chat"],
    [{ "FB lead id": "paid-id", "Fb is organic": "false", "Marketing Source": "Facebook chat" }, k.KOMMO_META_ADS_SOURCE, "meta_lead_id", "paid-id", "Messenger"],
  ];
  for (const [record, source, method, raw, capture] of cases) {
    const lead = dataset([record]).leads[0];
    assert.equal(lead.source, source);
    assert.equal(lead.sourceMethod, method);
    assert.equal(lead.sourceRaw, raw);
    assert.equal(lead.captureMethod, capture);
    assert.ok(lead.sourceEvidence.some((value) => value === `captureMethod: ${capture}`));
  }
  const enriched = dataset([{ first_touch_source: "fb", "FB lead id": "paid-id", "Fb is organic": "false" }]).leads[0];
  assert.ok(enriched.sourceEvidence.some((value) => /Fb is organic=false/.test(value)));
});

test("bare platform labels do not override original source or imply chat capture on forms", () => {
  const cases = [
    [{ "Marketing Source": "Facebook", "utm_source*": "google", "FB lead id": "paid", "Fb is organic": false }, "Google Ads", "Meta lead form"],
    [{ "Marketing Source": "Instagram", "FB lead id": "paid", "Fb is organic": false }, k.KOMMO_META_ADS_SOURCE, "Meta lead form"],
    [{ "Marketing Source": "Facebook", "FB lead id": "organic", "Fb is organic": true }, "Organic Social", "Meta lead form"],
    [{ "Marketing Source": "Facebook", "FB lead id": "unknown" }, k.KOMMO_META_UNKNOWN_SOURCE, "Meta lead form"],
    [{ "Marketing Source": "Facebook", "Fb ad id": "ad-only" }, k.KOMMO_META_UNKNOWN_SOURCE, "Not recorded"],
  ];
  for (const [record, source, capture] of cases) {
    const lead = dataset([record]).leads[0];
    assert.equal(lead.source, source);
    assert.equal(lead.captureMethod, capture);
  }
  const uncertain = dataset([{ "Marketing Source": "Facebook" }]).leads[0];
  assert.equal(uncertain.sourceRaw, "Facebook");
  assert.equal(uncertain.sourceMethod, "Marketing Source");
  assert.ok(uncertain.sourceEvidence.some((value) => /not established/.test(value)));
});

test("Meta paid evidence uses the matching source/medium pair and rejects unpaid labels", () => {
  const cases = [
    [{ first_touch_source: "facebook", first_touch_medium: "organic", "utm_source*": "fb", "utm_medium*": "cpc" }, "Organic Social"],
    [{ first_touch_source: "unknown", first_touch_medium: "cpc", "utm_source*": "fb", "utm_medium*": "social" }, k.KOMMO_META_UNKNOWN_SOURCE],
    [{ "utm_source*": "facebook", "utm_medium*": "unpaid_social" }, "Organic Social"],
    [{ "utm_source*": "facebook", "utm_medium*": "not_paid" }, "Organic Social"],
    [{ "utm_source*": "fb", "utm_medium*": "paid_social", "FB lead id": "organic-id", "Fb is organic": "true" }, k.KOMMO_META_ADS_SOURCE],
  ];
  for (const [record, expected] of cases) assert.equal(dataset([record]).leads[0].source, expected);
});

test("cleaning retains original paid Meta acquisition when a later record is a chat", () => {
  const d = dataset([
    { "Marketing Source": "Facebook ads", "Date Created": "01.10.2026", "Last Modified": "02.10.2026", "Work email (contact)": "example@example.com", "Qualified service": "LT citizenship" },
    { "Marketing Source": "Instagram DM", "Date Created": "05.10.2026", "Work email (contact)": "example@example.com", "Qualified service": "LT citizenship" },
  ]);
  const cleaned = k.cleanKommoLeads(d.leads);
  assert.equal(cleaned.records.length, 1);
  assert.equal(cleaned.records[0].source, k.KOMMO_META_ADS_SOURCE);
  assert.equal(cleaned.records[0].sourceRaw, "Facebook ads");
  assert.equal(cleaned.records[0].sourceMethod, "Marketing Source");
  assert.equal(cleaned.records[0].captureMethod, "Instagram chat");
  assert.deepEqual(cleaned.records[0].sourceEvidence, d.leads[0].sourceEvidence);
  assert.deepEqual(cleaned.records[0].mergedIds, ["1", "2"]);
});

test("Created on and Modified on aliases preserve actual export headers and timestamp validation", () => {
  const headers = ["ID", "Lead stage", "Created on", "Modified on", "Marketing Source", "First contact at"];
  const d = k.normalizeKommoRows([headers, ["1", "New", "01.10.2026 10:00:00", "21.10.2026 15:00:00", "Facebook", "01.10.2026 10:30:00"]], now);
  const canonical = dataset([{ "Marketing Source": "Facebook", "First contact at": "01.10.2026 10:30:00" }]);
  assert.equal(d.asOf.toISOString(), canonical.asOf.toISOString());
  for (const field of ["createdAt", "importedAt", "modifiedAt", "firstContactAt"]) assert.equal(d.leads[0][field].toISOString(), canonical.leads[0][field].toISOString());
  assert.equal(d.leads[0].source, k.KOMMO_META_UNKNOWN_SOURCE);
  assert.deepEqual(d.headers, headers);
  assert.ok(d.leads[0].filled.includes("Created on"));
  assert.ok(d.leads[0].filled.includes("Modified on"));
  assert.ok(!d.leads[0].filled.includes("Date Created"));
  assert.ok(!d.leads[0].filled.includes("Last Modified"));
  const both = k.normalizeKommoRows([
    ["ID", "Lead stage", "Date Created", "Created on", "Last Modified", "Modified on"],
    ["1", "New", "01.10.2026", "10.10.2026", "20.10.2026", "21.10.2026"],
  ], now);
  assert.equal(both.leads[0].createdAt.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(both.leads[0].modifiedAt.toISOString(), "2026-10-20T00:00:00.000Z");
  assert.equal(both.asOf.toISOString(), "2026-10-20T00:00:00.000Z");
});

test("duplicate consolidation preserves acquisition and updated relevance", () => {
  const d = dataset([
    { ID: "a", "Date Created": "01.10.2026 10:00:00", "Last Modified": "02.10.2026 12:00:00", "Work email (contact)": "person@example.com", "Qualified service": "LT citizenship", "Marketing Source": "Google Ads", "Reason for Rejection": "Double", Relevancy: "Not Relevant" },
    { ID: "b", "Date Created": "05.10.2026 10:00:00", "Work email (contact)": "person@example.com", "Qualified service": "LT citizenship", "Lead stage": "In work", Relevancy: "Relevant" },
  ]);
  const clean = k.cleanKommoLeads(d.leads);
  assert.equal(clean.records.length, 1);
  assert.equal(clean.records[0].source, "Google Ads");
  assert.equal(clean.records[0].relevancy, "Relevant");
  assert.equal(k.isoDay(clean.records[0].createdAt), "2026-10-01");
  assert.equal(clean.records[0].stage, "In work");
  assert.deepEqual(clean.records[0].mergedIds, ["a", "b"]);
});

test("matching names alone never deduplicate different people", () => {
  const d = dataset(Array.from({ length: 150 }, (_, i) => ({ ID: String(i), "Main contact": "Same name", "Work email (contact)": `person${i}@example.com` })));
  assert.equal(k.cleanKommoLeads(d.leads).records.length, 150);
});

test("a paid stage on an older duplicate remains client evidence after reopening", () => {
  const d = dataset([
    { "Date Created": "01.10.2026 10:00:00", "Last Modified": "02.10.2026 12:00:00", "Work email (contact)": "same@example.com", "Lead stage": "Initial payment received" },
    { "Date Created": "05.10.2026 10:00:00", "Work email (contact)": "same@example.com", "Lead stage": "In work" },
  ]);
  const clean = k.cleanKommoLeads(d.leads).records;
  assert.equal(clean.length, 1);
  assert.equal(clean[0].stage, "In work");
  assert.equal(a.isClient(clean[0]), true);
  assert.equal(a.summarize(clean).paidUnknown, 1);
});

test("different services or distant creation dates remain separate", () => {
  const d = dataset([
    { "Work email (contact)": "same@example.com", "Qualified service": "LT citizenship" },
    { "Work email (contact)": "same@example.com", "Qualified service": "LV citizenship" },
    { "Work email (contact)": "same@example.com", "Qualified service": "LT citizenship", "Date Created": "01.08.2026 10:00:00" },
  ]);
  assert.equal(k.cleanKommoLeads(d.leads).records.length, 3);
});

test("single-day filtering is inclusive and undated rows obey dimension filters", () => {
  const d = dataset([{ "Date Created": "01.10.2026 23:59:59", "Marketing Source": "Google Ads" }, { "Date Created": "02.10.2026 00:00:00" }, { "Date Created": "", "Marketing Source": "Facebook" }]);
  assert.equal(a.filterLeads(d.leads, { ...scope, from: "2026-10-01", to: "2026-10-01" }).length, 1);
  assert.equal(a.filterLeads(d.leads, { ...scope, sources: ["Google Ads"] }).length, 1);
});

test("historical PlanFix loss cannot close currently active Kommo lead", () => {
  const l = dataset([{ "Lead stage": "In work", "Date Created(from Planfix)": "01.08.2026", "Lost at(from Planfix)": "01.09.2026", "Closed at": "not closed" }]).leads[0];
  assert.ok(l.legacyLostAt);
  assert.equal(a.isLost(l), false);
  assert.equal(a.isOpen(l), true);
  assert.equal(a.isOpen({ ...l, closedAt: new Date("2026-10-20") }), false);
});

test("cohorts use dated payment only and mask unobserved horizons", () => {
  const d = dataset([{ "First payment at": "03.10.2026" }, { "Payment status": "Paid" }]);
  const row = a.cohortRows(d.leads, d.asOf, "firstPaymentAt")[0];
  assert.equal(row.cells[0], 0.5);
  assert.equal(row.cells[1], null);
  assert.equal(row.paidUnknown, 1);
});

function cohortDataset(records, snapshot = "2026-11-15T12:00:00Z") {
  const observed = new Date(snapshot);
  const defaults = { "Lead stage": "New", "Date Created": "01.09.2026 10:00:00", "Last Modified": snapshot };
  const headers = [...new Set(["ID", ...Object.keys(defaults), ...records.flatMap(Object.keys)])];
  const rows = records.map((record, index) => headers.map((header) => ({ ID: String(index + 1), ...defaults, ...record })[header] ?? ""));
  return k.normalizeKommoRows([headers, ...rows], observed);
}

test("cohort monthly counts are independent while cumulative fractions preserve the full lead base", () => {
  const d = cohortDataset([
    { "First payment at": "02.09.2026" }, { "First payment at": "02.10.2026" },
    { "First payment at": "01.11.2026" }, { "First payment at": "10.11.2026" },
    { "Payment status": "Paid" }, { "Third payment at": "10.10.2026" }, {}, {}, {}, {},
  ]);
  const [row] = a.cohortRows(d.leads, d.asOf, "firstPaymentAt");
  assert.equal(row.leads, 10);
  assert.deepEqual(row.incrementalCounts, [1, 1, 2, null, null, null]);
  assert.deepEqual(row.cumulativeCounts, [1, 2, 4, null, null, null]);
  assert.deepEqual(row.cells, [0.1, 0.2, 0.4, null, null, null]);
  assert.equal(row.incrementalCounts.reduce((sum, value) => sum + (value ?? 0), 0), 4);
  assert.deepEqual([row.datedEvents, row.undatedEvents, row.eventsBeyondHorizon], [4, 6, 0]);
  assert.equal(row.clients, 6);
  assert.equal(row.paidUnknown, 2);
  assert.equal(row.age, 2);
  assert.equal(row.partial, "2026-11");
});

test("observed zero months stay zero and cumulative conversion does not reset", () => {
  const d = cohortDataset([
    { "First payment at": "02.09.2026" }, { "First payment at": "02.10.2026" },
    { "First payment at": "01.11.2026" }, { "First payment at": "10.11.2026" }, {}, {}, {}, {}, {}, {},
  ], "2027-02-15T12:00:00Z");
  const [row] = a.cohortRows(d.leads, d.asOf, "firstPaymentAt");
  assert.deepEqual(row.incrementalCounts, [1, 1, 2, 0, 0, 0]);
  assert.deepEqual(row.cells, [0.1, 0.2, 0.4, 0.4, 0.4, 0.4]);
  assert.equal(row.datedEvents + row.undatedEvents, row.leads);
});

test("each cohort event uses its own actual timestamp rather than paid or pipeline proxies", () => {
  const d = cohortDataset([
    { "First contact at": "02.09.2026", "Agreement sent at": "02.10.2026", "First payment at": "02.11.2026", "Full payment at": "02.12.2026" },
    { "Lead stage": "Full payment is made", "Payment status": "Fully paid" },
  ], "2027-01-15T12:00:00Z");
  for (const [offset, event] of ["firstContactAt", "agreementSentAt", "firstPaymentAt", "fullPaymentAt"].entries()) {
    const [row] = a.cohortRows(d.leads, d.asOf, event);
    const expected = [0, 0, 0, 0, 0, null];
    expected[offset] = 1;
    assert.deepEqual(row.incrementalCounts, expected);
    assert.equal(row.datedEvents, 1);
    assert.equal(row.undatedEvents, 1);
    assert.equal(row.cells[offset], 0.5);
    assert.equal(row.cells[5], null);
  }
});

test("third-payment evidence without a first-payment date stays separate from timed first-payment counts", () => {
  const d = cohortDataset([{ "Third payment at": "10.10.2026" }, {}], "2026-10-21T12:00:00Z");
  const [row] = a.cohortRows(d.leads, d.asOf, "firstPaymentAt");
  assert.equal(row.clients, 1);
  assert.equal(row.paidUnknown, 1);
  assert.deepEqual(row.incrementalCounts, [0, 0, null, null, null, null]);
  assert.deepEqual(row.cells, [0, 0, null, null, null, null]);
});

test("cohort counts reject invalid, before-creation and future timestamps without inventing M0", () => {
  const d = cohortDataset([
    { "First payment at": "01.11.2026", "Payment status": "Paid" },
    { "First payment at": "01.08.2026" }, { "First payment at": "31.09.2026" },
    { "First payment at": "21.10.2026 12:00:00" },
  ], "2026-10-21T12:00:00Z");
  const injected = [
    ...d.leads,
    { ...d.leads[0], id: "future", firstPaymentAt: new Date("2026-10-21T12:00:01Z") },
    { ...d.leads[0], id: "invalid", firstPaymentAt: new Date(NaN) },
    { ...d.leads[0], id: "earlier", firstPaymentAt: new Date("2026-08-31") },
  ];
  const [row] = a.cohortRows(injected, d.asOf, "firstPaymentAt");
  assert.deepEqual(row.incrementalCounts, [0, 1, null, null, null, null]);
  assert.deepEqual(row.cells, [0, 1 / 7, null, null, null, null]);
  assert.equal(row.datedEvents, 1);
  assert.equal(row.undatedEvents, 6);
  assert.equal(a.cohortEventLag({ ...d.leads[0], firstPaymentAt: new Date(NaN) }, d.asOf, "firstPaymentAt"), null);
});

test("calendar offsets cross month and year boundaries rather than using 30-day windows", () => {
  const d = cohortDataset([{ "Date Created": "31.12.2026 23:00:00", "First payment at": "01.01.2027" }], "2027-01-15T12:00:00Z");
  const [row] = a.cohortRows(d.leads, d.asOf, "firstPaymentAt");
  assert.equal(row.month, "2026-12");
  assert.deepEqual(row.incrementalCounts, [0, 1, null, null, null, null]);
  assert.deepEqual(row.cells, [0, 1, null, null, null, null]);
  const sameDay = cohortDataset([{ "First payment at": "01.09.2026" }]);
  assert.equal(a.cohortRows(sameDay.leads, sameDay.asOf, "firstPaymentAt")[0].incrementalCounts[0], 1);
});

test("service-filtered cohort counts conserve overall events and retain conversions after the creation filter", () => {
  const d = cohortDataset([
    { "Qualified service": "LT citizenship", "First payment at": "02.09.2026" },
    { "Qualified service": "LT citizenship", "First payment at": "02.10.2026" },
    { "Qualified service": "LT citizenship", "Payment status": "Paid" },
    { "Qualified service": "LV citizenship", "First payment at": "02.10.2026" },
    { "Qualified service": "LV citizenship", "First payment at": "02.11.2026" },
  ]);
  const selectedScope = { ...scope, from: "2026-09-01", to: "2026-09-30" };
  const selected = a.filterLeads(d.leads, selectedScope);
  const [overall] = a.cohortRows(selected, d.asOf, "firstPaymentAt");
  const serviceRows = [...new Set(selected.map((lead) => lead.service))].map((service) => {
    const leads = a.filterLeads(d.leads, { ...selectedScope, services: [service] });
    return a.cohortRows(leads, d.asOf, "firstPaymentAt")[0];
  });
  assert.deepEqual(overall.incrementalCounts, [1, 2, 1, null, null, null]);
  assert.deepEqual(serviceRows.map((row) => row.incrementalCounts), [[1, 1, 0, null, null, null], [0, 1, 1, null, null, null]]);
  for (let offset = 0; offset < 3; offset++) {
    assert.equal(serviceRows.reduce((sum, row) => sum + row.incrementalCounts[offset], 0), overall.incrementalCounts[offset]);
  }
  assert.equal(serviceRows.reduce((sum, row) => sum + row.leads, 0), overall.leads);
  assert.equal(serviceRows[0].cells[1], 2 / 3);
  assert.equal(serviceRows[0].paidUnknown, 1);
});

test("overall and each service independently retain their latest ten creation cohorts", () => {
  const records = Array.from({ length: 12 }, (_, index) => ({
    "Date Created": new Date(Date.UTC(2025, 10 + index, 1)).toISOString().slice(0, 10),
    "Qualified service": "LT citizenship",
  }));
  records.push({ "Date Created": "2025-11-01", "Qualified service": "LV citizenship" });
  records.push({ "Date Created": "", "Qualified service": "LV citizenship" });
  const d = cohortDataset(records, "2026-10-21T12:00:00Z");
  const overall = a.cohortRows(d.leads, d.asOf, "firstPaymentAt");
  assert.equal(overall.length, 10);
  assert.equal(overall[0].month, "2026-10");
  assert.equal(overall[9].month, "2026-01");
  const service = d.leads.find((lead) => lead.service.startsWith("Latvian")).service;
  const ownRows = a.cohortRows(a.filterLeads(d.leads, { ...scope, services: [service] }), d.asOf, "firstPaymentAt");
  assert.equal(ownRows.length, 1);
  assert.equal(ownRows[0].month, "2025-11");
  assert.equal(ownRows[0].leads, 1);
  assert.deepEqual(overall[0].incrementalCounts, [0, null, null, null, null, null]);
  assert.deepEqual(a.cohortRows([], d.asOf, "firstPaymentAt"), []);
});

test("dated events beyond M5 are counted separately rather than moved into the displayed horizon", () => {
  const d = cohortDataset([{ "Date Created": "01.01.2026", "First payment at": "01.09.2026" }], "2026-10-21T12:00:00Z");
  const [row] = a.cohortRows(d.leads, d.asOf, "firstPaymentAt");
  assert.deepEqual(row.incrementalCounts, [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(row.cells, [0, 0, 0, 0, 0, 0]);
  assert.deepEqual([row.datedEvents, row.undatedEvents, row.eventsBeyondHorizon], [1, 0, 1]);
});

test("payment events include earlier creation cohorts and are not false-comparable", () => {
  const d = dataset([{ "Date Created": "01.08.2026", "First payment at": "20.09.2026" }, { "Date Created": "01.09.2026" }]);
  const s = { ...scope, from: "2026-09-01", to: "2026-09-30" };
  const row = a.financeComparison(a.filterLeads(d.leads, s), { monthly: [], channelCosts: [] }, s, d.leads)[0];
  assert.equal(row.leads, 1);
  assert.equal(row.paidEvents, 1);
  assert.equal(row.comparable, false);
});

test("finance spending is allocated by channel and month and not invented", () => {
  const d = dataset([{ "Date Created": "01.09.2026", "Marketing Source": "Google Ads", "Qualified service": "LT citizenship" }, { "Date Created": "10.09.2026", "Marketing Source": "Google Ads", "Qualified service": "LV citizenship" }]);
  const s = { ...scope, from: "2026-09-01", to: "2026-09-30" };
  const finance = { monthly: [], channelCosts: [{ month: "2026-09", source: "Google Ads", category: "Google", amount: 1000 }] };
  const rows = a.performanceRows(d.leads, d.leads, finance, s, "service");
  assert.deepEqual(rows.map((r) => r.spend), [500, 500]);
  assert.equal(rows.reduce((n, r) => n + r.spend, 0), 1000);
  const partial = a.performanceRows(d.leads, d.leads, finance, { ...s, from: "2026-09-02" }, "source");
  assert.equal(partial[0].spend, null);
  assert.equal(a.performanceRows(d.leads, d.leads, { monthly: [], channelCosts: [] }, s, "source")[0].cac, null);
  const october = dataset([{ "Marketing Source": "Google Ads" }]);
  const octoberCosts = { monthly: [], channelCosts: [{ month: "2026-10", source: "Google Ads", category: "Google", amount: 1000 }] };
  assert.equal(a.performanceRows(october.leads, october.leads, octoberCosts, { ...s, from: "2026-10-01", to: "2026-10-31" }, "source")[0].spend, null);
});

test("numeric XLSX dates and reordered columns retain field meaning", () => {
  const d = dataset([{ "Date Created": 46296, "Marketing Source": "Google Ads", "Qualified service": "LV RBI Real Estate" }]);
  assert.ok(d.leads[0].createdAt);
  assert.equal(d.leads[0].source, "Google Ads");
  assert.equal(d.leads[0].service, "Latvia RBI through real estate");
});

test("unallocated marketing overhead is not attributed to an Other acquisition channel", () => {
  const costs = a.financeForScope({ monthly: [], channelCosts: [
    { month: "2026-04", category: "Other marketing cost", source: "Other", amount: 2500 },
    { month: "2026-04", category: "Google", source: "Google Ads", amount: 5000 },
  ] }, scope);
  assert.equal(costs.channelCosts.length, 1);
  assert.equal(costs.channelCosts[0].source, "Google Ads");
});

test("CSV parsing preserves UTF-8 and refuses a PlanFix export", async () => {
  const csv = 'ID,Lead stage,Date Created,Main contact\n1,New,01.10.2026,Тест Имя\n';
  const d = await k.parseKommoWorkbook(new TextEncoder().encode(csv).buffer);
  assert.equal(d.leads[0].contact, "Тест Имя");
  await assert.rejects(k.parseKommoWorkbook(new TextEncoder().encode('ID,Статус\n1,NEW').buffer), /No Kommo/);
  assert.equal(XLSX.utils.aoa_to_sheet([["ID"]]).A1.v, "ID");
});
