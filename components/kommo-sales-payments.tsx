"use client";

import { salesActivity, type SalesPayment } from "@/lib/kommo-sales";
import { buildKommoEvidence } from "@/lib/kommo-metric-evidence";
import type { KommoLead } from "@/lib/kommo";
import type { MetricEvidence } from "@/lib/metric-evidence";
import { DataTable, dayLabel, Metrics, num, Panel, Trend } from "./kommo-ui";
import { EvidenceButton } from "./metric-data-drawer";
import { useReportLanguage } from "./report-language";
import type { ViewContext } from "./kommo-views";

const COPY = {
  en: {
    title: "Sales activity by event date", first: "First payments in period", further: "Further payments in period", paying: "Paying leads in period", amount: "Known dated payment amounts",
    scope: "These blocks use payment / agreement dates, not lead creation dates. Older leads are included. Service, channel, manager, origin and cleanup filters still apply. Managers are the current CRM owners, not necessarily the owners at payment time.",
    selectedScope: "These blocks include only leads originally created in the selected period, and only their payments / agreement events dated within that same period. Service, channel, manager, origin and cleanup filters still apply. Managers are the current CRM owners, not necessarily the owners at payment time.",
    allMode: "All lead creation dates", selectedMode: "Created in selected dates", selectedFirstHelp: "Dated first payments within the selected period, only for leads originally created in that same period.",
    selectedGaps: "Payment dates requiring review / selected creation dates", selectedGapHelp: "This review covers only leads originally created in the selected period, with the other filters preserved. Missing payment dates remain unknown and are not assigned to this month.",
    selectedUndated: "Retainer sent without date / selected creation dates",
    dates: "Only recorded First / Second / Third payment at calendar dates establish a payment in this period. Dates before lead creation are included with a warning in sales only; impossible or future dates remain excluded. A paid stage or Last Modified does not establish its month. Full payment at is a milestone, not an additional transfer. Amounts use the corresponding Payment 1 / 2 / 3 field, not Sale or another installment.",
    warning: "Date warnings", before_creation: "Receipt precedes lead creation: included in sales, excluded from timed cohorts",
    firstHelp: "Number of dated first-payment entries within the selected dates, including leads created earlier.", furtherHelp: "Dated second and third installments within the selected dates. One lead can contribute two installments.",
    payingHelp: "Distinct analytical leads with at least one dated payment in the period. Not the number of new leads or contracts.", amountHelp: "Sum of known amounts paired with payment dates in the period. Missing or conflicting amounts are excluded, not zero. CRM units; no currency conversion or bank reconciliation.",
    manager: "Payments by manager / receipt dates", stages: "Agreements and full-payment milestones / event dates", register: "Dated payment register", gaps: "Payment dates requiring review / all creation dates",
    owner: "Manager", firstCol: "First payments", furtherCol: "Further installments", payingCol: "Paying leads", amountCol: "Known amount", missing: "Missing amounts", sent: "Sent with date", signed: "Signed with date", full: "Full-paid with date", undated: "Retainer sent without date / all history",
    lead: "Lead / contact", date: "Payment date", installment: "Installment", sourceIds: "Source CRM IDs", review: "Leads needing date review", unknownRetainer: "Retainers without sent date",
    gapHelp: "This review covers all creation dates in the selected service/channel/manager scope. Missing dates cannot be assigned to this month. Open Data to inspect the affected records. No date or payment is invented from a stage.",
    absent: "Milestone columns not exported (shown as n/a, not zero)",
    covered: "dated entries with known amounts", eventUnit: "dated entries", cohorts: "Lead creation-cohort analysis", cohortHelp: "The following workload, conversion and lifetime amount metrics still describe leads created in the selected dates. They are not payments received in the period.",
    missing_date: "Payment evidence without a usable date", invalid_date: "Payment date rejected by validation", conflicting_dates: "Different dates for the same installment in consolidated records", conflicting_amounts: "Different amounts for the same dated installment", full_before_installment: "Full-payment date precedes a later installment",
  },
  ru: {
    title: "Работа sales по датам событий", first: "Первые оплаты за период", further: "Последующие оплаты за период", paying: "Оплатившие лиды за период", amount: "Известные суммы оплат за период",
    scope: "В этих блоках период применяется к датам платежей и договоров, а не создания лидов. Старые лиды тоже включены. Фильтры услуг, каналов, менеджеров, происхождения и очистки сохранены. Менеджер — текущий ответственный в CRM; история ответственных на момент платежа недоступна.",
    selectedScope: "В этих блоках учитываются только лиды, исходно созданные в выбранном периоде, и только их оплаты и события договоров с датами внутри того же периода. Фильтры услуг, каналов, менеджеров, происхождения и очистки сохранены. Менеджер — текущий ответственный в CRM, а не обязательно ответственный на момент оплаты.",
    allMode: "Все даты создания лидов", selectedMode: "Созданы в выбранном периоде", selectedFirstHelp: "Первые платежи с датой внутри выбранного периода только по лидам, исходно созданным в этом же периоде.",
    selectedGaps: "Даты оплат для проверки / выбранные даты создания", selectedGapHelp: "Проверка охватывает только лидов, исходно созданных в выбранном периоде, с сохранением остальных фильтров. Пустые даты платежей остаются неизвестными и не приписываются этому месяцу.",
    selectedUndated: "Retainer sent без даты / выбранные даты создания",
    dates: "Платёж относится к периоду по записанной календарной дате First / Second / Third payment at. Даты раньше создания лида включены только в sales с предупреждением; невозможные и будущие даты исключены. Оплаченный этап и Last Modified не определяют месяц оплаты. Full payment at — отдельная отметка, а не дополнительный перевод. Сумма берётся из соответствующего Payment 1 / 2 / 3, не из Sale или другого платежа.",
    warning: "Проверить даты", before_creation: "Оплата раньше создания лида: включена в sales, исключена из временных когорт",
    firstHelp: "Количество первых платежей с датой внутри периода, в том числе по лидам, созданным раньше.", furtherHelp: "Вторые и третьи платежи с датой внутри периода. Один лид может дать два последующих платежа.",
    payingHelp: "Количество разных аналитических лидов хотя бы с одним датированным платежом в периоде. Это не число новых лидов или договоров.", amountHelp: "Сумма известных значений, связанных с датами платежей периода. Пустые и противоречивые суммы не заменяются нулём. Единицы CRM, без конвертации валют и сверки с банком.",
    manager: "Оплаты по менеджерам / даты получения", stages: "Договоры и полная оплата / даты событий", register: "Реестр датированных платежей", gaps: "Даты оплат для проверки / все даты создания",
    owner: "Менеджер", firstCol: "Первые оплаты", furtherCol: "Последующие платежи", payingCol: "Оплатившие лиды", amountCol: "Известная сумма", missing: "Без суммы", sent: "Отправлены с датой", signed: "Подписаны с датой", full: "Полная оплата с датой", undated: "Retainer sent без даты / вся история",
    lead: "Лид / контакт", date: "Дата платежа", installment: "Номер платежа", sourceIds: "Исходные ID CRM", review: "Лиды с датами для проверки", unknownRetainer: "Договоры без даты отправки",
    gapHelp: "Проверка охватывает все даты создания в выбранном срезе услуг, каналов и менеджеров. Оплаты без даты нельзя приписать этому месяцу. Кнопка «Данные» открывает записи. Даты и платежи не придумываются по стадиям.",
    absent: "Столбцы этапов отсутствуют в выгрузке (показаны как n/a, не ноль)",
    covered: "датированных платежей с известной суммой", eventUnit: "датированные записи", cohorts: "Аналитика по месяцу создания лида", cohortHelp: "Следующие показатели нагрузки, конверсий и накопленных сумм относятся к лидам, созданным в выбранные даты. Это не оплаты, полученные за период.",
    missing_date: "Есть признаки оплаты, но нет корректной даты", invalid_date: "Дата платежа не прошла проверку", conflicting_dates: "Разные даты одного платежа в объединённых записях", conflicting_amounts: "Разные суммы одного датированного платежа", full_before_installment: "Дата полной оплаты раньше последующего платежа",
  },
};

function Opaque({ value }: { value: string }) { return <>{value}</>; }

export function SalesPayments({ ctx, details = false }: { ctx: ViewContext; details?: boolean }) {
  const { language } = useReportLanguage();
  const c = COPY[language];
  const createdOnly = ctx.options.salesCreatedOnly;
  const activity = salesActivity(ctx.base, ctx.scope, ctx.asOf, ctx.rawBase, createdOnly);
  const mode = createdOnly ? c.selectedMode : c.allMode;
  const scopeDescription = createdOnly ? c.selectedScope : c.scope;
  const firstHelp = createdOnly ? c.selectedFirstHelp : c.firstHelp;
  const gapTitle = createdOnly ? c.selectedGaps : c.gaps;
  const gapHelp = createdOnly ? c.selectedGapHelp : c.gapHelp;
  const hasColumn = (name: string) => ctx.headers?.some((header) => header.trim().toLowerCase() === name.toLowerCase())
    ?? activity.population.some((lead) => lead.filled.includes(name));
  const missingMilestones = ["Agreement sent at", "Agreement signed at", "Full payment at"].filter((field) => !hasColumn(field));
  const notice = `${scopeDescription} ${c.dates}`;
  function evidence(leads: KommoLead[], title: string, description: string): MetricEvidence {
    return { ...buildKommoEvidence("all", [...new Set(leads)], { raw: ctx.rawBase, language, scope: `${ctx.scope.from} / ${ctx.scope.to} / ${mode}` }),
      title, description, formula: description, denominator: undefined, notice };
  }
  function paymentEvidence(events: SalesPayment[], title: string, description: string): MetricEvidence {
    const value = evidence(events.map((event) => event.lead), title, description);
    const rows = new Map(value.rows.map((row) => [row.id, row]));
    return { ...value, numerator: events.length, fields: ["paymentDate", "installment", "paymentAmount", "paymentSourceIds", "paymentDateWarning", ...value.fields],
      rows: events.map((event) => ({ ...rows.get(event.lead.id)!, key: event.key, fields: { ...rows.get(event.lead.id)!.fields,
        paymentDate: event.at.toISOString(), installment: String(event.installment), paymentAmount: event.amount === null ? "" : String(event.amount), paymentSourceIds: event.sourceIds.join(", "), paymentDateWarning: event.beforeCreation ? c.before_creation : "" } })) };
  }
  const gapLeads = [...new Set(activity.gaps.map((gap) => gap.lead))];
  const gapEvidence = () => {
    const value = evidence(gapLeads, gapTitle, gapHelp);
    return { ...value, fields: ["paymentReview", ...value.fields], notice: gapHelp,
      rows: value.rows.map((row) => ({ ...row, fields: { ...row.fields, paymentReview: activity.gaps.filter((gap) => gap.lead.id === row.id)
        .map((gap) => `${gap.installment ? `Payment ${gap.installment}: ` : ""}${c[gap.reason]}`).join("; ") } })) };
  };
  return <>
    <Panel title={`${c.title} / ${mode}`} help={notice}><p className="text-sm leading-6 text-slate-600">{scopeDescription}</p><p className="mt-2 text-xs leading-5 text-slate-500">{c.dates}</p>{missingMilestones.length > 0 && <p className="mt-2 text-xs leading-5 text-amber-800">{c.absent}: <span translate="no">{missingMilestones.join(", ")}</span></p>}</Panel>
    <Metrics items={[
      { label: c.first, value: num(activity.first.length), help: firstHelp, evidence: () => paymentEvidence(activity.first, c.first, firstHelp), tone: "green" },
      { label: c.further, value: num(activity.further.length), help: c.furtherHelp, evidence: () => paymentEvidence(activity.further, c.further, c.furtherHelp), tone: "blue" },
      { label: c.paying, value: num(activity.payingLeads.length), help: c.payingHelp, evidence: () => evidence(activity.payingLeads, c.paying, c.payingHelp) },
      { label: c.amount, value: num(activity.amount), sub: `${activity.payments.length - activity.missingAmounts} / ${activity.payments.length} ${c.covered}`, help: c.amountHelp,
        evidence: () => { const value = paymentEvidence(activity.payments, c.amount, c.amountHelp); return { ...value, numerator: undefined }; } },
    ]} />
    <DataTable title={c.manager} help={notice} firstWidth="20%" headers={[c.owner, c.firstCol, c.furtherCol, c.payingCol, c.amountCol, c.missing, c.warning]}
      rows={activity.managerRows.map((row) => [<Opaque key="owner" value={row.owner} />, num(row.first), num(row.further), num(row.payingLeads), num(row.amount), num(row.missingAmounts), num(row.dateWarnings)])} />
    <DataTable title={c.stages} help={notice} firstWidth="20%" headers={[c.owner, c.sent, c.signed, c.full, createdOnly ? c.selectedUndated : c.undated]}
      rows={activity.managerRows.map((row) => [<Opaque key="owner" value={row.owner} />, num(hasColumn("Agreement sent at") ? row.sent : null), num(hasColumn("Agreement signed at") ? row.signed : null), num(hasColumn("Full payment at") ? row.fullPaid : null), num(row.undatedRetainers)])} />
    <Panel title={gapTitle} help={gapHelp}>
      <p className="text-xs leading-5 text-slate-600">{gapHelp}</p>
      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-4 text-sm">
        <div>{c.review}: <strong>{num(gapLeads.length)}</strong><EvidenceButton evidence={gapEvidence} /></div>
        <div>{c.unknownRetainer}: <strong>{num(activity.undatedRetainers.length)}</strong><EvidenceButton evidence={() => evidence(activity.undatedRetainers, c.unknownRetainer, gapHelp)} /></div>
      </div>
    </Panel>
    {details && <DataTable title={c.register} help={notice} firstWidth="25%" headers={[c.lead, c.owner, c.installment, c.date, c.amountCol, c.sourceIds]}
      rows={activity.payments.map((event) => [<span key={event.key}><span className="block text-slate-400">#{event.lead.id}</span><Opaque value={event.lead.contact || event.lead.title} /></span>, <Opaque key="owner" value={event.lead.owner} />, num(event.installment), <span key="date">{dayLabel(event.at)}{event.beforeCreation && <span className="mt-1 block text-[10px] leading-4 text-amber-800">{c.before_creation}</span>}</span>, num(event.amount), event.sourceIds.join(", ")])} />}
    {!details && activity.payments.length > 0 && <Trend title={c.register} help={notice}
      rows={[...new Set(activity.payments.map((event) => event.at.toISOString().slice(0, 7)))].sort().map((month) => ({ month,
        first: activity.first.filter((event) => event.at.toISOString().startsWith(month)).length,
        further: activity.further.filter((event) => event.at.toISOString().startsWith(month)).length }))}
      series={[{ key: "first", label: c.firstCol, bar: true }, { key: "further", label: c.furtherCol, bar: true }]} />}
    {ctx.leads.length > 0 && <Panel title={c.cohorts} help={c.cohortHelp}><p className="text-sm leading-6 text-slate-600">{c.cohortHelp}</p></Panel>}
  </>;
}
