"use client";

import { useMemo, type ReactNode } from "react";
import { Info } from "lucide-react";
import type { KommoLead } from "../lib/kommo";
import { hasContact, isAgreement, isClient, isFullPaid, isQualified } from "../lib/kommo-analytics";
import { translateReportNode, useReportLanguage } from "./report-language";

type DateField = {
  header: string;
  key: keyof Pick<KommoLead,
    "importedAt" | "modifiedAt" | "firstContactAt" | "inWorkAt" | "agreementSentAt" |
    "agreementSignedAt" | "firstPaymentAt" | "secondPaymentAt" | "thirdPaymentAt" |
    "fullPaymentAt" | "handoverAt" | "completedAt" | "meetingBookedAt" | "meetingHeldAt" |
    "meetingCancelledAt" | "nextTaskAt" | "closedAt" | "lostAt"
  >;
  fallbackHeader?: string;
  proxy?: (lead: KommoLead) => boolean;
  evidence: string;
};

const DATE_FIELDS: DateField[] = [
  { header: "Date Created", key: "importedAt", evidence: "Kommo creation/import timestamp; not necessarily original acquisition." },
  { header: "Last Modified", key: "modifiedAt", evidence: "Snapshot modification timestamp; not a stage-change history." },
  { header: "First contact at", key: "firstContactAt", proxy: hasContact, evidence: "Proxy: contact/qualified stage or downstream evidence; no contact time." },
  { header: "TD_In work", key: "inWorkAt", proxy: isQualified, evidence: "Proxy: qualified stage or downstream agreement/payment evidence; no entry time." },
  { header: "Agreement sent at", key: "agreementSentAt", proxy: isAgreement, evidence: "Proxy: agreement/client classification; does not prove sending or signature." },
  { header: "Agreement signed at", key: "agreementSignedAt", evidence: "Direct signature date only. Stage and payment evidence are not signature proof." },
  { header: "First payment at", key: "firstPaymentAt", proxy: isClient, evidence: "Proxy: payment amounts, other payment dates, status or stage; no first-payment time." },
  { header: "Second payment at", key: "secondPaymentAt", evidence: "Direct second-payment date only." },
  { header: "Third payment at", key: "thirdPaymentAt", evidence: "Direct third-payment date only." },
  { header: "Full payment at", key: "fullPaymentAt", proxy: isFullPaid, evidence: "Proxy: full-payment status or stage; no full-payment time." },
  { header: "Lawyer handover at", key: "handoverAt", evidence: "Direct handover date only." },
  { header: "TD_Lawyer has completed the work", key: "completedAt", evidence: "Direct completion date only." },
  { header: "Meeting booked at", key: "meetingBookedAt", evidence: "Direct booking date only." },
  { header: "Meeting held at", key: "meetingHeldAt", evidence: "Direct meeting date only." },
  { header: "Meeting cancelled at", key: "meetingCancelledAt", evidence: "Direct cancellation date only." },
  { header: "Next Task", key: "nextTaskAt", evidence: "Scheduled task: future dates are allowed by the parser." },
  { header: "Closed at", key: "closedAt", evidence: "Direct closure date only; a closed stage alone supplies no timestamp." },
  { header: "Lost_date_at", key: "lostAt", evidence: "Kommo loss date only. Historical PlanFix loss dates do not close current active leads." },
];

const CRITICAL_HEADERS = [...new Set([
  "ID", "Lead stage", "Pipeline", "Lead resp. user", "Qualified service", "Original service interest",
  "Relevancy", "Country (contact)", "Language (contact)", "Payment status", "Sale",
  "Payment 1", "Payment 2", "Payment 3", "Touches made", "Meeting result",
  "Real Reason for Rejection", "Reason for Rejection", "Old Lead ID", "Date Created(from Planfix)",
  "Work email (contact)", "Personal email (contact)", "Other email (contact)",
  "Mobile phone (contact)", "Work phone (contact)", "Other phone (contact)",
  ...DATE_FIELDS.flatMap((field) => field.fallbackHeader ? [field.header, field.fallbackHeader] : [field.header]),
])];

const SOURCE_HEADERS = [
  "first_touch_source", "utm_source*", "utm_source", "utm_tag", "gclid*", "gclid",
  "Marketing Source", "first_touch_medium", "utm_medium*", "utm_medium",
  "first_touch_campaign", "utm_campaign*", "utm_campaign", "FB lead id", "Type",
];

const SOURCE_METHODS = [
  { key: "first_touch_source", label: "first_touch_source", evidence: "Direct source field; first priority." },
  { key: "utm_source", label: "utm_source", evidence: "Direct utm_source* / utm_source field; second priority." },
  { key: "utm_tag", label: "utm_tag", evidence: "Parsed utm_source parameter; third priority." },
  { key: "click_id", label: "click_id", evidence: "Google source inferred from gclid; proxy, not a direct source field." },
  { key: "meta_lead_id", label: "Meta lead ID", evidence: "Meta lead-form evidence; organic flag is respected when available." },
  { key: "Marketing Source", label: "Marketing Source", evidence: "Legacy fallback; may describe capture rather than acquisition." },
  { key: "unknown", label: "unknown", evidence: "No source candidate accepted by the normalizer." },
  { key: "other", label: "Other / unrecognized method", evidence: "Method outside the normalizer's documented groups." },
];

const CAPTURE_METHODS = [
  { key: "Calendly", label: "Calendly", evidence: "Inferred from legacy Marketing Source." },
  { key: "Website form", label: "Website form", evidence: "Inferred from legacy Marketing Source." },
  { key: "Meta lead form", label: "Meta lead form", evidence: "Inferred from FB lead id after legacy capture checks." },
  { key: "other", label: "Other recorded capture method", evidence: "Other captureMethod values, including Type; raw labels withheld." },
  { key: "Not recorded", label: "Not recorded", evidence: "No capture method recorded." },
];

type Reason = KommoLead["issues"][number]["reason"];
type IssueCount = { occurrences: number; affected: number };
type Column<Row> = { key: string; label: string; render: (row: Row) => ReactNode; numeric?: boolean };

const REASONS: Record<Reason, string> = {
  invalid: "Invalid / unparseable",
  future: "After snapshot (unscheduled)",
  before_creation: "Before effective creation",
};

const panelClass = "min-w-0 border-t border-slate-200 bg-white";
const isDate = (value: Date | null): value is Date => value instanceof Date && Number.isFinite(value.getTime());

function InfoButton({ label, text }: { label: string; text: string }) {
  const { t } = useReportLanguage();
  return (
    <button
      type="button"
      title={t(text)}
      aria-label={`${t(label)}: ${t(text)}`}
      className="pdf-ignore inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
    >
      <Info aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  );
}

function Coverage({ count, total }: { count: number; total: number }) {
  const { t, locale } = useReportLanguage();
  const number = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  return (
    <span className="tabular-nums">
      {number.format(count)} / {number.format(total)}{" "}
      <span className="text-slate-500">({total ? percent.format(count / total) : t("n/a")})</span>
    </span>
  );
}

function ReportTable<Row>({ title, help, description, rows, columns, rowKey, empty = "No records in either supplied scope." }: {
  title: string;
  help: string;
  description?: string;
  rows: Row[];
  columns: Column<Row>[];
  rowKey: (row: Row) => string;
  empty?: string;
}) {
  const { t } = useReportLanguage();
  const chunks = Array.from({ length: Math.max(1, Math.ceil(rows.length / 12)) }, (_, index) => rows.slice(index * 12, (index + 1) * 12));
  return <>{chunks.map((chunk, index) => (
    <section key={index} data-report-block className={panelClass}>
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold text-slate-900">{t(title)}{chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ""}</h3>
          <InfoButton label={title} text={help} />
        </div>
        {description ? <p className="mt-1 text-xs leading-5 text-slate-500">{t(description)}</p> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] table-fixed text-left text-xs leading-5">
          <caption className="sr-only">{t(title)}{chunks.length > 1 ? t(`, part ${index + 1} of ${chunks.length}`) : ""}</caption>
          <thead className="bg-slate-50 text-slate-600">
            <tr>{columns.map((column) => (
              <th key={column.key} scope="col" className={`break-words px-4 py-2 font-medium [overflow-wrap:anywhere] ${column.numeric ? "text-right" : ""}`}>{t(column.label)}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {chunk.map((row) => <tr key={rowKey(row)}>{columns.map((column, columnIndex) => columnIndex === 0 ? (
              <th key={column.key} scope="row" translate={column.key === "field" ? "no" : undefined} className="break-words px-4 py-2 align-top font-medium text-slate-800 [overflow-wrap:anywhere]">{column.key === "field" ? column.render(row) : translateReportNode(column.render(row), t)}</th>
            ) : (
              <td key={column.key} className={`break-words px-4 py-2 align-top [overflow-wrap:anywhere] ${column.numeric ? "text-right tabular-nums" : ""}`}>{translateReportNode(column.render(row), t)}</td>
            ))}</tr>)}
            {!chunk.length ? <tr><td colSpan={columns.length} className="px-4 py-4 text-slate-500">{t(empty)}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  ))}</>;
}

function inspect(leads: KommoLead[]) {
  const filled = new Map<string, number>();
  const dates = new Map<DateField["key"], number>();
  const proxies = new Map<DateField["key"], number>();
  const issues = new Map<string, Map<Reason, IssueCount>>();
  const sourceMethods = new Map<string, number>();
  const captureMethods = new Map<string, number>();
  const origins = { unflagged: 0, oldId: 0, planfix: 0, both: 0, untraced: 0 };
  const response = { migrated: 0, noCreation: 0, noContact: 0, negative: 0, usable: 0 };
  const sources = { named: 0, unknown: 0, website: 0, other: 0 };
  let affected = 0, issueCount = 0, noCreation = 0, campaigns = 0, mediums = 0;

  for (const lead of leads) {
    const leadFields = new Set(lead.filled);
    for (const field of leadFields) filled.set(field, (filled.get(field) ?? 0) + 1);
    for (const field of DATE_FIELDS) {
      if (isDate(lead[field.key])) dates.set(field.key, (dates.get(field.key) ?? 0) + 1);
      else if (field.proxy?.(lead)) proxies.set(field.key, (proxies.get(field.key) ?? 0) + 1);
    }

    if (lead.issues.length) affected++;
    const seen = new Set<string>();
    for (const issue of lead.issues) {
      issueCount++;
      let fieldIssues = issues.get(issue.field);
      if (!fieldIssues) { fieldIssues = new Map(); issues.set(issue.field, fieldIssues); }
      const counts = fieldIssues.get(issue.reason) ?? { occurrences: 0, affected: 0 };
      counts.occurrences++;
      const key = JSON.stringify([issue.field, issue.reason]);
      if (!seen.has(key)) { counts.affected++; seen.add(key); }
      fieldIssues.set(issue.reason, counts);
    }

    if (!lead.migrated) origins.unflagged++;
    else if (leadFields.has("Old Lead ID") && leadFields.has("Date Created(from Planfix)")) origins.both++;
    else if (leadFields.has("Old Lead ID")) origins.oldId++;
    else if (leadFields.has("Date Created(from Planfix)")) origins.planfix++;
    else origins.untraced++;

    if (!isDate(lead.createdAt)) noCreation++;
    if (lead.migrated) response.migrated++;
    else if (!isDate(lead.createdAt)) response.noCreation++;
    else if (!isDate(lead.firstContactAt)) response.noContact++;
    else if (lead.firstContactAt < lead.createdAt) response.negative++;
    else response.usable++;

    const method = SOURCE_METHODS.some((entry) => entry.key === lead.sourceMethod) ? lead.sourceMethod : lead.sourceMethod ? "other" : "unknown";
    sourceMethods.set(method, (sourceMethods.get(method) ?? 0) + 1);
    const capture = !lead.captureMethod || lead.captureMethod === "Not recorded" ? "Not recorded"
      : CAPTURE_METHODS.some((entry) => entry.key === lead.captureMethod) ? lead.captureMethod : "other";
    captureMethods.set(capture, (captureMethods.get(capture) ?? 0) + 1);
    if (!lead.source || lead.source === "Unknown") sources.unknown++;
    else if (lead.source === "Website / source unknown") sources.website++;
    else if (lead.source === "Other") sources.other++;
    else sources.named++;
    if (lead.campaign && lead.campaign !== "Not recorded") campaigns++;
    if (lead.medium.trim()) mediums++;
  }

  return { total: leads.length, filled, dates, proxies, issues, affected, issueCount, origins, response, sources, sourceMethods, captureMethods, noCreation, campaigns, mediums };
}

export function KommoQuality({ leads, allLeads, headers, asOf }: {
  leads: KommoLead[];
  allLeads: KommoLead[];
  headers: string[];
  asOf: Date;
}) {
  const { t, locale } = useReportLanguage();
  const number = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const { selected, all, available, issueRows } = useMemo(() => {
    const selected = inspect(leads), all = inspect(allLeads), available = new Set(headers);
    const fields = [...new Set([...selected.issues.keys(), ...all.issues.keys()])].sort();
    const issueRows = fields.flatMap((field) => (Object.keys(REASONS) as Reason[]).flatMap((reason) => {
      const selectedCount = selected.issues.get(field)?.get(reason) ?? { occurrences: 0, affected: 0 };
      const allCount = all.issues.get(field)?.get(reason) ?? { occurrences: 0, affected: 0 };
      return selectedCount.occurrences || allCount.occurrences ? [{ field, reason, selected: selectedCount, all: allCount }] : [];
    }));
    return { selected, all, available, issueRows };
  }, [leads, allLeads, headers]);

  const selectedLabel = `Selected (${number.format(selected.total)})`;
  const allLabel = `All supplied (${number.format(all.total)})`;
  const selectedCoverage = (count: number) => <Coverage count={count} total={selected.total} />;
  const allCoverage = (count: number) => <Coverage count={count} total={all.total} />;
  const dateAvailable = (field: DateField) => available.has(field.header) || Boolean(field.fallbackHeader && available.has(field.fallbackHeader));
  const fieldColumns: Column<string>[] = [
    { key: "field", label: "Exact export header", render: (field) => field },
    { key: "available", label: "Column", render: (field) => available.has(field) ? "Present" : <span className="text-amber-700">Unavailable</span> },
    { key: "selected", label: `${selectedLabel} filled`, numeric: true, render: (field) => available.has(field) ? selectedCoverage(selected.filled.get(field) ?? 0) : "Unavailable" },
    { key: "all", label: `${allLabel} filled`, numeric: true, render: (field) => available.has(field) ? allCoverage(all.filled.get(field) ?? 0) : "Unavailable" },
  ];

  type CountRow = { key: string; label: string; selected: number; all: number; evidence: string };
  const countColumns: Column<CountRow>[] = [
    { key: "label", label: "Group", render: (row) => row.label },
    { key: "selected", label: selectedLabel, numeric: true, render: (row) => selectedCoverage(row.selected) },
    { key: "all", label: allLabel, numeric: true, render: (row) => allCoverage(row.all) },
    { key: "evidence", label: "Evidence / interpretation", render: (row) => row.evidence },
  ];

  const originRows: CountRow[] = [
    { key: "unflagged", label: "No migration flag", evidence: "migrated = false; not independent proof of native acquisition." },
    { key: "oldId", label: "Migrated: Old Lead ID only", evidence: "Migration flag plus filled Old Lead ID; no filled Planfix creation field." },
    { key: "planfix", label: "Migrated: Planfix creation only", evidence: "Migration flag plus filled Date Created(from Planfix); no filled Old Lead ID." },
    { key: "both", label: "Migrated: both origin fields", evidence: "Migration flag plus both exact origin headers filled." },
    { key: "untraced", label: "Migrated: origin fields untraceable", evidence: "Migration flag is true but neither origin header is in filled." },
  ].map((row) => ({ ...row, selected: selected.origins[row.key as keyof typeof selected.origins], all: all.origins[row.key as keyof typeof all.origins] }));

  const responseRows: CountRow[] = [
    { key: "migrated", label: "Excluded: migration flag", evidence: "All migrated leads are excluded from first-response SLA, even with dates." },
    { key: "noCreation", label: "Excluded: no creation date", evidence: "Non-migrated, without a usable effective createdAt." },
    { key: "noContact", label: "Excluded: no contact date", evidence: "Non-migrated, with creation date but no accepted firstContactAt; not proof of no contact." },
    { key: "negative", label: "Excluded: negative interval", evidence: "Non-migrated with both dates, but contact time precedes creation time on the same day." },
    { key: "usable", label: "Usable response-time sample", evidence: "Non-migrated, both timestamps accepted, contact minus creation is non-negative." },
  ].map((row) => ({ ...row, selected: selected.response[row.key as keyof typeof selected.response], all: all.response[row.key as keyof typeof all.response] }));

  const sourceRows: CountRow[] = [
    { key: "named", label: "Named normalized channel", selected: selected.sources.named, all: all.sources.named, evidence: "Normalized source other than Unknown, Website / source unknown or Other; not verification of acquisition." },
    { key: "unknown", label: "Unknown source", selected: selected.sources.unknown, all: all.sources.unknown, evidence: "No normalized source; no channel attribution available." },
    { key: "website", label: "Website / source unknown", selected: selected.sources.website, all: all.sources.website, evidence: "Website capture is known, acquisition channel is not." },
    { key: "other", label: "Other source", selected: selected.sources.other, all: all.sources.other, evidence: "Source value exists but was not mapped to a named channel." },
  ];

  const sourceMethodRows: CountRow[] = SOURCE_METHODS.map((row) => ({ ...row, selected: selected.sourceMethods.get(row.key) ?? 0, all: all.sourceMethods.get(row.key) ?? 0 }));
  const captureRows: CountRow[] = CAPTURE_METHODS.map((row) => ({ ...row, selected: selected.captureMethods.get(row.key) ?? 0, all: all.captureMethods.get(row.key) ?? 0 }));
  const missingCritical = CRITICAL_HEADERS.filter((field) => !available.has(field));
  const migrated = selected.response.migrated;
  const native = selected.total - migrated;
  const legacy = selected.sourceMethods.get("Marketing Source") ?? 0;
  const captureMissing = selected.captureMethods.get("Not recorded") ?? 0;
  const notes: { key: string; action: string; evidence: string }[] = [];
  if (!selected.total) notes.push({ key: "empty", action: "Review the current scope", evidence: "0 selected leads; selected percentages and response coverage are unavailable, not 0%. All-supplied counts remain separate." });
  if (missingCritical.length) notes.push({ key: "headers", action: "Include missing critical columns in the export", evidence: `${number.format(missingCritical.length)} / ${number.format(CRITICAL_HEADERS.length)} monitored exact critical headers are absent. Absent columns cannot be evaluated as empty cells.` });
  if (!available.has("Agreement signed at")) notes.push({ key: "signature", action: "Export Agreement signed at before measuring signature timing", evidence: `The exact header is absent for the export (${number.format(selected.total)} selected; ${number.format(all.total)} all supplied). Stage/payment proxies cannot establish signature dates or a directly observed signature rate.` });
  else if (selected.total && !(selected.dates.get("agreementSignedAt") ?? 0)) notes.push({ key: "signature", action: "Verify signature-date recording", evidence: `0 / ${number.format(selected.total)} selected leads have an accepted Agreement signed at timestamp. This is no observed signature date, not evidence of zero signed agreements.` });
  if (selected.issueCount) notes.push({ key: "issues", action: "Correct rejected dates at the source", evidence: `${number.format(selected.issueCount)} rejected-date occurrences affect ${number.format(selected.affected)} / ${number.format(selected.total)} selected leads. Counts include retained issues from merged records; the rejected values, not entire leads, were excluded.` });
  if (selected.noCreation) notes.push({ key: "creation", action: "Restore usable original/creation dates", evidence: `${number.format(selected.noCreation)} / ${number.format(selected.total)} selected leads have no usable effective createdAt and cannot enter creation-month cohorts or dated creation filters.` });
  if (migrated) notes.push({ key: "migration", action: "Keep migrated records out of first-response SLA", evidence: `${number.format(migrated)} / ${number.format(selected.total)} selected leads are migration-flagged. Only ${number.format(native)} non-migrated leads form the response-coverage denominator.` });
  if (native) notes.push({ key: "response", action: "Use only the dated, non-negative response sample", evidence: `${number.format(selected.response.usable)} / ${number.format(native)} non-migrated selected leads have a usable response interval; ${number.format(native - selected.response.usable)} / ${number.format(native)} are excluded for missing dates or negative intervals. Stage proxies supply no response time.` });
  if (selected.sources.unknown || selected.sources.website || selected.sources.other) notes.push({ key: "source", action: "Resolve incomplete channel attribution before channel comparisons", evidence: `Of ${number.format(selected.total)} selected leads: ${number.format(selected.sources.unknown)} have Unknown source, ${number.format(selected.sources.website)} have Website / source unknown, and ${number.format(selected.sources.other)} have Other. These are mutually exclusive source groups.` });
  if (legacy) notes.push({ key: "legacy", action: "Separate legacy source fallback from acquisition evidence", evidence: `${number.format(legacy)} / ${number.format(selected.total)} selected leads use sourceMethod = Marketing Source. This fallback may encode the capture route rather than the original marketing channel.` });
  if (captureMissing) notes.push({ key: "capture", action: "Record the lead capture route", evidence: `${number.format(captureMissing)} / ${number.format(selected.total)} selected leads have captureMethod = Not recorded. A known acquisition source does not fill this separate gap.` });

  return translateReportNode((
    <div className="space-y-3 text-sm text-slate-700">
      <section data-report-block className={`${panelClass} px-4 py-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-slate-900">Kommo export quality</h3>
            <InfoButton label="Quality scope" text="Selected and all-supplied arrays are counted independently. No raw-row, deduplication or filter-removal counts are inferred. Filled-field coverage is not event validity or a conversion rate." />
          </div>
          <p className="text-xs text-slate-500">Snapshot: {isDate(asOf) ? asOf.toISOString().slice(0, 10) : "Unavailable"} (UTC calendar day)</p>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
          {[
            { label: "Selected leads", value: number.format(selected.total) },
            { label: "All supplied leads", value: number.format(all.total) },
            { label: "Selected with date issues", value: <Coverage count={selected.affected} total={selected.total} /> },
            { label: "Selected migration-flagged", value: <Coverage count={migrated} total={selected.total} /> },
          ].map((item) => <div key={item.label} className="min-w-0"><dt className="text-xs text-slate-500">{item.label}</dt><dd className="mt-1 break-words font-semibold text-slate-900">{item.value}</dd></div>)}
        </dl>
        <p className="mt-3 text-xs leading-5 text-slate-500">All percentages state their denominator. All supplied is a comparison scope, not an assumed raw export. Filled means the exact header appears in lead.filled; it does not mean a valid date or a required event.</p>
        {!selected.total ? <p className="mt-2 text-xs text-amber-700">No leads in the selected scope. Selected percentages are unavailable.</p> : null}
      </section>

      <ReportTable title="Critical field completeness" help="Exact, case-sensitive header membership in headers determines availability; exact membership in each lead.filled determines filled counts. Normalized fallbacks, stage proxies and placeholder values do not establish field validity. Merged records may have the union of filled headers." description="Direct raw-cell coverage only. Missing column = Unavailable, not 0%. Filled timestamps may still be rejected by the parser; milestone dates are not expected on every lead." rows={CRITICAL_HEADERS} columns={fieldColumns} rowKey={(field) => field} />

      <ReportTable<DateField>
        title="Direct dates versus proxies"
        help="Accepted dates are finite normalized timestamps retained by the parser. Proxy-only counts use existing Kommo contact/qualified/agreement/client/full-paid classifications only where that event timestamp is absent. Proxies do not create event dates and are not added to date coverage. Signed agreements are never inferred."
        description="Direct date coverage uses all leads in each scope, not an event-eligible conversion denominator. Proxy-only is a separate selected-scope count; a blank timestamp does not prove the event never occurred."
        rows={DATE_FIELDS}
        rowKey={(field) => field.key}
        columns={[
          { key: "field", label: "Event date header", render: (field) => field.fallbackHeader ? `${field.header} / ${field.fallbackHeader}` : field.header },
          { key: "availability", label: "Column availability", render: (field) => dateAvailable(field) ? field.fallbackHeader ? `${available.has(field.header) ? "Primary present" : "Primary absent"}; ${available.has(field.fallbackHeader) ? "fallback present" : "fallback absent"}` : "Present" : "Unavailable" },
          { key: "selected", label: `${selectedLabel} accepted dates`, numeric: true, render: (field) => dateAvailable(field) ? selectedCoverage(selected.dates.get(field.key) ?? 0) : "Unavailable" },
          { key: "all", label: `${allLabel} accepted dates`, numeric: true, render: (field) => dateAvailable(field) ? allCoverage(all.dates.get(field.key) ?? 0) : "Unavailable" },
          { key: "proxy", label: "Selected proxy-only / all selected", numeric: true, render: (field) => field.proxy ? selectedCoverage(selected.proxies.get(field.key) ?? 0) : "Not inferred" },
          { key: "evidence", label: "Direct / proxy evidence", render: (field) => field.evidence },
        ]}
      />

      <ReportTable
        title="Rejected dates by field and reason"
        help="Each issue is a rejected raw date occurrence, not necessarily a separate lead. Merged leads can retain multiple issues and also a valid date for the same field. Affected leads are counted once per field/reason within each supplied array; do not sum affected-lead counts across rows. Raw examples are deliberately omitted."
        description={`Selected: ${number.format(selected.issueCount)} rejected values across ${number.format(selected.affected)} / ${number.format(selected.total)} leads. All supplied: ${number.format(all.issueCount)} values across ${number.format(all.affected)} / ${number.format(all.total)} leads. Future means after the snapshot day; before-creation compares UTC calendar days. Scheduled Next Task may be future.`}
        rows={issueRows}
        rowKey={(row) => JSON.stringify([row.field, row.reason])}
        empty="No recorded invalid, future or before-creation date issues in either supplied scope. Missing dates and missing columns are separate gaps."
        columns={[
          { key: "field", label: "Exact date field", render: (row) => row.field },
          { key: "reason", label: "Exclusion reason", render: (row) => REASONS[row.reason] },
          { key: "selectedOccurrences", label: "Selected rejected values", numeric: true, render: (row) => number.format(row.selected.occurrences) },
          { key: "selectedAffected", label: `${selectedLabel} affected`, numeric: true, render: (row) => selectedCoverage(row.selected.affected) },
          { key: "allOccurrences", label: "All rejected values", numeric: true, render: (row) => number.format(row.all.occurrences) },
          { key: "allAffected", label: `${allLabel} affected`, numeric: true, render: (row) => allCoverage(row.all.affected) },
        ]}
      />

      <ReportTable<CountRow> title="Creation-date exclusions" help="Effective createdAt uses accepted Date Created(from Planfix), falling back to accepted Kommo Date Created; cleanup may retain the earliest date across merged records. No date is reconstructed from stage, old ID or migration flag." description="Leads without a usable effective creation date cannot be assigned to a creation-month cohort. This exclusion can overlap the response and date-issue exclusions below." rows={[{ key: "creation", label: "No usable effective creation date", selected: selected.noCreation, all: all.noCreation, evidence: "Excluded from creation-month cohorts and filters requiring a dated creation." }]} columns={countColumns} rowKey={(row) => row.key} />

      <ReportTable title="First-response sample and exclusions" help="Rows partition each supplied scope exactly, in the displayed priority order. A migration-flagged lead is counted only in migration exclusions. The response sample needs non-migrated creation and first-contact timestamps with a non-negative interval; stage evidence is never timed." description={`Selected usable response coverage: ${number.format(selected.response.usable)} / ${number.format(native)} non-migrated leads (${native ? percent.format(selected.response.usable / native) : "n/a"}). All supplied: ${number.format(all.response.usable)} / ${number.format(all.total - all.response.migrated)} non-migrated leads. Table shares use all leads in each scope, so its five rows sum to the scope total.`} rows={responseRows} columns={countColumns} rowKey={(row) => row.key} />

      <ReportTable title="Migration origin" help="The migrated flag comes from an old lead ID or a populated Planfix creation field and is retained across merged records. Origin evidence below uses exact filled-header membership, not whether the historical date parsed successfully. The five rows partition each scope." description={`Migration-flagged: ${number.format(migrated)} / ${number.format(selected.total)} selected; ${number.format(all.response.migrated)} / ${number.format(all.total)} all supplied. Import time is not assumed to be acquisition time.`} rows={originRows} columns={countColumns} rowKey={(row) => row.key} />

      <ReportTable title="Normalized source coverage" help="The four groups partition each scope by normalized source. A Website capture route and a nonempty legacy source value do not establish a marketing acquisition channel. Named normalized channels can still be inferred or legacy-sourced; see sourceMethod." rows={sourceRows} columns={countColumns} rowKey={(row) => row.key} />

      <ReportTable title="Attribution evidence: sourceMethod" help="Each lead belongs to exactly one sourceMethod group, chosen by the normalizer's source priority. Counts are not raw field completeness: a populated lower-priority field can be bypassed. Unknown channel and unknown method are distinct checks." description="Priority: first_touch_source, UTM source field, parsed utm_tag, click ID, legacy Marketing Source, then unknown. Click-ID inference and legacy fallback are not direct acquisition-source fields." rows={sourceMethodRows} columns={countColumns} rowKey={(row) => row.key} />

      <ReportTable title="Capture method coverage" help="Capture route is a separate dimension from acquisition channel. The normalizer checks legacy Marketing Source for Calendly/Website, then FB lead id, then Type. Nonstandard capture labels are aggregated rather than displaying raw free text." description="These groups partition each scope. A recorded capture method does not repair missing channel attribution." rows={captureRows} columns={countColumns} rowKey={(row) => row.key} />

      <ReportTable title="Source and capture field completeness" help="Every listed spelling, including starred UTM headers, is checked separately and exactly against headers and lead.filled. Counts are nonempty cells, not accepted attribution or correct UTM values. Marketing Source population is not the count of leads using that fallback." description="Direct raw-field coverage; no aliases are silently combined. Legacy Marketing Source may be present even when a higher-priority source wins." rows={SOURCE_HEADERS} columns={fieldColumns} rowKey={(field) => field} />

      <ReportTable<CountRow>
        title="Campaign and medium coverage"
        help="Campaign counts use the normalized campaign string excluding its Not recorded fallback; medium counts use nonempty normalized medium. These derived counts may use header fallbacks or parsed UTM values and do not validate campaign naming."
        rows={[
          { key: "campaign", label: "Recorded campaign label", selected: selected.campaigns, all: all.campaigns, evidence: "Normalized first-touch / UTM / parsed-tag campaign; not proof of a valid campaign ID." },
          { key: "medium", label: "Recorded medium value", selected: selected.mediums, all: all.mediums, evidence: "Nonempty first-touch / UTM medium; not validation of paid versus organic classification." },
          { key: "legacy", label: "Legacy Marketing Source cell filled", selected: selected.filled.get("Marketing Source") ?? 0, all: all.filled.get("Marketing Source") ?? 0, evidence: available.has("Marketing Source") ? "Direct cell presence; distinct from sourceMethod = Marketing Source." : "Column unavailable; no legacy cell coverage can be evaluated." },
        ].filter((row) => row.key !== "legacy" || available.has("Marketing Source"))}
        columns={countColumns}
        rowKey={(row) => row.key}
      />

      <ReportTable title="Data-derived follow-up" help="Notes follow from supplied counts and exact header availability, not inferred sales outcomes. Empty cells on optional event fields do not automatically create a required follow-up." description="Counts refer to the selected scope unless explicitly stated otherwise." rows={notes} rowKey={(row) => row.key} empty="No follow-up is triggered by these checks. This does not certify the export as complete or validate its business outcomes." columns={[
        { key: "action", label: "Follow-up", render: (row) => row.action },
        { key: "evidence", label: "Observed evidence and denominator", render: (row) => row.evidence },
      ]} />
    </div>
  ), t);
}
