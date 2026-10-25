/* eslint-disable @typescript-eslint/no-require-imports -- Node's CJS test runner loads the existing TypeScript sources in memory. */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, path) => {
  const source = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(source, path);
};
const k = require("../lib/kommo.ts");
const a = require("../lib/kommo-analytics.ts");
const { matchedFinancePerformance: performance } = require("../lib/kommo-finance.ts");
const { parseFinanceWorkbook } = require("../lib/finance.ts");
const XLSX = require("xlsx");
const asOf = new Date("2026-10-21T15:00:00Z");
const scope = { from: "", to: "", services: [], sources: [], owners: [], origin: "all" };

function dataset(records) {
  const headers = [...new Set(["ID", "Lead stage", "Date Created", "Last Modified", "Marketing Source", ...records.flatMap(Object.keys)])];
  const rows = records.map((record, index) => headers.map((header) => ({
    ID: String(index + 1), "Lead stage": "New", "Date Created": "10.09.2026",
    "Last Modified": "21.10.2026 15:00:00", "Marketing Source": "Google Ads", ...record,
  })[header] ?? ""));
  return k.normalizeKommoRows([headers, ...rows], asOf).leads;
}

function finance(costs) {
  return { monthly: [], channelCosts: costs.map(([month, source, amount, category = source]) => ({ month, source, amount, category })) };
}

const september = { ...scope, from: "2026-09-01", to: "2026-09-30" };

test("all-history counts remain intact while costs and ratios use matching creation cohorts only", () => {
  const leads = dataset([
    { "Date Created": "01.03.2026", "Payment status": "Fully paid", Sale: "900000" },
    { "Date Created": "01.04.2026", Relevancy: "Relevant", "Payment status": "Fully paid" },
    { "Date Created": "01.05.2026", "Lead stage": "In work" },
    { "Date Created": "01.09.2026", "Agreement sent at": "02.09.2026" },
    { "Date Created": "01.10.2026", "Payment status": "Paid" },
  ]);
  const costs = finance([["2026-04", "Google Ads", 100], ["2026-09", "Google Ads", 200], ["2026-10", "Google Ads", 900]]);
  const [row] = performance(leads, leads, costs, scope, "source", asOf);
  assert.deepEqual({ leads: row.leads, clients: row.clients, qualified: row.qualified, relevant: row.relevant },
    { leads: 5, clients: 3, qualified: 5, relevant: 1 });
  assert.equal(row.relevantRate, a.summarize(leads).relevantRate);
  assert.equal(row.qualifiedRate, a.summarize(leads).qualifiedRate);
  assert.deepEqual([row.matchedLeads, row.matchedRelevant, row.matchedQualified, row.matchedClients, row.matchedAgreements, row.matchedFullPaid],
    [2, 1, 2, 1, 2, 1]);
  assert.deepEqual([row.spend, row.cpl, row.cpql, row.cac, row.costPerAgreement, row.coverage], [300, 150, 150, 300, 150, 2 / 5]);
  assert.deepEqual(row.months, ["2026-04", "2026-09"]);
  assert.deepEqual(row.missingMonths, ["2026-03", "2026-05"]);
  assert.deepEqual(row.closedSelectedMonths, ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
  assert.deepEqual(row.excludedMonths, ["2026-10"]);
  assert.equal(row.estimated, false);
  assert.equal("roas" in row, false);
});

test("partial months are excluded without day prorating, even when they have costs", () => {
  const leads = dataset([
    { "Date Created": "20.08.2026" }, { "Date Created": "10.09.2026" }, { "Date Created": "10.10.2026" },
  ]);
  const selected = { ...scope, from: "2026-08-15", to: "2026-10-15" };
  const costs = finance([["2026-08", "Google Ads", 800], ["2026-09", "Google Ads", 900], ["2026-10", "Google Ads", 1000]]);
  const [row] = performance(leads, leads, costs, selected, "source", asOf);
  assert.equal(row.leads, 3);
  assert.equal(row.matchedLeads, 1);
  assert.equal(row.spend, 900);
  assert.equal(row.coverage, 1 / 3);
  assert.deepEqual(row.months, ["2026-09"]);
  assert.deepEqual(row.closedSelectedMonths, ["2026-09"]);
  assert.deepEqual(row.excludedMonths, ["2026-08", "2026-10"]);
  assert.deepEqual(row.missingMonths, []);
  const [partial] = performance(leads, leads, costs, { ...september, from: "2026-09-02" }, "source", asOf);
  assert.equal(partial.spend, null);
  assert.equal(partial.cpl, null);
  assert.equal(partial.coverage, 0);
  assert.deepEqual(partial.months, []);
});

test("null/missing costs are not zero, but a present zero spend is matched", () => {
  const leads = dataset([{}]);
  for (const costs of [null, finance([]), { monthly: [{ month: "2026-09", marketingCost: 999 }], channelCosts: [] }]) {
    const [row] = performance(leads, leads, costs, september, "source", asOf);
    assert.deepEqual([row.spend, row.cpl, row.cpql, row.cac, row.costPerAgreement], [null, null, null, null, null]);
    assert.equal(row.matchedLeads, 0);
    assert.equal(row.coverage, 0);
    assert.deepEqual(row.missingMonths, ["2026-09"]);
  }
  const [zero] = performance(leads, leads, finance([["2026-09", "Google Ads", 0]]), september, "source", asOf);
  assert.deepEqual([zero.spend, zero.cpl, zero.cac, zero.cpql, zero.costPerAgreement], [0, 0, null, null, null]);
  assert.equal(zero.matchedLeads, 1);
  assert.equal(zero.coverage, 1);
  assert.deepEqual(zero.months, ["2026-09"]);
  const paid = dataset([{ "Payment status": "Paid" }]);
  const [zeroClientCost] = performance(paid, paid, finance([["2026-09", "Google Ads", 0]]), september, "source", asOf);
  assert.deepEqual([zeroClientCost.cac, zeroClientCost.cpql, zeroClientCost.costPerAgreement], [0, 0, 0]);
});

test("clients outside cost coverage never dilute CAC or other matched denominators", () => {
  const leads = dataset([
    { "Date Created": "10.08.2026", "Payment status": "Paid" }, {},
  ]);
  const [row] = performance(leads, leads, finance([["2026-09", "Google Ads", 500]]), scope, "source", asOf);
  assert.equal(row.clients, 1);
  assert.equal(row.matchedClients, 0);
  assert.equal(row.matchedAgreements, 0);
  assert.equal(row.spend, 500);
  assert.equal(row.cpl, 500);
  assert.deepEqual([row.cac, row.cpql, row.costPerAgreement], [null, null, null]);
});

test("service, owner, origin, and source filters never shrink the all-clean allocation base", () => {
  const leads = dataset([
    { "Qualified service": "LT citizenship", "Lead resp. user": "A" },
    { "Qualified service": "LT citizenship", "Lead resp. user": "B" },
    { "Qualified service": "LV citizenship", "Lead resp. user": "A", "Old Lead ID": "old-3" },
    { "Qualified service": "LV citizenship", "Lead resp. user": "B" },
    { "Qualified service": "LT citizenship", "Lead resp. user": "A", "Marketing Source": "Facebook" },
  ]);
  const costs = finance([["2026-09", "Google Ads", 1000], ["2026-09", "Facebook / Instagram", 300]]);
  const cases = [
    [{ services: [leads[0].service], sources: ["Google Ads"] }, 2, 500],
    [{ owners: ["A"], sources: ["Google Ads"] }, 2, 500],
    [{ origin: "native", sources: ["Google Ads"] }, 3, 750],
    [{ services: [leads[0].service], owners: ["A"], sources: ["Google Ads"] }, 1, 250],
  ];
  for (const [filters, count, spend] of cases) {
    const selected = { ...september, ...filters };
    const [row] = performance(leads, leads, costs, selected, "source", asOf);
    assert.deepEqual([row.leads, row.matchedLeads, row.spend, row.estimated], [count, count, spend, true]);
    assert.match(row.allocation, /Estimated/);
    assert.deepEqual(performance(a.filterLeads(leads, selected), leads, costs, selected, "source", asOf), [row]);
  }
  const [source] = performance(leads, leads, costs, { ...september, sources: ["Facebook / Instagram"] }, "source", asOf);
  assert.equal(source.spend, 300);
  assert.equal(source.estimated, false);
});

test("monthly source spend is conserved across service, manager, campaign and source partitions", () => {
  const leads = dataset([
    { "Date Created": "01.08.2026", "Qualified service": "LT citizenship", "Lead resp. user": "A", "utm_campaign*": "One" },
    { "Date Created": "02.08.2026", "Qualified service": "LV citizenship", "Lead resp. user": "B", "utm_campaign*": "Two", "Payment status": "Paid" },
    { "Qualified service": "LT citizenship", "Lead resp. user": "A", "utm_campaign*": "One" },
    { "Qualified service": "LV citizenship", "Lead resp. user": "B", "utm_campaign*": "Two" },
    { "Qualified service": "LV citizenship", "Lead resp. user": "B", "utm_campaign*": "Two" },
    { "Marketing Source": "Facebook", "Qualified service": "LT citizenship", "Lead resp. user": "A", "Payment status": "Fully paid" },
  ]);
  const costs = finance([
    ["2026-08", "Google Ads", 100], ["2026-09", "Google Ads", 900], ["2026-09", "Facebook / Instagram", 200],
    ["2026-09", "Other", 999, "Other marketing cost"], ["2026-09", "Bing Ads", 888],
  ]);
  for (const dimension of ["source", "service", "serviceSource", "owner", "manager", "campaign"]) {
    const rows = performance(leads, leads, costs, scope, dimension, asOf);
    assert.equal(rows.reduce((sum, row) => sum + row.spend, 0), 1200);
    assert.equal(rows.reduce((sum, row) => sum + row.matchedLeads, 0), 6);
    assert.equal(rows.reduce((sum, row) => sum + row.matchedClients, 0), 2);
    if (dimension !== "source") assert.ok(rows.every((row) => row.estimated && /Estimated/.test(row.allocation)));
  }
  const services = performance(leads, leads, costs, scope, "service", asOf);
  assert.equal(services.find((row) => row.name === leads[0].service).spend, 550);
  assert.equal(services.find((row) => row.name === leads[1].service).spend, 650);
});

test("normalized sources match exactly and overhead is excluded even when assigned to a real source", () => {
  const leads = dataset([
    { "utm_source*": "google", "Marketing Source": "Calendly" },
    { "FB lead id": "123" }, { "Marketing Source": "unmapped-token" },
  ]);
  const costs = finance([
    ["2026-09", "Google Ads", 100], ["2026-09", "Google Ads", 20, "Clickcease"],
    ["2026-09", "Google Ads", 999, " Other MARKETING cost "],
    ["2026-09", "Facebook / Instagram", 50], ["2026-09", "Other", 999, "Other marketing cost"],
    ["2026-09", "google", 5000],
  ]);
  const rows = performance(leads, leads, costs, september, "source", asOf);
  assert.equal(rows.find((row) => row.name === "Google Ads").spend, 120);
  assert.equal(rows.find((row) => row.name === "Facebook / Instagram").spend, 50);
  assert.equal(rows.find((row) => row.name === "Other").spend, null);
});

test("a mixed-source row reports missing cohorts even in a month that has some spend", () => {
  const leads = dataset([{}, { "Marketing Source": "Facebook" }]);
  const [row] = performance(leads, leads, finance([["2026-09", "Google Ads", 100]]), september, "service", asOf);
  assert.deepEqual([row.leads, row.matchedLeads, row.spend, row.cpl, row.coverage], [2, 1, 100, 100, 0.5]);
  assert.deepEqual(row.months, ["2026-09"]);
  assert.deepEqual(row.missingMonths, ["2026-09"]);
});

test("snapshot current/future months are excluded, with explicit asOf overriding inferred timestamps", () => {
  const leads = dataset([{ "Date Created": "01.08.2026" }, { "Date Created": "01.09.2026" }, { "Date Created": "01.10.2026" }]);
  const costs = finance([["2026-08", "Google Ads", 80], ["2026-09", "Google Ads", 90], ["2026-10", "Google Ads", 100], ["2026-11", "Google Ads", 110]]);
  const [inferred] = performance(leads, leads, costs, scope, "source");
  assert.equal(inferred.snapshotMonth, "2026-10");
  assert.deepEqual(inferred.months, ["2026-08", "2026-09"]);
  const [earlier] = performance(leads, leads, costs, scope, "source", new Date("2026-09-30T23:59:59Z"));
  assert.equal(earlier.spend, 80);
  assert.deepEqual(earlier.months, ["2026-08"]);
  const [later] = performance(leads, leads, costs, { ...scope, to: "2026-11-30" }, "source", new Date("2026-11-01T00:00:00Z"));
  assert.equal(later.spend, 270);
  assert.deepEqual(later.months, ["2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(later.excludedMonths, ["2026-11"]);
  const older = leads.map((lead) => ({ ...lead, modifiedAt: new Date("2026-09-15"), importedAt: new Date("2026-09-01"), createdAt: new Date("2026-08-01") }));
  assert.equal(performance(older, older, costs, scope, "source")[0].snapshotMonth, "2026-09");
  assert.deepEqual(performance(older, older, costs, scope, "source")[0].months, ["2026-08"]);
});

test("finance outside the closed selected month range cannot leak into allocations", () => {
  const leads = dataset([{ "Date Created": "01.08.2026" }, {}, { "Date Created": "01.10.2026" }]);
  const costs = finance([["2026-08", "Google Ads", 800], ["2026-09", "Google Ads", 90], ["2026-10", "Google Ads", 1000]]);
  const [row] = performance(leads, leads, costs, september, "source", asOf);
  assert.deepEqual([row.leads, row.matchedLeads, row.spend], [1, 1, 90]);
  assert.deepEqual(row.closedSelectedMonths, ["2026-09"]);
  assert.deepEqual(row.months, ["2026-09"]);
  assert.deepEqual(row.excludedMonths, []);
});

test("absent/inconsistent bases and invalid cost components fail closed rather than inventing spend", () => {
  const leads = dataset([{}, {}]);
  const costs = finance([["2026-09", "Google Ads", 100]]);
  for (const base of [[], leads.slice(0, 1)]) {
    const [row] = performance(leads, base, costs, september, "source", asOf);
    assert.equal(row.spend, null);
    assert.equal(row.matchedLeads, 0);
  }
  for (const amount of [NaN, Infinity]) {
    const [row] = performance(leads, leads, finance([["2026-09", "Google Ads", 100], ["2026-09", "Google Ads", amount]]), september, "source", asOf);
    assert.equal(row.spend, null);
    assert.equal(row.matchedLeads, 0);
  }
  assert.equal(performance(leads, leads, costs, september, "source", new Date(NaN))[0].spend, null);
});

test("undated leads remain in all-selection counts but never receive costs, and empty input stays empty", () => {
  const leads = dataset([{}, { "Date Created": "" }]);
  const costs = finance([["2026-09", "Google Ads", 100]]);
  const [row] = performance(leads, leads, costs, scope, "source", asOf);
  assert.deepEqual([row.leads, row.matchedLeads, row.coverage, row.spend], [2, 1, 0.5, 100]);
  assert.deepEqual(performance([], [], costs, scope, "source", asOf), []);
});

test("finance workbook retains explicit zero costs without inventing costs for blank or invalid cells", async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Revenue", "Jul-26", "Aug-26", "Sep-26"],
    ["Act. result month", 1000, 1000, 1000],
    ["Marketing cost", "Jul-26", "Aug-26", "Sep-26"],
    ["Act. result month", 100, 100, 100],
    ["Paid traffic google", "", "bad value", 100],
    ["Bridgewest (affiliate partner)", "", "", 0],
    ["Simona (affiliate partner)", "", "", "0"],
    ["Paid traffic bing", "", -1, ""],
  ]), "Main numbers");
  const parsed = await parseFinanceWorkbook(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
  assert.equal(parsed.monthly.length, 3);
  assert.deepEqual(parsed.channelCosts.map(({ month, source, amount }) => [month, source, amount]), [
    ["2026-09", "Google Ads", 100], ["2026-09", "Partner", 0], ["2026-09", "Partner", 0],
  ]);
  const leads = dataset([{ "Marketing Source": "Partner", "Lead stage": "In work" }]);
  const [row] = performance(leads, leads, parsed, scope, "source", asOf);
  assert.equal(row.spend, 0);
  assert.equal(row.cpl, 0);
  assert.equal(row.cpql, 0);
  assert.equal(row.cac, null);
});
