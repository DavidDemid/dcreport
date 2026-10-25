"use client";

import { cohortEventLag, cohortRows, groups, monthlyMetrics, summarize } from "@/lib/kommo-analytics";
import type { CohortRow, StageEvent } from "@/lib/kommo-analytics";
import type { KommoLead } from "@/lib/kommo";
import type { ViewContext } from "./kommo-views";
import { Hint, Metrics, Trend } from "./kommo-ui";
import { useReportLanguage } from "./report-language";
import { buildKommoEvidence, kommoMetricDescription, type KommoEvidenceMetric } from "@/lib/kommo-metric-evidence";

type CohortMode = "cumulative" | "monthly";
const OFFSETS = [0, 1, 2, 3, 4, 5];
const COPY = {
  en: {
    event: "Cohort event", mode: "Cohort mode", cumulative: "Cumulative conversion, %", monthly: "Monthly conversions, count",
    firstPayment: "First payment", fullPayment: "Full payment", firstContact: "First contact", agreementSent: "Agreement sent",
    calendar: "M0 is the creation month; M1 is the next calendar month, not the next 30 days.",
    example: "Example: 10 September leads reach the selected event: 1 in September, 1 in October, 2 in November.",
    monthlyExample: "Monthly counts: M0 = 1, M1 = 1, M2 = 2.", cumulativeExample: "Cumulative conversion: M0 = 10%, M1 = 20%, M2 = 40%.",
    datesOnly: "Only actual dated events enter the cells. Leads without an event date stay in the cohort base; current clients are a separate snapshot metric.",
    horizon: "Future cells are unavailable. The snapshot month is partial; counts may still increase.",
    selectedLeads: "Selected leads", originalMonth: "Original creation month", dated: "Valid event dates",
    paidStatus: "Current paid status", paidNow: "Clients", paidUnknown: "Paid / first date unknown", paidUnknownShort: "Paid date unknown", clients: "clients", cohort: "Cohort", leads: "Leads", relevant: "Relevant, %",
    datedShort: "Dated event", context: "Cohort context", cohorts: "Monthly cohorts",
    latest: "Latest 10 creation cohorts per table. Current paid counts are separate from the timed matrix.",
    matrix: "Calendar-month matrix", count: "Count", fraction: "Cumulative share", partial: "Partial snapshot month", partialShort: "part.",
    unavailable: "Horizon not yet observed", empty: "No creation cohorts in the current selection.",
    missingCreation: "Selected leads without a creation date are not assigned to a cohort:",
    beyond: "Dated events after M5, outside this matrix:", validHelp: "Valid selected-event dates on or after the creation day and no later than the snapshot.",
    paidUnknownHelp: "Payment evidence exists, but no valid first-payment date. This counts clients only, not every lead without the selected event date.",
    paidHelp: "Current payment evidence, including paid status without a first-payment date. This is not the number of dated events in the matrix.",
    paidTrend: "Current paid rate by creation cohort", paidRate: "Current paid rate", fullPaidRate: "Current full-paid rate",
    paidTrendHelp: "Snapshot client and full-paid rates by creation month, including payment evidence without a dated event. These are separate from the selected event and cohort display mode.",
  },
  ru: {
    event: "Событие когорты", mode: "Режим когорт", cumulative: "Накопленная конверсия, %", monthly: "Конверсии за месяц, количество",
    firstPayment: "Первая оплата", fullPayment: "Полная оплата", firstContact: "Первый контакт", agreementSent: "Договор отправлен",
    calendar: "M0 - месяц создания; M1 - следующий календарный месяц, а не следующие 30 дней.",
    example: "Пример: из 10 сентябрьских лидов событие произошло у 1 в сентябре, у 1 в октябре, у 2 в ноябре.",
    monthlyExample: "Количество за месяц: M0 = 1, M1 = 1, M2 = 2.", cumulativeExample: "Накопленная конверсия: M0 = 10%, M1 = 20%, M2 = 40%.",
    datesOnly: "В ячейках только события с реальной датой. Лиды без даты остаются в базе когорты; текущий статус оплаты показан отдельно.",
    horizon: "Будущие ячейки недоступны. Месяц снимка неполный; количество событий ещё может увеличиться.",
    selectedLeads: "Выбранные лиды", originalMonth: "Исходный месяц создания", dated: "События с корректной датой",
    paidStatus: "Клиенты на дату выгрузки", paidNow: "Клиенты всего", paidUnknown: "Клиенты без даты первой оплаты", paidUnknownShort: "Без первой даты", clients: "клиентов", cohort: "Когорта", leads: "Лиды", relevant: "Релевантные, %",
    datedShort: "Событие с датой", context: "Контекст когорты", cohorts: "Месячные когорты",
    latest: "В каждой таблице последние 10 когорт создания. Текущие оплаты показаны отдельно от матрицы событий с датой.",
    matrix: "Матрица календарных месяцев", count: "Количество", fraction: "Накопленная доля", partial: "Неполный месяц снимка", partialShort: "част.",
    unavailable: "Период ещё не наблюдался", empty: "В выбранном срезе нет когорт с датой создания.",
    missingCreation: "Выбранные лиды без даты создания не отнесены к когорте:",
    beyond: "События с датой после M5, вне матрицы:", validHelp: "Корректная дата выбранного события: не раньше дня создания и не позже снимка.",
    paidUnknownHelp: "Есть признаки оплаты, но нет корректной даты первой оплаты. Здесь только клиенты, а не все лиды без даты выбранного события.",
    paidHelp: "Текущие признаки оплаты, включая статус без даты первой оплаты. Это не количество датированных событий в матрице.",
    paidTrend: "Текущая доля клиентов по месяцу создания", paidRate: "Доля клиентов", fullPaidRate: "Доля полностью оплативших",
    paidTrendHelp: "Доли клиентов и полностью оплативших на дату снимка по месяцу создания, включая признаки оплаты без даты события. Эти показатели не зависят от выбранного события и режима когорт.",
  },
};
type Copy = typeof COPY.en;

function CohortTable({ rows, title, service, mode, copy, count, percent }: {
  rows: CohortRow[];
  title: string;
  service?: string;
  mode: CohortMode;
  copy: Copy;
  count: (value: number) => string;
  percent: (value: number) => string;
}) {
  const chunks = Array.from({ length: Math.max(1, Math.ceil(rows.length / 5)) }, (_, index) => rows.slice(index * 5, index * 5 + 5));
  const help = `${copy.calendar} ${copy.example} ${mode === "monthly" ? copy.monthlyExample : copy.cumulativeExample} ${copy.datesOnly} ${copy.horizon}`;
  return <>{chunks.map((chunk, chunkIndex) => <section key={chunkIndex} data-report-block className="min-w-0 border-t border-slate-200 bg-white px-4 py-5 sm:px-5">
    <h2 className="mb-2 break-words text-base font-semibold leading-6 text-slate-950">{title}{chunks.length > 1 ? ` (${chunkIndex + 1}/${chunks.length})` : ""}<Hint text={help} /></h2>
    <p className="mb-4 text-xs leading-5 text-slate-500">{copy.latest}</p>
    {!chunk.length ? <p className="py-6 text-center text-sm text-slate-500">{copy.empty}</p> : <>
      <table className="mb-5 w-full table-fixed border-collapse text-xs tabular-nums">
        <caption className="mb-2 text-left text-xs font-medium text-slate-600">{copy.context}</caption>
        <colgroup><col style={{ width: "19%" }} /><col style={{ width: "11%" }} />{[0, 1, 2, 3].map((index) => <col key={index} style={{ width: "17.5%" }} />)}</colgroup>
        <thead><tr className="border-b border-slate-200 bg-slate-50">{[copy.cohort, copy.leads, copy.relevant, copy.paidNow, copy.paidUnknownShort, copy.datedShort].map((label, index) => <th key={label} scope="col" title={index === 4 ? copy.paidUnknownHelp : undefined} className={`break-words px-1 py-2 align-middle font-medium leading-4 text-slate-600 ${index ? "text-center" : "text-left"}`}>{label}</th>)}</tr></thead>
        <tbody>{chunk.map((row) => <tr key={row.month} className="border-b border-slate-100 last:border-0">
          <th scope="row" className="px-1 py-2 text-left font-medium text-slate-950">{row.month}</th>
          {[count(row.leads), percent(row.relevantRate ?? 0), count(row.clients), count(row.paidUnknown), count(row.datedEvents)].map((value, index) => <td key={index} className="break-words px-1 py-2 text-center text-slate-700">{value}</td>)}
        </tr>)}</tbody>
      </table>
      <table data-cohort-table="true" data-cohort-service={service || "all"} data-cohort-mode={mode} className="w-full table-fixed border-collapse text-xs tabular-nums">
        <caption className="mb-2 text-left text-xs font-medium text-slate-600">{copy.matrix} / {mode === "monthly" ? copy.count : copy.fraction}</caption>
        <colgroup><col style={{ width: "22%" }} />{OFFSETS.map((offset) => <col key={offset} style={{ width: "13%" }} />)}</colgroup>
        <thead><tr className="border-b border-slate-200 bg-slate-50">
          <th scope="col" className="break-words px-1 py-2 text-left font-medium leading-4 text-slate-600">{copy.cohort}</th>
          {OFFSETS.map((offset) => <th key={offset} data-cohort-offset={offset} scope="col" className="px-1 py-2 text-center align-middle font-medium text-slate-600">M{offset}</th>)}
        </tr></thead>
        <tbody>{chunk.map((row) => <tr key={row.month} data-cohort-month={row.month} className="border-b border-slate-100 last:border-0">
          <th scope="row" className="px-1 py-2 text-left align-middle font-medium text-slate-950"><span className="block">{row.month}</span><span className="mt-1 block text-[10px] font-normal leading-4 text-slate-500">{copy.leads}: {count(row.leads)}</span></th>
          {(mode === "monthly" ? row.incrementalCounts : row.cells).map((value, offset) => {
            const partial = value !== null && offset === row.age;
            const fraction = value === null ? 0 : mode === "monthly" ? value / row.leads : value;
            const label = value === null ? "-" : mode === "monthly" ? count(value) : percent(value);
            const cellHelp = `M${offset}: ${value === null ? copy.unavailable : `${label}${partial ? ` / ${copy.partial}` : ""}`}`;
            return <td key={offset} data-cohort-offset={offset} className="px-1 py-2 text-center align-middle" title={cellHelp} aria-label={cellHelp}>
              <span className={`flex min-h-10 flex-col items-center justify-center rounded-sm px-0.5 py-1 ${value === null ? "text-slate-400" : "text-slate-900"}`} style={value === null ? undefined : { backgroundColor: `rgba(13,148,136,${0.05 + Math.min(fraction, 1) * 0.55})` }}>
                <span>{label}</span><span className="block h-3 text-[9px] leading-3 text-slate-600">{partial ? copy.partialShort : ""}</span>
              </span>
            </td>;
          })}
        </tr>)}</tbody>
      </table>
      {chunk.some((row) => row.eventsBeyondHorizon) && <p className="mt-3 text-xs leading-5 text-slate-500">{copy.beyond} {count(chunk.reduce((total, row) => total + row.eventsBeyondHorizon, 0))}</p>}
    </>}
  </section>)}</>;
}

export function KommoCohorts({ ctx }: { ctx: ViewContext }) {
  const { t, language, locale } = useReportLanguage();
  const copy = language === "ru" ? COPY.ru : COPY.en;
  const mode = ctx.options.cohortMode ?? "cumulative";
  const event = ctx.options.cohortEvent;
  const events: { value: StageEvent; label: string }[] = [
    { value: "firstPaymentAt", label: copy.firstPayment }, { value: "fullPaymentAt", label: copy.fullPayment },
    { value: "firstContactAt", label: copy.firstContact }, { value: "agreementSentAt", label: copy.agreementSent },
  ];
  const label = events.find((option) => option.value === event)!.label;
  const count = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
  const percent = (value: number) => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(value);
  const summary = summarize(ctx.leads);
  const dated = ctx.leads.filter((lead) => cohortEventLag(lead, ctx.asOf, event) !== null).length;
  const missingCreation = ctx.leads.filter((lead) => !lead.createdAt).length;
  const modeHelp = `${copy.calendar} ${copy.example} ${copy.monthlyExample} ${copy.cumulativeExample}`;
  const tableProps = { mode, copy, count, percent };
  const evidenceKeys: KommoEvidenceMetric[] = ["all", "datedEvent", "clients", "paidUnknown"];
  return <>
    <section data-report-block className="min-w-0 border-t border-slate-200 bg-white px-4 py-5 sm:px-5">
      <h2 className="mb-3 flex items-center gap-1 text-base font-semibold text-slate-950">{copy.event}<Hint text={copy.datesOnly} /></h2>
      <div role="group" aria-label={copy.event} className="mb-5 flex flex-wrap gap-2">{events.map((option) => <button key={option.value} type="button" aria-pressed={event === option.value} onClick={() => ctx.onOptionsChange({ cohortEvent: option.value })} className={`min-h-10 max-w-full whitespace-normal rounded-md border px-3 py-2 text-left text-sm leading-5 ${event === option.value ? "border-blue-600 bg-blue-50 font-semibold text-blue-700" : "border-slate-200 text-slate-600"}`}>{option.label}</button>)}</div>
      <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold text-slate-950">{copy.mode}<Hint text={modeHelp} /></h3>
      <div role="group" aria-label={copy.mode} className="grid max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">{(["cumulative", "monthly"] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => ctx.onOptionsChange({ cohortMode: value })} className={`min-h-11 min-w-0 whitespace-normal rounded-md border px-3 py-2 text-left text-sm leading-5 ${mode === value ? "border-blue-600 bg-blue-50 font-semibold text-blue-700" : "border-slate-200 text-slate-600"}`}>{copy[value]}</button>)}</div>
      <p className="mt-4 text-xs leading-5 text-slate-600">{copy.calendar} {copy.example} {mode === "monthly" ? copy.monthlyExample : copy.cumulativeExample}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{copy.datesOnly} {copy.horizon}</p>
    </section>
    <Metrics items={[
      { label: copy.selectedLeads, value: count(summary.leads), sub: copy.originalMonth, help: copy.latest },
      { label: copy.dated, value: count(dated), sub: label, help: copy.validHelp },
      { label: copy.paidStatus, value: summary.clientRate === null ? "n/a" : percent(summary.clientRate), sub: `${count(summary.clients)} ${copy.clients}`, help: copy.paidHelp, tone: "green" },
      { label: copy.paidUnknown, value: count(summary.paidUnknown), help: copy.paidUnknownHelp, tone: "amber" },
    ].map((item, index) => ({ ...item, tone: item.tone as "green" | "amber" | undefined,
      description: kommoMetricDescription(evidenceKeys[index], language),
      evidence: () => buildKommoEvidence(evidenceKeys[index], ctx.leads, { raw: ctx.rawBase, scope: ctx.selectionLabel, asOf: ctx.asOf, event, language }),
    }))} />
    {missingCreation > 0 && <p data-report-block className="border-l-2 border-amber-400 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950">{copy.missingCreation} {count(missingCreation)}</p>}
    <CohortTable rows={cohortRows(ctx.leads, ctx.asOf, event)} title={`${copy.cohorts} / ${label}`} {...tableProps} />
    {[...groups(ctx.leads, (lead) => lead.service)].sort(([a], [b]) => a.localeCompare(b, locale)).map(([service, leads]: [string, KommoLead[]]) => <CohortTable key={service} rows={cohortRows(leads, ctx.asOf, event)} service={service} title={`${t(service)} / ${label}`} {...tableProps} />)}
    <Trend title={copy.paidTrend} help={copy.paidTrendHelp} rows={monthlyMetrics(ctx.leads)} percent series={[{ key: "clientRate", label: copy.paidRate }, { key: "fullPaidRate", label: copy.fullPaidRate }]} />
  </>;
}
