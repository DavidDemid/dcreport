import {
  hasAgreementSent,
  hasAgreementSigned,
  isClient,
  isDuplicate,
  isFullPaidClient,
  isQualifiedActive,
  isRejected,
  isRelevantStrict,
} from "./analytics";
import { leadIdentityKey, type CRMRecord } from "./crm";
import type { EvidenceRow, MetricEvidence } from "./metric-evidence";

export type PlanfixMetricKey = "leads" | "relevant" | "rejected" | "qualified" | "agreementSent" | "agreementSigned" | "clients" | "fullPaid" | "duplicates" | "signedValue";
type Language = "en" | "ru";
type Localized = { en: string; ru: string };
type Definition = {
  title: Localized;
  description: Localized;
  formula: string;
  fields: string[];
  includes: (record: CRMRecord) => boolean;
};

const CLIENT_STATUSES = "INITIAL PAYMENT RECEIVED, 2ND INSTALLMENT RECEIVED, FULL PAYMENT IS MADE, ЗАВЕРШЕНЕ, COMPLETED";
const definitions: Record<PlanfixMetricKey, Definition> = {
  leads: {
    title: { en: "Total leads", ru: "Всего лидов" },
    description: { en: "All records remaining after this card's filters and the selected cleanup mode.", ru: "Все записи после фильтров этой карточки и выбранного режима очистки." },
    formula: "count(selected records)",
    fields: ["createdAt", "reportingService", "source", "sourceMethod"],
    includes: () => true,
  },
  relevant: {
    title: { en: "Relevant strict", ru: "Строгая доля целевых лидов" },
    description: { en: "Relevant field equals Relevant, divided by all selected records; blank assessments stay in the base.", ru: "Записи с Relevant = Relevant / все выбранные записи. Пустые оценки остаются в базе." },
    formula: 'count(trim(lower(Relevant)) = "relevant") / count(selected records)',
    fields: ["Relevant"],
    includes: isRelevantStrict,
  },
  rejected: {
    title: { en: "Rejected rate", ru: "Доля отказов" },
    description: { en: "Records with REJECTED status or a lost_at date, divided by all selected records.", ru: "Записи со статусом REJECTED или датой lost_at / все выбранные записи." },
    formula: 'count(upper(trim(status)) = "REJECTED" OR lost_at) / count(selected records)',
    fields: ["status", "lost_at", "Reason for Rejection"],
    includes: isRejected,
  },
  qualified: {
    title: { en: "Qualified / Active proxy", ru: "Квалифицированные / активные, прокси" },
    description: { en: "Relevant, or an active/contact proxy without an explicit negative assessment, divided by all selected records.", ru: "Relevant либо признаки активности или контакта без явной отрицательной оценки / все выбранные записи." },
    formula: 'count(Relevant = relevant OR (Relevant NOT IN [no relevant, not relevant] AND (active status OR first_contact_at OR first_response_at))) / count(selected records)',
    fields: ["Relevant", "status", "first_contact_at", "first_response_at"],
    includes: isQualifiedActive,
  },
  agreementSent: {
    title: { en: "Agreement sent", ru: "Договор отправлен" },
    description: { en: "Sent/signed date or a Retainer-sent/later status, divided by all selected records; status is only a proxy.", ru: "Дата отправки или подписи либо этап отправки договора и позднее / все выбранные записи. Этап является прокси." },
    formula: `count(agreement_sent_at OR agreement_signed_at OR status IN [RETAINER AGREEMENT SENT, ${CLIENT_STATUSES}]) / count(selected records)`,
    fields: ["agreement_sent_at", "agreement_signed_at", "status"],
    includes: hasAgreementSent,
  },
  agreementSigned: {
    title: { en: "Agreement signed", ru: "Договор подписан" },
    description: { en: "Signed/payment date, nonempty payment_status or a paid/completed status, divided by all selected records; proxies do not prove a signature.", ru: "Дата подписи или оплаты, непустой payment_status либо оплаченный или завершенный этап / все записи. Прокси не доказывает подпись." },
    formula: `count(agreement_signed_at OR first_payment_at OR full_payment_at OR nonempty payment_status OR status IN [${CLIENT_STATUSES}]) / count(selected records)`,
    fields: ["agreement_signed_at", "first_payment_at", "full_payment_at", "payment_status", "status"],
    includes: hasAgreementSigned,
  },
  clients: {
    title: { en: "First-payment clients", ru: "Клиенты: первая оплата" },
    description: { en: "First/full-payment date, nonempty payment_status or a paid/completed status, divided by all selected records.", ru: "Дата первой или полной оплаты, непустой payment_status либо оплаченный или завершенный этап / все выбранные записи." },
    formula: `count(first_payment_at OR full_payment_at OR nonempty payment_status OR status IN [${CLIENT_STATUSES}]) / count(selected records)`,
    fields: ["first_payment_at", "full_payment_at", "payment_status", "status"],
    includes: isClient,
  },
  fullPaid: {
    title: { en: "Full payment", ru: "Полная оплата" },
    description: { en: "Full-payment/completion date or a full-paid/completed status, divided by all selected records.", ru: "Дата полной оплаты или завершения либо этап полной оплаты или завершения / все выбранные записи." },
    formula: "count(full_payment_at OR completed_at OR status IN [FULL PAYMENT IS MADE, ЗАВЕРШЕНЕ, COMPLETED]) / count(selected records)",
    fields: ["full_payment_at", "completed_at", "status"],
    includes: isFullPaidClient,
  },
  duplicates: {
    title: { en: "Duplicates", ru: "Дубли" },
    description: { en: "Explicit duplicates or repeated identity/service rows within the analytics 30-day window, divided by all selected records.", ru: "Явные дубли либо повторения личности и услуги в 30-дневном окне аналитики / все выбранные записи." },
    formula: "count(duplicate_flag OR rejection reason DOUBLE OR repeated identity + reportingService within 30 days of the last accepted record) / count(selected records)",
    fields: ["duplicate_flag", "Reason for Rejection", "email", "googleClientId", "counterparty", "title", "createdAt", "reportingService", "duplicateRule (derived)", "matchingBaseId (derived)", "matchingBaseRow (derived)"],
    includes: isDuplicate,
  },
  signedValue: {
    title: { en: "CRM signed value", ru: "Сумма подписанных сделок CRM" },
    description: { en: "Sum of deal_value_actual for signed/proxy-signed records. Missing amounts count as zero; this is not finance revenue.", ru: "Сумма deal_value_actual по записям с подписью или ее прокси. Пустые суммы считаются нулем; это не финансовые поступления." },
    formula: "sum(deal_value_actual ?? 0 for records where hasAgreementSigned = true)",
    fields: ["deal_value_actual", "agreement_signed_at", "first_payment_at", "full_payment_at", "payment_status", "status"],
    includes: hasAgreementSigned,
  },
};

export function planfixMetricDescription(metric: PlanfixMetricKey, language: Language = "en"): string {
  return definitions[metric].description[language];
}

type DuplicateMatch = { explicit: boolean; base?: CRMRecord };

// Mirror the private analytics duplicate counter, retaining original array positions as evidence.
function duplicateMatches(records: CRMRecord[]): Map<number, DuplicateMatch> {
  const seen = new Map<string, { time: number; record: CRMRecord }>();
  const matches = new Map<number, DuplicateMatch>();
  const sorted = records.map((record, index) => ({ record, index })).sort((a, b) => (a.record.createdAt?.getTime() ?? 0) - (b.record.createdAt?.getTime() ?? 0) || a.record.rowNumber - b.record.rowNumber);
  for (const { record, index } of sorted) {
    const key = `${leadIdentityKey(record)}|||${record.reportingService}`;
    const time = record.createdAt?.getTime() ?? 0;
    const previous = seen.get(key);
    const explicit = isDuplicate(record);
    const withinWindow = previous !== undefined && time && time - previous.time <= 30 * 86_400_000;
    if (explicit || withinWindow) {
      matches.set(index, { explicit, base: withinWindow ? previous.record : undefined });
      continue;
    }
    seen.set(key, { time, record });
  }
  return matches;
}

function dateValue(value: Date | null): string {
  return value && Number.isFinite(value.getTime()) ? value.toISOString() : "";
}

const FIELD_ALIASES: Record<string, keyof CRMRecord> = {
  Relevant: "relevant", lost_at: "lostAt", "Reason for Rejection": "rejectionReason",
  first_contact_at: "firstContactAt", first_response_at: "firstResponseAt",
  agreement_sent_at: "agreementSentAt", agreement_signed_at: "agreementSignedAt",
  first_payment_at: "firstPaymentAt", full_payment_at: "fullPaymentAt", payment_status: "paymentStatus",
  completed_at: "completedAt", duplicate_flag: "duplicateFlag", deal_value_actual: "dealValueActual",
};

function fieldValue(record: CRMRecord, field: string): string {
  const value = record[FIELD_ALIASES[field] ?? field as keyof CRMRecord];
  return value instanceof Date ? dateValue(value) : value == null ? "" : String(value);
}

export function buildPlanfixMetricEvidence(metric: PlanfixMetricKey, records: CRMRecord[], options: { language?: Language; scope?: string } = {}): MetricEvidence {
  const language = options.language ?? "en";
  const definition = definitions[metric];
  const duplicates = metric === "duplicates" ? duplicateMatches(records) : null;
  const fields = ["rowNumber", ...definition.fields];
  const baseRows: EvidenceRow[] = records.map((record, index) => {
    const values = Object.fromEntries(fields.map((field) => [field, fieldValue(record, field)]));
    const duplicate = duplicates?.get(index);
    if (duplicate) {
      values["duplicateRule (derived)"] = duplicate.explicit
        ? language === "ru" ? "Явная метка дубля или причина DOUBLE" : "Explicit duplicate flag or rejection reason DOUBLE"
        : language === "ru" ? "Совпадение личности и услуги в 30-дневном окне" : "Matching identity and service within the 30-day window";
      values["matchingBaseId (derived)"] = duplicate.base?.id ?? "";
      values["matchingBaseRow (derived)"] = duplicate.base ? String(duplicate.base.rowNumber) : "";
    }
    return {
      key: `${record.rowNumber}:${record.id}:${index}`,
      id: record.id,
      name: record.counterparty || record.title,
      owner: record.assignee,
      service: record.reportingService,
      source: record.source,
      stage: record.status,
      relevancy: record.relevant,
      created: dateValue(record.createdAt),
      mergedIds: [],
      fields: values,
    };
  });
  const rows = baseRows.filter((_, index) => duplicates ? duplicates.has(index) : definition.includes(records[index]));
  const notices = [language === "ru"
    ? "Показаны точные нормализованные записи этой карточки. В режиме очистки значения могут быть объединены из истории. Исходные значения ячеек и ID объединенных записей не сохраняются; показан только оставшийся ID. Названия полей являются нормализованными именами или алиасами, даты показаны в ISO-формате."
    : "These are the exact normalized records behind this card. Clean mode may consolidate historical values. Original cell values and merged-history IDs are not retained; only the retained ID is available. Field names are normalized names or aliases, and dates are shown as ISO timestamps."];
  if (metric === "clients" || metric === "agreementSigned" || metric === "signedValue") notices.push(language === "ru"
    ? "Текущее правило PlanFix учитывает любой непустой payment_status, даже текст без подтверждения оплаты. Прокси не является проверенной оплатой или подписью."
    : "The current PlanFix rule accepts any nonempty payment_status, even text that does not confirm payment. A proxy is not a verified payment or signature.");
  if (metric === "qualified") notices.push(language === "ru"
    ? `Активные статусы: RETAINER AGREEMENT SENT, ${CLIENT_STATUSES}, IN WORK, PAUSED, WHATSAPP. Relevant включается независимо от этапа; No Relevant и Not Relevant исключаются из этого прокси.`
    : `Active statuses: RETAINER AGREEMENT SENT, ${CLIENT_STATUSES}, IN WORK, PAUSED, WHATSAPP. Relevant qualifies independently of status; No Relevant and Not Relevant are excluded from this proxy.`);
  if (metric === "duplicates") notices.push(language === "ru"
    ? "Порядок: дата создания, затем номер строки. Личность определяется по валидному email, затем Google Client ID, контрагенту, заголовку, ID или номеру строки. Совпадение требует той же услуги. Дубль не сдвигает опорную дату; строка без даты не совпадает по временному окну."
    : "Order: creation date, then row number. Identity uses valid email, then Google Client ID, counterparty, title, ID or row number. A match requires the same reporting service. Duplicates do not advance the anchor; an undated row cannot match by the time window.");
  return {
    title: definition.title[language],
    description: definition.description[language],
    formula: definition.formula,
    fields,
    rows,
    baseRows,
    numerator: metric === "signedValue" ? records.reduce((sum, record) => sum + (hasAgreementSigned(record) ? record.dealValueActual ?? 0 : 0), 0) : rows.length,
    ...(metric === "leads" || metric === "signedValue" ? {} : { denominator: records.length }),
    scope: options.scope ?? (language === "ru" ? "Точные фильтры этой карточки, включая выбранный режим очистки." : "This card's exact filters, including the selected cleanup mode."),
    notice: notices.join(" "),
  };
}
