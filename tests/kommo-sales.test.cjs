/* eslint-disable @typescript-eslint/no-require-imports -- Analytics fixtures load TypeScript in memory. */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");
const XLSX = require("xlsx");
require.extensions[".ts"] = (m, p) => m._compile(ts.transpileModule(fs.readFileSync(p, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, p);
const k = require("../lib/kommo.ts");
const { salesActivity } = require("../lib/kommo-sales.ts");
const { filterLeads, summarize, cohortRows } = require("../lib/kommo-analytics.ts");
const now = new Date("2026-10-29T20:00:00Z");
const scope = { from: "2026-10-01", to: "2026-10-28", services: [], sources: [], owners: [], origin: "all" };
function dataset(records) {
  const defaults = { "Lead stage": "New", "Date Created": "01.09.2026", "Last Modified": "29.10.2026 15:00:00", "Lead resp. user": "Mariana" };
  const headers = [...new Set(["ID", ...Object.keys(defaults), ...records.flatMap(Object.keys)])];
  return k.normalizeKommoRows([headers, ...records.map((record, i) => headers.map((header) => ({ ID: String(i + 1), ...defaults, ...record })[header] ?? ""))], now);
}
const ids = (events) => events.map((event) => event.lead.id);

test("receipt calendar includes old leads and later installments without changing creation cohorts", () => {
  const d = dataset([
    { "Date Created": "01.01.2026", "Payment 1": 100, "First payment at": "05.10.2026", "Payment 2": 200, "Second payment at": "10.10.2026", "Full payment at": "10.10.2026" },
    { "Date Created": "01.10.2026", "Lead stage": "Initial payment received", "Payment 1": 400, "First payment at": "10.10.2026" },
    { "Date Created": "01.03.2026", "First payment at": "02.03.2026", "Second payment at": "15.05.2026", "Third payment at": "24.10.2026", "Payment 3": 790 },
  ]);
  const before = JSON.stringify(d.leads);
  const activity = salesActivity(d.leads, scope, now, d.leads);
  assert.equal(activity.first.length, 2);
  assert.equal(activity.further.length, 2);
  assert.equal(activity.payingLeads.length, 3);
  assert.equal(activity.payments.length, 4, "full-payment milestone is not a fourth installment");
  assert.equal(activity.amount, 1490);
  assert.equal(activity.fullPaid.length, 1);
  assert.equal(filterLeads(d.leads, scope).length, 1);
  assert.equal(summarize(filterLeads(d.leads, scope)).clients, 1);
  assert.equal(cohortRows(d.leads, d.asOf, "firstPaymentAt").find((row) => row.month === "2026-01").cells[0], 0);
  assert.equal(JSON.stringify(d.leads), before);
});

test("creation-only mode intersects receipt dates with original creation dates without changing default behavior", () => {
  const d = dataset([
    { "Date Created": "01.01.2026", "First payment at": "05.10.2026", "Payment 1": 100 },
    { "Date Created": "01.10.2026", "First payment at": "10.10.2026", "Payment 1": 400 },
    { "Date Created": "28.10.2026", "First payment at": "28.10.2026", "Payment 1": 500 },
    { "Date Created": "05.10.2026", "First payment at": "29.10.2026", "Payment 1": 600 },
    { "Date Created": "10.10.2026", "First payment at": "12.10.2026", "Payment 1": 700, "Lead resp. user": "Sheila" },
  ]);
  const selected = { ...scope, owners: ["Mariana"] };
  const before = JSON.stringify(d.leads);
  const all = salesActivity(d.leads, selected, now, d.leads);
  const created = salesActivity(d.leads, selected, now, d.leads, true);
  assert.deepEqual(ids(all.payments).sort(), ["1", "2", "3"]);
  assert.deepEqual(ids(created.payments).sort(), ["2", "3"]);
  assert.equal(created.amount, 900);
  assert.equal(created.population.length, 3);
  assert.equal(salesActivity(d.leads, { ...selected, from: "2026-10-15", to: "2026-10-15" }, now, d.leads, true).payments.length, 0);
  assert.equal(JSON.stringify(d.leads), before);
});

test("all dimensions still apply while receipt dates are inclusive and future dates excluded", () => {
  const d = dataset([
    { "First payment at": "01.10.2026", "Qualified service": "LT citizenship", "Marketing Source": "Google Ads" },
    { "First payment at": "28.10.2026", "Qualified service": "LT citizenship", "Marketing Source": "Google Ads" },
    { "First payment at": "29.10.2026", "Qualified service": "LT citizenship", "Marketing Source": "Google Ads" },
    { "First payment at": "28.10.2026", "Lead resp. user": "Sheila", "Qualified service": "LV citizenship", "Marketing Source": "Facebook ads" },
  ]);
  const selected = { ...scope, owners: ["Mariana"], services: ["Lithuanian citizenship by descent"], sources: ["Google Ads"] };
  assert.deepEqual(ids(salesActivity(d.leads, selected, now).payments).sort(), ["1", "2"]);
  assert.deepEqual(ids(salesActivity(d.leads, { ...selected, from: "2026-10-28" }, now).payments), ["2"]);
  assert.equal(salesActivity(d.leads, { ...scope, from: "2026-10-28", to: "2026-11-30" }, new Date("2026-10-28T23:59:59Z")).payments.length, 2);
});

test("stages and modifications never invent receipt dates or retainer sent timestamps", () => {
  const d = dataset([
    { "Lead stage": "Initial payment received", "Payment 1": 370 },
    { "Lead stage": "2ND installment received", "First payment at": "03.09.2026", "Payment 2": 790 },
    { "Lead stage": "Retainer sent" },
    { "Agreement sent at": "05.10.2026" },
  ]);
  const activity = salesActivity(d.leads, scope, now);
  assert.equal(activity.payments.length, 0);
  assert.equal(activity.amount, null);
  assert.equal(activity.sent.length, 1);
  assert.equal(activity.signed.length, 0);
  assert.equal(activity.undatedRetainers.length, 1);
  assert.deepEqual(activity.gaps.map((gap) => [gap.lead.id, gap.installment, gap.reason]), [["1", 1, "missing_date"], ["2", 2, "missing_date"]]);
});

test("known zero and negative amounts differ from absent or malformed amounts", () => {
  const d = dataset([
    { "Payment 1": 0, "First payment at": "05.10.2026" },
    { "Payment 1": -20, "First payment at": "05.10.2026" },
    { "First payment at": "05.10.2026" },
    { "Payment 1": "not entered", "First payment at": "05.10.2026" },
  ]);
  const activity = salesActivity(d.leads, scope, now);
  assert.equal(activity.amount, -20);
  assert.equal(activity.missingAmounts, 2);
  assert.deepEqual(activity.payments.map((event) => event.amount), [0, -20, null, null]);
});

test("the date of payment 2 never borrows an undated payment 3 amount", () => {
  const d = dataset([{ "Payment 1": 370, "First payment at": "05.08.2026", "Date Created": "01.01.2026", "Second payment at": "22.10.2026", "Payment 3": 2.04 }]);
  const activity = salesActivity(d.leads, scope, now);
  assert.equal(activity.further.length, 1);
  assert.equal(activity.amount, null);
  assert.equal(activity.payments[0].amount, null);
  assert.ok(activity.gaps.some((gap) => gap.installment === 3 && gap.reason === "missing_date"));
});

test("invalid dates and full-payment chronology are surfaced without moving them to October", () => {
  const d = dataset([{ "Payment 1": 370, "First payment at": "16.03.2026", "Date Created": "16.04.2026", "Second payment at": "21.10.2026", "Full payment at": "21.09.2026" }]);
  const activity = salesActivity(d.leads, scope, now);
  assert.equal(activity.first.length, 0);
  assert.equal(activity.further.length, 1);
  assert.ok(activity.gaps.some((gap) => gap.reason === "before_creation"));
  assert.ok(activity.gaps.some((gap) => gap.reason === "full_before_installment"));
});

test("cleanup counts a duplicate payment once and conflicting paired values remain unresolved", () => {
  const fields = { "Work email (contact)": "same@example.com", "Qualified service": "LT citizenship", "First payment at": "10.10.2026" };
  const d = dataset([{ ...fields, "Payment 1": 370 }, { ...fields, "Payment 1": 370, "Date Created": "05.09.2026" }]);
  const clean = k.cleanKommoLeads(d.leads).records;
  const activity = salesActivity(clean, scope, now, d.leads);
  assert.equal(activity.payments.length, 1);
  assert.equal(activity.amount, 370);
  assert.deepEqual(activity.payments[0].sourceIds, ["1", "2"]);
  const conflict = dataset([{ ...fields, "Payment 1": 370 }, { ...fields, "Payment 1": 790 }]);
  const unresolved = salesActivity(k.cleanKommoLeads(conflict.leads).records, scope, now, conflict.leads);
  assert.equal(unresolved.payments.length, 1);
  assert.equal(unresolved.amount, null);
  assert.ok(unresolved.gaps.some((gap) => gap.reason === "conflicting_amounts"));
  conflict.leads[1].firstPaymentAt = new Date("2026-10-11T00:00:00Z");
  const dates = salesActivity(k.cleanKommoLeads(conflict.leads).records, scope, now, conflict.leads);
  assert.equal(dates.payments.length, 0);
  assert.ok(dates.gaps.some((gap) => gap.reason === "conflicting_dates"));
});

test("native CSV aliases preserve manager, sale and contact identity instead of Unassigned", async () => {
  const headers = ["ID", "Lead stage", "Created on", "Modified on", "Respons. user", "Lead sale €", "Fullname", "Work email", "Mobile phone", "Country", "Language", "Payment 1", "First payment at"];
  const sheet = XLSX.utils.aoa_to_sheet([headers, ["1", "Initial payment received", "01.09.2026", "28.10.2026", "Mariana", "1950", "Example Contact", "Person@Example.com", "+12345678901", "BR", "PT", "370", "07.10.2026"]]);
  const data = await k.parseKommoWorkbook(new TextEncoder().encode(XLSX.utils.sheet_to_csv(sheet)).buffer);
  const lead = data.leads[0];
  assert.equal(lead.owner, "Mariana");
  assert.equal(lead.sale, 1950);
  assert.equal(lead.contact, "Example Contact");
  assert.equal(lead.email, "person@example.com");
  assert.equal(lead.phone, "+12345678901");
  assert.equal(lead.country, "Brazil");
  assert.equal(lead.language, "PT");
  assert.ok(!lead.filled.includes("Lead resp. user"));
  assert.equal(salesActivity(data.leads, scope, now).managerRows[0].first, 1);
});

test("Mariana's supplied cases include three first and three further October payments in export (11)", {
  skip: !process.env.META_FULL_CRM_XLSX && "Set META_FULL_CRM_XLSX to the verified October 28 export (11).",
}, async () => {
  const data = await k.parseKommoWorkbook(Uint8Array.from(fs.readFileSync(process.env.META_FULL_CRM_XLSX)).buffer);
  const wanted = new Set(["3473680", "3443446", "4735210", "3411122", "3411126", "3465606", "3465572", "2144428", "3558784", "4566634", "4083720"]);
  const leads = data.leads.filter((lead) => wanted.has(lead.id));
  assert.equal(leads.length, 11);
  const activity = salesActivity(k.cleanKommoLeads(leads).records, { ...scope, owners: ["Mariana"] }, data.asOf, data.leads);
  assert.deepEqual(ids(activity.first).sort(), ["3443446", "3473680", "4735210"]);
  assert.deepEqual(ids(activity.further).sort(), ["3411126", "3465572", "3465606"]);
  assert.equal(activity.amount, 2720);
  assert.equal(activity.missingAmounts, 1);
  assert.equal(filterLeads(leads, scope).filter((lead) => summarize([lead]).clients).length, 1);
});

test("fresh full export (October 29) includes the newly recorded Landim installment and all managers", {
  skip: !process.env.SALES_CRM_XLSX && "Set SALES_CRM_XLSX to the freshly verified full October 29 export.",
}, async () => {
  const data = await k.parseKommoWorkbook(Uint8Array.from(fs.readFileSync(process.env.SALES_CRM_XLSX)).buffer);
  const clean = k.cleanKommoLeads(data.leads).records;
  assert.equal(data.leads.length, 5984);
  assert.equal(clean.length, 5967);
  const activity = salesActivity(clean, scope, data.asOf, data.leads);
  const manager = (name) => activity.managerRows.find((row) => row.owner === name);
  assert.deepEqual([manager("Mariana").first, manager("Mariana").further, manager("Mariana").payingLeads, manager("Mariana").amount, manager("Mariana").missingAmounts], [3, 6, 9, 3120, 3]);
  assert.deepEqual([manager("Sheila").first, manager("Sheila").further, manager("Sheila").payingLeads, manager("Sheila").dateWarnings], [12, 2, 14, 1]);
  assert.deepEqual([manager("Oleh Dymovski").first, manager("Oleh Dymovski").further, manager("Oleh Dymovski").payingLeads], [1, 1, 2]);
  const landim = activity.payments.find((event) => event.lead.id === "2144428");
  assert.deepEqual([landim.installment, k.isoDay(landim.at), landim.amount], [2, "2026-10-28", 400]);
  assert.ok(!activity.payments.some((event) => event.lead.id === "3411122"));
  const created = salesActivity(clean, { ...scope, owners: ["Mariana"] }, data.asOf, data.leads, true);
  assert.equal(created.payingLeads.length, 2);
  assert.equal(created.first.length, 1);
  assert.equal(created.further.length, 1);
});

test("a real calendar receipt before CRM creation is counted only in sales with an explicit warning", () => {
  const d = dataset([{ "Date Created": "19.10.2026", "First payment at": "16.10.2026", "Payment 1": 370 },
    { "First payment at": "31.02.2026" }, { "First payment at": "30.10.2026" }]);
  const activity = salesActivity(d.leads, scope, now);
  assert.equal(activity.first.length, 1);
  assert.equal(activity.first[0].beforeCreation, true);
  assert.equal(activity.amount, 370);
  assert.equal(d.leads[0].firstPaymentAt, null);
  assert.equal(cohortRows(d.leads, d.asOf, "firstPaymentAt").find((row) => row.month === "2026-10").cells[0], 0);
  assert.ok(activity.gaps.some((gap) => gap.reason === "before_creation"));
  assert.ok(activity.gaps.some((gap) => gap.reason === "invalid_date"));
});
