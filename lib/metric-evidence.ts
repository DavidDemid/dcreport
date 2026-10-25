export type EvidenceRow = {
  key: string;
  id: string;
  name: string;
  owner: string;
  service: string;
  source: string;
  stage: string;
  relevancy: string;
  created: string;
  mergedIds: string[];
  fields: Record<string, string>;
};

export type MetricEvidence = {
  title: string;
  description: string;
  formula: string;
  fields: string[];
  rows: EvidenceRow[];
  baseRows?: EvidenceRow[];
  rawRows?: EvidenceRow[];
  segments?: { id: string; label: string; rows: EvidenceRow[] }[];
  numerator?: number;
  denominator?: number;
  scope?: string;
  notice?: string;
};

export type EvidenceSource = MetricEvidence | (() => MetricEvidence);

export function searchEvidence(rows: EvidenceRow[], query: string): EvidenceRow[] {
  const text = query.trim().toLocaleLowerCase();
  if (!text) return rows;
  return rows.filter((row) => [row.id, row.name, row.owner, row.service, row.source, row.stage, row.relevancy,
    ...row.mergedIds, ...Object.values(row.fields)].some((value) => value.toLocaleLowerCase().includes(text)));
}

export function evidenceCsv(rows: EvidenceRow[]): string {
  const fields = [...new Set(rows.flatMap((row) => Object.keys(row.fields)))];
  const headers = ["Lead ID", "Name", "Owner", "Service", "Source", "Stage", "Relevancy", "Created", "Merged IDs", ...fields];
  const quote = (value: string) => `"${(/^[\s]*[=+@-]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
  return "\uFEFF" + [headers, ...rows.map((row) => [row.id, row.name, row.owner, row.service, row.source, row.stage,
    row.relevancy, row.created, row.mergedIds.join("; "), ...fields.map((field) => row.fields[field] ?? "")])]
    .map((row) => row.map(quote).join(",")).join("\r\n");
}
