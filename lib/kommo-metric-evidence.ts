import type { EvidenceRow, MetricEvidence } from "./metric-evidence";
import type { KommoLead } from "./kommo";
import {
  cohortEventLag, hasContact, isAgreement, isClient, isFullPaid, isOpen, isQualified,
  isRelevant, isWon, responseMinutes, summarize,
} from "./kommo-analytics";
import type { StageEvent } from "./kommo-analytics";

export type KommoEvidenceMetric =
  | "all" | "relevant" | "assessed" | "unassessed" | "relevantAmongAssessed"
  | "qualified" | "agreement" | "clients" | "fullPaid" | "signed"
  | "response" | "contactSla" | "noContact" | "overdue" | "noTask"
  | "sales" | "payments" | "touches" | "datedEvent" | "paidUnknown";

export type KommoEvidenceOptions = {
  raw?: KommoLead[];
  scope?: string;
  asOf?: Date;
  sla?: number;
  event?: StageEvent;
  language?: "en" | "ru";
};

type Bilingual = readonly [english: string, russian: string];
type Definition = { title: Bilingual; description: Bilingual; formula: Bilingual; fields: readonly string[] };
const PAYMENT_FIELDS = ["firstPaymentAt", "secondPaymentAt", "thirdPaymentAt", "fullPaymentAt", "paymentStatus", "payments", "paymentAmounts", "reachedStages"];
const OPEN_FIELDS = ["stage", "closedAt", "lostAt", "completedAt", "isOpen"];

const DEFINITIONS: Record<KommoEvidenceMetric, Definition> = {
  all: {
    title: ["Selected leads", "Выбранные лиды"],
    description: ["All leads in the current selection, with the chosen filters and cleanup mode.", "Все лиды текущего среза с выбранными фильтрами и режимом очистки."],
    formula: ["Number of leads in the current selection.", "Количество лидов текущего среза."],
    fields: ["createdAt", "importedAt", "migrated", "service", "sourceRaw", "sourceMethod", "mergedIds"],
  },
  relevant: {
    title: ["Relevant strict", "Целевые от всех лидов"],
    description: ["Leads marked Relevant / all selected leads. Blank or unrecognized assessments stay in the base.", "Лиды с Relevant / все лиды текущего среза. Пустые и нераспознанные оценки остаются в базе."],
    formula: ["Leads with Relevancy = Relevant / all selected leads. Spaces and letter case do not affect the match.", "Лиды с Relevancy = Relevant / все выбранные лиды. Краевые пробелы и регистр не влияют на сравнение."],
    fields: ["relevancy", "isRelevant", "isAssessed"],
  },
  assessed: {
    title: ["Assessment coverage", "Охват оценкой"],
    description: ["Leads with an explicit relevance assessment / all selected leads. Blank or unrecognized values are unassessed.", "Лиды с явной оценкой релевантности / все выбранные лиды. Пустые и нераспознанные значения не считаются оценкой."],
    formula: ["Leads marked Relevant, Not Relevant or No Relevant / all selected leads.", "Лиды с Relevant, Not Relevant или No Relevant / все выбранные лиды."],
    fields: ["relevancy", "isAssessed", "isRelevant"],
  },
  unassessed: {
    title: ["Unassessed leads", "Неоценённые лиды"],
    description: ["Selected leads outside the accepted assessment values, including blank or malformed Relevancy; this is not evidence of poor lead quality.", "Выбранные лиды без допустимой оценки, включая пустую или некорректную Relevancy. Это не доказательство низкого качества лидов."],
    formula: ["All selected leads minus leads marked Relevant, Not Relevant or No Relevant.", "Все выбранные лиды минус лиды с Relevant, Not Relevant или No Relevant."],
    fields: ["relevancy", "isAssessed"],
  },
  relevantAmongAssessed: {
    title: ["Relevant among assessed", "Целевые среди оценённых"],
    description: ["Relevant leads divided only by assessed leads. Blank or unrecognized assessments are excluded from this denominator and available as a separate segment.", "Целевые лиды делятся только на оценённых. Пустые и нераспознанные оценки исключены из этой базы и доступны отдельной группой."],
    formula: ["Leads marked Relevant / leads marked Relevant, Not Relevant or No Relevant. No assessments means no rate.", "Лиды с Relevant / лиды с Relevant, Not Relevant или No Relevant. Без оценённых лидов доля не рассчитывается."],
    fields: ["relevancy", "isRelevant", "isAssessed"],
  },
  qualified: {
    title: ["Qualified / active", "Квалифицированные / в работе"],
    description: ["Leads with work, agreement or payment evidence / all selected leads. Relevant alone is insufficient.", "Лиды с признаками работы, договора или оплаты / все выбранные лиды. Relevant сам по себе недостаточен."],
    formula: ["Leads with accepted work/agreement dates, qualifying reached stages or payment evidence / all selected leads.", "Лиды с принятой датой работы или договора, подходящим достигнутым этапом либо признаками оплаты / все выбранные лиды."],
    fields: ["inWorkAt", "agreementSentAt", "agreementSignedAt", ...PAYMENT_FIELDS, "isQualified"],
  },
  agreement: {
    title: ["Agreement sent / later", "Договор отправлен / более поздний этап"],
    description: ["Leads with agreement or payment evidence / all selected leads. A stage alone does not confirm signing or its date.", "Лиды с признаками договора или оплаты / все выбранные лиды. Один этап не подтверждает подпись и её дату."],
    formula: ["Leads with a sent/signed date, a reached retainer/agreement stage or payment evidence / all selected leads.", "Лиды с датой отправки или подписи, достигнутым этапом договора либо признаками оплаты / все выбранные лиды."],
    fields: ["agreementSentAt", "agreementSignedAt", ...PAYMENT_FIELDS, "isAgreement"],
  },
  clients: {
    title: ["Clients", "Клиенты"],
    description: ["Leads with payment evidence / all selected leads. Payment status can establish a client even when the first-payment date is missing.", "Лиды с признаками оплаты / все выбранные лиды. Статус оплаты может подтверждать клиента даже без даты первого платежа."],
    formula: ["Leads with an accepted payment date, a positive payment, an explicit paid status or a reached payment stage / all selected leads.", "Лиды с принятой датой платежа, положительной суммой, явным оплаченным статусом или достигнутым этапом оплаты / все выбранные лиды."],
    fields: [...PAYMENT_FIELDS, "isClient"],
  },
  fullPaid: {
    title: ["Fully paid clients", "Полностью оплатившие клиенты"],
    description: ["Leads with full-payment evidence / all selected leads. Lawyer handover or completion alone is insufficient.", "Лиды с признаками полной оплаты / все выбранные лиды. Одной передачи юристу или завершения работ недостаточно."],
    formula: ["Leads with a full-payment date, an explicit fully-paid status or a reached full-payment stage / all selected leads.", "Лиды с датой полной оплаты, явным статусом или достигнутым этапом полной оплаты / все выбранные лиды."],
    fields: ["fullPaymentAt", "paymentStatus", "reachedStages", "isFullPaid"],
  },
  signed: {
    title: ["Dated signed agreements", "Договоры с датой подписания"],
    description: ["Leads with a recorded, accepted signature date. Agreement stages and payments do not prove a signature.", "Лиды с записанной и принятой датой подписания. Этап договора и оплата не подтверждают подпись."],
    formula: ["Number of leads with an accepted Agreement signed at date. A missing column is unavailable, not a confirmed zero.", "Количество лидов с принятой датой Agreement signed at. Отсутствующий столбец означает недоступность, а не подтверждённый ноль."],
    fields: ["agreementSignedAt", "filled"],
  },
  response: {
    title: ["First-contact time sample", "Выборка времени первого контакта"],
    description: ["Time from creation to recorded first contact, for native Kommo leads with both dates. The list is sorted from fastest to slowest; migrated leads are excluded.", "Время от создания до записанного первого контакта у лидов Kommo с обеими датами. Список — от быстрых к медленным; перенесённые лиды исключены."],
    formula: ["First contact at minus creation time, in calendar minutes; negative intervals excluded. Median and P90 use linear interpolation. Coverage = measured / all selected native leads.", "First contact at минус время создания в календарных минутах; отрицательные интервалы исключены. Медиана и P90 рассчитываются с линейной интерполяцией. Покрытие = измеренные / все выбранные неперенесённые лиды."],
    fields: ["createdAt", "firstContactAt", "migrated", "responseMinutes"],
  },
  contactSla: {
    title: ["First contact within SLA", "Первый контакт в пределах SLA"],
    description: ["Only measured native contacts at or below the supplied SLA. Missing contacts and migrated history are not SLA passes and are excluded from this denominator.", "Только измеренные контакты неперенесённых лидов не позже заданного SLA. Отсутствующие контакты и история переноса не считаются выполнением SLA и не входят в эту базу."],
    formula: ["Measured native contacts within SLA, including its boundary / all measured native contacts. Calendar minutes, not working time.", "Измеренные контакты в пределах SLA, включая границу / все измеренные контакты неперенесённых лидов. Календарные минуты, не рабочее время."],
    fields: ["createdAt", "firstContactAt", "migrated", "responseMinutes", "slaMinutes", "withinSla"],
  },
  noContact: {
    title: ["Native leads without contact", "Лиды Kommo без контакта"],
    description: ["Open native Kommo leads with no first-contact date or contact/work evidence. A contact stage can count as contact even without a date.", "Открытые лиды Kommo без даты первого контакта и признаков контакта или работы. Этап контакта может учитываться и без даты."],
    formula: ["Number of open, non-migrated leads without contact evidence. No age or SLA threshold is applied.", "Количество открытых неперенесённых лидов без признаков контакта. Порог возраста или SLA не применяется."],
    fields: ["migrated", "firstContactAt", "reachedStages", "hasContact", ...OPEN_FIELDS],
  },
  overdue: {
    title: ["Overdue tasks", "Просроченные задачи"],
    description: ["Open leads whose next task is earlier than the snapshot. A task exactly at the snapshot is not overdue.", "Открытые лиды со следующей задачей раньше среза. Задача ровно в момент среза не просрочена."],
    formula: ["Number of open leads with Next Task strictly earlier than the snapshot.", "Количество открытых лидов с Next Task строго раньше среза."],
    fields: ["nextTaskAt", "asOf", ...OPEN_FIELDS],
  },
  noTask: {
    title: ["Open leads without next task", "Открытые лиды без следующей задачи"],
    description: ["Open selected leads with no next task, regardless of migration or contact history.", "Открытые выбранные лиды без следующей задачи независимо от переноса и истории контакта."],
    formula: ["Number of open leads without Next Task.", "Количество открытых лидов без Next Task."],
    fields: ["nextTaskAt", ...OPEN_FIELDS],
  },
  sales: {
    title: ["Recorded CRM Sale", "Сумма сделок в CRM"],
    description: ["Recorded Sale for clients, signed agreements or won leads. Zero and missing amounts remain visible; the CRM currency is unspecified.", "Сумма Sale клиентов, договоров с датой подписи и выигранных лидов. Нули и пропуски видны; валюта CRM не указана."],
    formula: ["Sum Sale for clients, leads with a signature date or won leads; missing Sale contributes zero. This is a monetary sum, not a lead-count ratio.", "Сумма Sale клиентов, лидов с датой подписи или выигранных лидов; пропуск даёт нулевой вклад. Это денежная сумма, не доля лидов."],
    fields: ["sale", "saleContribution", "isClient", "agreementSignedAt", "isWon", "reachedStages"],
  },
  payments: {
    title: ["Recorded payment amounts", "Учтённые суммы платежей"],
    description: ["Sum all normalized Payment 1/2/3 amounts for selected leads, including zero and negative values. Missing/malformed amounts normalize to zero; Sale is never substituted.", "Сумма всех нормализованных Payment 1/2/3 выбранных лидов, включая нулевые и отрицательные значения. Пропуски и некорректные суммы нормализуются в ноль; Sale не подставляется."],
    formula: ["Sum Payment 1 + Payment 2 + Payment 3 for all selected leads. CRM units, not assumed EUR.", "Сумма Payment 1 + Payment 2 + Payment 3 по всем выбранным лидам. Единицы CRM, не предполагаемые EUR."],
    fields: ["payments", "paymentAmount", "filled", "paymentStatus"],
  },
  touches: {
    title: ["Median recorded touches", "Медиана числа касаний"],
    description: ["Median of recorded contact counts. Blank counters are excluded; a recorded zero is included. This is not an average or a count of replies.", "Медиана записанного числа касаний. Пустые счётчики исключены, записанный ноль учитывается. Это не среднее и не количество ответов."],
    formula: ["Middle value of recorded Touches made; for an even sample, average the two middle values. No recorded counters means unavailable, not zero.", "Середина упорядоченных значений Touches made; при чётном количестве — среднее двух центральных. Без записанных счётчиков результат недоступен, а не равен нулю."],
    fields: ["touches", "filled"],
  },
  datedEvent: {
    title: ["Valid selected-event dates", "События с корректной датой"],
    description: ["Selected events with valid dates between the creation day and the snapshot. Stages and payment status never substitute for an event date.", "Выбранные события с корректной датой от дня создания до среза. Этапы и статус оплаты не заменяют дату события."],
    formula: ["Leads with a valid selected-event date, no earlier than the creation day and no later than the snapshot / all selected leads.", "Лиды с корректной датой выбранного события не раньше дня создания и не позже среза / все выбранные лиды."],
    fields: ["createdAt", "event", "selectedEventAt", "cohortEventLag", "asOf"],
  },
  paidUnknown: {
    title: ["Clients without first-payment date", "Клиенты без даты первого платежа"],
    description: ["Clients with payment evidence but no accepted first-payment date. This does not mean no payment occurred.", "Клиенты с признаками оплаты, но без принятой даты первого платежа. Это не означает, что оплаты не было."],
    formula: ["Number of clients without an accepted First payment at date.", "Количество клиентов без принятой даты First payment at."],
    fields: [...PAYMENT_FIELDS, "isClient", "issues"],
  },
};

export function kommoMetricDescription(metric: KommoEvidenceMetric, language: "en" | "ru" = "en"): string {
  return DEFINITIONS[metric].description[language === "ru" ? 1 : 0];
}

export function kommoMetricFields(metric: KommoEvidenceMetric): string[] {
  return [...DEFINITIONS[metric].fields];
}

function timestamp(value: Date | null): string {
  return value && Number.isFinite(value.getTime()) ? value.toISOString() : "";
}

function normalizedValue(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return timestamp(value);
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function inferSnapshot(leads: KommoLead[]): Date {
  const latest = leads.reduce((maximum, lead) => Math.max(maximum,
    lead.importedAt?.getTime() || 0, lead.modifiedAt?.getTime() || 0), 0);
  return latest ? new Date(latest) : new Date();
}

export function buildKommoEvidence(metric: KommoEvidenceMetric, leads: KommoLead[], options: KommoEvidenceOptions = {}): MetricEvidence {
  const index = options.language === "ru" ? 1 : 0;
  const definition = DEFINITIONS[metric];
  const asOf = options.asOf ?? inferSnapshot(options.raw ?? leads);
  const sla = options.sla ?? 60;
  const event = options.event ?? "firstPaymentAt";
  const single = new Map<KommoLead, ReturnType<typeof summarize>>();
  const summaryOf = (lead: KommoLead) => {
    let value = single.get(lead);
    if (!value) { value = summarize([lead]); single.set(lead, value); }
    return value;
  };
  // Assessed is not exported as a predicate; use the KPI itself, not a second regex.
  const assessed = (lead: KommoLead) => summaryOf(lead).assessed === 1;
  const measurable = () => leads.filter((lead) => responseMinutes(lead) !== null)
    .sort((a, b) => responseMinutes(a)! - responseMinutes(b)!);
  let selected = leads;
  let base = leads;
  let amount: number | undefined;
  switch (metric) {
    case "all": break;
    case "relevant": selected = leads.filter(isRelevant); break;
    case "assessed": selected = leads.filter(assessed); break;
    case "unassessed": selected = leads.filter((lead) => !assessed(lead)); break;
    case "relevantAmongAssessed": selected = leads.filter(isRelevant); base = leads.filter(assessed); break;
    case "qualified": selected = leads.filter(isQualified); break;
    case "agreement": selected = leads.filter(isAgreement); break;
    case "clients": selected = leads.filter(isClient); break;
    case "fullPaid": selected = leads.filter(isFullPaid); break;
    case "signed": selected = leads.filter((lead) => Boolean(lead.agreementSignedAt)); break;
    case "response": selected = measurable(); base = leads.filter((lead) => !lead.migrated); break;
    case "contactSla": base = measurable(); selected = base.filter((lead) => responseMinutes(lead)! <= sla); break;
    case "noContact": selected = leads.filter((lead) => !lead.migrated && isOpen(lead) && !hasContact(lead)); break;
    case "overdue": selected = leads.filter((lead) => isOpen(lead) && lead.nextTaskAt && lead.nextTaskAt < asOf); break;
    case "noTask": selected = leads.filter((lead) => isOpen(lead) && !lead.nextTaskAt); break;
    case "sales": selected = leads.filter((lead) => isClient(lead) || Boolean(lead.agreementSignedAt) || isWon(lead)); amount = summarize(leads).sales; break;
    case "payments": amount = summarize(leads).paymentAmount; break;
    case "touches": selected = leads.filter((lead) => lead.touches !== null).sort((a, b) => a.touches! - b.touches!); break;
    case "datedEvent": selected = leads.filter((lead) => cohortEventLag(lead, asOf, event) !== null); break;
    case "paidUnknown": selected = leads.filter((lead) => isClient(lead) && !lead.firstPaymentAt); break;
  }

  function evidenceRow(lead: KommoLead, position: number, history = false): EvidenceRow {
    const summary = summaryOf(lead);
    const response = responseMinutes(lead);
    const lag = cohortEventLag(lead, asOf, event);
    const fields: Record<string, string> = Object.fromEntries(Object.entries(lead).map(([key, value]) => [key, normalizedValue(value)]));
    Object.assign(fields, {
      isRelevant: String(isRelevant(lead)), isAssessed: String(summary.assessed === 1),
      isQualified: String(isQualified(lead)), isAgreement: String(isAgreement(lead)),
      isClient: String(isClient(lead)), isFullPaid: String(isFullPaid(lead)),
      isWon: String(isWon(lead)), isOpen: String(isOpen(lead)), hasContact: String(hasContact(lead)),
      responseMinutes: response === null ? "" : String(response),
      slaMinutes: String(sla), withinSla: response === null ? "" : String(response <= sla),
      saleContribution: String(summary.sales), paymentAmount: String(summary.paymentAmount),
      event, selectedEventAt: timestamp(lead[event]), cohortEventLag: lag === null ? "" : String(lag), asOf: timestamp(asOf),
      dateValidation: lead.issues.length
        ? ["Rejected raw date values are retained in issues (field, reason, raw); their normalized dates may be empty.", "Отклонённые исходные даты сохранены в issues (поле, причина, значение); нормализованная дата может быть пустой."][index]
        : ["No rejected dates recorded; missing dates remain missing. Accepted dates are parser output, not reconstructed stage history.", "Ошибки дат не зарегистрированы; пропуски остаются пропусками. Принятые даты получены из разбора, а не восстановлены по этапам."][index],
    });
    return {
      key: `kommo:${history ? "raw" : "selected"}:${JSON.stringify([lead.id, lead.row, position])}`,
      id: lead.id, name: lead.contact || lead.title || lead.id, owner: lead.owner, service: lead.service,
      source: lead.source, stage: lead.stage, relevancy: lead.relevancy, created: timestamp(lead.createdAt).slice(0, 10),
      mergedIds: [...lead.mergedIds], fields,
    };
  }
  const cache = new Map<KommoLead, EvidenceRow>();
  const toRows = (items: KommoLead[]) => items.map((lead) => {
    let row = cache.get(lead);
    if (!row) { row = evidenceRow(lead, cache.size); cache.set(lead, row); }
    return row;
  });
  const evidence: MetricEvidence = {
    title: definition.title[index], description: kommoMetricDescription(metric, options.language),
    formula: definition.formula[index], fields: [...definition.fields, "email", "phone", "sourceRaw", "sourceMethod", "sourceEvidence", "captureMethod", "metaSubmissions", "mergedIds", "issues", "dateValidation"]
      .filter((field, position, all) => all.indexOf(field) === position),
    rows: toRows(selected), baseRows: toRows(base), numerator: amount ?? selected.length,
    ...(amount === undefined ? { denominator: base.length } : {}),
    scope: options.scope,
    notice: [
      "Rows are the supplied analytical leads, not a new calculation or deduplication. Dates retain CRM calendar/time values encoded as ISO; rejected originals are in issues. Blank is not zero; normalized payments may contain parser-default zeros. Raw history contains normalized export records, not every original raw cell, and may lie outside current filters. Merged/validated analytical values can differ from those history records. Raw-history counts must not be added to KPI counts.",
      "Показаны переданные аналитические лиды без нового расчёта или объединения. Даты сохраняют календарь и время CRM в ISO; отклонённые значения находятся в issues. Пустое значение не равно нулю; в payments возможны нули по умолчанию парсера. Исходная история содержит нормализованные записи выгрузки, не все исходные ячейки, и может выходить за текущие фильтры. Объединённые и проверенные значения могут отличаться от истории. Число записей истории нельзя прибавлять к KPI.",
    ][index],
  };
  if (metric === "datedEvent") evidence.fields = [...new Set([event, ...evidence.fields])];
  if (metric === "contactSla") evidence.formula += index ? ` SLA = ${sla} мин.` : ` SLA = ${sla} min.`;
  if (metric === "touches") evidence.numerator = summarize(leads).touchesMean ?? undefined;
  if (metric === "touches") delete evidence.denominator;
  if (metric === "signed" && !leads.some((lead) => lead.filled.includes("Agreement signed at"))) {
    evidence.notice += index ? " Столбец Agreement signed at не заполнен ни в одной переданной записи; доступность подписи требует проверки заголовков выгрузки." : " No supplied record lists Agreement signed at in filled; signature-column availability requires the export headers.";
  }
  if (metric === "relevant" || metric === "assessed" || metric === "relevantAmongAssessed") {
    evidence.segments = [
      { id: "unassessed", label: ["Unassessed: blank or unrecognized Relevancy", "Не оценены: пустая или нераспознанная Relevancy"][index], rows: toRows(leads.filter((lead) => !assessed(lead))) },
      { id: "notRelevant", label: ["Not relevant: explicitly assessed", "Нецелевые: явно оценены"][index], rows: toRows(leads.filter((lead) => assessed(lead) && !isRelevant(lead))) },
    ];
  }
  if (options.raw) {
    const ids = new Set(base.flatMap((lead) => [lead.id, ...lead.mergedIds]));
    evidence.rawRows = options.raw.filter((lead) => ids.has(lead.id) || lead.mergedIds.some((id) => ids.has(id)))
      .map((lead, position) => evidenceRow(lead, position, true));
  }
  return evidence;
}
