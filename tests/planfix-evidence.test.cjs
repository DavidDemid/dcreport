/* eslint-disable @typescript-eslint/no-require-imports -- Node tests load the existing TypeScript modules in memory. */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(source, filename);
};

const crm = require("../lib/crm.ts");
const analytics = require("../lib/analytics.ts");
const { buildPlanfixMetricEvidence: evidence, planfixMetricDescription } = require("../lib/planfix-metric-evidence.ts");
const rates = {
  relevant: ["relevantStrictRate", analytics.isRelevantStrict],
  rejected: ["rejectedRate", analytics.isRejected],
  qualified: ["qualifiedActiveRate", analytics.isQualifiedActive],
  agreementSent: ["agreementSentRate", analytics.hasAgreementSent],
  agreementSigned: ["agreementSignedRate", analytics.hasAgreementSigned],
  clients: ["clientRate", analytics.isClient],
  fullPaid: ["fullPaidClientRate", analytics.isFullPaidClient],
};

function lead(id, patch = {}) {
  const [record] = crm.normalizeRows([
    ["ID", "Counterparty", "Title", "Creation date", "Status", "Relevant", "Assignee", "Service group", "Country", "UTM tag", "Google Client ID", "Language", "Type", "Email", "Reason for Rejection", "Name"],
    [id, `Person ${id}`, `Lead ${id}`, "2026-09-01", "NEW", "", "Owner", "LT citizenship", "LT", "", "", "EN", "Lead", `person-${id}@example.com`, "", "Google Ads"],
  ]);
  return { ...record, ...patch };
}

function assertRatesMatch(records) {
  const summary = analytics.buildAnalytics(records);
  for (const [key, [property, predicate]] of Object.entries(rates)) {
    const result = evidence(key, records);
    const matching = records.filter(predicate);
    assert.equal(result.numerator, matching.length, key);
    assert.equal(result.denominator, records.length, key);
    assert.deepEqual(result.rows.map(row => row.id), matching.map(record => record.id), key);
    assert.equal(result.baseRows.length, records.length, key);
    assert.equal(records.length ? result.numerator / records.length : 0, summary[property], key);
  }
}

test("PlanFix evidence reuses exact analytics predicates, including negative assessments and status proxies", () => {
  const records = [
    lead("relevant", { relevant: " RELEVANT ", status: "REJECTED" }),
    lead("negative", { relevant: "Not Relevant", status: "FULL PAYMENT IS MADE", firstContactAt: new Date("2026-09-02") }),
    lead("active", { status: "IN WORK" }),
    lead("response", { firstResponseAt: new Date("2026-09-02") }),
    lead("sent", { agreementSentAt: new Date("2026-09-03") }),
    lead("signed", { agreementSignedAt: new Date("2026-09-04") }),
    lead("paid", { firstPaymentAt: new Date("2026-09-05") }),
    lead("completed", { completedAt: new Date("2026-09-06") }),
    lead("lost", { lostAt: new Date("2026-09-07") }),
    lead("new"),
  ];
  assertRatesMatch(records);
});

test("current nonempty payment_status behavior is exposed, not silently corrected or called verified payment", () => {
  const records = [lead("not-paid", { paymentStatus: "Not paid" }), lead("empty")];
  assertRatesMatch(records);
  for (const metric of ["clients", "agreementSigned", "signedValue"]) {
    const result = evidence(metric, records);
    assert.deepEqual(result.rows.map(row => row.id), ["not-paid"]);
    assert.equal(result.rows[0].fields.payment_status, "Not paid");
    assert.match(result.notice, /any nonempty payment_status/);
    assert.match(result.notice, /not a verified payment or signature/);
  }
});

test("duplicate evidence matches analytics at the 30-day boundary without moving the accepted anchor", () => {
  const identity = { email: "same@example.com", reportingService: "Same service" };
  const records = [
    lead("after-window", { ...identity, createdAt: new Date("2026-03-04"), rowNumber: 5 }),
    lead("boundary", { ...identity, createdAt: new Date("2026-01-31"), rowNumber: 3 }),
    lead("anchor", { ...identity, createdAt: new Date("2026-01-01"), rowNumber: 2 }),
    lead("new-anchor", { ...identity, createdAt: new Date("2026-02-01"), rowNumber: 4 }),
    lead("other-service", { ...identity, reportingService: "Other service", createdAt: new Date("2026-01-02"), rowNumber: 6 }),
    lead("undated", { ...identity, createdAt: null, rowNumber: 7 }),
    lead("flagged", { duplicateFlag: "yes", rowNumber: 8 }),
    lead("double", { rejectionReason: " double ", rowNumber: 9 }),
  ];
  const originalOrder = records.map(record => record.id);
  const result = evidence("duplicates", records);
  const summary = analytics.buildAnalytics(records);
  assert.deepEqual(result.rows.map(row => row.id), ["boundary", "flagged", "double"]);
  assert.equal(result.numerator / result.denominator, summary.duplicateRate);
  assert.equal(result.rows[0].fields["matchingBaseId (derived)"], "anchor");
  assert.equal(result.rows[0].fields["matchingBaseRow (derived)"], "2");
  assert.deepEqual(records.map(record => record.id), originalOrder);
});

test("duplicate evidence preserves repeated references, repeated IDs and stable row keys", () => {
  const same = lead("same", { email: "same@example.com", rowNumber: 20 });
  const records = [same, same, lead("same", { email: "another@example.com", rowNumber: 21 })];
  const result = evidence("duplicates", records);
  assert.equal(result.numerator, 1);
  assert.equal(result.numerator / result.denominator, analytics.buildAnalytics(records).duplicateRate);
  assert.equal(new Set(result.baseRows.map(row => row.key)).size, records.length);
});

test("evidence uses only supplied filtered rows for each channel and cleanup mode", () => {
  const records = [
    lead("first", { email: "shared@example.com", createdAt: new Date("2026-09-01"), relevant: "Not Relevant", rowNumber: 2 }),
    lead("working", { email: "shared@example.com", createdAt: new Date("2026-09-05"), relevant: "Relevant", firstPaymentAt: new Date("2026-09-08"), rowNumber: 3 }),
    lead("other-channel", { source: "Bing Ads", relevant: "Relevant", rowNumber: 4 }),
  ];
  for (const selected of [records, crm.cleanLeadRecords(records).records]) {
    const filtered = selected.filter(record => record.source === "Google Ads");
    assertRatesMatch(filtered);
    const result = evidence("leads", filtered, { scope: "Google Ads / September" });
    assert.equal(result.numerator, filtered.length);
    assert.equal(result.denominator, undefined);
    assert.equal(result.scope, "Google Ads / September");
    assert(result.baseRows.every(row => row.source === "Google Ads"));
    assert(!result.baseRows.some(row => row.id === "other-channel"));
    assert.equal(result.rawRows, undefined);
    assert(result.baseRows.every(row => row.mergedIds.length === 0));
    assert.match(result.notice, /merged-history IDs are not retained/);
  }
});

test("CRM signed value matches analytics, preserves missing/zero/negative amounts, and does not use finance", () => {
  const records = [
    lead("positive", { agreementSignedAt: new Date("2026-09-02"), dealValueActual: 1200 }),
    lead("missing", { status: "INITIAL PAYMENT RECEIVED" }),
    lead("zero", { paymentStatus: "paid", dealValueActual: 0 }),
    lead("negative", { fullPaymentAt: new Date("2026-09-03"), dealValueActual: -20 }),
    lead("unsigned", { dealValueActual: 9000 }),
  ];
  const result = evidence("signedValue", records);
  assert.equal(result.numerator, 1180);
  assert.equal(result.numerator, analytics.buildAnalytics(records).crmSignedSalesValue);
  assert.equal(result.denominator, undefined);
  assert.deepEqual(result.rows.map(row => row.id), ["positive", "missing", "zero", "negative"]);
  assert.deepEqual(result.rows.map(row => row.fields.deal_value_actual), ["1200", "", "0", "-20"]);
  assert.match(result.description, /not finance revenue/);
});

test("field values and IDs remain unchanged while presentation copy is localized", () => {
  const record = lead("raw-id", { relevant: " Relevant ", paymentStatus: "Not paid", assignee: "Clients", counterparty: "Relevant", source: "Google Ads", firstPaymentAt: new Date("2026-09-02T13:14:15Z") });
  const en = evidence("clients", [record]);
  const ru = evidence("clients", [record], { language: "ru" });
  assert.deepEqual(en.rows, ru.rows);
  assert.equal(ru.rows[0].id, "raw-id");
  assert.equal(ru.rows[0].name, "Relevant");
  assert.equal(ru.rows[0].owner, "Clients");
  assert.equal(ru.rows[0].relevancy, " Relevant ");
  assert.equal(ru.rows[0].fields.first_payment_at, "2026-09-02T13:14:15.000Z");
  assert.equal(ru.rows[0].fields.payment_status, "Not paid");
  assert.match(ru.title, /Клиенты/);
  assert.match(planfixMetricDescription("clients", "ru"), /непустой payment_status/);
  assert(!JSON.stringify(ru).includes("https://"));
});

test("all evidence metrics support empty inputs without fabricated rows or rates", () => {
  assertRatesMatch([]);
  for (const key of ["leads", ...Object.keys(rates), "duplicates", "signedValue"]) {
    const result = evidence(key, []);
    assert.equal(result.numerator, 0);
    assert.deepEqual(result.rows, []);
    assert.deepEqual(result.baseRows, []);
    assert.equal(result.rawRows, undefined);
  }
});
