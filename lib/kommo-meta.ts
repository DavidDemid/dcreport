import { KOMMO_META_ADS_SOURCE, mergeMetaSubmissions } from "./kommo";
import type { KommoLead } from "./kommo";

export type MetaEvidenceSummary = {
  paidRecords: KommoLead[];
  /** Unique FB lead/submission IDs, not FB form-template IDs. */
  paidFormIds: string[];
  /** Unique confirmed-paid submission IDs per record, summed across records. */
  paidLinks: number;
  duplicatePaidLinks: number;
  otherSourceRecords: KommoLead[];
  adsWithoutPaidFormRecords: KommoLead[];
  /** Records with missing or contradictory organic flags; groups may overlap. */
  unknownOrganicRecords: KommoLead[];
  allFormIds: string[];
  /** Records sharing a submission ID, regardless of its organic flag. */
  repeatedIdRecords: KommoLead[];
  /** Potential identity conflicts only; these records are not excluded or reclassified. */
  identityCollisionRecords: KommoLead[];
  suspiciousFormIds: string[];
};

/**
 * CRM-only provenance audit, independent of acquisition-source and creation-date metrics.
 * Callers choose the scope. No submission date or external campaign membership is inferred.
 * Conflicting flags for one submission ID, including across separate records, stay unknown.
 */
export function summarizeMetaEvidence(leads: KommoLead[]): MetaEvidenceSummary {
  const records = leads.map((lead) => ({ lead, submissions: mergeMetaSubmissions(lead.metaSubmissions ?? []) }));
  const canonical = mergeMetaSubmissions(records.flatMap(({ submissions }) => submissions));
  const organicById = new Map(canonical.map((submission) => [submission.leadId, submission.isOrganic]));
  const recordsByFormId = new Map<string, KommoLead[]>();
  for (const { lead, submissions } of records) {
    for (const { leadId } of submissions) {
      const linked = recordsByFormId.get(leadId) ?? [];
      linked.push(lead);
      recordsByFormId.set(leadId, linked);
    }
  }
  const repeatedIds = new Set<string>();
  const suspiciousIds = new Set<string>();
  for (const [formId, linked] of recordsByFormId) {
    if (linked.length < 2) continue;
    repeatedIds.add(formId);
    const emails = new Set(linked.map((lead) => lead.email.trim().toLowerCase())
      .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)));
    const phones = new Set(linked.map((lead) => lead.phone.replace(/\D/g, ""))
      .filter((phone) => phone.length >= 8));
    if (emails.size > 1 || phones.size > 1) suspiciousIds.add(formId);
  }
  const paidRecords: KommoLead[] = [];
  const otherSourceRecords: KommoLead[] = [];
  const adsWithoutPaidFormRecords: KommoLead[] = [];
  const unknownOrganicRecords: KommoLead[] = [];
  const paidFormIds = new Set<string>();
  let paidLinks = 0;
  for (const { lead, submissions } of records) {
    const paid = submissions.filter((submission) => organicById.get(submission.leadId) === false);
    if (paid.length) {
      paidRecords.push(lead);
      paidLinks += paid.length;
      for (const submission of paid) paidFormIds.add(submission.leadId);
      if (lead.source !== KOMMO_META_ADS_SOURCE) otherSourceRecords.push(lead);
    } else if (lead.source === KOMMO_META_ADS_SOURCE) adsWithoutPaidFormRecords.push(lead);
    if (submissions.some((submission) => organicById.get(submission.leadId) === null)) unknownOrganicRecords.push(lead);
  }
  return {
    paidRecords, paidFormIds: [...paidFormIds], paidLinks,
    duplicatePaidLinks: paidLinks - paidFormIds.size,
    otherSourceRecords, adsWithoutPaidFormRecords, unknownOrganicRecords,
    allFormIds: canonical.map((submission) => submission.leadId),
    repeatedIdRecords: records.filter(({ submissions }) => submissions.some(({ leadId }) => repeatedIds.has(leadId))).map(({ lead }) => lead),
    identityCollisionRecords: records.filter(({ submissions }) => submissions.some(({ leadId }) => suspiciousIds.has(leadId))).map(({ lead }) => lead),
    suspiciousFormIds: [...suspiciousIds],
  };
}
