import { FinanceData, FinanceMonthlyRecord } from "./finance";
import { divide, isoDay, KommoLead, monthOf } from "./kommo";

const DAY = 86_400_000;
export type Scope = { from: string; to: string; services: string[]; sources: string[]; owners: string[]; origin: "all" | "native" | "migrated" };
export type StageEvent = "firstContactAt" | "agreementSentAt" | "firstPaymentAt" | "fullPaymentAt";
export type Summary = ReturnType<typeof summarize>;
export type PerformanceRow = Summary & { name: string; spend: number | null; cpl: number | null; cpql: number | null; cac: number | null; costPerAgreement: number | null; allocation: string };

export const isRelevant = (lead: KommoLead) => lead.relevancy.trim().toLowerCase() === "relevant";
export const isLost = (lead: KommoLead) => /^(closed.*lost|lost|rejected)$/i.test(lead.stage) || Boolean(lead.lostAt);
export const isWon = (lead: KommoLead) => /^(closed.*won|won|successful)$/i.test(lead.stage);
const reached = (lead: KommoLead, expression: RegExp) => lead.reachedStages.some((stage) => expression.test(stage));
export const isFullPaid = (lead: KommoLead) => Boolean(lead.fullPaymentAt) || /^(full(y)? paid|full payment( is made)?|fully paid client)$/i.test(lead.paymentStatus) || reached(lead, /full payment/i);
export const isClient = (lead: KommoLead) => isFullPaid(lead) || Boolean(lead.firstPaymentAt || lead.secondPaymentAt || lead.thirdPaymentAt)
  || lead.payments.some((n) => n > 0) || /^(paid|partially paid|partial payment|first payment received)$/i.test(lead.paymentStatus)
  || reached(lead, /payment received|installment received/i);
export const isAgreement = (lead: KommoLead) => Boolean(lead.agreementSentAt || lead.agreementSignedAt) || reached(lead, /retainer|agreement/i) || isClient(lead);
export const isQualified = (lead: KommoLead) => Boolean(lead.inWorkAt || lead.agreementSentAt || lead.agreementSignedAt) || reached(lead, /in work|retainer|assigned to a lawyer|lawyer completed/i) || isClient(lead);
export const isOpen = (lead: KommoLead) => !isLost(lead) && !isWon(lead) && !lead.completedAt && !lead.closedAt;
export const hasContact = (lead: KommoLead) => Boolean(lead.firstContactAt) || reached(lead, /first contact/i) || isQualified(lead);

export function bounds(leads: KommoLead[]) {
  const dates = leads.flatMap((lead) => lead.createdAt ? [isoDay(lead.createdAt)] : []).sort();
  return { from: dates[0] ?? "", to: dates[dates.length - 1] ?? "" };
}

export function filterLeads(leads: KommoLead[], scope: Scope): KommoLead[] {
  return leads.filter((lead) => {
    if (!lead.createdAt && (scope.from || scope.to)) return false;
    const day = lead.createdAt ? isoDay(lead.createdAt) : "";
    return (!scope.from || day >= scope.from) && (!scope.to || day <= scope.to)
      && (!scope.services.length || scope.services.includes(lead.service))
      && (!scope.sources.length || scope.sources.includes(lead.source))
      && (!scope.owners.length || scope.owners.includes(lead.owner))
      && (scope.origin === "all" || (scope.origin === "migrated") === lead.migrated);
  });
}

export function quantile(values: number[], probability = 0.5): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * probability;
  const lo = Math.floor(index), hi = Math.ceil(index);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

export function responseMinutes(lead: KommoLead): number | null {
  if (lead.migrated || !lead.createdAt || !lead.firstContactAt) return null;
  const value = (lead.firstContactAt.getTime() - lead.createdAt.getTime()) / 60_000;
  return value >= 0 ? value : null;
}

export function summarize(leads: KommoLead[]) {
  const count = (fn: (lead: KommoLead) => boolean) => leads.filter(fn).length;
  const relevant = count(isRelevant), qualified = count(isQualified), clients = count(isClient), fullPaid = count(isFullPaid), agreements = count(isAgreement);
  const assessed = count((lead) => /^(relevant|not relevant|no relevant)$/i.test(lead.relevancy.trim()));
  const response = leads.flatMap((lead) => { const n = responseMinutes(lead); return n === null ? [] : [n]; });
  const native = leads.filter((lead) => !lead.migrated);
  const sales = leads.reduce((sum, lead) => sum + (isClient(lead) || lead.agreementSignedAt || isWon(lead) ? lead.sale ?? 0 : 0), 0);
  return {
    leads: leads.length, relevant, assessed, unassessed: leads.length - assessed, qualified, clients, fullPaid, agreements,
    agreementDated: count((lead) => Boolean(lead.agreementSentAt)), signedDated: count((lead) => Boolean(lead.agreementSignedAt)),
    clientsDated: count((lead) => Boolean(lead.firstPaymentAt)), paidUnknown: count((lead) => isClient(lead) && !lead.firstPaymentAt),
    rejected: count(isLost), open: count(isOpen), contacted: count(hasContact), migrated: count((lead) => lead.migrated), native: native.length,
    relevantRate: divide(relevant, leads.length), assessedRate: divide(assessed, leads.length), relevantAmongAssessed: divide(relevant, assessed),
    qualifiedRate: divide(qualified, leads.length), agreementRate: divide(agreements, leads.length), clientRate: divide(clients, leads.length), fullPaidRate: divide(fullPaid, leads.length),
    rejectedRate: divide(count(isLost), leads.length), sales, paymentAmount: leads.reduce((s, l) => s + l.payments.reduce((a, b) => a + b, 0), 0),
    responseMedian: quantile(response), responseP90: quantile(response, 0.9), responseSample: response.length,
    responseCoverage: divide(response.length, native.length), touchesMean: quantile(leads.flatMap((l) => l.touches === null ? [] : [l.touches])),
  };
}

export function groups<T>(leads: T[], getter: (lead: T) => string) {
  const result = new Map<string, T[]>();
  for (const lead of leads) { const k = getter(lead); result.set(k, [...(result.get(k) ?? []), lead]); }
  return result;
}

export function monthlyMetrics(leads: KommoLead[]) {
  return [...groups(leads.filter((l) => Boolean(l.createdAt)), (l) => monthOf(l.createdAt!))]
    .sort(([a], [b]) => a.localeCompare(b)).map(([month, rows]) => ({ month, ...summarize(rows) }));
}

export function fullySelectedMonth(month: string, scope: Pick<Scope, "from" | "to">) {
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`, last = isoDay(new Date(Date.UTC(y, m, 0)));
  return (!scope.from || scope.from <= first) && (!scope.to || scope.to >= last);
}

export function financeForScope(finance: FinanceData | null, scope: Pick<Scope, "from" | "to">): FinanceData {
  const inRange = (month: string) => (!scope.from || month >= scope.from.slice(0, 7)) && (!scope.to || month <= scope.to.slice(0, 7));
  return {
    monthly: finance?.monthly.filter((row) => inRange(row.month)) ?? [],
    channelCosts: finance?.channelCosts.filter((row) => inRange(row.month) && row.category.trim().toLowerCase() !== "other marketing cost") ?? [],
  };
}

export function performanceRows(leads: KommoLead[], base: KommoLead[], finance: FinanceData, scope: Scope, dimension: "source" | "service" | "campaign" | "serviceSource"): PerformanceRow[] {
  const observationTime = base.reduce((maximum, lead) => Math.max(maximum, lead.modifiedAt?.getTime() ?? lead.importedAt?.getTime() ?? 0), 0);
  const observationMonth = observationTime ? monthOf(new Date(observationTime)) : "";
  const getter = (l: KommoLead) => dimension === "serviceSource" ? `${l.service}|||${l.source}` : l[dimension];
  const baseCounts = new Map<string, number>();
  for (const lead of base) {
    if (!lead.createdAt) continue;
    const k = `${monthOf(lead.createdAt)}|||${lead.source}`;
    baseCounts.set(k, (baseCounts.get(k) ?? 0) + 1);
  }
  return [...groups(leads, getter)].map(([name, rows]) => {
    const monthlySource = groups(rows.filter((l) => l.createdAt), (l) => `${monthOf(l.createdAt!)}|||${l.source}`);
    let total = 0;
    let covered = 0;
    for (const [k, cohort] of monthlySource) {
      const [month, source] = k.split("|||");
      if (!fullySelectedMonth(month, scope) || !observationMonth || month >= observationMonth) continue;
      const matching = finance.channelCosts.filter((c) => c.month === month && c.source === source);
      if (!matching.length) continue;
      const cost = matching.reduce((sum, c) => sum + c.amount, 0);
      total += cost * cohort.length / (baseCounts.get(k) ?? cohort.length);
      covered += cohort.length;
    }
    const spend = covered === rows.length && covered > 0 ? total : null;
    const metrics = summarize(rows);
    return {
      ...metrics, name, spend, cpl: spend === null ? null : divide(spend, rows.length),
      cpql: spend === null ? null : divide(spend, metrics.qualified), cac: spend === null ? null : divide(spend, metrics.clients),
      costPerAgreement: spend === null ? null : divide(spend, metrics.agreements),
      allocation: spend === null ? "Missing spend, attribution or full-month coverage" : dimension === "source" && !scope.services.length && !scope.owners.length && scope.origin === "all" ? "Channel spend; attribution preliminary" : "Estimated from monthly channel lead share",
    };
  }).sort((a, b) => b.leads - a.leads);
}

export type CohortRow = Summary & {
  month: string;
  age: number;
  /** Cumulative fractions of the entire creation cohort, preserving the existing API. */
  cells: (number | null)[];
  /** Independent event counts in each calendar-month offset, never cumulative. */
  incrementalCounts: (number | null)[];
  cumulativeCounts: (number | null)[];
  datedEvents: number;
  /** All cohort leads without a usable selected-event date, not just undated clients. */
  undatedEvents: number;
  eventsBeyondHorizon: number;
  partial: string;
};

export function cohortEventLag(lead: KommoLead, asOf: Date, event: StageEvent): number | null {
  const date = lead[event], created = lead.createdAt;
  if (!date || !created || !Number.isFinite(date.getTime()) || !Number.isFinite(created.getTime()) || date > asOf) return null;
  // Date-only CRM events can precede the creation time on the same calendar day.
  if (isoDay(date) < isoDay(created)) return null;
  return (date.getUTCFullYear() - created.getUTCFullYear()) * 12 + date.getUTCMonth() - created.getUTCMonth();
}

export function cohortRows(leads: KommoLead[], asOf: Date, event: StageEvent): CohortRow[] {
  return [...groups(leads.filter((l) => l.createdAt), (l) => monthOf(l.createdAt!))].sort(([a], [b]) => b.localeCompare(a)).slice(0, 10).map(([month, rows]) => {
    const metrics = summarize(rows);
    const age = (asOf.getUTCFullYear() - Number(month.slice(0, 4))) * 12 + asOf.getUTCMonth() - Number(month.slice(5, 7)) + 1;
    const lags = rows.flatMap((lead) => {
      const lag = cohortEventLag(lead, asOf, event);
      return lag === null ? [] : [lag];
    });
    const incrementalCounts = Array.from({ length: 6 }, (_, offset) => offset > age ? null : lags.filter((lag) => lag === offset).length);
    let converted = 0;
    const cumulativeCounts = incrementalCounts.map((count) => {
      if (count === null) return null;
      converted += count;
      return converted;
    });
    const cells = cumulativeCounts.map((count) => count === null ? null : divide(count, rows.length));
    return {
      month, ...metrics, age, cells, incrementalCounts, cumulativeCounts,
      datedEvents: lags.length, undatedEvents: rows.length - lags.length,
      eventsBeyondHorizon: lags.filter((lag) => lag >= incrementalCounts.length).length,
      partial: monthOf(asOf),
    };
  });
}

export type QueueItem = { lead: KommoLead; action: string; ageHours: number; priority: number };
export function actionQueue(leads: KommoLead[], asOf: Date, slaMinutes: number, staleDays: number): QueueItem[] {
  const result: QueueItem[] = [];
  for (const lead of leads) {
    if (!isOpen(lead)) continue;
    const ageHours = lead.createdAt ? Math.max(0, (asOf.getTime() - lead.createdAt.getTime()) / 3_600_000) : 0;
    const contact = responseMinutes(lead);
    const stageContact = hasContact(lead);
    let action = "", priority = 0;
    if (lead.nextTaskAt && lead.nextTaskAt < asOf) { action = "Complete overdue task"; priority = 5; }
    if (!lead.migrated && !stageContact && ageHours * 60 > slaMinutes) { action = "First contact overdue"; priority = 6; }
    if (priority < 3 && contact !== null && contact > slaMinutes && !lead.nextTaskAt) { action = "Set next follow-up after delayed contact"; priority = 3; }
    if (priority < 4 && isAgreement(lead) && !isClient(lead) && !lead.nextTaskAt) { action = "Follow up on retainer / payment"; priority = 4; }
    if (lead.modifiedAt && (asOf.getTime() - lead.modifiedAt.getTime()) / DAY >= staleDays) { action ||= "Review stale opportunity"; priority = Math.max(priority, 2); }
    if (!lead.nextTaskAt && stageContact && !action) { action = "Schedule next task"; priority = 1; }
    if (action) result.push({ lead, action, ageHours, priority });
  }
  return result.sort((a, b) => b.priority - a.priority || b.ageHours - a.ageHours || a.lead.id.localeCompare(b.lead.id));
}

export function managerRows(leads: KommoLead[], asOf: Date, slaMinutes: number, staleDays: number) {
  return [...groups(leads, (l) => l.owner)].map(([owner, rows]) => {
    const metrics = summarize(rows);
    const queue = actionQueue(rows, asOf, slaMinutes, staleDays);
    const responses = rows.flatMap((l) => { const n = responseMinutes(l); return n === null ? [] : [n]; });
    return { ...metrics, owner, overdue: rows.filter((l) => isOpen(l) && l.nextTaskAt && l.nextTaskAt < asOf).length,
      noContact: rows.filter((l) => !l.migrated && isOpen(l) && !hasContact(l)).length,
      slaRate: divide(responses.filter((n) => n <= slaMinutes).length, responses.length), actions: queue.length,
      noTask: rows.filter((l) => isOpen(l) && !l.nextTaskAt).length,
    };
  }).sort((a, b) => b.leads - a.leads);
}

export function financeComparison(leads: KommoLead[], finance: FinanceData, scope: Scope, allLeads = leads) {
  const eventPopulation = filterLeads(allLeads, { ...scope, from: "", to: "" });
  const hasClosedHistory = allLeads.some((l) => Boolean(l.closedAt) || /lost|rejected|won|successful/i.test(l.stage));
  return [...new Set([...finance.monthly.map((m) => m.month), ...leads.flatMap((l) => l.createdAt ? [monthOf(l.createdAt)] : [])])]
    .sort((a, b) => b.localeCompare(a)).map((month) => {
      const created = leads.filter((l) => l.createdAt && monthOf(l.createdAt) === month);
      const paidEvents = eventPopulation.filter((l) => l.firstPaymentAt && monthOf(l.firstPaymentAt) === month);
      const entry = finance.monthly.find((m) => m.month === month);
      const summary = summarize(created);
      return { month, ...summary, paidEvents: paidEvents.length, finance: entry ?? null,
        difference: entry?.leads === undefined ? null : created.length - entry.leads,
        comparable: hasClosedHistory && fullySelectedMonth(month, scope) && !scope.services.length && !scope.sources.length && !scope.owners.length && scope.origin === "all",
      };
    });
}

export function financeTotals(rows: FinanceMonthlyRecord[]) {
  return rows.reduce((t, r) => ({ revenue: t.revenue + r.revenue, spend: t.spend + r.marketingCost, sales: t.sales + (r.sales ?? 0), contracts: t.contracts + r.signedContracts,
    clicks: t.clicks + (r.clicks ?? 0), sessions: t.sessions + (r.sessions ?? 0), paidTraffic: t.paidTraffic + (r.paidTrafficCost ?? 0), leads: t.leads + (r.leads ?? 0) }),
  { revenue: 0, spend: 0, sales: 0, contracts: 0, clicks: 0, sessions: 0, paidTraffic: 0, leads: 0 });
}
