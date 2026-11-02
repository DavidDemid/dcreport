"use client";

import { type ReactNode, useId } from "react";
import { ChevronDown, Info } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { translateReportNode, useReportLanguage } from "./report-language";
import { EvidenceButton } from "./metric-data-drawer";
import type { EvidenceSource } from "@/lib/metric-evidence";

export const num = (n: number | null | undefined) => n == null ? "n/a" : new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(n);
export const pct = (n: number | null | undefined) => n == null ? "n/a" : `${num(n * 100)}%`;
export const eur = (n: number | null | undefined) => n == null ? "n/a" : new Intl.NumberFormat("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
export const duration = (minutes: number | null | undefined) => minutes == null ? "n/a" : minutes < 60 ? `${num(minutes)} min` : minutes < 1440 ? `${num(minutes / 60)} h` : `${num(minutes / 1440)} d`;
export const dayLabel = (d: Date | null) => d ? d.toISOString().slice(0, 10) : "n/a";

export function Hint({ text }: { text: string }) {
  const { t } = useReportLanguage();
  const id = useId();
  return <span className="kommo-hint pdf-ignore relative inline-flex shrink-0 align-middle">
    <button type="button" className="peer inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:text-blue-700 focus:text-blue-700" aria-label={t(text)} aria-describedby={id}><Info size={14} /></button>
    <span id={id} role="tooltip" className="pointer-events-none absolute right-0 top-7 z-50 hidden w-64 max-w-[calc(100vw-2rem)] rounded-md bg-slate-900 p-3 text-left text-xs font-normal leading-relaxed text-white shadow-lg peer-hover:block peer-focus:block">{t(text)}</span>
  </span>;
}

export function Panel({ title, help, children, extra }: { title: string; help: string; children: ReactNode; extra?: ReactNode }) {
  const { t } = useReportLanguage();
  return <section data-report-block className="min-w-0 border-t border-slate-200 bg-white px-4 py-5 sm:px-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="flex min-w-0 items-center gap-1 text-base font-semibold text-slate-950">{t(title)}<Hint text={help} /></h2>{translateReportNode(extra, t)}</div>{translateReportNode(children, t)}
  </section>;
}

export type Metric = { label: string; value: string; sub?: string; help: string; description?: string; evidence?: EvidenceSource; tone?: "blue" | "green" | "amber" };
export function Metrics({ items }: { items: Metric[] }) {
  const { t } = useReportLanguage();
  const groups = Array.from({ length: Math.ceil(items.length / 4) }, (_, i) => items.slice(i * 4, i * 4 + 4));
  return <>{groups.map((group, i) => <div data-report-block key={i} className="grid grid-cols-2 gap-3 py-1 lg:grid-cols-4">{group.map((m) => <div data-metric-card={m.label} className="flex min-w-0 flex-col rounded-lg border border-slate-200 bg-white p-4" key={m.label}>
    <div className="flex items-start justify-between gap-1 text-xs font-semibold text-slate-600"><span className="min-w-0 break-words leading-5">{t(m.label)}</span><Hint text={m.help} /></div>
    <div className={`mt-2 break-words text-2xl font-semibold tabular-nums ${m.tone === "green" ? "text-emerald-700" : m.tone === "amber" ? "text-amber-700" : m.tone === "blue" ? "text-blue-700" : "text-slate-950"}`}>{t(m.value)}</div>
    {m.sub && <div className="mt-2 text-xs leading-5 text-slate-500">{t(m.sub)}</div>}
    <p className="mt-2 text-xs leading-5 text-slate-500">{t(m.description ?? m.help)}</p>
    {m.evidence && <div className="mt-auto"><EvidenceButton evidence={m.evidence} /></div>}
  </div>)}</div>)}</>;
}

export function DataTable({ title, help, headers, rows, firstWidth = "24%" }: { title: string; help: string; headers: string[]; rows: ReactNode[][]; firstWidth?: string }) {
  const { t } = useReportLanguage();
  const chunks = rows.length ? Array.from({ length: Math.ceil(rows.length / 12) }, (_, i) => rows.slice(i * 12, (i + 1) * 12)) : [[]];
  return <>{chunks.map((chunk, index) => <Panel key={index} title={`${title}${chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ""}`} help={help}>
    <div className="max-w-full overflow-x-auto"><table className="kommo-table w-full table-fixed text-xs tabular-nums">
      <colgroup><col style={{ width: firstWidth }} />{headers.slice(1).map((h) => <col key={h} />)}</colgroup>
      <thead><tr className="border-b border-slate-200 bg-slate-50">{headers.map((h, i) => <th key={h} className={`break-words px-1 py-3 font-semibold leading-4 text-slate-600 sm:px-2 sm:leading-5 ${i ? "text-right" : "text-left"}`}>{t(h)}</th>)}</tr></thead>
      <tbody>{chunk.map((row, j) => <tr key={j} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50">{row.map((cell, i) => <td key={i} className={`break-words px-1 py-3 leading-4 sm:px-2 sm:leading-5 ${i ? "text-right text-slate-700" : "font-medium text-slate-950"}`}>{translateReportNode(cell, t)}</td>)}</tr>)}</tbody>
    </table>{!rows.length && <p className="py-8 text-center text-sm text-slate-500">{t("No records in the current selection.")}</p>}</div>
  </Panel>)}</>;
}

export function MultiFilter({ label, values, selected, onChange }: { label: string; values: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const { t } = useReportLanguage();
  return <details className="kommo-filter relative min-w-0">
    <summary className="flex h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm"><span className="truncate">{t(label)}: {t(selected.length ? `${selected.length} selected` : "All")}</span><ChevronDown size={14} /></summary>
    <div className="absolute right-0 top-11 z-30 max-h-80 w-72 max-w-[85vw] overflow-y-auto rounded-md border border-slate-200 bg-white p-2 shadow-lg">
      <button type="button" onClick={() => onChange([])} className="mb-1 w-full rounded px-2 py-2 text-left text-xs font-semibold text-blue-700 hover:bg-blue-50">{t(`All ${label.toLowerCase()}`)}</button>
      {values.map((option) => <label className="flex cursor-pointer items-start gap-2 rounded px-2 py-2 text-xs leading-5 hover:bg-slate-50" key={option}><input type="checkbox" checked={selected.includes(option)} onChange={() => onChange(selected.includes(option) ? selected.filter((s) => s !== option) : [...selected, option])} className="mt-1" />{t(option)}</label>)}
    </div>
  </details>;
}

const COLORS = ["#2563eb", "#0d9488", "#e11d48", "#d97706", "#7c3aed", "#475569"];
export function Trend({ title, help, rows, series, percent = false }: { title: string; help: string; rows: Record<string, unknown>[]; series: { key: string; label: string; bar?: boolean }[]; percent?: boolean }) {
  const { t, locale } = useReportLanguage();
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return <Panel title={title} help={help}>
    {rows.length ? <div className="h-[300px] w-full min-w-0"><ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={{ left: 0, right: 12, top: 12, bottom: 4 }}><CartesianGrid stroke="#e2e8f0" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 11 }} minTickGap={20} /><YAxis width={48} domain={percent ? [0, 1] : [0, "auto"]} tick={{ fontSize: 11 }} tickFormatter={(v) => percent ? `${Math.round(v * 100)}%` : format.format(Number(v))} /><Tooltip formatter={(v) => percent ? `${format.format(Number(v) * 100)}%` : format.format(Number(v))} /><Legend wrapperStyle={{ fontSize: 11, paddingTop: 14 }} />
        {series.map((s, i) => s.bar ? <Bar key={s.key} isAnimationActive={false} dataKey={s.key} name={t(s.label)} fill={COLORS[i % COLORS.length]} maxBarSize={30} /> : <Line key={s.key} isAnimationActive={false} connectNulls={false} type="linear" dataKey={s.key} name={t(s.label)} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 2 }} />)}
      </ComposedChart>
    </ResponsiveContainer></div> : <p className="py-12 text-center text-sm text-slate-500">{t("No dated data in the current selection.")}</p>}
  </Panel>;
}
