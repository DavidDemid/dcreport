import { CRMRecord, compactDate, leadIdentityKey, monthDiff, monthKey, monthLabel } from "./crm";
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

export type ServiceChannelRow = BucketRow & {
  service: string;
  source: string;
  spendAllocation: "direct_channel" | "estimated_by_lead_share" | "none";
  attributionNote: string;
};

export type DecisionInsight = {
  title: string;
  detail: string;
  tone: "green" | "amber" | "red" | "blue";
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
  financeLeads: number;
  sessions: number;
  clicks: number;
  paidTrafficCost: number;
  sales: number;
  planProfitAfterMarketing: number;
  planProfitAfterMarketing3MonthAverage: number;
  avgProfitAfterMarketing: number;
  avgRevenue: number;
  avgSales: number;
  avgMarketingCost: number;
  avgPaidTrafficCost: number;
  avgSignedContracts: number;
  avgSessions: number;
  avgLeads: number;
  avgClicks: number;
  ltContracts: number;
  lvContracts: number;
  rbiContracts: number;
  cpl: number | null;
  paidTrafficCpl: number | null;
  costPerSignedContract: number | null;
  leadToContractRate: number | null;
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

export type ServiceCohortRow = {
  service: string;
  cohort: string;
  label: string;
  leads: number;
  qualifiedActiveRate: number;
  currentPaidRate: number;
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
  crmSignedSalesValue: number;
  crmSignedSalesCoverage: number;
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
  servicePerformanceRows: BucketRow[];
  serviceChannelRows: ServiceChannelRow[];
  decisionInsights: DecisionInsight[];
  attributionWarnings: string[];
  statusRows: { name: string; value: number; share: number }[];
  rejectionRows: { name: string; value: number; share: number }[];
  fieldCoverage: FieldCoverageRow[];
  cohorts: CohortRow[];
  serviceCohorts: ServiceCohortRow[];
  topCountries: { name: string; value: number; share: number }[];
  sourceServiceMatrix: { source: string; service: string; leads: number; clients: number; fullPaidClients: number; clientRate: number }[];
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

function duplicateIdentityCount(records: CRMRecord[]): number {
  const seen = new Map<string, number>();
  let duplicates = 0;
  const sorted = [...records].sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) || a.rowNumber - b.rowNumber);
  for (const record of sorted) {
    const key = `${leadIdentityKey(record)}|||${record.reportingService}`;
    const currentTime = record.createdAt?.getTime() ?? 0;
    const previousTime = seen.get(key);
    if (isDuplicate(record) || (previousTime !== undefined && currentTime && currentTime - previousTime <= 30 * 24 * 60 * 60 * 1000)) {
      duplicates += 1;
      continue;
    }
    seen.set(key, currentTime);
  }
  return duplicates;
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

function sourceSpendMap(finance?: FinanceData): Map<string, number> {
  const map = new Map<string, number>();
  for (const cost of finance?.channelCosts ?? []) {
    map.set(cost.source, (map.get(cost.source) ?? 0) + cost.amount);
  }
  return map;
}

function metricSummary(name: string, group: CRMRecord[], total: number, marketingSpend = 0): BucketRow {
  const leads = group.length;
  const relevantStrict = group.filter(isRelevantStrict).length;
  const qualifiedActive = group.filter(isQualifiedActive).length;
  const rejected = group.filter(isRejected).length;
  const agreementSent = group.filter(hasAgreementSent).length;
  const agreementSigned = group.filter(hasAgreementSigned).length;
  const clients = group.filter(isClient).length;
  const fullPaidClients = group.filter(isFullPaidClient).length;
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
      const marketingSpend = getter === sourceGetter ? sumFinanceSourceSpend(finance, name) : 0;
      return metricSummary(name, group, total, marketingSpend);
    })
    .sort((a, b) => b.leads - a.leads)
    .slice(0, limit);
}

function sourceGetter(record: CRMRecord): string {
  return record.source;
}

function allocatedServiceSpend(records: CRMRecord[], finance?: FinanceData): Map<string, number> {
  const spendBySource = sourceSpendMap(finance);
  const sourceGroups = new Map<string, CRMRecord[]>();
  for (const record of records) {
    sourceGroups.set(record.source, [...(sourceGroups.get(record.source) ?? []), record]);
  }

  const serviceSpend = new Map<string, number>();
  for (const [source, sourceRecords] of sourceGroups.entries()) {
    const sourceSpend = spendBySource.get(source) ?? 0;
    if (!sourceSpend || !sourceRecords.length) continue;
    const byService = new Map<string, number>();
    for (const record of sourceRecords) {
      byService.set(record.reportingService, (byService.get(record.reportingService) ?? 0) + 1);
    }
    for (const [service, leads] of byService.entries()) {
      const allocated = sourceSpend * (leads / sourceRecords.length);
      serviceSpend.set(service, (serviceSpend.get(service) ?? 0) + allocated);
    }
  }
  return serviceSpend;
}

function servicePerformanceRows(records: CRMRecord[], finance?: FinanceData): BucketRow[] {
  const grouped = new Map<string, CRMRecord[]>();
  for (const record of records) {
    grouped.set(record.reportingService, [...(grouped.get(record.reportingService) ?? []), record]);
  }
  const spend = allocatedServiceSpend(records, finance);
  return [...grouped.entries()]
    .map(([service, group]) => metricSummary(service, group, records.length, spend.get(service) ?? 0))
    .sort((a, b) => b.leads - a.leads);
}

function serviceChannelRows(records: CRMRecord[], finance?: FinanceData): ServiceChannelRow[] {
  const grouped = new Map<string, CRMRecord[]>();
  const sourceGroups = new Map<string, CRMRecord[]>();
  const spendBySource = sourceSpendMap(finance);

  for (const record of records) {
    const key = `${record.reportingService}|||${record.source}`;
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
    sourceGroups.set(record.source, [...(sourceGroups.get(record.source) ?? []), record]);
  }

  return [...grouped.entries()]
    .map(([key, group]) => {
      const [service, source] = key.split("|||");
      const sourceRecords = sourceGroups.get(source) ?? [];
      const sourceSpend = spendBySource.get(source) ?? 0;
      const marketingSpend = sourceSpend && sourceRecords.length ? sourceSpend * (group.length / sourceRecords.length) : 0;
      const summary = metricSummary(`${service} / ${source}`, group, records.length, marketingSpend);
      const spendAllocation: ServiceChannelRow["spendAllocation"] = sourceSpend ? "estimated_by_lead_share" : "none";
      return {
        ...summary,
        service,
        source,
        spendAllocation,
        attributionNote: sourceSpend
          ? "Spend is estimated: channel finance cost allocated to service by lead share inside that channel."
          : "No matching finance spend for this channel in the selected period.",
      };
    })
    .sort((a, b) => a.service.localeCompare(b.service) || b.leads - a.leads);
}

function financeMonthlyMap(finance?: FinanceData): Map<string, MonthlyRow> {
  const map = new Map<string, MonthlyRow>();
  for (const record of finance?.monthly ?? []) {
    const current = map.get(record.month) ?? {
      month: record.month,
      label: monthLabel(record.month),
      leads: 0,
      relevantStrict: 0,
      relevantStrictRate: 0,
      qualifiedActive: 0,
      qualifiedActiveRate: 0,
      rejected: 0,
      rejectionRate: 0,
      inWork: 0,
      agreementSent: 0,
      agreementSentRate: 0,
      agreementSigned: 0,
      agreementSignedRate: 0,
      clients: 0,
      clientRate: 0,
      fullPaidClients: 0,
      fullPaidClientRate: 0,
      completed: 0,
      marketingSpend: 0,
      revenue: 0,
      profitAfterMarketing: 0,
      signedContracts: 0,
      financeLeads: 0,
      sessions: 0,
      clicks: 0,
      paidTrafficCost: 0,
      sales: 0,
      planProfitAfterMarketing: 0,
      planProfitAfterMarketing3MonthAverage: 0,
      avgProfitAfterMarketing: 0,
      avgRevenue: 0,
      avgSales: 0,
      avgMarketingCost: 0,
      avgPaidTrafficCost: 0,
      avgSignedContracts: 0,
      avgSessions: 0,
      avgLeads: 0,
      avgClicks: 0,
      ltContracts: 0,
      lvContracts: 0,
      rbiContracts: 0,
      cpl: null,
      paidTrafficCpl: null,
      costPerSignedContract: null,
      leadToContractRate: null,
      cac: null,
      roas: null,
      marketingCostShare: null,
    };
    current.revenue += record.revenue;
    current.marketingSpend += record.marketingCost;
    current.profitAfterMarketing += record.profitAfterMarketing;
    current.signedContracts += record.signedContracts;
    current.financeLeads += record.leads ?? 0;
    current.sessions += record.sessions ?? 0;
    current.clicks += record.clicks ?? 0;
    current.paidTrafficCost += record.paidTrafficCost ?? 0;
    current.sales += record.sales ?? 0;
    current.planProfitAfterMarketing += record.planProfitAfterMarketing ?? 0;
    current.planProfitAfterMarketing3MonthAverage += record.planProfitAfterMarketing3MonthAverage ?? 0;
    current.avgProfitAfterMarketing += record.avgProfitAfterMarketing ?? 0;
    current.avgRevenue += record.avgRevenue ?? 0;
    current.avgSales += record.avgSales ?? 0;
    current.avgMarketingCost += record.avgMarketingCost ?? 0;
    current.avgPaidTrafficCost += record.avgPaidTrafficCost ?? 0;
    current.avgSignedContracts += record.avgSignedContracts ?? 0;
    current.avgSessions += record.avgSessions ?? 0;
    current.avgLeads += record.avgLeads ?? 0;
    current.avgClicks += record.avgClicks ?? 0;
    current.ltContracts += record.ltContracts ?? 0;
    current.lvContracts += record.lvContracts ?? 0;
    current.rbiContracts += record.rbiContracts ?? 0;
    current.cpl = ratio(current.marketingSpend, current.financeLeads);
    current.paidTrafficCpl = ratio(current.paidTrafficCost, current.financeLeads);
    current.costPerSignedContract = ratio(current.marketingSpend, current.signedContracts);
    current.leadToContractRate = ratio(current.signedContracts, current.financeLeads);
    current.roas = ratio(current.revenue, current.marketingSpend);
    current.marketingCostShare = ratio(current.marketingSpend, current.revenue);
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

  const months = new Set<string>([
    ...[...grouped.keys()].filter((key) => key !== "Unknown"),
    ...financeByMonth.keys(),
  ]);

  return [...months]
    .sort((a, b) => a.localeCompare(b))
    .map((month) => {
      const group = grouped.get(month) ?? [];
      const leads = group.length;
      const relevantStrict = group.filter(isRelevantStrict).length;
      const qualifiedActive = group.filter(isQualifiedActive).length;
      const rejected = group.filter(isRejected).length;
      const agreementSent = group.filter(hasAgreementSent).length;
      const agreementSigned = group.filter(hasAgreementSigned).length;
      const clients = group.filter(isClient).length;
      const fullPaidClients = group.filter(isFullPaidClient).length;
      const financeMonth = financeByMonth.get(month);

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
        marketingSpend: financeMonth?.marketingSpend ?? 0,
        revenue: financeMonth?.revenue ?? 0,
        profitAfterMarketing: financeMonth?.profitAfterMarketing ?? 0,
        signedContracts: financeMonth?.signedContracts ?? 0,
        financeLeads: financeMonth?.financeLeads ?? 0,
        sessions: financeMonth?.sessions ?? 0,
        clicks: financeMonth?.clicks ?? 0,
        paidTrafficCost: financeMonth?.paidTrafficCost ?? 0,
        sales: financeMonth?.sales ?? 0,
        planProfitAfterMarketing: financeMonth?.planProfitAfterMarketing ?? 0,
        planProfitAfterMarketing3MonthAverage: financeMonth?.planProfitAfterMarketing3MonthAverage ?? 0,
        avgProfitAfterMarketing: financeMonth?.avgProfitAfterMarketing ?? 0,
        avgRevenue: financeMonth?.avgRevenue ?? 0,
        avgSales: financeMonth?.avgSales ?? 0,
        avgMarketingCost: financeMonth?.avgMarketingCost ?? 0,
        avgPaidTrafficCost: financeMonth?.avgPaidTrafficCost ?? 0,
        avgSignedContracts: financeMonth?.avgSignedContracts ?? 0,
        avgSessions: financeMonth?.avgSessions ?? 0,
        avgLeads: financeMonth?.avgLeads ?? 0,
        avgClicks: financeMonth?.avgClicks ?? 0,
        ltContracts: financeMonth?.ltContracts ?? 0,
        lvContracts: financeMonth?.lvContracts ?? 0,
        rbiContracts: financeMonth?.rbiContracts ?? 0,
        cpl: ratio(financeMonth?.marketingSpend ?? 0, financeMonth?.financeLeads || leads),
        paidTrafficCpl: ratio(financeMonth?.paidTrafficCost ?? 0, financeMonth?.financeLeads || leads),
        costPerSignedContract: ratio(financeMonth?.marketingSpend ?? 0, financeMonth?.signedContracts ?? 0),
        leadToContractRate: ratio(financeMonth?.signedContracts ?? 0, financeMonth?.financeLeads || leads),
        cac: ratio(financeMonth?.marketingSpend ?? 0, clients),
        roas: ratio(financeMonth?.revenue ?? 0, financeMonth?.marketingSpend ?? 0),
        marketingCostShare: ratio(financeMonth?.marketingSpend ?? 0, financeMonth?.revenue ?? 0),
      };
    });
}

function fieldCoverage(records: CRMRecord[]): FieldCoverageRow[] {
  const fields: [FieldCoverageRow["group"], string, (record: CRMRecord) => unknown][] = [
    ["Used directly in analytics", "Relevant", (r) => r.relevant],
    ["Used directly in analytics", "Service dimension", (r) => r.reportingService !== "Other / Unknown" && r.reportingService],
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

function serviceCohortRows(records: CRMRecord[]): ServiceCohortRow[] {
  const grouped = new Map<string, CRMRecord[]>();
  for (const record of records) {
    const cohort = monthKey(record.createdAt);
    if (cohort === "Unknown") continue;
    const key = `${record.reportingService}|||${cohort}`;
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }

  return [...grouped.entries()]
    .map(([key, group]) => {
      const [service, cohort] = key.split("|||");
      const leads = group.length;
      const clients = group.filter(isClient);
      const paidWithDate = clients.filter((record) => record.createdAt && record.firstPaymentAt);
      const paidDateUnknown = clients.filter((record) => !record.firstPaymentAt).length;
      const byMonth = [0, 1, 2, 3, 4, 5].map((age) => {
        const count = paidWithDate.filter((record) => record.createdAt && record.firstPaymentAt && monthDiff(record.createdAt, record.firstPaymentAt) <= age).length;
        return pct(count, leads);
      });

      return {
        service,
        cohort,
        label: monthLabel(cohort),
        leads,
        qualifiedActiveRate: pct(group.filter(isQualifiedActive).length, leads),
        currentPaidRate: pct(clients.length, leads),
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
    })
    .filter((row) => row.leads >= 3)
    .sort((a, b) => b.cohort.localeCompare(a.cohort) || a.service.localeCompare(b.service));
}

function sourceServiceMatrix(records: CRMRecord[]) {
  const grouped = new Map<string, CRMRecord[]>();
  for (const record of records) {
    const key = `${record.source}|||${record.reportingService}`;
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }

  return [...grouped.entries()]
    .map(([key, group]) => {
      const [source, service] = key.split("|||");
      return {
        source,
        service,
        leads: group.length,
        clients: group.filter(isClient).length,
        fullPaidClients: group.filter(isFullPaidClient).length,
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
  const clicks = monthly.reduce((sum, record) => sum + (record.clicks ?? 0), 0);
  const paidTrafficCost = monthly.reduce((sum, record) => sum + (record.paidTrafficCost ?? 0), 0);

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
    cpc: ratio(paidTrafficCost || marketingSpend, clicks),
  };
}

function attributionWarnings(records: CRMRecord[], finance?: FinanceData): string[] {
  const sourceMethods = countBy(records, (record) => record.sourceMethod);
  const legacyOrUnknown = (sourceMethods.get("legacy_name") ?? 0) + (sourceMethods.get("unknown") ?? 0);
  const warnings = [
    "Channel CAC is based on normalized CRM source and finance channel spend. It is preliminary and subject to attribution completeness.",
    "Service-level spend and CAC are estimated by allocating channel spend across services by lead share, because the finance report does not contain service-level spend.",
  ];
  if (pct(legacyOrUnknown, records.length) > 0.2) {
    warnings.push("More than 20% of source attribution uses legacy/unknown source logic, so source CAC may be overstated or understated.");
  }
  if (pct(records.filter((record) => record.reportingService === "Other / Unknown").length, records.length) > 0.2) {
    warnings.push("More than 20% of leads are mapped to Other / Unknown service, so service-level conclusions need CRM service field cleanup.");
  }
  if ((finance?.channelCosts.length ?? 0) === 0) {
    warnings.push("No finance channel costs are available in the selected period, so CPL/CAC by channel and service are unavailable.");
  }
  return warnings;
}

function decisionInsights(rows: ServiceChannelRow[]): DecisionInsight[] {
  const paidRows = rows.filter((row) => row.marketingSpend > 0 && row.leads >= 3);
  const candidates = paidRows
    .filter((row) => row.clients > 0 && row.cac !== null)
    .sort((a, b) => (a.cac ?? Number.POSITIVE_INFINITY) - (b.cac ?? Number.POSITIVE_INFINITY))
    .slice(0, 2)
    .map((row) => ({
      title: `${row.source} / ${row.service}`,
      detail: `${row.clients} clients from ${row.leads} leads. Estimated CAC ${formatCurrency(row.cac)}.`,
      tone: "green" as const,
    }));

  const controlledTests = paidRows
    .filter((row) => row.clients === 0)
    .sort((a, b) => b.marketingSpend - a.marketingSpend)
    .slice(0, 2)
    .map((row) => ({
      title: `${row.source} / ${row.service}`,
      detail: `${formatCurrency(row.marketingSpend)} spend and ${row.leads} leads, but no clients yet. Keep as controlled test until attribution or conversion improves.`,
      tone: "amber" as const,
    }));

  const organicOrPartner = rows
    .filter((row) => row.marketingSpend === 0 && row.clients > 0 && ["Partner", "Organic Search", "Direct", "Calendly"].includes(row.source))
    .sort((a, b) => b.clients - a.clients)
    .slice(0, 2)
    .map((row) => ({
      title: `${row.source} / ${row.service}`,
      detail: `${row.clients} clients with no matched paid spend. Check whether this is true organic/partner performance or source capture drift.`,
      tone: "blue" as const,
    }));

  return [...candidates, ...controlledTests, ...organicOrPartner].slice(0, 5);
}

export function buildAnalytics(records: CRMRecord[], finance?: FinanceData): Analytics {
  const sortedDates = records
    .map((record) => record.createdAt)
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime());
  const total = records.length;
  const duplicates = duplicateIdentityCount(records);
  const uniqueTotal = total - duplicates;
  const relevantStrict = records.filter(isRelevantStrict).length;
  const qualifiedActive = records.filter(isQualifiedActive).length;
  const rejected = records.filter(isRejected).length;
  const agreementSent = records.filter(hasAgreementSent).length;
  const agreementSigned = records.filter(hasAgreementSigned).length;
  const signedWithDealValue = records.filter((record) => hasAgreementSigned(record) && (record.dealValueActual ?? 0) > 0).length;
  const crmSignedSalesValue = records.reduce((sum, record) => {
    if (!hasAgreementSigned(record)) return sum;
    return sum + (record.dealValueActual ?? 0);
  }, 0);
  const clients = records.filter(isClient).length;
  const fullPaidClients = records.filter(isFullPaidClient).length;
  const coverage = fieldCoverage(records);
  const implementedFields = coverage.filter((field) => field.rate > 0).length;
  const serviceRows = servicePerformanceRows(records, finance);
  const serviceChannelPerformance = serviceChannelRows(records, finance);

  return {
    total,
    uniqueTotal,
    dateRange: sortedDates.length
      ? compactDate(sortedDates[0]) === compactDate(sortedDates[sortedDates.length - 1])
        ? compactDate(sortedDates[0])
        : `${compactDate(sortedDates[0])} - ${compactDate(sortedDates[sortedDates.length - 1])}`
      : "n/a",
    relevantStrictRate: pct(relevantStrict, total),
    qualifiedActiveRate: pct(qualifiedActive, total),
    rejectedRate: pct(rejected, total),
    duplicateRate: pct(duplicates, total),
    agreementSentRate: pct(agreementSent, total),
    agreementSignedRate: pct(agreementSigned, total),
    crmSignedSalesValue,
    crmSignedSalesCoverage: pct(signedWithDealValue, agreementSigned),
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
    serviceRows,
    servicePerformanceRows: serviceRows,
    serviceChannelRows: serviceChannelPerformance,
    decisionInsights: decisionInsights(serviceChannelPerformance),
    attributionWarnings: attributionWarnings(records, finance),
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
    serviceCohorts: serviceCohortRows(records),
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
