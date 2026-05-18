import { CRMRecord, compactDate, monthDiff, monthKey, monthLabel } from "./crm";
import { FinanceData } from "./finance";

export type BucketRow = {
  name: string;
  leads: number;
  share: number;
  relevantStrict: number;
  relevantStrictRate: number;
  qualifiedActive: number;
  qualifiedActiveRate: number;
  rejected: number;
  rejectionRate: number;
  agreementSent: number;
  agreementSentRate: number;
  agreementSigned: number;
  agreementSignedRate: number;
  clients: number;
  clientRate: number;
  fullPaidClients: number;
  fullPaidClientRate: number;
  marketingSpend: number;
  cpl: number | null;
  cpql: number | null;
  cac: number | null;
  roas: number | null;
};

export type MonthlyRow = {
  month: string;
  label: string;
  leads: number;
  relevantStrict: number;
  relevantStrictRate: number;
  qualifiedActive: number;
  qualifiedActiveRate: number;
  rejected: number;
  rejectionRate: number;
  inWork: number;
  agreementSent: number;
  agreementSentRate: number;
  agreementSigned: number;
  agreementSignedRate: number;
  clients: number;
  clientRate: number;
  fullPaidClients: number;
  fullPaidClientRate: number;
  completed: number;
  marketingSpend: number;
  revenue: number;
  profitAfterMarketing: number;
  signedContracts: number;
  cpl: number | null;
  cac: number | null;
  roas: number | null;
  marketingCostShare: number | null;
};

export type SourceMonthlyConversionRow = {
  source: string;
  month: string;
  label: string;
  leads: number;
  relevantStrictRate: number;
  qualifiedActiveRate: number;
  agreementSentRate: number;
  agreementSignedRate: number;
  clientRate: number;
  fullPaidClientRate: number;
  marketingSpend: number;
  cpl: number | null;
  cac: number | null;
};

export type FieldCoverageRow = {
  field: string;
  filled: number;
  rate: number;
  group: "Used directly in analytics" | "Still using status proxy" | "Critical analytics fields";
};

export type CohortRow = {
  cohort: string;
  label: string;
  leads: number;
  qualifiedActiveRate: number;
  clientRate: number;
  rejectionRate: number;
  m0: number;
  m1: number;
  m2: number;
  m3: number;
  m4: number;
  m5: number;
  paidDateUnknown: number;
  paidDateUnknownRate: number;
};

export type Analytics = {
  total: number;
  uniqueTotal: number;
  dateRange: string;
  relevantStrictRate: number;
  qualifiedActiveRate: number;
  rejectedRate: number;
  duplicateRate: number;
  agreementSentRate: number;
  agreementSignedRate: number;
  clientRate: number;
  fullPaidClientRate: number;
  fieldImplementationRate: number;
  finance: {
    hasFinanceData: boolean;
    revenue: number;
    marketingSpend: number;
    profitAfterMarketing: number;
    signedContracts: number;
    roas: number | null;
    marketingCostShare: number | null;
    cpl: number | null;
    cpql: number | null;
    cac: number | null;
    costPerSignedContract: number | null;
    cpc: number | null;
  };
  funnel: { stage: string; count: number; rate: number }[];
  monthly: MonthlyRow[];
  sourceRows: BucketRow[];
  serviceRows: BucketRow[];
  statusRows: { name: string; value: number; share: number }[];
  rejectionRows: { name: string; value: number; share: number }[];
  fieldCoverage: FieldCoverageRow[];
  cohorts: CohortRow[];
  topCountries: { name: string; value: number; share: number }[];
  sourceServiceMatrix: { source: string; service: string; leads: number; clientRate: number }[];
  sourceMonthlyConversion: SourceMonthlyConversionRow[];
};

const CLIENT_STATUSES = ["INITIAL PAYMENT RECEIVED", "2ND INSTALLMENT RECEIVED", "FULL PAYMENT IS MADE", "ЗАВЕРШЕНЕ", "COMPLETED"];
const FULL_PAID_STATUSES = ["FULL PAYMENT IS MADE", "ЗАВЕРШЕНЕ", "COMPLETED"];
const AGREEMENT_SENT_STATUSES = ["RETAINER AGREEMENT SENT", ...CLIENT_STATUSES];
const AGREEMENT_SIGNED_STATUSES = CLIENT_STATUSES;
const QUALIFIED_ACTIVE_STATUSES = [...AGREEMENT_SENT_STATUSES, "IN WORK", "PAUSED", "WHATSAPP"];

function pct(part: number, total: number): number {
  return total ? part / total : 0;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator ? numerator / denominator : null;
}

function status(record: CRMRecord): string {
  return record.status.trim().toUpperCase();
}

export function isDuplicate(record: CRMRecord): boolean {
  return record.duplicateFlag.toLowerCase() === "true";
}

export function isRelevantStrict(record: CRMRecord): boolean {
  return record.relevant.trim().toLowerCase() === "relevant";
}

export function isRejected(record: CRMRecord): boolean {
  return status(record) === "REJECTED" || Boolean(record.lostAt);
}

export function isQualifiedActive(record: CRMRecord): boolean {
  const relevant = record.relevant.trim().toLowerCase();
  if (relevant === "relevant") return true;
  if (relevant === "no relevant" || relevant === "not relevant") return false;
  return QUALIFIED_ACTIVE_STATUSES.includes(status(record)) || Boolean(record.firstContactAt || record.firstResponseAt);
}

export function hasAgreementSent(record: CRMRecord): boolean {
  return Boolean(record.agreementSentAt || record.agreementSignedAt) || AGREEMENT_SENT_STATUSES.includes(status(record));
}

export function hasAgreementSigned(record: CRMRecord): boolean {
  return Boolean(record.agreementSignedAt || record.firstPaymentAt || record.fullPaymentAt || record.paymentStatus) || AGREEMENT_SIGNED_STATUSES.includes(status(record));
}

export function isClient(record: CRMRecord): boolean {
  return Boolean(record.firstPaymentAt || record.fullPaymentAt || record.paymentStatus) || CLIENT_STATUSES.includes(status(record));
}

export function isFullPaidClient(record: CRMRecord): boolean {
  return Boolean(record.fullPaymentAt || record.completedAt) || FULL_PAID_STATUSES.includes(status(record));
}

function countBy<T extends string>(records: CRMRecord[], getter: (record: CRMRecord) => T): Map<T, number> {
  const map = new Map<T, number>();
  for (const record of records) {
    const key = getter(record);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function topRows(map: Map<string, number>, total: number, limit: number) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name, value, share: pct(value, total) }));
}

function sumFinanceSourceSpend(finance: FinanceData | undefined, source: string): number {
  return finance?.channelCosts
    .filter((record) => record.source === source)
    .reduce((sum, record) => sum + record.amount, 0) ?? 0;
}

function bucketRows(records: CRMRecord[], getter: (record: CRMRecord) => string, limit: number, finance?: FinanceData): BucketRow[] {
  const total = records.length;
  const grouped = new Map<string, CRMRecord[]>();
  for (const record of records) {
    const key = getter(record) || "Unknown";
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }

  return [...grouped.entries()]
    .map(([name, group]) => {
      const leads = group.length;
      const relevantStrict = group.filter(isRelevantStrict).length;
      const qualifiedActive = group.filter(isQualifiedActive).length;
      const rejected = group.filter(isRejected).length;
      const agreementSent = group.filter(hasAgreementSent).length;
      const agreementSigned = group.filter(hasAgreementSigned).length;
      const clients = group.filter(isClient).length;
      const fullPaidClients = group.filter(isFullPaidClient).length;
      const marketingSpend = getter === sourceGetter ? sumFinanceSourceSpend(finance, name) : 0;
      return {
        name,
        leads,
        share: pct(leads, total),
        relevantStrict,
        relevantStrictRate: pct(relevantStrict, leads),
        qualifiedActive,
        qualifiedActiveRate: pct(qualifiedActive, leads),
        rejected,
        rejectionRate: pct(rejected, leads),
        agreementSent,
        agreementSentRate: pct(agreementSent, leads),
        agreementSigned,
        agreementSignedRate: pct(agreementSigned, leads),
        clients,
        clientRate: pct(clients, leads),
        fullPaidClients,
        fullPaidClientRate: pct(fullPaidClients, leads),
        marketingSpend,
        cpl: ratio(marketingSpend, leads),
        cpql: ratio(marketingSpend, qualifiedActive),
        cac: ratio(marketingSpend, clients),
        roas: null,
      };
    })
    .sort((a, b) => b.leads - a.leads)
    .slice(0, limit);
}

function sourceGetter(record: CRMRecord): string {
  return record.source;
}

function serviceGetter(record: CRMRecord): string {
  return record.analyticsService;
}

function financeMonthlyMap(finance?: FinanceData): Map<string, { revenue: number; marketingSpend: number; profitAfterMarketing: number; signedContracts: number }> {
  const map = new Map<string, { revenue: number; marketingSpend: number; profitAfterMarketing: number; signedContracts: number }>();
  for (const record of finance?.monthly ?? []) {
    const current = map.get(record.month) ?? { revenue: 0, marketingSpend: 0, profitAfterMarketing: 0, signedContracts: 0 };
    current.revenue += record.revenue;
    current.marketingSpend += record.marketingCost;
    current.profitAfterMarketing += record.profitAfterMarketing;
    current.signedContracts += record.signedContracts;
    map.set(record.month, current);
  }
  return map;
}

function monthlyRows(records: CRMRecord[], finance?: FinanceData): MonthlyRow[] {
  const grouped = new Map<string, CRMRecord[]>();
  for (const record of records) {
    const key = monthKey(record.createdAt);
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }

  const financeByMonth = financeMonthlyMap(finance);

  return [...grouped.entries()]
    .filter(([key]) => key !== "Unknown")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, group]) => {
      const leads = group.length;
      const relevantStrict = group.filter(isRelevantStrict).length;
      const qualifiedActive = group.filter(isQualifiedActive).length;
      const rejected = group.filter(isRejected).length;
      const agreementSent = group.filter(hasAgreementSent).length;
      const agreementSigned = group.filter(hasAgreementSigned).length;
      const clients = group.filter(isClient).length;
      const fullPaidClients = group.filter(isFullPaidClient).length;
      const financeMonth = financeByMonth.get(month) ?? { revenue: 0, marketingSpend: 0, profitAfterMarketing: 0, signedContracts: 0 };

      return {
        month,
        label: monthLabel(month),
        leads,
        relevantStrict,
        relevantStrictRate: pct(relevantStrict, leads),
        qualifiedActive,
        qualifiedActiveRate: pct(qualifiedActive, leads),
        rejected,
        rejectionRate: pct(rejected, leads),
        inWork: group.filter((record) => status(record) === "IN WORK").length,
        agreementSent,
        agreementSentRate: pct(agreementSent, leads),
        agreementSigned,
        agreementSignedRate: pct(agreementSigned, leads),
        clients,
        clientRate: pct(clients, leads),
        fullPaidClients,
        fullPaidClientRate: pct(fullPaidClients, leads),
        completed: group.filter((record) => status(record) === "ЗАВЕРШЕНЕ" || Boolean(record.completedAt)).length,
        marketingSpend: financeMonth.marketingSpend,
        revenue: financeMonth.revenue,
        profitAfterMarketing: financeMonth.profitAfterMarketing,
        signedContracts: financeMonth.signedContracts,
        cpl: ratio(financeMonth.marketingSpend, leads),
        cac: ratio(financeMonth.marketingSpend, clients),
        roas: ratio(financeMonth.revenue, financeMonth.marketingSpend),
        marketingCostShare: ratio(financeMonth.marketingSpend, financeMonth.revenue),
      };
    });
}

function fieldCoverage(records: CRMRecord[]): FieldCoverageRow[] {
  const fields: [FieldCoverageRow["group"], string, (record: CRMRecord) => unknown][] = [
    ["Used directly in analytics", "Relevant", (r) => r.relevant],
    ["Used directly in analytics", "Service dimension", (r) => r.analyticsService !== "Unknown" && r.analyticsService],
    ["Used directly in analytics", "Country", (r) => r.country !== "Unknown" && r.country],
    ["Used directly in analytics", "Normalized source", (r) => r.source !== "Unknown" && r.source],
    ["Used directly in analytics", "Google Client ID", (r) => r.googleClientId],
    ["Still using status proxy", "Agreement sent date", (r) => r.agreementSentAt],
    ["Still using status proxy", "Agreement signed date", (r) => r.agreementSignedAt],
    ["Still using status proxy", "First payment date", (r) => r.firstPaymentAt],
    ["Still using status proxy", "Full payment date", (r) => r.fullPaymentAt],
    ["Still using status proxy", "Payment status", (r) => r.paymentStatus],
    ["Critical analytics fields", "first_touch_source", (r) => r.firstTouchSource],
    ["Critical analytics fields", "utm_source", (r) => r.utmSource],
    ["Critical analytics fields", "utm_medium", (r) => r.utmMedium],
    ["Critical analytics fields", "utm_campaign", (r) => r.utmCampaign],
    ["Critical analytics fields", "original_service_interest", (r) => r.originalServiceInterest],
    ["Critical analytics fields", "qualified_service", (r) => r.qualifiedService],
    ["Critical analytics fields", "agreement_sent_at", (r) => r.agreementSentAt],
    ["Critical analytics fields", "agreement_signed_at", (r) => r.agreementSignedAt],
    ["Critical analytics fields", "first_payment_at", (r) => r.firstPaymentAt],
    ["Critical analytics fields", "full_payment_at", (r) => r.fullPaymentAt],
    ["Critical analytics fields", "payment_status", (r) => r.paymentStatus],
    ["Critical analytics fields", "deal_value_actual", (r) => r.dealValueActual],
    ["Critical analytics fields", "lawyer_handover_at", (r) => r.lawyerHandoverAt],
    ["Critical analytics fields", "meeting_booked_at", (r) => r.meetingBookedAt],
    ["Critical analytics fields", "meeting_held_at", (r) => r.meetingHeldAt],
    ["Critical analytics fields", "first_contact_at", (r) => r.firstContactAt],
  ];

  return fields.map(([group, field, getter]) => {
    const filled = records.filter((record) => Boolean(getter(record))).length;
    return { group, field, filled, rate: pct(filled, records.length) };
  });
}

function cohortRows(records: CRMRecord[]): CohortRow[] {
  const grouped = new Map<string, CRMRecord[]>();
  for (const record of records) {
    const key = monthKey(record.createdAt);
    if (key === "Unknown") continue;
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([cohort, group]) => {
      const leads = group.length;
      const clients = group.filter(isClient);
      const paidWithDate = clients.filter((record) => record.createdAt && record.firstPaymentAt);
      const paidDateUnknown = clients.filter((record) => !record.firstPaymentAt).length;
      const byMonth = [0, 1, 2, 3, 4, 5].map((age) => {
        const count = paidWithDate.filter((record) => record.createdAt && record.firstPaymentAt && monthDiff(record.createdAt, record.firstPaymentAt) <= age).length;
        return pct(count, leads);
      });

      return {
        cohort,
        label: monthLabel(cohort),
        leads,
        qualifiedActiveRate: pct(group.filter(isQualifiedActive).length, leads),
        clientRate: pct(clients.length, leads),
        rejectionRate: pct(group.filter(isRejected).length, leads),
        m0: byMonth[0],
        m1: byMonth[1],
        m2: byMonth[2],
        m3: byMonth[3],
        m4: byMonth[4],
        m5: byMonth[5],
        paidDateUnknown,
        paidDateUnknownRate: pct(paidDateUnknown, leads),
      };
    });
}

function sourceServiceMatrix(records: CRMRecord[]) {
  const grouped = new Map<string, CRMRecord[]>();
  for (const record of records) {
    const key = `${record.source}|||${record.analyticsService}`;
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }

  return [...grouped.entries()]
    .map(([key, group]) => {
      const [source, service] = key.split("|||");
      return {
        source,
        service,
        leads: group.length,
        clientRate: pct(group.filter(isClient).length, group.length),
      };
    })
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 16);
}

function sourceMonthlyConversion(records: CRMRecord[], finance?: FinanceData): SourceMonthlyConversionRow[] {
  const grouped = new Map<string, CRMRecord[]>();
  for (const record of records) {
    const month = monthKey(record.createdAt);
    if (month === "Unknown") continue;
    const key = `${record.source || "Unknown"}|||${month}`;
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }

  const sourceSpendByMonth = new Map<string, number>();
  for (const cost of finance?.channelCosts ?? []) {
    const key = `${cost.source}|||${cost.month}`;
    sourceSpendByMonth.set(key, (sourceSpendByMonth.get(key) ?? 0) + cost.amount);
  }

  return [...grouped.entries()]
    .map(([key, group]) => {
      const [source, month] = key.split("|||");
      const leads = group.length;
      const clients = group.filter(isClient).length;
      const qualifiedActive = group.filter(isQualifiedActive).length;
      const marketingSpend = sourceSpendByMonth.get(key) ?? 0;
      return {
        source,
        month,
        label: monthLabel(month),
        leads,
        relevantStrictRate: pct(group.filter(isRelevantStrict).length, leads),
        qualifiedActiveRate: pct(qualifiedActive, leads),
        agreementSentRate: pct(group.filter(hasAgreementSent).length, leads),
        agreementSignedRate: pct(group.filter(hasAgreementSigned).length, leads),
        clientRate: pct(clients, leads),
        fullPaidClientRate: pct(group.filter(isFullPaidClient).length, leads),
        marketingSpend,
        cpl: ratio(marketingSpend, leads),
        cac: ratio(marketingSpend, clients),
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month) || a.source.localeCompare(b.source));
}

function financeSummary(finance: FinanceData | undefined, leads: number, qualifiedActive: number, clients: number) {
  const monthly = finance?.monthly ?? [];
  const revenue = monthly.reduce((sum, record) => sum + record.revenue, 0);
  const marketingSpend = monthly.reduce((sum, record) => sum + record.marketingCost, 0);
  const profitAfterMarketing = monthly.reduce((sum, record) => sum + record.profitAfterMarketing, 0);
  const signedContracts = monthly.reduce((sum, record) => sum + record.signedContracts, 0);

  return {
    hasFinanceData: monthly.length > 0 || (finance?.channelCosts.length ?? 0) > 0,
    revenue,
    marketingSpend,
    profitAfterMarketing,
    signedContracts,
    roas: ratio(revenue, marketingSpend),
    marketingCostShare: ratio(marketingSpend, revenue),
    cpl: ratio(marketingSpend, leads),
    cpql: ratio(marketingSpend, qualifiedActive),
    cac: ratio(marketingSpend, clients),
    costPerSignedContract: ratio(marketingSpend, signedContracts),
    cpc: null,
  };
}

export function buildAnalytics(records: CRMRecord[], finance?: FinanceData): Analytics {
  const sortedDates = records
    .map((record) => record.createdAt)
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime());
  const total = records.length;
  const uniqueTotal = records.filter((record) => !isDuplicate(record)).length;
  const relevantStrict = records.filter(isRelevantStrict).length;
  const qualifiedActive = records.filter(isQualifiedActive).length;
  const rejected = records.filter(isRejected).length;
  const agreementSent = records.filter(hasAgreementSent).length;
  const agreementSigned = records.filter(hasAgreementSigned).length;
  const clients = records.filter(isClient).length;
  const fullPaidClients = records.filter(isFullPaidClient).length;
  const duplicates = records.filter(isDuplicate).length;
  const coverage = fieldCoverage(records);
  const implementedFields = coverage.filter((field) => field.rate > 0).length;

  return {
    total,
    uniqueTotal,
    dateRange: sortedDates.length
      ? `${compactDate(sortedDates[0])} - ${compactDate(sortedDates[sortedDates.length - 1])}`
      : "n/a",
    relevantStrictRate: pct(relevantStrict, total),
    qualifiedActiveRate: pct(qualifiedActive, total),
    rejectedRate: pct(rejected, total),
    duplicateRate: pct(duplicates, total),
    agreementSentRate: pct(agreementSent, total),
    agreementSignedRate: pct(agreementSigned, total),
    clientRate: pct(clients, total),
    fullPaidClientRate: pct(fullPaidClients, total),
    fieldImplementationRate: pct(implementedFields, coverage.length),
    finance: financeSummary(finance, total, qualifiedActive, clients),
    funnel: [
      { stage: "Leads", count: total, rate: 1 },
      { stage: "Relevant", count: relevantStrict, rate: pct(relevantStrict, total) },
      { stage: "Qualified / Active proxy", count: qualifiedActive, rate: pct(qualifiedActive, total) },
      { stage: "Agreement sent", count: agreementSent, rate: pct(agreementSent, total) },
      { stage: "Agreement signed", count: agreementSigned, rate: pct(agreementSigned, total) },
      { stage: "First payment", count: clients, rate: pct(clients, total) },
      { stage: "Full payment", count: fullPaidClients, rate: pct(fullPaidClients, total) },
    ],
    monthly: monthlyRows(records, finance),
    sourceRows: bucketRows(records, sourceGetter, 12, finance),
    serviceRows: bucketRows(records, serviceGetter, 12),
    statusRows: topRows(countBy(records, (record) => record.status || "Unknown"), total, 12),
    rejectionRows: topRows(
      countBy(
        records.filter((record) => record.rejectionReason),
        (record) => record.rejectionReason,
      ),
      rejected || total,
      10,
    ),
    fieldCoverage: coverage,
    cohorts: cohortRows(records),
    topCountries: topRows(countBy(records, (record) => record.country || "Unknown"), total, 12),
    sourceServiceMatrix: sourceServiceMatrix(records),
    sourceMonthlyConversion: sourceMonthlyConversion(records, finance),
  };
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

export function formatCurrency(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}
