"use client";

import { type Summary } from "@/lib/kommo-analytics";
import { divide } from "@/lib/kommo";
import { eur, num, Panel, pct } from "./kommo-ui";
import { translateReportNode, useReportLanguage } from "./report-language";

type AcquisitionRow = Pick<Summary, "leads" | "relevant" | "assessed" | "unassessed" | "clients" | "fullPaid"> & { name: string };
const segments = [
  { label: "Relevant", color: "bg-emerald-600" },
  { label: "Not relevant", color: "bg-rose-400" },
  { label: "Not assessed", color: "bg-slate-200" },
];

export function AcquisitionChart({ title, help, rows }: { title: string; help: string; rows: AcquisitionRow[] }) {
  const { t } = useReportLanguage();
  const maximum = Math.max(1, ...rows.map((r) => r.leads));
  const chunks = Array.from({ length: Math.max(1, Math.ceil(rows.length / 8)) }, (_, i) => rows.slice(i * 8, (i + 1) * 8));
  return translateReportNode(<>{chunks.map((chunk, index) => <Panel key={index} title={`${title}${chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ""}`} help={help}>
    <figure data-chart="acquisition" className="min-w-0">
      <div className="mb-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">{segments.map((s) => <span key={s.label} className="inline-flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-sm ${s.color}`} />{s.label}</span>)}</div>
      <div className="space-y-5">{chunk.map((row) => {
        const values = [row.relevant, row.assessed - row.relevant, row.unassessed];
        return <div key={row.name} className="grid min-w-0 gap-x-5 gap-y-2 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)_140px] md:items-center">
          <div className="min-w-0 break-words text-xs font-medium leading-5 text-slate-800">{row.name}</div>
          <div className="relative h-7 min-w-0 rounded-sm bg-slate-50" aria-label={`${row.name}: ${num(row.leads)} leads; ${num(row.relevant)} relevant, ${num(row.assessed - row.relevant)} not relevant, ${num(row.unassessed)} not assessed`}>
            <div className="flex h-full overflow-hidden rounded-sm" style={{ width: `${row.leads / maximum * 100}%` }}>{values.map((value, i) => <div key={i} className={`h-full ${segments[i].color}`} style={{ width: `${(divide(value, row.leads) ?? 0) * 100}%` }} title={`${segments[i].label}: ${num(value)} (${pct(divide(value, row.leads))})`} />)}</div>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs tabular-nums md:block md:text-right"><span className="font-semibold text-slate-950">{num(row.leads)} leads</span><span className="text-emerald-700 md:block">RR {pct(divide(row.relevant, row.leads))}</span><span className="text-slate-500 md:block">{num(row.clients)} clients / {pct(divide(row.clients, row.leads))}</span></div>
        </div>;
      })}</div>
      {!rows.length && <p className="py-8 text-center text-sm text-slate-500">No leads match this selection.</p>}
    </figure>
  </Panel>)}</>, t);
}

type RateRow = { name: string; leads: number; relevantRate: number | null; qualifiedRate: number | null; clientRate: number | null };
const rates = [
  { key: "relevantRate" as const, label: "Relevant strict", color: "bg-emerald-600" },
  { key: "qualifiedRate" as const, label: "Qualified / active", color: "bg-blue-600" },
  { key: "clientRate" as const, label: "Client", color: "bg-amber-500" },
];

export function ConversionChart({ title, help, rows }: { title: string; help: string; rows: RateRow[] }) {
  const { t } = useReportLanguage();
  const chunks = Array.from({ length: Math.max(1, Math.ceil(rows.length / 6)) }, (_, i) => rows.slice(i * 6, (i + 1) * 6));
  return translateReportNode(<>{chunks.map((chunk, index) => <Panel key={index} title={`${title}${chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ""}`} help={help}>
    <figure data-chart="conversion" className="min-w-0">
      <div className="mb-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">{rates.map((s) => <span key={s.key} className="inline-flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-sm ${s.color}`} />{s.label}</span>)}<span>Common scale: 0-100%</span></div>
      <div className="space-y-5">{chunk.map((row) => <div key={row.name} className="grid min-w-0 gap-x-6 gap-y-2 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <div className="min-w-0 break-words text-xs font-medium leading-5 text-slate-800">{row.name}<span className="ml-2 font-normal text-slate-400 md:ml-0 md:block">{num(row.leads)} leads</span></div>
        <div className="space-y-2">{rates.map((s) => <div key={s.key} className="grid grid-cols-[minmax(0,1fr)_48px] items-center gap-3" aria-label={`${row.name}, ${s.label}: ${pct(row[s.key])}`}><div className="h-3 rounded-sm bg-slate-100"><div className={`h-full rounded-sm ${s.color}`} style={{ width: `${(row[s.key] ?? 0) * 100}%` }} /></div><span className="text-right text-[11px] tabular-nums text-slate-600">{pct(row[s.key])}</span></div>)}</div>
      </div>)}</div>
      {!rows.length && <p className="py-8 text-center text-sm text-slate-500">No leads match this selection.</p>}
    </figure>
  </Panel>)}</>, t);
}

type CostRow = { name: string; cpl: number | null; cac: number | null; matchedLeads: number; matchedClients: number };
export function AcquisitionCostChart({ rows }: { rows: CostRow[] }) {
  const { t } = useReportLanguage();
  const available = rows.filter((r) => r.cpl !== null || r.cac !== null);
  const maximum = Math.max(1, ...available.flatMap((r) => [r.cpl ?? 0, r.cac ?? 0]));
  const chunks = Array.from({ length: Math.max(1, Math.ceil(available.length / 6)) }, (_, i) => available.slice(i * 6, (i + 1) * 6));
  return translateReportNode(<>{chunks.map((chunk, index) => <Panel key={index} title={`Matched-period acquisition cost${chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ""}`} help="Finance media spend divided by CRM leads or clients from the same fully selected, completed months and matched channels. Bars share one EUR scale. CAC is preliminary: the export may omit closed leads. Missing spend and zero clients produce n/a, never an invented zero.">
    <figure data-chart="cost" className="min-w-0">
      <div className="mb-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500"><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-blue-600" />CPL</span><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />CAC / client</span><span>EUR / matching months only</span></div>
      <div className="space-y-5">{chunk.map((row) => <div key={row.name} className="grid min-w-0 gap-x-6 gap-y-2 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <div className="break-words text-xs font-medium leading-5 text-slate-800">{row.name}<span className="block font-normal text-slate-400">{num(row.matchedLeads)} leads / {num(row.matchedClients)} clients</span></div>
        <div className="space-y-2">{([{ key: "cpl", color: "bg-blue-600" }, { key: "cac", color: "bg-amber-500" }] as const).map((s) => <div key={s.key} className="grid grid-cols-[minmax(0,1fr)_70px] items-center gap-3" aria-label={`${row.name} ${s.key.toUpperCase()}: ${eur(row[s.key])}`}><div className="h-3 rounded-sm bg-slate-100"><div className={`h-full rounded-sm ${s.color}`} style={{ width: `${(row[s.key] ?? 0) / maximum * 100}%` }} /></div><span className="text-right text-xs tabular-nums text-slate-600">{eur(row[s.key])}</span></div>)}</div>
      </div>)}</div>
      {!available.length && <p className="py-8 text-center text-sm text-slate-500">No complete months with matching channel spend. Partial-day selections retain CRM metrics without inventing daily finance costs.</p>}
    </figure>
  </Panel>)}</>, t);
}
