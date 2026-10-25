import type { FinanceData } from "./finance";
import type { KommoLead } from "./kommo";
import { divide, monthOf } from "./kommo";
import type { Scope, Summary } from "./kommo-analytics";
import { filterLeads, financeForScope, fullySelectedMonth, groups, summarize } from "./kommo-analytics";

export type FinancePerformanceDimension = "source" | "service" | "campaign" | "serviceSource" | "owner" | "manager";

export type MatchedFinancePerformanceRow = Summary & {
  name: string;
  matchedLeads: number;
  matchedRelevant: number;
  matchedQualified: number;
  matchedClients: number;
  matchedAgreements: number;
  matchedFullPaid: number;
  /** Allocated channel spend for matched creation cohorts only, not all selected leads. */
  spend: number | null;
  cpl: number | null;
  cpql: number | null;
  cac: number | null;
  costPerAgreement: number | null;
  /** matchedLeads / leads, including uncovered and undated leads in the denominator. */
  coverage: number | null;
  /** Sorted months with at least one matched month/source cohort. */
  months: string[];
  /** Closed, fully selected months with unmatched leads; may overlap months for mixed sources. */
  missingMonths: string[];
  /** Calendar range restricted to fully selected months before the snapshot month. */
  closedSelectedMonths: string[];
  /** Selected calendar months excluded because they are partial, current, or future. */
  excludedMonths: string[];
  snapshotMonth: string | null;
  estimated: boolean;
  allocation: string;
};

function snapshotMonthOf(base: KommoLead[], asOf?: Date): string | null {
  if (asOf !== undefined) return Number.isFinite(asOf.getTime()) ? monthOf(asOf) : null;
  let latest = -Infinity;
  for (const lead of base) {
    for (const date of [lead.modifiedAt, lead.importedAt, lead.createdAt]) {
      if (date && Number.isFinite(date.getTime())) latest = Math.max(latest, date.getTime());
    }
  }
  return Number.isFinite(latest) ? monthOf(new Date(latest)) : null;
}

function calendarMonths(base: KommoLead[], scope: Scope, snapshotMonth: string | null): string[] {
  const observed = base.flatMap((lead) => lead.createdAt ? [monthOf(lead.createdAt)] : []).sort();
  const from = scope.from.slice(0, 7) || observed[0] || scope.to.slice(0, 7) || snapshotMonth;
  const to = scope.to.slice(0, 7) || snapshotMonth || observed[observed.length - 1] || from;
  const valid = (month: string | null): month is string => Boolean(month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month));
  if (!valid(from) || !valid(to) || from > to) return [];
  const index = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
  const result: string[] = [];
  for (let i = index(from); i <= index(to); i++) {
    result.push(`${String(Math.floor(i / 12)).padStart(4, "0")}-${String(i % 12 + 1).padStart(2, "0")}`);
  }
  return result;
}

const cohortKey = (month: string, source: string) => JSON.stringify([month, source]);

/**
 * Browser-only supplement to performanceRows. Pass the entire cleaned population as base;
 * scope is reapplied to leads, never to the allocation denominator. Sources must already be
 * normalized by the existing CRM/finance parsers. No day prorating or monthly-total fallback.
 * Summary.sales/paymentAmount remain raw CRM values of unknown currency, not ROAS inputs.
 * Source rows form a disjoint partition, so their matched spend/counts can be totaled once.
 */
export function matchedFinancePerformance(
  leads: KommoLead[],
  base: KommoLead[],
  finance: FinanceData | null,
  scope: Scope,
  dimension: FinancePerformanceDimension,
  asOf?: Date,
): MatchedFinancePerformanceRow[] {
  const snapshotMonth = snapshotMonthOf(base, asOf);
  const selectedMonths = calendarMonths(base, scope, snapshotMonth);
  const closedSelectedMonths = selectedMonths.filter((month) => snapshotMonth !== null && month < snapshotMonth && fullySelectedMonth(month, scope));
  const closed = new Set(closedSelectedMonths);
  const excludedMonths = selectedMonths.filter((month) => !closed.has(month));
  const baseCounts = new Map<string, number>();
  for (const lead of base) {
    if (!lead.createdAt) continue;
    const key = cohortKey(monthOf(lead.createdAt), lead.source);
    baseCounts.set(key, (baseCounts.get(key) ?? 0) + 1);
  }

  const costs = new Map<string, number | null>();
  for (const cost of financeForScope(finance, scope).channelCosts) {
    if (!closed.has(cost.month)) continue;
    const key = cohortKey(cost.month, cost.source);
    const previous = costs.get(key);
    const total = (previous ?? 0) + cost.amount;
    // An invalid component makes the whole bucket unknown, rather than a partial/zero cost.
    costs.set(key, previous === null || !Number.isFinite(cost.amount) || !Number.isFinite(total) ? null : total);
  }

  const getter = (lead: KommoLead): string => dimension === "serviceSource" ? `${lead.service}|||${lead.source}`
    : dimension === "manager" ? lead.owner : lead[dimension];
  return [...groups(filterLeads(leads, scope), getter)].map(([name, rows]): MatchedFinancePerformanceRow => {
    const cohorts = groups(rows.filter((lead) => lead.createdAt), (lead) => cohortKey(monthOf(lead.createdAt!), lead.source));
    const matched: KommoLead[] = [];
    const months = new Set<string>();
    const missingMonths = new Set<string>();
    let total = 0;
    let estimated = dimension !== "source" || Boolean(scope.services.length || scope.owners.length || scope.origin !== "all");
    for (const [key, cohort] of cohorts) {
      const month = monthOf(cohort[0].createdAt!);
      if (!closed.has(month)) continue;
      const cost = costs.get(key);
      const denominator = baseCounts.get(key) ?? 0;
      // No fallback to the selected population: an absent/inconsistent base cannot allocate.
      if (cost === undefined || cost === null || denominator < cohort.length) {
        missingMonths.add(month);
        continue;
      }
      const share = cohort.length / denominator;
      total += cost * share;
      estimated ||= share < 1;
      matched.push(...cohort);
      months.add(month);
    }

    const all = summarize(rows);
    const covered = summarize(matched);
    const spend = matched.length ? total : null;
    return {
      ...all, name,
      matchedLeads: covered.leads, matchedRelevant: covered.relevant, matchedQualified: covered.qualified,
      matchedClients: covered.clients, matchedAgreements: covered.agreements, matchedFullPaid: covered.fullPaid,
      spend,
      cpl: spend === null ? null : divide(spend, covered.leads),
      cpql: spend === null ? null : divide(spend, covered.qualified),
      cac: spend === null ? null : divide(spend, covered.clients),
      costPerAgreement: spend === null ? null : divide(spend, covered.agreements),
      coverage: divide(covered.leads, all.leads),
      months: [...months].sort(), missingMonths: [...missingMonths].sort(),
      closedSelectedMonths: [...closedSelectedMonths], excludedMonths: [...excludedMonths], snapshotMonth,
      estimated,
      allocation: spend === null ? "No matched closed-month channel spend"
        : estimated ? "Estimated from monthly channel lead share; attribution preliminary"
          : "Monthly channel spend; attribution preliminary",
    };
  }).sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name));
}
