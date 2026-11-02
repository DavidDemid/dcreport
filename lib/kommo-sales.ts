import { type KommoLead, isoDay, parseKommoDate } from "./kommo";
import { filterLeads, groups, isClient, type Scope } from "./kommo-analytics";

const SLOTS = ["firstPaymentAt", "secondPaymentAt", "thirdPaymentAt"] as const;
const DATE_FIELDS = ["First payment at", "Second payment at", "Third payment at"];
export type SalesPayment = { key: string; lead: KommoLead; installment: number; at: Date; amount: number | null; sourceIds: string[]; beforeCreation: boolean };
export type PaymentGap = { lead: KommoLead; installment: number | null; reason: "missing_date" | "conflicting_dates" | "conflicting_amounts" | "invalid_date" | "full_before_installment" | "before_creation" };

function receiptDate(lead: KommoLead, index: number) {
  const accepted = lead[SLOTS[index]];
  if (accepted) return { at: accepted, beforeCreation: false };
  // Earlier-than-creation is a cohort constraint, not an impossible receipt calendar date.
  const issue = lead.issues.find((item) => item.field === DATE_FIELDS[index] && item.reason === "before_creation");
  const at = issue ? parseKommoDate(issue.raw) ?? (/^\d+(?:\.\d+)?$/.test(issue.raw) ? parseKommoDate(Number(issue.raw)) : null) : null;
  return at ? { at, beforeCreation: true } : null;
}

function recordedAmount(lead: KommoLead, index: number): number | null {
  const amount = lead.paymentAmounts ? lead.paymentAmounts[index]
    : lead.filled.includes(`Payment ${index + 1}`) ? lead.payments[index] : null;
  return amount != null && Number.isFinite(amount) ? amount : null;
}

/** Receipt calendar, never creation cohorts. A full-payment milestone is not a fourth transfer. */
export function salesActivity(base: KommoLead[], scope: Scope, asOf: Date, raw?: KommoLead[], createdOnly = false) {
  const population = filterLeads(base, createdOnly ? scope : { ...scope, from: "", to: "" });
  const inPeriod = (at: Date | null): at is Date => Boolean(at && Number.isFinite(at.getTime()) && isoDay(at) <= isoDay(asOf)
    && (!scope.from || isoDay(at) >= scope.from) && (!scope.to || isoDay(at) <= scope.to));
  const rawById = new Map<string, KommoLead>();
  for (const lead of raw ?? []) {
    const previous = rawById.get(lead.id);
    if (!previous || (lead.modifiedAt?.getTime() ?? lead.row) >= (previous.modifiedAt?.getTime() ?? previous.row)) rawById.set(lead.id, lead);
  }
  const payments: SalesPayment[] = [], gaps: PaymentGap[] = [];
  for (const lead of population) {
    const originals = [...new Set(lead.mergedIds)].flatMap((id) => rawById.has(id) ? [rawById.get(id)!] : []);
    const records = originals.length ? originals : [lead];
    for (const index of SLOTS.keys()) {
      const dated = records.flatMap((record) => {
        const date = receiptDate(record, index);
        return date && Number.isFinite(date.at.getTime()) && isoDay(date.at) <= isoDay(asOf) ? [{ record, ...date }] : [];
      });
      const dates = new Set(dated.map(({ at }) => isoDay(at)));
      if (dates.size > 1) { gaps.push({ lead, installment: index + 1, reason: "conflicting_dates" }); continue; }
      if (!dated.length) {
        const invalid = records.some((record) => record.issues.some((issue) => issue.field === DATE_FIELDS[index]));
        const stageRequiresDate = records.some((record) => record.reachedStages.some((stage) => index === 0 ? /initial payment received/i.test(stage)
          : index === 1 ? /2nd installment received/i.test(stage) : /3rd installment received/i.test(stage)));
        if (invalid || stageRequiresDate || records.some((record) => (recordedAmount(record, index) ?? 0) > 0)) gaps.push({ lead, installment: index + 1, reason: invalid ? "invalid_date" : "missing_date" });
        continue;
      }
      const amounts = [...new Set(dated.flatMap(({ record }) => { const amount = recordedAmount(record, index); return amount === null ? [] : [amount]; }))];
      const at = dated[0].at;
      const beforeCreation = dated.some((entry) => entry.beforeCreation);
      if (beforeCreation) gaps.push({ lead, installment: index + 1, reason: "before_creation" });
      if (amounts.length > 1) gaps.push({ lead, installment: index + 1, reason: "conflicting_amounts" });
      if (inPeriod(at)) payments.push({ key: `${lead.id}:${index + 1}`, lead, installment: index + 1, at,
        amount: amounts.length === 1 ? amounts[0] : null, sourceIds: [...new Set(dated.map(({ record }) => record.id))], beforeCreation });
    }
    if (isClient(lead) && !SLOTS.some((field) => lead[field]) && !gaps.some((gap) => gap.lead === lead)) gaps.push({ lead, installment: null, reason: "missing_date" });
    if (lead.fullPaymentAt && SLOTS.some((field) => lead[field] && isoDay(lead[field]!) > isoDay(lead.fullPaymentAt!))) gaps.push({ lead, installment: null, reason: "full_before_installment" });
  }
  payments.sort((a, b) => b.at.getTime() - a.at.getTime() || a.lead.id.localeCompare(b.lead.id) || a.installment - b.installment);
  const sent = population.filter((lead) => inPeriod(lead.agreementSentAt));
  const signed = population.filter((lead) => inPeriod(lead.agreementSignedAt));
  const fullPaid = population.filter((lead) => inPeriod(lead.fullPaymentAt) && !gaps.some((gap) => gap.lead === lead && gap.reason === "full_before_installment"));
  const undatedRetainers = population.filter((lead) => !lead.agreementSentAt && lead.reachedStages.some((stage) => /^retainer sent$/i.test(stage)));
  const sum = (events: SalesPayment[]) => ({ amount: events.some((event) => event.amount !== null) ? events.reduce((total, event) => total + (event.amount ?? 0), 0) : null,
    missingAmounts: events.filter((event) => event.amount === null).length });
  const managerRows = [...groups(population, (lead) => lead.owner)].map(([owner, leads]) => {
    const events = payments.filter((event) => event.lead.owner === owner);
    return { owner, first: events.filter((event) => event.installment === 1).length, further: events.filter((event) => event.installment > 1).length,
      payingLeads: new Set(events.map((event) => event.lead.id)).size, ...sum(events),
      dateWarnings: events.filter((event) => event.beforeCreation).length,
      sent: sent.filter((lead) => lead.owner === owner).length, signed: signed.filter((lead) => lead.owner === owner).length,
      fullPaid: fullPaid.filter((lead) => lead.owner === owner).length,
      dateGaps: new Set(gaps.filter((gap) => gap.lead.owner === owner).map((gap) => gap.lead.id)).size,
      undatedRetainers: leads.filter((lead) => undatedRetainers.includes(lead)).length };
  }).sort((a, b) => b.payingLeads - a.payingLeads || b.first - a.first || a.owner.localeCompare(b.owner));
  return { population, payments, first: payments.filter((event) => event.installment === 1), further: payments.filter((event) => event.installment > 1),
    payingLeads: [...new Set(payments.map((event) => event.lead))], ...sum(payments), sent, signed, fullPaid, gaps, undatedRetainers, managerRows };
}
