"use client";

import { ArrowDownToLine, ArrowRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import { FinanceData, FinanceMonthlyRecord } from "@/lib/finance";
import { divide, KommoLead } from "@/lib/kommo";
import { actionQueue, financeComparison, financeForScope, financeTotals, groups, isClient, isOpen, managerRows, monthlyMetrics, performanceRows, responseMinutes, Scope, StageEvent, summarize } from "@/lib/kommo-analytics";
import { DataTable, dayLabel, duration, eur, Hint, Metrics, num, Panel, pct, Trend } from "./kommo-ui";
import { AcquisitionChart, AcquisitionCostChart, ConversionChart } from "./kommo-charts";
import { matchedFinancePerformance } from "@/lib/kommo-finance";
import { KommoCohorts } from "./kommo-cohorts";
import { useReportLanguage } from "./report-language";
import { buildKommoEvidence, kommoMetricDescription, type KommoEvidenceMetric } from "@/lib/kommo-metric-evidence";
import { KommoMetaAudit } from "./kommo-meta-audit";
import { SalesPayments } from "./kommo-sales-payments";

export type ViewOptions = { cohortEvent: StageEvent; cohortMode: "cumulative" | "monthly"; conversionChannel: string; queueSearch: string; queueAction: string; queuePage: number; salesCreatedOnly: boolean };
export type ViewContext = { leads: KommoLead[]; base: KommoLead[]; raw: KommoLead[]; rawBase?: KommoLead[]; headers?: string[]; selectionLabel?: string; finance: FinanceData | null; scope: Scope; asOf: Date; sla: number; staleDays: number; options: ViewOptions; onOptionsChange: (patch: Partial<ViewOptions>) => void; onFinanceOpen?: () => void };
export type MarketingPage = "overview" | "channels" | "conversions" | "cohorts" | "finance" | "quality";
export type SalesPage = "overview" | "managers" | "pipeline" | "actions";
const strictHelp = "Relevant strict = leads whose Relevancy is exactly Relevant / all selected leads. Blank Relevancy remains in the denominator. After consolidation, the latest filled assessment on a working record is used.";
const clientHelp = "Client = validated first/full/instalment payment date, positive recorded payment, paid Payment status or an explicit paid pipeline stage. Current client status without a valid first-payment date is excluded from timed cohorts.";
const sourceHelp = "First-touch source, then UTM source (* field before regular field), then parsed UTM, then gclid, then Marketing Source. Calendly and website form are capture methods when an original acquisition source exists.";
const metaSourceHelp = "Meta ads require explicit paid evidence. Facebook / Instagram chats without that evidence are separate from ads; ambiguous social sources are not treated as paid. A chat can remain the capture method while a confirmed original advertising source is preserved.";
const financeHelp = "Finance is monthly, company-wide data. It is not automatically attributed to a manager, country or CRM sale. CRM counts use original creation dates; finance leads can reflect different historical inclusion rules.";
const relevanceHelp = "Relevant / all includes unassessed leads in the denominator. Relevant / assessed excludes blank or unrecognized assessments: Relevant / (Relevant + Not Relevant). A channel with no assessed leads shows n/a, not 0%. The small fractions show the exact counts behind each rate.";
function RelevanceCell({ relevant, base }: { relevant: number; base: number }) {
  return <span>{pct(divide(relevant, base))}<span className="block text-[10px] leading-4 text-slate-500">{num(relevant)} / {num(base)}</span></span>;
}
function financeValue(row: FinanceMonthlyRecord, field: keyof FinanceMonthlyRecord): number | null {
  if (row.availableFields && !row.availableFields.includes(field)) return null;
  const value = row[field];
  return typeof value === "number" ? value : null;
}

// Keep exported CRM text opaque to presentation-only translation at table boundaries.
function RawText({ value }: { value: string }) { return <>{value}</>; }

export function downloadLeadCsv(leads: KommoLead[], filename: string, actions?: Map<string, string>) {
  const headers = ["Lead ID", "Contact", "Owner", "Service", "Source", "Source method", "Source evidence", "Meta submissions", "Capture method", "Stage", "Relevancy", "Created", "Origin", "First contact", "First payment", "Full payment", "Sale", "Next task", "Merged IDs", "Date issues", ...(actions ? ["Next action"] : [])];
  const rows = leads.map((l) => [l.id, l.contact || l.title, l.owner, l.service, l.source, l.sourceMethod, l.sourceEvidence?.join("; ") ?? "", JSON.stringify(l.metaSubmissions ?? []), l.captureMethod, l.stage, l.relevancy, dayLabel(l.createdAt), l.migrated ? "PlanFix migration" : "Native Kommo", l.firstContactAt?.toISOString() ?? "", dayLabel(l.firstPaymentAt), dayLabel(l.fullPaymentAt), l.sale ?? "", l.nextTaskAt?.toISOString() ?? "", l.mergedIds.join(";"), l.issues.map((i) => `${i.field}: ${i.reason}`).join(";"), ...(actions ? [actions.get(l.id) ?? ""] : [])]);
  const quote = (v: unknown) => { const s = String(v ?? ""); return `"${(/^[=+@\-]/.test(s) ? "'" : "") + s.replaceAll('"', '""')}"`; };
  const blob = new Blob(["\uFEFF", [headers, ...rows].map((r) => r.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = `${filename}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Funnel({ ctx }: { ctx: ViewContext }) {
  const { t } = useReportLanguage();
  const s = summarize(ctx.leads);
  const stages = [
    { label: "Leads", count: s.leads }, { label: "Relevant strict", count: s.relevant }, { label: "Qualified / in work", count: s.qualified },
    { label: "Agreement sent / later", count: s.agreements }, { label: "First-payment client", count: s.clients }, { label: "Fully paid", count: s.fullPaid },
  ];
  return <Panel title="Funnel milestones" help="Each milestone is measured against all selected leads. Relevant and Qualified are independent definitions, so the chart is not a stage-to-stage transition funnel. Agreement includes later paid stages. Signed contracts require a separate timestamp.">
    <div className="space-y-4">{stages.map((stage, i) => <div key={stage.label} className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_60px] items-center gap-3 text-xs"><span className="break-words font-medium leading-5">{t(stage.label)}</span><div className="h-7 overflow-hidden rounded bg-slate-100"><div className={`h-full ${i > 3 ? "bg-emerald-600" : "bg-blue-600"}`} style={{ width: `${(divide(stage.count, s.leads) ?? 0) * 100}%` }} /></div><span className="text-right tabular-nums">{num(stage.count)}<span className="block text-slate-400">{pct(divide(stage.count, s.leads))}</span></span></div>)}</div>
  </Panel>;
}

function ConversionCards({ ctx }: { ctx: ViewContext }) {
  const { t, language } = useReportLanguage();
  const leads = ctx.leads;
  const s = summarize(leads);
  const keys: KommoEvidenceMetric[] = ["all", "relevant", "assessed", "relevantAmongAssessed", "qualified", "agreement", "clients", "fullPaid"];
  return <Metrics items={[
    { label: "Leads", value: num(s.leads), sub: `${num(s.native)} ${t("native")} / ${num(s.migrated)} ${t("migrated")}`, help: "Selected CRM rows or consolidated leads after original creation-date, service, channel, manager and origin filters." },
    { label: "Relevant strict rate", value: pct(s.relevantRate), sub: `${num(s.relevant)} ${t("relevant")} / ${num(s.leads)} ${t("total")}`, help: strictHelp, tone: "green" },
    { label: "Assessment coverage", value: pct(s.assessedRate), sub: `${num(s.unassessed)} ${t("not assessed")}`, help: "Leads explicitly marked Relevant or Not Relevant divided by all selected leads. This separates pending sales assessment from lead quality.", tone: "amber" },
    { label: "Relevant among assessed", value: pct(s.relevantAmongAssessed), sub: `${num(s.relevant)} / ${num(s.assessed)} ${t("assessed")}`, help: "Relevant / (Relevant + Not Relevant). Pending assessments are excluded from this metric only. Do not confuse it with Relevant strict." },
    { label: "Qualified / active rate", value: pct(s.qualifiedRate), sub: `${num(s.qualified)} ${t("leads")}`, help: "In work timestamp, an In work/Retainer/later pipeline stage, agreement date or client evidence. Not inferred from Relevant alone." },
    { label: "Agreement sent / later", value: pct(s.agreementRate), sub: `${num(s.agreementDated)} ${t("dated")} / ${num(s.agreements)} ${t("reached")}`, help: "Agreement sent timestamp or current Retainer/later stage. Stage evidence is a proxy and cannot provide a historic date." },
    { label: "Client rate", value: pct(s.clientRate), sub: `${num(s.clients)} ${t("clients")}; ${num(s.paidUnknown)} ${t("without first-payment date")}`, help: clientHelp, tone: "blue" },
    { label: "Full-paid rate", value: pct(s.fullPaidRate), sub: `${num(s.fullPaid)} ${t("full-paid clients")}`, help: "Validated Full payment at date, explicitly full-paid payment status or a full-payment stage divided by selected leads. Lawyer handover or completion alone is not proof of full payment." },
  ].map((item, index) => ({ ...item, tone: item.tone as "blue" | "green" | "amber" | undefined,
    description: kommoMetricDescription(keys[index], language),
    evidence: () => buildKommoEvidence(keys[index], leads, { raw: ctx.rawBase, scope: ctx.selectionLabel, asOf: ctx.asOf, language }),
  }))} />;
}

function QualityNotice({ ctx }: { ctx: ViewContext }) {
  const { t } = useReportLanguage();
  const issues = ctx.leads.reduce((n, lead) => n + lead.issues.length, 0);
  const hasClosed = ctx.base.some((l) => /lost|rejected|won|successful/i.test(l.stage));
  return <div data-report-block className="flex items-start gap-3 border-l-2 border-amber-400 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-950"><AlertTriangle className="mt-1 shrink-0" size={16} /><div>
    {!hasClosed && <p>{t("This export contains no closed-won / closed-lost stages. Historical win rate and rejection rate are unavailable from this snapshot.")}</p>}
    {issues > 0 && <p>{num(issues)} {t("date values in this selection failed validation and are excluded from time-based calculations. Details are in Quality.")}</p>}
    <p>{t("Creation cohorts use the original PlanFix date for migrated leads. Response-time comparisons use native Kommo leads only. Owner means the currently recorded responsible user.")}</p>
  </div></div>;
}

const matchedCostHelp = "Finance channel spend is matched to CRM leads by acquisition channel and original creation month. Only fully selected, completed months with an explicit channel cost are included. CPL, CPQL and CAC use those matched leads only, not all selected leads. Service, manager and origin slices use estimated shares of monthly channel spend. Closed leads missing from an export and incomplete source attribution can overstate or understate CAC. Company overhead is not assigned to channels.";

function FinanceSummary({ ctx }: { ctx: ViewContext }) {
  const { t } = useReportLanguage();
  const rows = matchedFinancePerformance(ctx.leads, ctx.base, ctx.finance, ctx.scope, "source", ctx.asOf);
  const matched = rows.filter((r) => r.spend !== null);
  const spend = matched.length ? matched.reduce((n, r) => n + (r.spend ?? 0), 0) : null;
  const leads = matched.reduce((n, r) => n + r.matchedLeads, 0), clients = matched.reduce((n, r) => n + r.matchedClients, 0);
  const qualified = matched.reduce((n, r) => n + r.matchedQualified, 0);
  const months = [...new Set(matched.flatMap((r) => r.months))].sort();
  const period = months.length === 1 ? months[0] : months.length ? `${months[0]} ${t("to")} ${months.at(-1)} (${months.length} ${t("months")})` : t("No matching full months");
  const coverage = divide(leads, ctx.leads.length);
  const estimated = Boolean(ctx.scope.services.length || ctx.scope.owners.length || ctx.scope.origin !== "all");
  return <Panel title="Acquisition economics / Finance + Kommo" help={matchedCostHelp} extra={ctx.onFinanceOpen && <button type="button" onClick={ctx.onFinanceOpen} className="pdf-ignore inline-flex items-center gap-1 py-1 text-xs font-semibold text-blue-700">{t("Finance & reconciliation")}<ArrowRight size={14} /></button>}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-xs leading-5 text-slate-500"><span>{ctx.finance ? period : t("Finance workbook not uploaded")}</span><span>{num(leads)} {t("of")} {num(ctx.leads.length)} {t("selected leads matched")} ({pct(coverage)})</span></div>
    <div className="mb-5 h-1 overflow-hidden rounded-sm bg-slate-100"><div className="h-full bg-blue-600" style={{ width: `${(coverage ?? 0) * 100}%` }} /></div>
    <dl className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">{[
      { label: estimated ? "Estimated matched media spend" : "Matched media spend", value: eur(spend), sub: "Channel costs / EUR", help: "Sum of finance channel costs allocated to the matched CRM population. Excludes overhead, missing channel costs, incomplete months and partial-month date selections." },
      { label: "CPL / matched leads", value: eur(spend === null ? null : divide(spend, leads)), sub: `${num(leads)} ${t("matched leads")}`, help: "Matched finance media spend / matched CRM leads. Unmatched selected leads do not enter the denominator." },
      { label: "CPQL / matched qualified", value: eur(spend === null ? null : divide(spend, qualified)), sub: `${num(qualified)} ${t("matched qualified leads")}`, help: "Matched finance media spend / qualified or active CRM leads from exactly the same matched creation months and channels." },
      { label: "CAC / matched clients", value: eur(spend === null ? null : divide(spend, clients)), sub: `${num(clients)} ${t("matched clients / preliminary")}`, help: "Matched media spend / current clients among matched creation cohorts. This is a preliminary cohort acquisition cost, not the cost of clients paying during this calendar period. Missing closed leads or source mapping can distort it." },
    ].map((m) => <div key={m.label} className="min-w-0"><dt className="flex items-start gap-1 text-xs font-medium leading-5 text-slate-600">{t(m.label)}<Hint text={m.help} /></dt><dd className="mt-2 break-words text-2xl font-semibold tabular-nums text-slate-950">{t(m.value)}</dd><dd className="mt-1 text-xs leading-5 text-slate-500">{t(m.sub)}</dd><dd className="mt-2 text-xs leading-5 text-slate-500">{t(m.help)}</dd></div>)}</dl>
    <p className="mt-5 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">{estimated && <>{t("Service / manager allocations are estimates based on each channel's monthly lead share.")} </>}{leads < ctx.leads.length && <>{t("Costs cover the matched subset only.")} </>}{t("Daily CRM filters remain exact; monthly finance costs are never prorated to days. Revenue and company overhead remain in Finance & reconciliation.")}</p>
  </Panel>;
}

function MarketingOverview({ ctx }: { ctx: ViewContext }) {
  const { t } = useReportLanguage();
  const s = summarize(ctx.leads), queue = actionQueue(ctx.leads, ctx.asOf, ctx.sla, ctx.staleDays);
  const finance = financeForScope(ctx.finance, ctx.scope);
  const serviceRows = performanceRows(ctx.leads, ctx.base, finance, ctx.scope, "service");
  const trend = monthlyMetrics(ctx.leads);
  const sourceRows = [...groups(ctx.leads, (l) => l.source)].map(([name, rows]) => ({ name, ...summarize(rows) })).sort((a, b) => b.leads - a.leads);
  return <>
    <ConversionCards ctx={ctx} />
    <FinanceSummary ctx={ctx} />
    <QualityNotice ctx={ctx} />
    <Panel title="Priority checks" help="Rules use this selection only: unassessed leads, actionable open leads, unknown attribution and missing payment dates. Counts reflect the uploaded snapshot, not live CRM activity.">
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">{[
        [`${num(s.unassessed)} ${t("leads await assessment")}`, "Complete Relevancy before concluding that channel quality has declined."],
        [`${num(queue.length)} ${t("open leads need a next action")}`, "Review overdue first contact, tasks and retainer follow-ups in Sales Report."],
        [`${num(ctx.leads.filter((l) => l.source === "Unknown" || l.source === "Website / source unknown").length)} ${t("leads lack acquisition attribution")}`, "Capture method alone does not establish the advertising source."],
        [`${num(s.paidUnknown)} ${t("clients lack a valid first-payment date")}`, "Fill or correct First payment at to make timed payment cohorts complete."],
      ].map(([title, text]) => <div key={title} className="border-l-2 border-blue-200 pl-3"><div className="text-sm font-semibold text-slate-950">{title}</div><p className="mt-1 text-xs leading-5 text-slate-500">{t(text)}</p></div>)}</div>
    </Panel>
    <Trend title="Acquisition by creation month" help="Native leads use Date Created. Migrated leads use valid Date Created(from Planfix). Counts are cohort creation volumes, not Kommo import batches." rows={trend} series={[{ key: "leads", label: "All leads", bar: true }, { key: "relevant", label: "Relevant" }, { key: "clients", label: "Current clients" }]} />
    <AcquisitionChart title="Acquisition by service" help="Bar length shows selected leads on a common scale. Green is explicitly Relevant, rose is Not Relevant and grey is unassessed. Client counts show the current outcome of those same creation cohorts." rows={serviceRows.map((row) => ({ ...row, name: t(row.name) }))} />
    <AcquisitionChart title="Lead acquisition by channel" help={`${t(sourceHelp)} ${t(metaSourceHelp)}`} rows={sourceRows.map((row) => ({ ...row, name: t(row.name) }))} />
    <DataTable title="Service overview" help="Each service has its own denominator. Eligibility assessment and unknown service are visible independently; no service is silently discarded." headers={["Service", "Leads", "Relevant", "Unassessed", "Clients", "Full paid", "Client rate"]} rows={serviceRows.map((r) => [t(r.name), num(r.leads), pct(r.relevantRate), num(r.unassessed), num(r.clients), num(r.fullPaid), pct(r.clientRate)])} />
    <DataTable title="Acquisition by channel" help={`${t(sourceHelp)} ${t(relevanceHelp)}`} firstWidth="22%" headers={["Channel", "Leads", "Share", "Relevant strict", "Relevant / assessed", "Assessed", "Clients", "Full paid"]} rows={sourceRows.map((r) => [t(r.name), num(r.leads), pct(divide(r.leads, s.leads)), <RelevanceCell key="strict" relevant={r.relevant} base={r.leads} />, <RelevanceCell key="assessed" relevant={r.relevant} base={r.assessed} />, pct(r.assessedRate), num(r.clients), num(r.fullPaid)])} />
    <DataTable title="Country performance" help="Country names and two-letter country codes are normalized. Rates use all selected leads within each country." headers={["Country", "Leads", "Relevant strict", "Assessed", "Clients", "Client rate"]} rows={[...groups(ctx.leads, (l) => l.country)].map(([country, leads]) => ({ country, ...summarize(leads) })).sort((a, b) => b.leads - a.leads).slice(0, 20).map((r) => [<RawText key="country" value={r.country} />, num(r.leads), pct(r.relevantRate), pct(r.assessedRate), num(r.clients), pct(r.clientRate)])} />
  </>;
}

function Channels({ ctx }: { ctx: ViewContext }) {
  const { t } = useReportLanguage();
  const channels = matchedFinancePerformance(ctx.leads, ctx.base, ctx.finance, ctx.scope, "source", ctx.asOf);
  const services = matchedFinancePerformance(ctx.leads, ctx.base, ctx.finance, ctx.scope, "service", ctx.asOf);
  const combined = matchedFinancePerformance(ctx.leads, ctx.base, ctx.finance, ctx.scope, "serviceSource", ctx.asOf);
  const costScope = (r: (typeof channels)[number], rawName = false) => <span className="inline-flex items-start">{rawName ? <RawText value={r.name} /> : t(r.name)}<Hint text={`${t(r.allocation)}. ${t("Matching months")}: ${r.months.join(", ") || t("none")}. ${num(r.matchedLeads)} ${t("of")} ${num(r.leads)} ${t("selected leads covered")}.`} /></span>;
  const matchedCount = (covered: number, total: number) => <span>{num(covered)}<span className="block text-[10px] leading-4 text-slate-400">{t("of")} {num(total)} {t("selected")}</span></span>;
  return <>
    <Panel title="Channel counting scope" help="Channel counts use the available acquisition attribution and original CRM creation date. They count CRM records or consolidated leads, not Meta form submissions in the period."><p className="text-sm leading-6 text-slate-600">{t("Channel counts use the available acquisition attribution and original CRM creation date. They count CRM records or consolidated leads, not Meta form submissions in the period.")}</p></Panel>
    <AcquisitionChart title="Channel acquisition & lead quality" help="Bar lengths show CRM lead volumes. Colors separate Relevant, Not Relevant and pending assessments. Clients are current outcomes for the same selected creation cohorts. This chart includes all selected leads, regardless of finance coverage." rows={channels.map((row) => ({ ...row, name: t(row.name) }))} />
    <ConversionChart title="Service conversion comparison" help="Compare services on the same 0-100% scale. Relevant strict, Qualified / active and Client are independent milestones, each divided by all leads in that service. Grey assessment gaps are visible in the acquisition charts." rows={services.map((row) => ({ ...row, name: t(row.name) }))} />
    <FinanceSummary ctx={ctx} />
    <AcquisitionCostChart rows={channels.map((row) => ({ ...row, name: t(row.name) }))} />
    <Panel title="Reading channel relevance" help={relevanceHelp}><p className="text-sm leading-6 text-slate-600">{t(relevanceHelp)}</p><p className="mt-3 text-xs leading-5 text-slate-500"><span className="font-medium">{t("Meta attribution")}: </span>{t(metaSourceHelp)}</p></Panel>
    <DataTable title="Channel performance" help={`${t(sourceHelp)} ${t(relevanceHelp)}`} firstWidth="22%" headers={["Channel", "Leads", "Relevant / all", "Relevant / assessed", "Unassessed", "Clients", "Full paid", "Client rate"]} rows={channels.map((r) => [t(r.name), num(r.leads), <RelevanceCell key="strict" relevant={r.relevant} base={r.leads} />, <RelevanceCell key="assessed" relevant={r.relevant} base={r.assessed} />, num(r.unassessed), num(r.clients), num(r.fullPaid), pct(r.clientRate)])} />
    <KommoMetaAudit ctx={ctx} />
    <DataTable title="Marketing efficiency by channel / matched months" help={matchedCostHelp} headers={["Channel", "Matched spend", "Matched leads", "Matched clients", "CPL", "CPQL", "CAC"]} rows={channels.map((r) => [costScope(r), eur(r.spend), matchedCount(r.matchedLeads, r.leads), matchedCount(r.matchedClients, r.clients), eur(r.cpl), eur(r.cpql), eur(r.cac)])} />
    <DataTable title="Service-level performance" help="Each product is evaluated independently. Relevance uses the strict CRM field; Qualified uses In work or later evidence. Eligibility assessment and Partnership remain separate." headers={["Service", "Leads", "Relevant strict", "Qualified", "Agreement", "Clients", "Full paid"]} rows={services.map((r) => [t(r.name), num(r.leads), pct(r.relevantRate), pct(r.qualifiedRate), pct(r.agreementRate), num(r.clients), num(r.fullPaid)])} />
    <DataTable title="Acquisition cost by service / matched months" help={matchedCostHelp} headers={["Service", "Est. matched spend", "Matched leads", "Matched clients", "CPL", "CAC", "Cost / agreement"]} rows={services.map((r) => [costScope(r), eur(r.spend), matchedCount(r.matchedLeads, r.leads), matchedCount(r.matchedClients, r.clients), eur(r.cpl), eur(r.cac), eur(r.costPerAgreement)])} />
    {[...new Set(combined.map((r) => r.name.split("|||")[0]))].sort().map((service) => {
      const rows = combined.filter((r) => r.name.split("|||")[0] === service).map((r) => ({ ...r, name: r.name.split("|||")[1] }));
      return <div key={service} className="space-y-4 border-l-2 border-blue-200 pl-2 sm:pl-4">
        <AcquisitionChart title={t(service)} help="Channel mix within this service only. Bar length is lead count; colors show strict relevance and pending assessment. Counts include all CRM leads in the global selection, including months without finance costs." rows={rows.map((row) => ({ ...row, name: t(row.name) }))} />
        <DataTable title={`${t("Channel detail")} / ${t(service)}`} help={matchedCostHelp} headers={["Channel", "All leads", "All clients", "Full paid", "Matched leads / clients", "Est. matched spend", "CPL", "CAC"]} rows={rows.map((r) => [costScope(r), num(r.leads), num(r.clients), num(r.fullPaid), `${num(r.matchedLeads)} / ${num(r.matchedClients)}`, eur(r.spend), eur(r.cpl), eur(r.cac)])} />
      </div>;
    })}
    <DataTable title="Campaign performance" help="Campaign uses first_touch_campaign, UTM campaign (* before regular), then parsed UTM. Estimated CAC uses only finance-matched creation months and the campaign's share of monthly channel leads. Counts outside coverage are excluded from its cost denominator, not from the all-lead columns." headers={["Campaign", "All leads", "Relevant strict", "Relevant / assessed", "Assessed", "All clients", "Matched leads / clients", "Est. matched CAC"]} rows={matchedFinancePerformance(ctx.leads, ctx.base, ctx.finance, ctx.scope, "campaign", ctx.asOf).map((r) => [costScope(r, true), num(r.leads), <RelevanceCell key="strict" relevant={r.relevant} base={r.leads} />, <RelevanceCell key="assessed" relevant={r.relevant} base={r.assessed} />, pct(r.assessedRate), num(r.clients), `${num(r.matchedLeads)} / ${num(r.matchedClients)}`, eur(r.cac)])} />
  </>;
}

function Conversions({ ctx }: { ctx: ViewContext }) {
  const { t, language } = useReportLanguage();
  const channelOptions = [...new Set(ctx.leads.map((l) => l.source))].sort();
  const channel = channelOptions.includes(ctx.options.conversionChannel) ? ctx.options.conversionChannel : "";
  const selected = ctx.leads.filter((l) => !channel || l.source === channel);
  return <>
    <ConversionCards ctx={ctx} />
    <FinanceSummary ctx={ctx} />
    <Metrics items={[{ label: "Dated signed agreements", value: ctx.leads.some((l) => l.filled.includes("Agreement signed at")) ? num(summarize(ctx.leads).signedDated) : "n/a", sub: "Separate from Retainer sent / paid", help: "This export has no Agreement signed at column. Retainer sent is not a signed contract. Paid evidence is shown as client conversion, not a confirmed signed timestamp.", description: kommoMetricDescription("signed", language), evidence: () => buildKommoEvidence("signed", ctx.leads, { raw: ctx.rawBase, scope: ctx.selectionLabel, asOf: ctx.asOf, language }) }]} />
    <Funnel ctx={ctx} />
    <Trend title="Monthly conversion trend" help="Rates follow creation cohorts and their current outcome at the export snapshot. They are not events that occurred during the displayed month." rows={monthlyMetrics(ctx.leads)} percent series={[{ key: "relevantRate", label: "Relevant strict" }, { key: "qualifiedRate", label: "Qualified / active" }, { key: "agreementRate", label: "Agreement / later" }, { key: "clientRate", label: "Client" }, { key: "fullPaidRate", label: "Full paid" }]} />
    <Panel title="Channel trend selection" help="This selector affects only the monthly channel trend below. The global Channels selector applies to all metrics on the page."><select aria-label={t("Monthly conversion channel")} value={channel} onChange={(e) => ctx.onOptionsChange({ conversionChannel: e.target.value })} className="h-10 max-w-full rounded-md border border-slate-300 px-3 text-sm"><option value="">{t("All selected channels")}</option>{channelOptions.map((source) => <option key={source} value={source}>{t(source)}</option>)}</select></Panel>
    <Trend title="Monthly conversion by channel" help="Same creation-cohort conversion formula, for the selected channel. Pending relevance assessments remain in the strict denominator." rows={monthlyMetrics(selected)} percent series={[{ key: "relevantRate", label: "Relevant strict" }, { key: "relevantAmongAssessed", label: "Relevant / assessed" }, { key: "assessedRate", label: "Assessment coverage" }, { key: "clientRate", label: "Client" }]} />
    <ConversionChart title="Conversion rates by service" help="Independent milestones divided by that service's selected leads. A 0-100% common scale prevents products with different lead volumes from appearing artificially comparable by absolute counts." rows={[...groups(ctx.leads, (l) => l.service)].map(([name, rows]) => ({ name: t(name), ...summarize(rows) })).sort((a, b) => b.leads - a.leads)} />
    {[{ title: "Conversion by service", dimension: (l: KommoLead) => l.service }, { title: "Conversion by channel", dimension: (l: KommoLead) => l.source }].map(({ title, dimension }) => <DataTable key={title} title={title} help="All rates use that row's lead count. Assessment coverage explains the difference between strict relevance and relevance among assessed leads." headers={["Dimension", "Leads", "Relevant strict", "Relevant / assessed", "Qualified", "Agreement", "Client", "Full paid"]} rows={[...groups(ctx.leads, dimension)].map(([name, rows]) => ({ name, ...summarize(rows) })).sort((a, b) => b.leads - a.leads).map((r) => [t(r.name), num(r.leads), pct(r.relevantRate), pct(r.relevantAmongAssessed), pct(r.qualifiedRate), pct(r.agreementRate), pct(r.clientRate), pct(r.fullPaidRate)])} />)}
    <DataTable title="Contact, meeting and handover milestones" help="Only validated timestamps are counted here; no stage-date proxy is inserted. Meeting-held rate uses booked leads with a valid held timestamp." headers={["Milestone", "Count", "Share of leads"]} rows={[
      ["First contact (dated)", num(ctx.leads.filter((l) => l.firstContactAt).length), pct(divide(ctx.leads.filter((l) => l.firstContactAt).length, ctx.leads.length))],
      ["Meeting booked", num(ctx.leads.filter((l) => l.meetingBookedAt).length), pct(divide(ctx.leads.filter((l) => l.meetingBookedAt).length, ctx.leads.length))],
      ["Meeting held", num(ctx.leads.filter((l) => l.meetingHeldAt).length), pct(divide(ctx.leads.filter((l) => l.meetingHeldAt).length, ctx.leads.length))],
      ["Meeting cancelled", num(ctx.leads.filter((l) => l.meetingCancelledAt || /cancel/i.test(l.meetingResult)).length), pct(divide(ctx.leads.filter((l) => l.meetingCancelledAt || /cancel/i.test(l.meetingResult)).length, ctx.leads.length))],
      ["Lawyer handover", num(ctx.leads.filter((l) => l.handoverAt).length), pct(divide(ctx.leads.filter((l) => l.handoverAt).length, ctx.leads.length))],
    ]} />
  </>;
}

function Financial({ ctx }: { ctx: ViewContext }) {
  const { t } = useReportLanguage();
  const finance = financeForScope(ctx.finance, ctx.scope), totals = financeTotals(finance.monthly);
  const comparison = financeComparison(ctx.leads, finance, ctx.scope, ctx.base);
  const restricted = Boolean(ctx.scope.services.length || ctx.scope.sources.length || ctx.scope.owners.length || ctx.scope.origin !== "all");
  return <>
    <FinanceSummary ctx={ctx} />
    <Panel title="Company finance context & reconciliation" help={financeHelp}><p className="text-sm leading-6 text-slate-600">{finance.monthly.length ? <>{finance.monthly.length} {t("finance months overlap the selected creation period.")}</> : t("No finance months match this period. Upload a finance workbook or change the dates.")} {t("The following company totals include full overlapping calendar months; they are not revenue or costs attributed to the filtered CRM cohort.")}{restricted && <> {t("Service, channel, manager or origin filters affect CRM counts only in the reconciliation below.")}</>}</p></Panel>
    <Metrics items={[
      { label: "Marketing cost", value: finance.monthly.length ? eur(totals.spend) : "n/a", help: financeHelp, tone: "amber" },
      { label: "Revenue received", value: finance.monthly.length ? eur(totals.revenue) : "n/a", help: "Cash received in calendar months according to finance, not the contract value of created CRM leads." },
      { label: "Finance Sales", value: finance.monthly.length ? eur(totals.sales) : "n/a", help: "Contract value signed in each month according to finance. CRM Sale is separate and its currency is not exported." },
      { label: "Signed contracts", value: finance.monthly.length ? num(totals.contracts) : "n/a", help: "Actual signed contract count from Finance, not inferred from Retainer sent." },
      { label: "Revenue / marketing", value: totals.spend ? `${num(totals.revenue / totals.spend)}x` : "n/a", help: "Company finance revenue divided by all marketing expenditure. A blended revenue-to-marketing ratio, not paid-ad attributed ROAS." },
      { label: "Finance CPL", value: eur(divide(totals.spend, totals.leads)), help: "Total marketing spend / finance-reported leads for the same finance months. Not the CPL of a filtered CRM cohort." },
      { label: "Cost / signed contract", value: eur(divide(totals.spend, totals.contracts)), help: "Marketing expenditure divided by finance signed contracts in the same calendar months." },
      { label: "CPC (Google + Bing)", value: eur(divide(totals.paidTraffic, totals.clicks)), help: "Workbook Paid traffic all / workbook total clicks. The supplied workbook total excludes Facebook; its rows are reconciled below." },
    ]} />
    <DataTable title="CRM vs finance leads" help="CRM leads are creation-cohort counts. Payment events are filtered independently by payment month across all creation cohorts, preserving service/channel/manager/origin selection. Finance is calendar-period data. Open-only exports cannot establish complete historic acquisition or loss counts." headers={["Month", "CRM leads", "Clients in cohort", "First-payment events", "Finance leads", "Lead difference", "Finance contracts", "Comparison"]} rows={comparison.map((r) => [r.month, num(r.leads), num(r.clients), num(r.paidEvents), num(r.finance?.leads), r.finance ? num(r.difference) : "n/a", num(r.finance?.signedContracts), r.comparable ? "Scope aligned / verify export coverage" : "Snapshot / partial / filtered"])} />
    <Trend title="Marketing finance trend" help="All series come from finance calendar months. CRM dimension filters do not allocate these company totals." rows={[...finance.monthly].sort((a, b) => a.month.localeCompare(b.month))} series={[{ key: "marketingCost", label: "Marketing cost" }, { key: "revenue", label: "Revenue" }, { key: "sales", label: "Sales" }, { key: "profitAfterMarketing", label: "After marketing" }]} />
    <DataTable title="Financial monthly results" help="Actual, monthly plan and three-month average are read from separate labeled rows in the workbook. Empty cells remain n/a in this report. Stored workbook averages are displayed as supplied, including any incomplete historical basis." headers={["Month", "Revenue", "Sales", "Marketing", "After marketing", "Profit plan", "Profit 3-mo avg", "Plan 3-mo avg"]} rows={[...finance.monthly].sort((a, b) => b.month.localeCompare(a.month)).map((r) => [r.month, eur(financeValue(r, "revenue")), eur(financeValue(r, "sales")), eur(financeValue(r, "marketingCost")), eur(financeValue(r, "profitAfterMarketing")), eur(financeValue(r, "planProfitAfterMarketing")), eur(financeValue(r, "avgProfitAfterMarketing")), eur(financeValue(r, "planProfitAfterMarketing3MonthAverage"))])} />
    <DataTable title="Finance traffic and contracts" help="Sessions, clicks, leads, contracts and their averages are imported independently. Paid traffic all in this workbook currently includes Google + Bing, while Facebook is a separate line item. Empty source cells display n/a." headers={["Month", "Sessions", "Clicks", "Finance leads", "Leads 3-mo avg", "Contracts", "Paid traffic total", "Profit check"]} rows={[...finance.monthly].sort((a, b) => b.month.localeCompare(a.month)).map((r) => [r.month, num(financeValue(r, "sessions")), num(financeValue(r, "clicks")), num(financeValue(r, "leads")), num(financeValue(r, "avgLeads")), num(financeValue(r, "signedContracts")), eur(financeValue(r, "paidTrafficCost")), Math.abs(r.revenue - r.marketingCost - r.profitAfterMarketing) < 1 ? "Matched" : "Mismatch"])} />
    <DataTable title="Monthly spend reconciliation" help="Channel amounts are only explicitly mapped categories. The residual is overhead or unallocated spend, not an invented acquisition channel. Positive residual can explain why company fully loaded CAC differs from ad-only channel CAC." headers={["Month", "Total marketing", "Mapped channel spend", "Overhead / unallocated", "Channel coverage"]} rows={[...finance.monthly].sort((a, b) => b.month.localeCompare(a.month)).map((r) => { const mapped = finance.channelCosts.filter((c) => c.month === r.month).reduce((s, c) => s + c.amount, 0); return [r.month, eur(r.marketingCost), mapped ? eur(mapped) : "n/a", mapped ? eur(r.marketingCost - mapped) : "n/a", mapped ? pct(divide(mapped, r.marketingCost)) : "n/a"]; })} />
    <DataTable title="Channel spend availability" help="Only matching finance category rows are shown. No channel spend is invented for unfilled historical months. Agency fees and other overhead are part of company marketing cost, not silently added to paid-media channel spend." headers={["Month / channel", "Media / recorded spend", "Source categories"]} rows={[...groups(finance.channelCosts, (l) => `${l.month} / ${l.source}`)].map(([, costs]) => [`${costs[0].month} / ${t(costs[0].source)}`, eur(costs.reduce((s, c) => s + c.amount, 0)), <RawText key="categories" value={costs.map((c) => c.category).join(", ")} />])} />
  </>;
}

export function MarketingView({ page, ctx }: { page: Exclude<MarketingPage, "quality">; ctx: ViewContext }) {
  if (page === "channels") return <Channels ctx={ctx} />;
  if (page === "conversions") return <Conversions ctx={ctx} />;
  if (page === "cohorts") return <KommoCohorts ctx={ctx} />;
  if (page === "finance") return <Financial ctx={ctx} />;
  return <MarketingOverview ctx={ctx} />;
}

function SalesOverview({ ctx }: { ctx: ViewContext }) {
  const { t, language } = useReportLanguage();
  const s = summarize(ctx.leads), managers = managerRows(ctx.leads, ctx.asOf, ctx.sla, ctx.staleDays);
  const response = ctx.leads.flatMap((l) => { const n = responseMinutes(l); return n === null ? [] : [n]; });
  const evidenceKeys: KommoEvidenceMetric[] = ["all", "response", "response", "contactSla", "noContact", "overdue", "noTask", "clients", "sales", "payments", "agreement", "touches"];
  if (!ctx.leads.length) return <SalesPayments ctx={ctx} />;
  return <>
    <SalesPayments ctx={ctx} />
    <Metrics items={[
      { label: "Assigned leads", value: num(s.leads), sub: `${num(s.open)} ${t("open in snapshot")}`, help: "Selected leads assigned to the currently recorded owners. Creation dates and the other global filters apply." },
      { label: "Median first-contact time", value: duration(s.responseMedian), sub: `${num(s.responseSample)} ${t("native leads measured")}`, help: "Median of First contact at - Date Created for native Kommo leads with valid nonnegative timestamps. Measures recorded first contact, not necessarily first human reply.", tone: "blue" },
      { label: "P90 first-contact time", value: duration(s.responseP90), sub: `${pct(s.responseCoverage)} ${t("native timestamp coverage")}`, help: "90% of measured native contacts were recorded within this time. Missing timestamps and migrated lead history are excluded." },
      { label: `${t("Contact within")} ${num(ctx.sla)} ${t("min")}`, value: pct(divide(response.filter((n) => n <= ctx.sla).length, response.length)), sub: `${num(response.length)} ${t("measured contacts")}`, help: "Measured native first contacts at or below the chosen SLA divided by all measured native first contacts. Uncontacted leads are shown separately, not counted as SLA passes.", tone: "green" },
      { label: "Native leads without contact", value: num(managers.reduce((n, r) => n + r.noContact, 0)), help: "Open native leads with neither a valid first-contact date nor a contacted/qualified current stage.", tone: "amber" },
      { label: "Overdue tasks", value: num(managers.reduce((n, r) => n + r.overdue, 0)), help: "Open leads with Next Task earlier than the export snapshot. Only the next task is exported, not the complete task history.", tone: "amber" },
      { label: "Open leads without next task", value: num(managers.reduce((n, r) => n + r.noTask, 0)), help: "Open selected leads with no Next Task value. This is a task-planning gap, not proof that no communication occurred." },
      { label: "Clients in creation cohort", value: num(s.clients), sub: `${num(s.fullPaid)} ${t("fully paid")}`, help: clientHelp, tone: "green" },
      { label: "Recorded CRM Sale", value: num(s.sales), sub: "Client / signed / won records; CRM units", help: "Sale summed only for client, dated-signed or won records. Currency is not in this export; do not compare directly with finance EUR or assume this is audited revenue." },
      { label: "Lifetime payments in creation cohort", value: num(s.paymentAmount), sub: "Payment 1 + Payment 2 + Payment 3 / CRM units", help: "Explicit payment amounts from selected CRM records. Incomplete amount fields are not replaced by Sale. Currency is not specified by the export." },
      { label: "Agreement sent / later", value: num(s.agreements), sub: `${num(s.agreementDated)} ${t("with validated sent date")}`, help: "Explicit Agreement sent at or Retainer/later stage. Not equivalent to signed contracts." },
      { label: "Median recorded touches", value: num(s.touchesMean), sub: "Only leads with Touches made", help: "Median of the exported Touches made counter. Blank counters are excluded; this is not a count of replies or call outcomes." },
    ].map((item, index) => ({ ...item, tone: item.tone as "blue" | "green" | "amber" | undefined,
      description: kommoMetricDescription(evidenceKeys[index], language),
      evidence: () => buildKommoEvidence(evidenceKeys[index], ctx.leads, { raw: ctx.rawBase, scope: ctx.selectionLabel, asOf: ctx.asOf, sla: ctx.sla, language }),
    }))} />
    <QualityNotice ctx={ctx} />
    <DataTable title="Team at a glance / creation cohorts" help="Current responsible user, not historical assignment. Response-time metrics exclude migrated leads. Counts and sales follow the global creation-date selection." headers={["Manager", "Leads", "Open", "Clients", "Full paid", "Median contact", "Next actions"]} rows={managers.map((r) => [<RawText key="owner" value={r.owner} />, num(r.leads), num(r.open), num(r.clients), num(r.fullPaid), duration(r.responseMedian), num(r.actions)])} />
    <Trend title="Team acquisition and outcome trend" help="Creation cohorts show current outcomes at the snapshot. Owner filters select the current responsible user." rows={monthlyMetrics(ctx.leads)} series={[{ key: "leads", label: "Assigned leads", bar: true }, { key: "contacted", label: "Contacted / later" }, { key: "qualified", label: "Qualified / active" }, { key: "clients", label: "Clients" }]} />
    <Funnel ctx={ctx} />
  </>;
}

function Managers({ ctx }: { ctx: ViewContext }) {
  const { t } = useReportLanguage();
  const rows = managerRows(ctx.leads, ctx.asOf, ctx.sla, ctx.staleDays);
  if (!ctx.leads.length) return <SalesPayments ctx={ctx} details />;
  return <>
    <SalesPayments ctx={ctx} details />
    <DataTable title="Manager workload and results / creation cohorts" help="These are counts for the selected creation cohorts and current owner. Full-paid and client counts use actual dates or explicit paid evidence. Reassignment history is not exported." headers={["Manager", "Leads", "Open", "Relevant strict", "Qualified", "Clients", "Full paid", "Client rate"]} rows={rows.map((r) => [<RawText key="owner" value={r.owner} />, num(r.leads), num(r.open), pct(r.relevantRate), num(r.qualified), num(r.clients), num(r.fullPaid), pct(r.clientRate)])} />
    <DataTable title="First-contact speed by manager" help="Calendar elapsed time, not business hours. Native Kommo leads only. A stage of First contact without a valid timestamp cannot contribute to timing. SLA % is conditional on a measured contact." headers={["Manager", "Native leads", "Measured contacts", "Coverage", "Median", "P90", "Within SLA", "Without contact"]} rows={rows.map((r) => [<RawText key="owner" value={r.owner} />, num(r.native), num(r.responseSample), pct(r.responseCoverage), duration(r.responseMedian), duration(r.responseP90), pct(r.slaRate), num(r.noContact)])} />
    <DataTable title="Follow-up discipline" help="Next Task and Last Modified describe the export snapshot, not all historical activity. Review missing tasks and stale opportunities before attributing a conversion gap to a manager." headers={["Manager", "Open leads", "Overdue task", "No next task", "Next actions", "Recorded Sale", "Median touches"]} rows={rows.map((r) => [<RawText key="owner" value={r.owner} />, num(r.open), num(r.overdue), num(r.noTask), num(r.actions), num(r.sales), num(r.touchesMean)])} />
    {[...groups(ctx.leads, (l) => l.service)].sort(([a], [b]) => a.localeCompare(b)).map(([service, leads]) => <DataTable key={service} title={`${t("Manager performance")} / ${t(service)}`} help="Compare managers within one service to avoid distortion from a different product mix. Rates are not adjusted for source, cohort age or reassignment." headers={["Manager", "Leads", "Relevant strict", "Agreement", "Clients", "Full paid", "Client rate"]} rows={managerRows(leads, ctx.asOf, ctx.sla, ctx.staleDays).map((r) => [<RawText key="owner" value={r.owner} />, num(r.leads), pct(r.relevantRate), num(r.agreements), num(r.clients), num(r.fullPaid), pct(r.clientRate)])} />)}
  </>;
}

function Pipeline({ ctx }: { ctx: ViewContext }) {
  const bins = [{ label: "0-15 min", lo: 0, hi: 15 }, { label: "15-60 min", lo: 15, hi: 60 }, { label: "1-4 h", lo: 60, hi: 240 }, { label: "4-24 h", lo: 240, hi: 1440 }, { label: ">24 h", lo: 1440, hi: Infinity }];
  const measurable = ctx.leads.flatMap((l) => { const n = responseMinutes(l); return n === null ? [] : [n]; });
  const stageRows = [...groups(ctx.leads, (l) => l.stage)].sort((a, b) => b[1].length - a[1].length);
  return <>
    <DataTable title="Current pipeline stages" help="Each lead appears once under its current stage. Age is from original creation, not time in current stage. Stage-entry history is not present for every stage." headers={["Stage", "Leads", "Share", "Native", "Migrated", "Recorded Sale"]} rows={stageRows.map(([name, leads]) => { const s = summarize(leads); return [<RawText key="stage" value={name} />, num(s.leads), pct(divide(s.leads, ctx.leads.length)), num(s.native), num(s.migrated), num(s.sales)]; })} />
    <DataTable title="First-contact time distribution" help="Only native leads with a valid first-contact timestamp are included. The bins do not overlap at their boundaries. This measures recorded contact time, not the first message response." headers={["Elapsed time", "Measured leads", "Share"]} rows={bins.map((b) => { const n = measurable.filter((v) => v >= b.lo && v < b.hi).length; return [b.label, num(n), pct(divide(n, measurable.length))]; })} />
    <DataTable title="Pipeline age" help="Open lead age uses original creation date and the export snapshot. This is not stage duration. Old migrated opportunities can legitimately have a long age." headers={["Age", "Open leads", "Relevant", "Clients", "No next task"]} rows={[{ label: "0-7 days", lo: 0, hi: 7 }, { label: "7-30 days", lo: 7, hi: 30 }, { label: "30-90 days", lo: 30, hi: 90 }, { label: "90+ days", lo: 90, hi: Infinity }].map((b) => { const rows = ctx.leads.filter((l) => { if (!isOpen(l) || !l.createdAt) return false; const age = (ctx.asOf.getTime() - l.createdAt.getTime()) / 86_400_000; return age >= b.lo && age < b.hi; }); const s = summarize(rows); return [b.label, num(s.leads), num(s.relevant), num(s.clients), num(rows.filter((l) => !l.nextTaskAt).length)]; })} />
    <DataTable title="Rejection reasons recorded" help="Reason for Rejection may exist even while the current stage remains active. Counts here are recorded reasons, not confirmed lost deals. A missing closed-lost history prevents a complete rejection-rate analysis." headers={["Reason", "Leads", "Current client evidence"]} rows={[...groups(ctx.leads.filter((l) => l.rejectionReason), (l) => l.rejectionReason)].sort((a, b) => b[1].length - a[1].length).map(([name, rows]) => [<RawText key="reason" value={name} />, num(rows.length), num(rows.filter(isClient).length)])} />
  </>;
}

export function SalesActions({ ctx }: { ctx: ViewContext }) {
  const { t } = useReportLanguage();
  const { queueSearch: search, queueAction: action, queuePage: page } = ctx.options;
  const queue = actionQueue(ctx.leads, ctx.asOf, ctx.sla, ctx.staleDays);
  const filtered = queue.filter((r) => (!action || r.action === action) && (!search || `${r.lead.id} ${r.lead.contact} ${r.lead.title}`.toLowerCase().includes(search.toLowerCase())));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 12));
  const current = Math.min(page, pageCount - 1);
  return <>
    <Panel title="Next actions" help="Rules prioritize first contact beyond SLA, overdue Next Task, retainer follow-up and stale opportunities. Timings are relative to the export snapshot. No CRM updates are performed." extra={<button type="button" title={t("CSV contains every matching queue lead, not only the current page. Original CRM fields and action values are preserved.")} onClick={() => downloadLeadCsv(filtered.map((r) => r.lead), `kommo-actions_${ctx.scope.from}_to_${ctx.scope.to}`, new Map(filtered.map((r) => [r.lead.id, r.action])))} className="pdf-ignore inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold"><ArrowDownToLine size={14} />{t("Export queue CSV")}</button>}>
      <div className="pdf-ignore grid gap-3 sm:grid-cols-2"><input aria-label={t("Find lead in action queue")} placeholder={t("Contact or Lead ID")} value={search} onChange={(e) => ctx.onOptionsChange({ queueSearch: e.target.value, queuePage: 0 })} className="h-10 rounded-md border border-slate-300 px-3 text-sm" /><select aria-label={t("Filter next action")} value={action} onChange={(e) => ctx.onOptionsChange({ queueAction: e.target.value, queuePage: 0 })} className="h-10 rounded-md border border-slate-300 px-3 text-sm"><option value="">{t("All actions")} ({num(queue.length)})</option>{[...new Set(queue.map((r) => r.action))].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></div>
      {!queue.length && <div className="mt-3 flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={16} />{t("No leads match the current action rules.")}</div>}
    </Panel>
    <DataTable title={`${t("Action queue")} / ${num(filtered.length)} ${t("leads")}`} help="Sorted by action urgency, then lead age. Current contact and manager are from the snapshot. The PDF contains the currently visible queue page; CSV exports every matching queue lead." firstWidth="18%" headers={["Lead / contact", "Owner", "Service", "Stage", "Next action", "Next task", "Age"]} rows={filtered.slice(current * 12, current * 12 + 12).map((r) => [<span key={r.lead.id}><span className="block text-slate-400">#<RawText value={r.lead.id} /></span><RawText value={r.lead.contact || r.lead.title} /></span>, <RawText key="owner" value={r.lead.owner} />, t(r.lead.service), <RawText key="stage" value={r.lead.stage} />, t(r.action), dayLabel(r.lead.nextTaskAt), duration(r.ageHours * 60)])} />
    <div className="pdf-ignore flex items-center justify-between gap-3 py-3 text-sm"><button type="button" disabled={current === 0} onClick={() => ctx.onOptionsChange({ queuePage: current - 1 })} className="rounded-md border border-slate-300 px-3 py-2 disabled:opacity-40">{t("Previous")}</button><span>{current + 1} / {pageCount}</span><button type="button" disabled={current + 1 >= pageCount} onClick={() => ctx.onOptionsChange({ queuePage: current + 1 })} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 disabled:opacity-40">{t("Next")}<ArrowRight size={14} /></button></div>
  </>;
}

export function SalesView({ page, ctx }: { page: SalesPage; ctx: ViewContext }) {
  if (page === "managers") return <Managers ctx={ctx} />;
  if (page === "pipeline") return <Pipeline ctx={ctx} />;
  if (page === "actions") return <SalesActions ctx={ctx} />;
  return <SalesOverview ctx={ctx} />;
}
