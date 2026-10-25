/* eslint-disable @typescript-eslint/no-require-imports -- Match the existing in-memory TypeScript test loader. */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path);

const k = require("../lib/kommo.ts");
const a = require("../lib/kommo-analytics.ts");
const { buildKommoEvidence: build, kommoMetricDescription: description, kommoMetricFields: metricFields } = require("../lib/kommo-metric-evidence.ts");
const NOW = new Date("2026-10-21T18:00:00Z");
const METRICS = ["all", "relevant", "assessed", "unassessed", "relevantAmongAssessed", "qualified", "agreement", "clients", "fullPaid", "signed", "response", "contactSla", "noContact", "overdue", "noTask", "sales", "payments", "touches", "datedEvent", "paidUnknown"];
const SCOPE = { from: "", to: "", services: [], sources: [], owners: [], origin: "all" };

function dataset(records) {
  const defaults = { "Lead stage": "New", "Date Created": "01.10.2026 10:00:00", "Last Modified": "21.10.2026 15:00:00", "Lead resp. user": "Manager A" };
  const headers = [...new Set(["ID", ...Object.keys(defaults), ...records.flatMap(Object.keys)])];
  return k.normalizeKommoRows([headers, ...records.map((record, index) => headers.map((header) => ({ ID: String(index + 1), ...defaults, ...record })[header] ?? ""))], NOW);
}
const ids = (rows) => rows.map((row) => row.id);
const segment = (evidence, id) => evidence.segments.find((entry) => entry.id === id);

test("all count/rate populations agree with summarize and preserve the selected denominator", () => {
  const d = dataset([
    { Relevancy: "Relevant", "Lead stage": "In work" },
    { Relevancy: "Not Relevant", "Lead stage": "Retainer sent" },
    { Relevancy: " No Relevant ", "Payment 2": 40 },
    { Relevancy: "maybe", "Payment status": "Not paid" },
    { Relevancy: " rEleVanT ", "Lead stage": "Full payment is made" },
    { "Agreement signed at": "10.10.2026" },
    { "First payment at": "03.10.2026" },
    { "Payment status": "Paid" }, {},
  ]);
  const s = a.summarize(d.leads);
  const counts = { all: s.leads, relevant: s.relevant, assessed: s.assessed, unassessed: s.unassessed,
    qualified: s.qualified, agreement: s.agreements, clients: s.clients, fullPaid: s.fullPaid,
    signed: s.signedDated, paidUnknown: s.paidUnknown };
  for (const [metric, expected] of Object.entries(counts)) {
    const evidence = build(metric, d.leads, { asOf: d.asOf, scope: "Current creation filter" });
    assert.equal(evidence.rows.length, expected, metric);
    assert.equal(evidence.numerator, expected, metric);
    assert.equal(evidence.denominator, d.leads.length, metric);
    assert.deepEqual(ids(evidence.baseRows), d.leads.map((lead) => lead.id));
    assert.equal(evidence.scope, "Current creation filter");
  }
  const assessed = build("relevantAmongAssessed", d.leads, {});
  assert.equal(assessed.rows.length, s.relevant);
  assert.equal(assessed.baseRows.length, s.assessed);
  assert.equal(assessed.numerator / assessed.denominator, s.relevantAmongAssessed);
});

test("relevance segments distinguish explicit negative assessments from blank and malformed values", () => {
  const d = dataset([
    { Relevancy: " Relevant " }, { Relevancy: "NOT RELEVANT" }, { Relevancy: "no relevant" },
    {}, { Relevancy: "  " }, { Relevancy: "Irrelevant" }, { Relevancy: "Relevant?" },
  ]);
  for (const metric of ["relevant", "assessed", "relevantAmongAssessed"]) {
    const evidence = build(metric, d.leads, {});
    assert.deepEqual(ids(segment(evidence, "unassessed").rows), ["4", "5", "6", "7"]);
    assert.deepEqual(ids(segment(evidence, "notRelevant").rows), ["2", "3"]);
    assert.equal(evidence.rows.filter((row) => row.relevancy === "Relevant").length, 1);
  }
  assert.deepEqual(ids(build("unassessed", d.leads, {}).rows), ["4", "5", "6", "7"]);
  assert.equal(build("clients", d.leads, {}).segments, undefined);
});

test("response sample sorts calendar minutes and matches median, P90 and native coverage", () => {
  const d = dataset([
    { "First contact at": "01.10.2026 11:01:00" },
    { "First contact at": "01.10.2026 10:00:00" },
    { "First contact at": "01.10.2026 11:00:00" },
    { "First contact at": "01.10.2026 10:30:00", "Old Lead ID": "old" },
    { "First contact at": "01.10.2026 09:59:00" },
    { "Lead stage": "First contact" }, {},
  ]);
  const evidence = build("response", d.leads, { asOf: d.asOf });
  assert.deepEqual(ids(evidence.rows), ["2", "3", "1"]);
  assert.deepEqual(evidence.rows.map((row) => row.fields.responseMinutes), ["0", "60", "61"]);
  assert.equal(evidence.numerator, a.summarize(d.leads).responseSample);
  assert.equal(evidence.denominator, a.summarize(d.leads).native);
  assert.equal(evidence.numerator / evidence.denominator, a.summarize(d.leads).responseCoverage);
  const values = evidence.rows.map((row) => Number(row.fields.responseMinutes));
  assert.equal(a.quantile(values), a.summarize(d.leads).responseMedian);
  assert.equal(a.quantile(values, 0.9), a.summarize(d.leads).responseP90);
});

test("SLA denominator is measured native contacts and boundary/zero thresholds are inclusive", () => {
  const d = dataset([
    { "First contact at": "01.10.2026 10:00:00" },
    { "First contact at": "01.10.2026 11:00:00" },
    { "First contact at": "01.10.2026 11:00:01" },
    { "First contact at": "01.10.2026 10:30:00", "Old Lead ID": "legacy" }, {},
  ]);
  const evidence = build("contactSla", d.leads, { asOf: d.asOf, sla: 60 });
  assert.deepEqual(ids(evidence.rows), ["1", "2"]);
  assert.deepEqual(ids(evidence.baseRows), ["1", "2", "3"]);
  assert.equal(evidence.numerator / evidence.denominator, a.managerRows(d.leads, d.asOf, 60, 7)[0].slaRate);
  assert.equal(evidence.rows[1].fields.slaMinutes, "60");
  assert.equal(evidence.rows[1].fields.withinSla, "true");
  const zero = build("contactSla", d.leads, { sla: 0, asOf: d.asOf });
  assert.deepEqual(ids(zero.rows), ["1"]);
  assert.equal(zero.rows[0].fields.slaMinutes, "0");
});

test("manager evidence follows exact open/contact/task rules, including strict overdue boundary", () => {
  const d = dataset([
    { ID: "uncontacted", "Next Task": "21.10.2026 14:59:59" },
    { ID: "boundary", "Next Task": "21.10.2026 15:00:00" },
    { ID: "future", "Next Task": "22.10.2026" },
    { ID: "stage-contact", "Lead stage": "First contact" },
    { ID: "qualified", "Lead stage": "In work" },
    { ID: "migrated", "Old Lead ID": "old" },
    { ID: "lost", "Lead stage": "Closed lost", "Next Task": "20.10.2026" },
    { ID: "won", "Lead stage": "Won" },
    { ID: "closed", "Closed at": "20.10.2026" },
    { ID: "complete", "TD_Lawyer has completed the work": "20.10.2026" },
    { ID: "undated", "Date Created": "", "Lead resp. user": "Manager B" },
  ]);
  const managers = a.managerRows(d.leads, d.asOf, 60, 7);
  for (const metric of ["noContact", "overdue", "noTask"]) {
    const evidence = build(metric, d.leads, { asOf: d.asOf });
    assert.equal(evidence.rows.length, managers.reduce((sum, manager) => sum + manager[metric], 0));
    assert.equal(evidence.denominator, d.leads.length);
  }
  assert.deepEqual(ids(build("overdue", d.leads, { asOf: d.asOf }).rows), ["uncontacted"]);
  assert.deepEqual(ids(build("noContact", d.leads, { asOf: d.asOf }).rows), ["uncontacted", "boundary", "future", "undated"]);
  assert.deepEqual(ids(build("noTask", d.leads, { asOf: d.asOf }).rows), ["stage-contact", "qualified", "migrated", "undated"]);
  assert.deepEqual(ids(build("overdue", d.leads, { raw: d.leads }).rows), ["uncontacted"], "default snapshot uses observed export times");
});

test("sales and payment sums match summarize without removing zero, null or negative amounts", () => {
  const d = dataset([
    { ID: "excluded-sale", Sale: 999, "Payment 1": -2 },
    { ID: "paid", Sale: 100, "Payment 1": 10, "Payment 2": 5 },
    { ID: "signed", Sale: 50, "Agreement signed at": "10.10.2026", "Payment 1": 0 },
    { ID: "won", Sale: 20, "Lead stage": "Won" },
    { ID: "zero", Sale: 0, "Payment status": "Fully paid" },
    { ID: "null", "Payment status": "Paid", "Payment 2": "malformed" },
    { ID: "negative", Sale: -5, "Payment status": "Paid", "Payment 3": -3 },
  ]);
  const sales = build("sales", d.leads, {});
  assert.deepEqual(ids(sales.rows), ["paid", "signed", "won", "zero", "null", "negative"]);
  assert.equal(sales.numerator, 165);
  assert.equal(sales.numerator, a.summarize(d.leads).sales);
  assert.equal(sales.rows.reduce((sum, row) => sum + Number(row.fields.saleContribution), 0), sales.numerator);
  assert.equal(sales.rows.find((row) => row.id === "zero").fields.sale, "0");
  assert.equal(sales.rows.find((row) => row.id === "null").fields.sale, "");
  assert.equal(sales.denominator, undefined);
  const payments = build("payments", d.leads, {});
  assert.equal(payments.rows.length, d.leads.length);
  assert.equal(payments.numerator, 10);
  assert.equal(payments.numerator, a.summarize(d.leads).paymentAmount);
  assert.equal(payments.rows.reduce((sum, row) => sum + Number(row.fields.paymentAmount), 0), payments.numerator);
  assert.deepEqual(JSON.parse(payments.rows.find((row) => row.id === "null").fields.payments), [0, 0, 0]);
  assert.equal(payments.denominator, undefined);
});

test("touches uses the median sample, keeping zero while excluding missing and malformed counters", () => {
  const d = dataset([{ "Touches made": 100 }, {}, { "Touches made": "bad" }, { "Touches made": 0 }, { "Touches made": 1 }, { "Touches made": 2 }]);
  const evidence = build("touches", d.leads, {});
  assert.deepEqual(evidence.rows.map((row) => row.fields.touches), ["0", "1", "2", "100"]);
  assert.equal(evidence.numerator, 1.5);
  assert.equal(evidence.numerator, a.summarize(d.leads).touchesMean);
  assert.equal(evidence.denominator, undefined);
  assert.equal(evidence.baseRows.length, 6);
  assert.equal(build("touches", dataset([{}]).leads, {}).numerator, undefined);
});

test("dated event evidence uses the chosen cohort predicate and never invents dates from payment status", () => {
  const d = dataset([
    { "First payment at": "01.10.2026", "First contact at": "01.10.2026 10:10:00", "Full payment at": "05.10.2026" },
    { "First payment at": "22.10.2026", "Agreement sent at": "05.10.2026" },
    { "First payment at": "30.09.2026" },
    { "First payment at": "31.02.2026" },
    { "Payment status": "Paid" },
    { "Date Created": "", "First payment at": "10.10.2026" },
    { "First payment at": "10.10.2026", "Old Lead ID": "old" },
  ]);
  for (const event of ["firstContactAt", "agreementSentAt", "firstPaymentAt", "fullPaymentAt"]) {
    const evidence = build("datedEvent", d.leads, { event, asOf: d.asOf });
    assert.deepEqual(ids(evidence.rows), d.leads.filter((lead) => a.cohortEventLag(lead, d.asOf, event) !== null).map((lead) => lead.id));
    assert.ok(evidence.fields.includes(event));
    assert.ok(evidence.rows.every((row) => row.fields.event === event));
  }
  const first = build("datedEvent", d.leads, { asOf: d.asOf });
  assert.deepEqual(ids(first.rows), ["1", "7"]);
  assert.equal(first.rows[0].fields.selectedEventAt, "2026-10-01T00:00:00.000Z");
  assert.equal(first.denominator, d.leads.length);
  assert.equal(build("paidUnknown", d.leads, {}).rows.length, a.summarize(d.leads).paidUnknown);
});

test("cohort checks also reject bad normalized dates and accept same-day date-only events", () => {
  const d = dataset([{}, {}, {}, {}]);
  d.leads[0].firstPaymentAt = new Date(NaN);
  d.leads[1].firstPaymentAt = new Date("2026-09-30T23:59:59Z");
  d.leads[2].firstPaymentAt = new Date("2026-10-22T00:00:00Z");
  d.leads[3].firstPaymentAt = new Date("2026-10-01T00:00:00Z");
  assert.deepEqual(ids(build("datedEvent", d.leads, { asOf: d.asOf }).rows), ["4"]);
});

test("raw history covers the entire denominator, including duplicate IDs and source rows outside filters", () => {
  const d = dataset([
    { ID: "old", "Date Created": "01.09.2026", "Last Modified": "02.09.2026", "Work email (contact)": "same@example.com", "Qualified service": "LT citizenship", "Lead resp. user": "Former owner", "Lead stage": "Initial payment received", "Marketing Source": "Google Ads", Relevancy: "Not Relevant", "Reason for Rejection": "Double", "First payment at": "31.02.2026" },
    { ID: "old", "Date Created": "01.09.2026", "Last Modified": "03.09.2026", "Work email (contact)": "same@example.com", "Qualified service": "LT citizenship", "Lead resp. user": "Former owner", "Lead stage": "Initial payment received", "Marketing Source": "Google Ads", Relevancy: "Not Relevant", "Reason for Rejection": "Double", "First payment at": "31.02.2026" },
    { ID: "new", "Date Created": "20.09.2026", "Work email (contact)": "same@example.com", "Qualified service": "LT citizenship", "Lead resp. user": "Current owner", "Lead stage": "In work", Relevancy: "Relevant", Sale: 0 },
    { ID: "negative", "Date Created": "01.09.2026", "Qualified service": "LT citizenship", "Lead resp. user": "Current owner", Relevancy: "Not Relevant", "Marketing Source": "Google Ads" },
    { ID: "outside", "Date Created": "01.08.2026", "Work email (contact)": "same@example.com", "Qualified service": "LT citizenship", "Lead resp. user": "Current owner", "Marketing Source": "Google Ads" },
  ]);
  const clean = k.cleanKommoLeads(d.leads).records;
  const selected = a.filterLeads(clean, { ...SCOPE, from: "2026-09-01", to: "2026-09-01", owners: ["Current owner"] });
  const evidence = build("relevant", selected, { raw: d.leads, asOf: d.asOf });
  assert.equal(evidence.rows.length, 1);
  assert.equal(evidence.baseRows.length, 2);
  assert.deepEqual(ids(evidence.rawRows), ["old", "old", "new", "negative"]);
  assert.equal(new Set(evidence.rawRows.map((row) => row.key)).size, 4);
  assert.ok(evidence.rawRows.some((row) => row.owner === "Former owner"));
  assert.equal(evidence.rows[0].stage, "In work");
  assert.deepEqual(JSON.parse(evidence.rows[0].fields.reachedStages), ["Initial payment received", "In work"]);
  assert.deepEqual(evidence.rows[0].mergedIds, ["old", "new"]);
  assert.equal(evidence.rows[0].source, "Google Ads");
  assert.equal(evidence.rows[0].fields.sourceRaw, "Google Ads");
  assert.equal(evidence.rows[0].fields.sourceMethod, "Marketing Source");
  assert.equal(JSON.parse(evidence.rows[0].fields.issues)[0].raw, "31.02.2026");
  assert.match(evidence.notice, /outside current filters/);
  assert.match(evidence.notice, /normalized export records/);
  assert.match(evidence.notice, /differ/);
});

test("assessed/SLA raw history follows their denominator, not only the numerator", () => {
  const d = dataset([{ Relevancy: "Relevant", "First contact at": "01.10.2026 10:10:00" },
    { Relevancy: "Not Relevant", "First contact at": "01.10.2026 12:00:00" }, {}]);
  const relevance = build("relevantAmongAssessed", d.leads, { raw: d.leads });
  assert.deepEqual(ids(relevance.rawRows), ["1", "2"]);
  assert.deepEqual(ids(segment(relevance, "unassessed").rows), ["3"]);
  const sla = build("contactSla", d.leads, { raw: d.leads, sla: 60 });
  assert.deepEqual(ids(sla.rows), ["1"]);
  assert.deepEqual(ids(sla.rawRows), ["1", "2"]);
});

test("all evidence rows expose normalized audit values and descriptions are cheap, human, bilingual lookups", () => {
  const d = dataset([{ "Main contact": "Original CRM Name", "Work email (contact)": "Person@Example.com", "Mobile phone (contact)": "+359 123456789", "Payment 1": 0, "Touches made": 0 }]);
  for (const metric of METRICS) {
    for (const language of ["en", "ru"]) {
      const evidence = build(metric, d.leads, { asOf: d.asOf, language });
      assert.equal(evidence.description, description(metric, language));
      assert.ok(evidence.title && evidence.formula && evidence.notice);
      assert.doesNotMatch(evidence.description, /summarize\(|managerRows|isQualified|responseMinutes|hasContact/);
      for (const row of [...evidence.rows, ...evidence.baseRows]) {
        assert.equal(row.name, "Original CRM Name");
        assert.equal(row.fields.email, "person@example.com");
        assert.equal(row.fields.phone, "+359 123456789");
        assert.equal(row.fields.touches, "0");
        for (const field of evidence.fields) assert.equal(typeof row.fields[field], "string", `${metric}: ${field}`);
      }
    }
    assert.notEqual(description(metric, "en"), description(metric, "ru"));
    const fields = metricFields(metric);
    fields.push("caller-owned");
    assert.ok(!metricFields(metric).includes("caller-owned"));
  }
  assert.match(description("qualified", "ru"), /Relevant сам по себе недостаточен/);
  assert.equal(build("all", d.leads).rawRows, undefined);
});

test("empty populations, zero-valued counters and missing signature columns stay distinguishable", () => {
  for (const metric of METRICS) {
    const evidence = build(metric, [], { raw: [], asOf: NOW });
    assert.deepEqual(evidence.rows, []);
    assert.deepEqual(evidence.baseRows, []);
    assert.deepEqual(evidence.rawRows, []);
    if (!["sales", "payments", "touches"].includes(metric)) assert.equal(evidence.denominator, 0);
  }
  const d = dataset([{}]);
  assert.match(build("signed", d.leads, {}).notice, /availability requires the export headers/);
  assert.equal(build("signed", d.leads, {}).numerator, 0);
  assert.equal(build("touches", dataset([{ "Touches made": 0 }]).leads, {}).numerator, 0);
  assert.equal(build("payments", [], {}).numerator, 0);
});

test("building or editing evidence never changes CRM records, arrays or cleanup results", () => {
  const d = dataset([{ Relevancy: "Relevant", "First contact at": "01.10.2026 10:30:00", "Touches made": 0 }, { Relevancy: "Not Relevant" }]);
  const before = JSON.stringify(d);
  function freeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const child of Object.values(value)) freeze(child);
    }
  }
  freeze(d);
  for (const metric of METRICS) {
    const evidence = build(metric, d.leads, { raw: d.leads, asOf: d.asOf });
    for (const row of [...evidence.rows, ...evidence.baseRows, ...evidence.rawRows]) {
      row.mergedIds.push("external-edit");
      row.fields.source = "external-edit";
    }
  }
  assert.equal(JSON.stringify(d), before);
});
