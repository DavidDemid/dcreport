"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Filter,
  Info,
  Layers3,
  RefreshCw,
  Upload,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import clsx from "clsx";
import { Analytics, buildAnalytics, formatCurrency, formatNumber, formatPercent } from "@/lib/analytics";
import { CRMRecord, parseWorkbook } from "@/lib/crm";
import { FinanceData, parseFinanceWorkbook } from "@/lib/finance";

type Tab = "overview" | "sources" | "conversion" | "cohorts" | "quality";

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#be123c", "#475569"];

const tabs: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "sources", label: "Channels & services", icon: Filter },
  { id: "conversion", label: "Conversion", icon: Activity },
  { id: "cohorts", label: "Cohorts", icon: Layers3 },
  { id: "quality", label: "Quality", icon: CheckCircle2 },
];

const DB_NAME = "dc-crm-analytics";
const DB_VERSION = 1;
const FILE_STORE = "files";

const panelHelp: Record<string, string> = {
  "Monthly trend": "Shows how lead volume, active-qualified leads, rejected leads, and clients changed by lead creation month.",
  "Pipeline status distribution": "Counts CRM rows by current status, so you can see where the pipeline is concentrated right now.",
  "Marketing finance trend": "Compares monthly marketing spend, revenue, and ROAS from the finance file for the selected period.",
  "Top countries": "Ranks countries by lead count in the current CRM filter.",
  "Rejection reasons": "Shows the most common CRM rejection reasons among rejected/lost leads.",
  "Lead acquisition by channel": "Counts leads by normalized source: first-touch source, UTM source, parsed UTM tag, then legacy source name.",
  "Lead acquisition by service": "Counts leads by service dimension: qualified service, original service interest, then Service group fallback.",
  "Source report": "Channel table with volume, conversion rates, spend, CPL, and CAC where finance spend can be matched.",
  "Decision flags": "Highlights channel-service combinations that may be scale candidates, controlled tests, or attribution checks.",
  "Attribution and CAC limitations": "Explains where CAC is preliminary because CRM source and finance spend do not fully match end to end.",
  "Marketing efficiency by channel": "Shows spend, cost per lead, and cost per client for channels that have finance costs.",
  "Service report": "Service table with lead volume and conversion rates. Spend is not split by service because finance data is channel-based.",
  "Service-level performance": "Performance by normalized product/service. Spend is estimated by allocating channel spend across services by lead share.",
  "Channel performance by service": "Breaks each product/service down by channel with lead, client, full-paid counts and estimated cost metrics.",
  "Channel and service combinations": "Largest source-service pairs, useful for seeing which channel drives which service.",
  "Monthly conversion trend": "Shows month-by-month conversion rates from lead to relevant, active, agreement, client, and full-paid client.",
  "Monthly conversion by channel": "Same conversion trend, but only for the selected marketing channel.",
  "Lead to client funnel": "Step funnel from all leads to full payment. Each rate is calculated against total leads.",
  "Conversion by channel": "Compares channel volume and conversion quality side by side.",
  "Conversion by service": "Compares service volume and conversion quality side by side.",
  "Monthly cohorts": "Groups leads by creation month and tracks payment timing using real first_payment_at dates only.",
  "Service cohort snapshot": "Recent monthly cohorts split by normalized product/service, so cohort quality is not hidden by the total average.",
  "Cohort conversion trend": "Compares cohort quality: active-qualified rate, current paid proxy, paid with date by M5, and rejected rate.",
  "Field completeness": "Shows how often important CRM fields are filled and whether metrics still depend on status proxies.",
};

function numericValue(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

function dateFromInput(value: string, endOfDay = false): Date | null {
  if (!value) return null;
  const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDateBounds(records: CRMRecord[]) {
  const dates = records
    .map((record) => record.createdAt)
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    from: toDateInputValue(dates[0] ?? null),
    to: toDateInputValue(dates[dates.length - 1] ?? null),
  };
}

function financeMonthDate(month: string): Date | null {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return null;
  return new Date(Date.UTC(year, monthNumber - 1, 1));
}

function filterFinanceData(finance: FinanceData | null, from: string, to: string): FinanceData | undefined {
  if (!finance) return undefined;
  const fromDate = dateFromInput(from);
  const toDate = dateFromInput(to, true);
  const inRange = (month: string) => {
    const date = financeMonthDate(month);
    if (!date) return false;
    if (fromDate && date < new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1))) return false;
    if (toDate && date > new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), 1))) return false;
    return true;
  };

  return {
    monthly: finance.monthly.filter((record) => inRange(record.month)),
    channelCosts: finance.channelCosts.filter((record) => inRange(record.month)),
  };
}

function reportFileDate(value: string, fallback: string): string {
  return value || fallback;
}

function fileSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function openReportsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveReportFile(key: "crm" | "finance", name: string, buffer: ArrayBuffer) {
  const db = await openReportsDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, "readwrite");
    tx.objectStore(FILE_STORE).put({ name, buffer, savedAt: Date.now() }, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadReportFile(key: "crm" | "finance"): Promise<{ name: string; buffer: ArrayBuffer } | null> {
  const db = await openReportsDb();
  const result = await new Promise<{ name: string; buffer: ArrayBuffer } | null>((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, "readonly");
    const request = tx.objectStore(FILE_STORE).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

function EmptyState() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fa] p-6">
      <section className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <FileSpreadsheet className="mx-auto h-10 w-10 text-slate-500" />
        <h1 className="mt-4 text-2xl font-semibold text-slate-950">DC CRM Analytics</h1>
        <p className="mt-2 text-sm text-slate-600">Loading the current CRM export...</p>
      </section>
    </main>
  );
}

function KpiCard({
  label,
  value,
  sub,
  help,
  tone = "blue",
}: {
  label: string;
  value: string;
  sub: string;
  help?: string;
  tone?: "blue" | "green" | "amber" | "red";
}) {
  const toneClass = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-rose-200 bg-rose-50 text-rose-700",
  }[tone];
  const helpText = help ?? sub;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className={clsx("kpi-label mb-4 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold", toneClass)}>
        <span className="kpi-label-text">{label}</span>
        {helpText ? (
          <span className="pdf-ignore" title={helpText}>
            <Info className="h-3.5 w-3.5" aria-label={helpText} />
          </span>
        ) : null}
      </div>
      <div className="pdf-kpi-label hidden text-sm font-semibold text-slate-950">{label}</div>
      <div className="text-3xl font-semibold text-slate-950">{value}</div>
      <div className="mt-2 text-sm text-slate-600">{sub}</div>
    </section>
  );
}

function InfoHint({ text }: { text: string }) {
  return (
    <span
      title={text}
      className="pdf-ignore inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500"
    >
      <Info className="h-3.5 w-3.5" aria-label={text} />
    </span>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
      {children}
    </div>
  );
}

function Panel({
  title,
  children,
  action,
  help,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  help?: string;
}) {
  const helpText = help ?? panelHelp[title];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          {helpText ? <InfoHint text={helpText} /> : null}
        </div>
        {action ? <div className="pdf-ignore">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function PercentBar({ value, color = "bg-blue-600" }: { value: number; color?: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-slate-100">
      <div className={clsx("h-2 rounded-full", color)} style={{ width: `${Math.min(value * 100, 100)}%` }} />
    </div>
  );
}

function Overview({ analytics }: { analytics: Analytics }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total leads" value={formatNumber(analytics.total)} sub={`${analytics.dateRange} · ${formatNumber(analytics.uniqueTotal)} unique`} help="All CRM rows after date and duplicate filters. Unique count excludes duplicate_flag = true." />
        <KpiCard label="Relevant rate" value={formatPercent(analytics.relevantStrictRate)} sub="Strict: Relevant = Relevant" help="Strict metric from the Relevant field only." tone="green" />
        <KpiCard label="Rejected rate" value={formatPercent(analytics.rejectedRate)} sub="Rejected or lost leads" help="Rejected leads divided by all leads in the current filter. Uses Rejected status or lost_at." tone="red" />
        <KpiCard label="Client rate" value={formatPercent(analytics.clientRate)} sub="First payment date or payment proxy" help="Client means first payment reached. If payment date is empty, status/payment_status can still mark the lead as client." tone="amber" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Marketing spend" value={formatCurrency(analytics.finance.marketingSpend)} sub="From finance report, filtered by month" help="Finance report is matched to CRM by month and the global creation-date period." />
        <KpiCard label="ROAS" value={analytics.finance.roas === null ? "n/a" : `${analytics.finance.roas.toFixed(2)}x`} sub="Revenue / marketing spend" help="How many euros of finance revenue were generated per euro of marketing spend." tone="green" />
        <KpiCard label="CPL" value={formatCurrency(analytics.finance.cpl)} sub="Marketing spend / leads" help="Average marketing cost for one CRM lead in the current period." tone="amber" />
        <KpiCard label="CAC" value={formatCurrency(analytics.finance.cac)} sub="Marketing spend / first-payment clients" help="Average marketing cost for one client. Client means first payment reached." tone="red" />
        <KpiCard label="CPC" value="n/a" sub="Clicks are not present in finance XLS" help="CPC requires click counts. Current finance report has costs/revenue/contracts, but no clicks." />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Monthly trend">
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={analytics.monthly}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar isAnimationActive={false} dataKey="leads" fill="#2563eb" name="Leads" radius={[3, 3, 0, 0]} />
                <Line isAnimationActive={false} type="monotone" dataKey="qualifiedActive" stroke="#16a34a" strokeWidth={2} name="Qualified / Active" dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="rejected" stroke="#dc2626" strokeWidth={2} name="Rejected" dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="clients" stroke="#f59e0b" strokeWidth={2} name="Clients" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Pipeline status distribution">
          <div className="space-y-3">
            {analytics.statusRows.slice(0, 10).map((row, index) => (
              <div key={row.name} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <span
                      className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="min-w-0 break-words text-sm font-semibold leading-snug text-slate-950">{row.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-slate-950">{formatNumber(row.value)}</div>
                    <div className="text-xs text-slate-500">{formatPercent(row.share)}</div>
                  </div>
                </div>
                <PercentBar value={row.share} color="bg-slate-700" />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Marketing finance trend">
        <div className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={analytics.monthly}>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${Number(value).toFixed(1)}x`} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value, name) =>
                  String(name).includes("ROAS") ? `${numericValue(value).toFixed(2)}x` : formatCurrency(numericValue(value))
                }
              />
              <Legend />
              <Bar isAnimationActive={false} yAxisId="left" dataKey="marketingSpend" fill="#2563eb" name="Marketing spend" radius={[3, 3, 0, 0]} />
              <Bar isAnimationActive={false} yAxisId="left" dataKey="revenue" fill="#16a34a" name="Revenue" radius={[3, 3, 0, 0]} />
              <Line isAnimationActive={false} yAxisId="right" type="monotone" dataKey="roas" stroke="#f59e0b" strokeWidth={2} name="ROAS" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Top countries">
          <div className="space-y-3">
            {analytics.topCountries.slice(0, 8).map((row) => (
              <div key={row.name} className="grid grid-cols-[minmax(0,1fr)_74px] items-center gap-3 text-sm">
                <span className="truncate text-slate-700">{row.name}</span>
                <span className="text-right font-medium text-slate-950">{formatNumber(row.value)}</span>
                <div className="col-span-2">
                  <PercentBar value={row.share} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Rejection reasons">
          <div className="space-y-3">
            {analytics.rejectionRows.slice(0, 8).map((row) => (
              <div key={row.name} className="grid grid-cols-[minmax(0,1fr)_74px] items-center gap-3 text-sm">
                <span className="truncate text-slate-700">{row.name}</span>
                <span className="text-right font-medium text-slate-950">{formatNumber(row.value)}</span>
                <div className="col-span-2">
                  <PercentBar value={row.share} color="bg-rose-600" />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function BucketTable({ rows, kind }: { rows: Analytics["sourceRows"]; kind: "source" | "service" }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1280px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 [&>th]:whitespace-nowrap">
            <th className="py-3 pr-4">{kind === "source" ? "Channel" : "Service"}</th>
            <th className="py-3 pr-4 text-right">Leads</th>
            <th className="py-3 pr-4 text-right">Clients</th>
            <th className="py-3 pr-4 text-right">Full paid</th>
            <th className="py-3 pr-4 text-right">Share</th>
            <th className="py-3 pr-4 text-right">Relevant</th>
            <th className="py-3 pr-4 text-right">Qualified / Active</th>
            <th className="py-3 pr-4 text-right">Rejected</th>
            <th className="py-3 pr-4 text-right">Agr. sent</th>
            <th className="py-3 pr-4 text-right">Agr. signed</th>
            <th className="py-3 pr-4 text-right">Client rate</th>
            <th className="py-3 text-right">Full paid rate</th>
            <th className="py-3 pl-4 text-right">Spend</th>
            <th className="py-3 pl-4 text-right">CPL</th>
            <th className="py-3 pl-4 text-right">CAC</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-slate-100">
              <td className="max-w-[280px] py-3 pr-4 font-medium leading-snug text-slate-950">{row.name}</td>
              <td className="py-3 pr-4 text-right">{formatNumber(row.leads)}</td>
              <td className="py-3 pr-4 text-right font-medium text-slate-950">{formatNumber(row.clients)}</td>
              <td className="py-3 pr-4 text-right font-medium text-slate-950">{formatNumber(row.fullPaidClients)}</td>
              <td className="py-3 pr-4 text-right">{formatPercent(row.share)}</td>
              <td className="py-3 pr-4 text-right">{formatPercent(row.relevantStrictRate)}</td>
              <td className="py-3 pr-4 text-right">{formatPercent(row.qualifiedActiveRate)}</td>
              <td className="py-3 pr-4 text-right">{formatPercent(row.rejectionRate)}</td>
              <td className="py-3 pr-4 text-right">{formatPercent(row.agreementSentRate)}</td>
              <td className="py-3 pr-4 text-right">{formatPercent(row.agreementSignedRate)}</td>
              <td className="py-3 pr-4 text-right">{formatPercent(row.clientRate)}</td>
              <td className="py-3 text-right">{formatPercent(row.fullPaidClientRate)}</td>
              <td className="py-3 pl-4 text-right">{formatCurrency(row.marketingSpend)}</td>
              <td className="py-3 pl-4 text-right">{formatCurrency(row.cpl)}</td>
              <td className="py-3 pl-4 text-right">{formatCurrency(row.cac)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ServiceChannelTable({ rows }: { rows: Analytics["serviceChannelRows"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1260px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 [&>th]:whitespace-nowrap">
            <th className="py-3 pr-4">Service</th>
            <th className="py-3 pr-4">Channel</th>
            <th className="py-3 pr-4 text-right">Leads</th>
            <th className="py-3 pr-4 text-right">Clients</th>
            <th className="py-3 pr-4 text-right">Full paid</th>
            <th className="py-3 pr-4 text-right">Relevant</th>
            <th className="py-3 pr-4 text-right">Qualified</th>
            <th className="py-3 pr-4 text-right">Rejected</th>
            <th className="py-3 pr-4 text-right">Agr. sent</th>
            <th className="py-3 pr-4 text-right">Agr. signed</th>
            <th className="py-3 pr-4 text-right">Spend</th>
            <th className="py-3 pr-4 text-right">CPL</th>
            <th className="py-3 text-right">CAC</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.service}-${row.source}`} className="border-b border-slate-100">
              <td className="max-w-[260px] py-3 pr-4 font-medium leading-snug text-slate-950">{row.service}</td>
              <td className="max-w-[180px] py-3 pr-4 leading-snug text-slate-700">{row.source}</td>
              <td className="py-3 pr-4 text-right">{formatNumber(row.leads)}</td>
              <td className="py-3 pr-4 text-right font-medium text-slate-950">{formatNumber(row.clients)}</td>
              <td className="py-3 pr-4 text-right font-medium text-slate-950">{formatNumber(row.fullPaidClients)}</td>
              <td className="py-3 pr-4 text-right">{formatPercent(row.relevantStrictRate)}</td>
              <td className="py-3 pr-4 text-right">{formatPercent(row.qualifiedActiveRate)}</td>
              <td className="py-3 pr-4 text-right">{formatPercent(row.rejectionRate)}</td>
              <td className="py-3 pr-4 text-right">{formatPercent(row.agreementSentRate)}</td>
              <td className="py-3 pr-4 text-right">{formatPercent(row.agreementSignedRate)}</td>
              <td className="py-3 pr-4 text-right">
                <span title={row.attributionNote}>{formatCurrency(row.marketingSpend)}</span>
              </td>
              <td className="py-3 pr-4 text-right">{formatCurrency(row.cpl)}</td>
              <td className="py-3 text-right">{formatCurrency(row.cac)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Sources({ analytics }: { analytics: Analytics }) {
  return (
    <div className="space-y-5">
      <Panel title="Decision flags">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {analytics.decisionInsights.map((item) => (
            <div
              key={`${item.title}-${item.detail}`}
              className={clsx(
                "rounded-lg border p-4",
                item.tone === "green" && "border-emerald-200 bg-emerald-50",
                item.tone === "amber" && "border-amber-200 bg-amber-50",
                item.tone === "red" && "border-rose-200 bg-rose-50",
                item.tone === "blue" && "border-blue-200 bg-blue-50",
              )}
            >
              <div className="text-sm font-semibold text-slate-950">{item.title}</div>
              <div className="mt-2 text-sm leading-5 text-slate-700">{item.detail}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Attribution and CAC limitations">
        <div className="space-y-2 text-sm leading-6 text-slate-700">
          {analytics.attributionWarnings.map((warning) => (
            <div key={warning} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              {warning}
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Lead acquisition by channel">
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.sourceRows.slice(0, 8)} layout="vertical" margin={{ left: 12, right: 12 }}>
                <CartesianGrid stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar isAnimationActive={false} dataKey="leads" fill="#2563eb" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Lead acquisition by service">
          <div style={{ height: Math.max(340, analytics.serviceRows.length * 58) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.serviceRows} layout="vertical" margin={{ left: 12, right: 12 }}>
                <CartesianGrid stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis dataKey="name" type="category" width={230} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar isAnimationActive={false} dataKey="leads" fill="#16a34a" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Source report">
        <BucketTable rows={analytics.sourceRows} kind="source" />
      </Panel>

      <Panel title="Service-level performance">
        <BucketTable rows={analytics.servicePerformanceRows} kind="service" />
      </Panel>

      <Panel title="Channel performance by service">
        <ServiceChannelTable rows={analytics.serviceChannelRows} />
      </Panel>

      <Panel title="Marketing efficiency by channel">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {analytics.sourceRows
            .filter((row) => row.marketingSpend > 0)
            .slice(0, 8)
            .map((row) => (
              <div key={row.name} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="break-words text-sm font-semibold leading-snug text-slate-950">{row.name}</div>
                    <div className="mt-1 text-xs text-slate-500">Preliminary attribution</div>
                  </div>
                  <InfoHint text="Spend comes from the finance report by channel. CAC is preliminary because CRM source attribution can differ from original acquisition source." />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500">Leads</div>
                    <div className="font-semibold text-slate-950">{formatNumber(row.leads)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500">Clients</div>
                    <div className="font-semibold text-slate-950">{formatNumber(row.clients)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500">Spend</div>
                    <div className="font-semibold text-slate-950">{formatCurrency(row.marketingSpend)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500">CPL</div>
                    <div className="font-semibold text-slate-950">{formatCurrency(row.cpl)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500">CAC</div>
                    <div className="font-semibold text-slate-950">{formatCurrency(row.cac)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500">Full paid</div>
                    <div className="font-semibold text-slate-950">{formatNumber(row.fullPaidClients)}</div>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </Panel>

      <Panel title="Channel and service combinations">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {analytics.sourceServiceMatrix.map((row) => (
            <div key={`${row.source}-${row.service}`} className="rounded-lg border border-slate-200 p-4">
              <div className="truncate text-sm font-semibold text-slate-950">{row.source}</div>
              <div className="mt-1 truncate text-xs text-slate-500">{row.service}</div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <span className="text-2xl font-semibold text-slate-950">{formatNumber(row.leads)}</span>
                <span className="text-right text-sm font-medium text-amber-700">
                  {formatNumber(row.clients)} clients
                  <br />
                  {formatNumber(row.fullPaidClients)} full paid
                </span>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Conversion({ analytics }: { analytics: Analytics }) {
  const max = analytics.funnel[0]?.count || 1;
  const [selectedSource, setSelectedSource] = useState("");
  const sourceOptions = useMemo(() => analytics.sourceRows.map((row) => row.name), [analytics.sourceRows]);
  const activeSource = sourceOptions.includes(selectedSource) ? selectedSource : sourceOptions[0] || "";
  const activeSourceMonthly = analytics.sourceMonthlyConversion.filter((row) => row.source === activeSource);

  useEffect(() => {
    if (!sourceOptions.length) return;
    if (!selectedSource || !sourceOptions.includes(selectedSource)) {
      setSelectedSource(sourceOptions[0]);
    }
  }, [selectedSource, sourceOptions]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Leads" value={formatNumber(analytics.total)} sub={`${formatNumber(analytics.uniqueTotal)} unique in current filter`} help="All CRM rows after global date filter and optional unique-only mode." />
        <KpiCard label="Relevant strict" value={formatPercent(analytics.relevantStrictRate)} sub="Only Relevant = Relevant" help="Strict metric from CRM Relevant field only." tone="green" />
        <KpiCard label="Qualified / Active proxy" value={formatPercent(analytics.qualifiedActiveRate)} sub="Relevant plus active statuses" help="Hybrid proxy: Relevant field, active statuses, first contact/response." tone="blue" />
        <KpiCard label="Agreement sent" value={formatPercent(analytics.agreementSentRate)} sub="Date or status >= sent" help="Uses agreement_sent_at or pipeline statuses at/after retainer agreement sent." tone="blue" />
        <KpiCard label="Agreement signed" value={formatPercent(analytics.agreementSignedRate)} sub="Signed date or paid stage proxy" help="Uses agreement_signed_at or explicitly paid/signed pipeline statuses." tone="green" />
        <KpiCard label="First payment" value={formatPercent(analytics.clientRate)} sub="Client definition" help="Client = first payment reached, using payment date when present, otherwise payment status proxy." tone="amber" />
        <KpiCard label="Full payment" value={formatPercent(analytics.fullPaidClientRate)} sub="Full-paid client" help="Share of leads that reached full payment or completed status." tone="green" />
        <KpiCard label="Duplicates" value={formatPercent(analytics.duplicateRate)} sub="Duplicate flag from export" help="Share of rows marked duplicate_flag = true." tone="red" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="CPL" value={formatCurrency(analytics.finance.cpl)} sub="Marketing spend / leads" help="Average marketing spend needed to generate one CRM lead." />
        <KpiCard label="CPQL" value={formatCurrency(analytics.finance.cpql)} sub="Marketing spend / qualified-active leads" help="Average marketing spend per qualified or active-proxy lead." />
        <KpiCard label="CAC" value={formatCurrency(analytics.finance.cac)} sub="Marketing spend / clients" help="Average marketing spend per first-payment client." tone="amber" />
        <KpiCard label="Cost per signed contract" value={formatCurrency(analytics.finance.costPerSignedContract)} sub="Finance signed contracts" help="Marketing spend divided by signed contracts from the finance report." tone="green" />
        <KpiCard label="CPC" value="n/a" sub="No clicks column in finance report" help="CPC needs clicks. The current finance XLS contains costs, revenue, and contracts, but no clicks." />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Monthly conversion trend">
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={analytics.monthly}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis
                  yAxisId="left"
                  tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`}
                  tick={{ fontSize: 12 }}
                />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value, name) =>
                    String(name).includes("rate") ? formatPercent(numericValue(value)) : formatNumber(numericValue(value))
                  }
                />
                <Legend />
                <Bar isAnimationActive={false} yAxisId="right" dataKey="leads" fill="#cbd5e1" name="Leads" radius={[3, 3, 0, 0]} />
                <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey="relevantStrictRate" stroke="#0891b2" strokeWidth={2} name="Relevant strict rate" dot={false} />
                <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey="qualifiedActiveRate" stroke="#2563eb" strokeWidth={2} name="Qualified / Active rate" dot={false} />
                <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey="agreementSentRate" stroke="#7c3aed" strokeWidth={2} name="Agreement sent rate" dot={false} />
                <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey="agreementSignedRate" stroke="#be123c" strokeWidth={2} name="Agreement signed rate" dot={false} />
                <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey="clientRate" stroke="#f59e0b" strokeWidth={2} name="Client rate" dot={false} />
                <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey="fullPaidClientRate" stroke="#16a34a" strokeWidth={2} name="Full-paid rate" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="Monthly conversion by channel"
          action={
            <select
              value={activeSource}
              onChange={(event) => setSelectedSource(event.target.value)}
              className="max-w-52 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
            >
              {sourceOptions.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          }
        >
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={activeSourceMonthly}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis
                  yAxisId="left"
                  tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`}
                  tick={{ fontSize: 12 }}
                />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value, name) =>
                    String(name).includes("rate") ? formatPercent(numericValue(value)) : formatNumber(numericValue(value))
                  }
                />
                <Legend />
                <Bar isAnimationActive={false} yAxisId="right" dataKey="leads" fill="#cbd5e1" name="Leads" radius={[3, 3, 0, 0]} />
                <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey="relevantStrictRate" stroke="#0891b2" strokeWidth={2} name="Relevant strict rate" dot={false} />
                <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey="qualifiedActiveRate" stroke="#2563eb" strokeWidth={2} name="Qualified / Active rate" dot={false} />
                <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey="agreementSentRate" stroke="#7c3aed" strokeWidth={2} name="Agreement sent rate" dot={false} />
                <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey="agreementSignedRate" stroke="#be123c" strokeWidth={2} name="Agreement signed rate" dot={false} />
                <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey="clientRate" stroke="#f59e0b" strokeWidth={2} name="Client rate" dot={false} />
                <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey="fullPaidClientRate" stroke="#16a34a" strokeWidth={2} name="Full-paid rate" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Lead to client funnel">
        <div className="grid gap-3">
          {analytics.funnel.map((stage, index) => (
            <div key={stage.stage} className="grid gap-2 rounded-lg border border-slate-200 p-4 md:grid-cols-[160px_1fr_120px] md:items-center">
              <div>
                <div className="text-sm font-semibold text-slate-950">{stage.stage}</div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span>Step {index + 1}</span>
                  <InfoHint text={`${stage.stage}: ${formatNumber(stage.count)} leads, ${formatPercent(stage.rate)} of all leads in the current filter.`} />
                </div>
              </div>
              <div className="h-4 rounded-full bg-slate-100">
                <div
                  className="h-4 rounded-full bg-blue-600"
                  style={{ width: `${Math.max((stage.count / max) * 100, stage.count ? 1 : 0)}%` }}
                />
              </div>
              <div className="text-left md:text-right">
                <div className="font-semibold text-slate-950">{formatNumber(stage.count)}</div>
                <div className="text-xs text-slate-500">{formatPercent(stage.rate)}</div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Conversion by channel">
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={analytics.sourceRows.slice(0, 8)}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-25} textAnchor="end" height={82} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value, name) => (String(name).includes("rate") ? formatPercent(numericValue(value)) : formatNumber(numericValue(value)))} />
                <Bar isAnimationActive={false} yAxisId="left" dataKey="leads" fill="#2563eb" name="Leads" radius={[3, 3, 0, 0]} />
                <Line isAnimationActive={false} yAxisId="right" type="monotone" dataKey="relevantStrictRate" stroke="#0891b2" strokeWidth={2} name="Relevant strict rate" />
                <Line isAnimationActive={false} yAxisId="right" type="monotone" dataKey="qualifiedActiveRate" stroke="#2563eb" strokeWidth={2} name="Qualified / Active rate" />
                <Line isAnimationActive={false} yAxisId="right" type="monotone" dataKey="agreementSentRate" stroke="#7c3aed" strokeWidth={2} name="Agreement sent rate" />
                <Line isAnimationActive={false} yAxisId="right" type="monotone" dataKey="agreementSignedRate" stroke="#be123c" strokeWidth={2} name="Agreement signed rate" />
                <Line isAnimationActive={false} yAxisId="right" type="monotone" dataKey="clientRate" stroke="#f59e0b" strokeWidth={2} name="Client rate" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Conversion by service">
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={analytics.serviceRows.slice(0, 8)}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-25} textAnchor="end" height={82} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value, name) => (String(name).includes("rate") ? formatPercent(numericValue(value)) : formatNumber(numericValue(value)))} />
                <Bar isAnimationActive={false} yAxisId="left" dataKey="leads" fill="#16a34a" name="Leads" radius={[3, 3, 0, 0]} />
                <Line isAnimationActive={false} yAxisId="right" type="monotone" dataKey="relevantStrictRate" stroke="#0891b2" strokeWidth={2} name="Relevant strict rate" />
                <Line isAnimationActive={false} yAxisId="right" type="monotone" dataKey="qualifiedActiveRate" stroke="#2563eb" strokeWidth={2} name="Qualified / Active rate" />
                <Line isAnimationActive={false} yAxisId="right" type="monotone" dataKey="agreementSentRate" stroke="#7c3aed" strokeWidth={2} name="Agreement sent rate" />
                <Line isAnimationActive={false} yAxisId="right" type="monotone" dataKey="agreementSignedRate" stroke="#be123c" strokeWidth={2} name="Agreement signed rate" />
                <Line isAnimationActive={false} yAxisId="right" type="monotone" dataKey="clientRate" stroke="#f59e0b" strokeWidth={2} name="Client rate" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function heat(value: number) {
  const alpha = 0.08 + value * 0.72;
  return `rgba(22, 163, 74, ${alpha})`;
}

function Cohorts({ analytics }: { analytics: Analytics }) {
  return (
    <div className="space-y-5">
      <Note>
        M0-M5 use only real <strong>first_payment_at</strong> dates. Paid leads without a payment date are excluded from M0-M5 and shown separately as <strong>Paid date unknown</strong>.
      </Note>

      <Panel title="Monthly cohorts">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="py-3 pr-4">Cohort</th>
                <th className="py-3 pr-4 text-right">Leads</th>
                <th className="py-3 pr-4 text-right">Qualified / Active</th>
                <th className="py-3 pr-4 text-right">Paid</th>
                <th className="py-3 pr-4 text-right">Rejected</th>
                {["M0", "M1", "M2", "M3", "M4", "M5"].map((label) => (
                  <th key={label} className="py-3 pr-2 text-center">
                    {label}
                  </th>
                ))}
                <th className="py-3 text-right">Paid date unknown</th>
              </tr>
            </thead>
            <tbody>
              {analytics.cohorts.map((row) => (
                <tr key={row.cohort} className="border-b border-slate-100">
                  <td className="py-3 pr-4 font-medium text-slate-950">{row.label}</td>
                  <td className="py-3 pr-4 text-right">{formatNumber(row.leads)}</td>
                  <td className="py-3 pr-4 text-right">{formatPercent(row.qualifiedActiveRate)}</td>
                  <td className="py-3 pr-4 text-right">{formatPercent(row.clientRate)}</td>
                  <td className="py-3 pr-4 text-right">{formatPercent(row.rejectionRate)}</td>
                  {(["m0", "m1", "m2", "m3", "m4", "m5"] as const).map((key) => (
                    <td key={key} className="py-2 pr-2 text-center">
                      <span
                        className="inline-flex min-w-16 justify-center rounded-md px-2 py-1 font-medium text-slate-950"
                        style={{ backgroundColor: heat(row[key]) }}
                      >
                        {formatPercent(row[key])}
                      </span>
                    </td>
                  ))}
                  <td className="py-3 text-right">
                    <div className="font-medium text-slate-950">{formatPercent(row.paidDateUnknownRate)}</div>
                    <div className="text-xs text-slate-500">{formatNumber(row.paidDateUnknown)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Service cohort snapshot" help="Recent cohort rows split by normalized service. M0-M3 use real first_payment_at only; paid date unknown is kept separate.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="py-3 pr-4">Cohort</th>
                <th className="py-3 pr-4">Service</th>
                <th className="py-3 pr-4 text-right">Leads</th>
                <th className="py-3 pr-4 text-right">Current paid</th>
                <th className="py-3 pr-4 text-right">M0</th>
                <th className="py-3 pr-4 text-right">M1</th>
                <th className="py-3 pr-4 text-right">M2</th>
                <th className="py-3 pr-4 text-right">M3</th>
                <th className="py-3 text-right">Paid date unknown</th>
              </tr>
            </thead>
            <tbody>
              {analytics.serviceCohorts.map((row) => (
                <tr key={`${row.service}-${row.cohort}`} className="border-b border-slate-100">
                  <td className="py-3 pr-4 font-medium text-slate-950">{row.label}</td>
                  <td className="max-w-[260px] truncate py-3 pr-4 text-slate-700">{row.service}</td>
                  <td className="py-3 pr-4 text-right">{formatNumber(row.leads)}</td>
                  <td className="py-3 pr-4 text-right">{formatPercent(row.currentPaidRate)}</td>
                  <td className="py-3 pr-4 text-right">{formatPercent(row.m0)}</td>
                  <td className="py-3 pr-4 text-right">{formatPercent(row.m1)}</td>
                  <td className="py-3 pr-4 text-right">{formatPercent(row.m2)}</td>
                  <td className="py-3 pr-4 text-right">{formatPercent(row.m3)}</td>
                  <td className="py-3 text-right">{formatPercent(row.paidDateUnknownRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Cohort conversion trend">
        <div className="h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={[...analytics.cohorts].reverse()}>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => formatPercent(numericValue(value))} />
              <Legend />
              <Line isAnimationActive={false} type="monotone" dataKey="qualifiedActiveRate" stroke="#2563eb" strokeWidth={2} name="Qualified / Active" />
              <Line isAnimationActive={false} type="monotone" dataKey="clientRate" stroke="#f59e0b" strokeWidth={2} name="Current paid rate" />
              <Line isAnimationActive={false} type="monotone" dataKey="m5" stroke="#16a34a" strokeWidth={2} name="M5 paid with date" />
              <Line isAnimationActive={false} type="monotone" dataKey="rejectionRate" stroke="#dc2626" strokeWidth={2} name="Rejected" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}

function Quality({ analytics }: { analytics: Analytics }) {
  const fieldGroups: Array<Analytics["fieldCoverage"][number]["group"]> = [
    "Used directly in analytics",
    "Still using status proxy",
    "Critical analytics fields",
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Field implementation" value={formatPercent(analytics.fieldImplementationRate)} sub="Fields with any usable values" help="Share of tracked analytics fields that have at least one filled value in the current dataset." />
        <KpiCard label="Duplicate rate" value={formatPercent(analytics.duplicateRate)} sub="Flagged rows" help="Share of CRM rows marked duplicate_flag = true." tone="red" />
        <KpiCard label="Full payment coverage" value={formatPercent(analytics.fullPaidClientRate)} sub="Full payment or completed" help="Share of leads that reached full payment or completed status." tone="green" />
      </div>

      <Panel title="Field completeness">
        <div className="space-y-6">
          {fieldGroups.map((group) => (
            <section key={group}>
              <h3 className="mb-3 text-sm font-semibold text-slate-700">{group}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {analytics.fieldCoverage
                  .filter((field) => field.group === group)
                  .map((field) => (
                    <div key={`${field.group}-${field.field}`} className="grid grid-cols-[minmax(0,1fr)_92px] items-center gap-3 rounded-lg border border-slate-200 p-4">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="truncate text-sm font-semibold text-slate-950">{field.field}</div>
                          <InfoHint text={`${field.field}: ${formatPercent(field.rate)} of rows are filled. Higher fill rate means less reliance on status proxies or manual interpretation.`} />
                        </div>
                        <div className="mt-2">
                          <PercentBar value={field.rate} color={field.rate < 0.1 ? "bg-rose-600" : field.rate < 0.6 ? "bg-amber-500" : "bg-emerald-600"} />
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-slate-950">{formatPercent(field.rate)}</div>
                        <div className="text-xs text-slate-500">{formatNumber(field.filled)}</div>
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function ReportPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="export-page">
      <div className="export-page-title">{title}</div>
      <div className="export-page-content">{children}</div>
    </section>
  );
}

export default function Home() {
  const [records, setRecords] = useState<CRMRecord[]>([]);
  const [financeData, setFinanceData] = useState<FinanceData | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [fileName, setFileName] = useState("Works with clients sample");
  const [financeFileName, setFinanceFileName] = useState("Marketing-Finance sample");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [uniqueOnly, setUniqueOnly] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMode, setExportMode] = useState<"none" | "current" | "all">("none");
  const inputRef = useRef<HTMLInputElement>(null);
  const financeInputRef = useRef<HTMLInputElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    async function loadSample() {
      try {
        const savedCrm = await loadReportFile("crm").catch(() => null);
        const savedFinance = await loadReportFile("finance").catch(() => null);
        let crmBuffer: ArrayBuffer;
        if (savedCrm?.buffer) {
          crmBuffer = savedCrm.buffer;
        } else {
          crmBuffer = await fetch("/sample-crm-export.xlsx").then((response) => {
            if (!response.ok) throw new Error("Sample CRM XLSX was not found");
            return response.arrayBuffer();
          });
        }
        const parsed = await parseWorkbook(crmBuffer);
        const financeBuffer: ArrayBuffer | null = savedFinance?.buffer
          ? savedFinance.buffer
          : await fetch("/sample-finance-report.xlsx").then((response) => (
            response.ok ? response.arrayBuffer() : null
          ));
        const parsedFinance = financeBuffer ? await parseFinanceWorkbook(financeBuffer) : null;
        if (mounted) {
          setRecords(parsed);
          setFinanceData(parsedFinance);
          if (savedCrm) setFileName(savedCrm.name);
          if (savedFinance) setFinanceFileName(savedFinance.name);
          setDateRange(getDateBounds(parsed));
        }
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Could not load sample data");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadSample();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredRecords = useMemo(() => {
    const fromDate = dateFromInput(dateRange.from);
    const toDate = dateFromInput(dateRange.to, true);

    return records.filter((record) => {
      if (!fromDate && !toDate) return true;
      if (!record.createdAt) return false;
      if (fromDate && record.createdAt < fromDate) return false;
      if (toDate && record.createdAt > toDate) return false;
      if (uniqueOnly && record.duplicateFlag.toLowerCase() === "true") return false;
      return true;
    });
  }, [dateRange.from, dateRange.to, records, uniqueOnly]);

  const filteredFinance = useMemo(
    () => filterFinanceData(financeData, dateRange.from, dateRange.to),
    [dateRange.from, dateRange.to, financeData],
  );

  const analytics = useMemo(() => buildAnalytics(filteredRecords, filteredFinance), [filteredFinance, filteredRecords]);
  const activeTab = tabs.find((item) => item.id === tab) ?? tabs[0];

  async function handleFile(file: File) {
    setError("");
    setIsLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parseWorkbook(buffer);
      setRecords(parsed);
      setDateRange(getDateBounds(parsed));
      setFileName(file.name);
      await saveReportFile("crm", file.name, buffer.slice(0));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not parse the selected XLSX file");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleFinanceFile(file: File) {
    setError("");
    setIsLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parseFinanceWorkbook(buffer);
      setFinanceData(parsed);
      setFinanceFileName(file.name);
      await saveReportFile("finance", file.name, buffer.slice(0));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not parse the selected finance XLSX file");
    } finally {
      setIsLoading(false);
    }
  }

  async function exportPdf(mode: "current" | "all") {
    if (isExporting) return;
    setIsExporting(true);
    setError("");
    const bounds = getDateBounds(records);
    const from = reportFileDate(dateRange.from, bounds.from || "start");
    const to = reportFileDate(dateRange.to, bounds.to || "end");
    const scope = mode === "all" ? "full-report" : activeTab.label;
    const filename = `dc-crm-analytics-${fileSlug(scope)}_${from}_to_${to}`;

    try {
      setExportMode(mode);
      document.body.classList.add("pdf-export");
      await nextFrame();
      await document.fonts?.ready;
      await wait(1200);

      const [{ toPng }, { default: jsPDF }] = await Promise.all([
        import("html-to-image"),
        import("jspdf"),
      ]);

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = pageHeight - margin * 2;
      let firstPage = true;

      const root = exportRef.current;
      if (!root) throw new Error("Report content is not ready for export");
      const pages = Array.from(root.querySelectorAll<HTMLElement>(".export-page"));

      for (const page of pages) {
        if (!firstPage) pdf.addPage();
        firstPage = false;
        const title = page.querySelector<HTMLElement>(".export-page-title")?.innerText.trim();
        let cursorY = margin;
        if (title) {
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(14);
          pdf.setTextColor(15, 23, 42);
          pdf.text(title, margin, cursorY + 5);
          cursorY += 12;
        }

        const content = page.querySelector<HTMLElement>(".export-page-content");
        const contentRoot = content?.firstElementChild instanceof HTMLElement ? content.firstElementChild : content;
        const blocks = Array.from(contentRoot?.children ?? []).filter((child): child is HTMLElement => child instanceof HTMLElement);
        let blocksOnCurrentPdfPage = 0;

        for (const block of blocks) {
          const dataUrl = await toPng(block, {
            backgroundColor: "#f7f8fa",
            cacheBust: true,
            pixelRatio: 2,
            width: block.scrollWidth,
            height: block.scrollHeight,
            style: {
              transform: "none",
              transformOrigin: "top left",
            },
            filter: (node) => !(node instanceof HTMLElement && node.classList.contains("pdf-ignore")),
          });
          const image = new Image();
          image.src = dataUrl;
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("Could not render PDF image"));
          });

          const imageHeight = (image.height * contentWidth) / image.width;
          const remainingHeight = pageHeight - margin - cursorY;
          const shouldMoveWholeBlock = imageHeight <= contentHeight && imageHeight > remainingHeight;
          if (shouldMoveWholeBlock && blocksOnCurrentPdfPage > 0) {
            pdf.addPage();
            cursorY = margin;
            blocksOnCurrentPdfPage = 0;
          }

          if (imageHeight <= contentHeight) {
            pdf.addImage(dataUrl, "PNG", margin, cursorY, contentWidth, imageHeight);
            cursorY += imageHeight + 5;
            blocksOnCurrentPdfPage += 1;
            continue;
          }

          const canvas = document.createElement("canvas");
          const scale = image.width / contentWidth;
          canvas.width = image.width;
          canvas.height = Math.floor(contentHeight * scale);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Could not prepare PDF canvas");

          let sourceY = 0;
          while (sourceY < image.height) {
            if (cursorY > margin && blocksOnCurrentPdfPage > 0) {
              pdf.addPage();
              cursorY = margin;
              blocksOnCurrentPdfPage = 0;
            }
            const availableHeight = pageHeight - margin - cursorY;
            const sliceHeightPx = Math.max(1, Math.floor(availableHeight * scale));
            const currentSliceHeight = Math.min(sliceHeightPx, image.height - sourceY);
            if (canvas.height !== currentSliceHeight) canvas.height = currentSliceHeight;
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, sourceY, image.width, currentSliceHeight, 0, 0, image.width, currentSliceHeight);
            const sliceUrl = canvas.toDataURL("image/png");
            const sliceHeightMm = currentSliceHeight / scale;
            pdf.addImage(sliceUrl, "PNG", margin, cursorY, contentWidth, sliceHeightMm);
            blocksOnCurrentPdfPage += 1;
            sourceY += currentSliceHeight;
            if (sourceY < image.height) {
              pdf.addPage();
              cursorY = margin;
              blocksOnCurrentPdfPage = 0;
            } else {
              cursorY += sliceHeightMm + 5;
            }
          }
        }
      }

      pdf.save(`${filename}.pdf`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Could not export PDF");
    } finally {
      document.body.classList.remove("pdf-export");
      setExportMode("none");
      setIsExporting(false);
    }
  }

  if (!records.length && isLoading) return <EmptyState />;

  return (
    <main className={clsx("min-h-screen bg-[#f7f8fa]", isExporting && "pdf-export")}>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <div className="flex items-center gap-3 text-sm font-semibold text-blue-700">
              <FileSpreadsheet className="h-5 w-5" />
              DC CRM Analytics
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-950 sm:text-3xl">CRM reports dashboard</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                {analytics.dateRange}
              </span>
              <span>{formatNumber(analytics.total)} rows</span>
              <span>{uniqueOnly ? "Unique leads only" : "All leads"}</span>
              <span className="max-w-full truncate">Dataset: {fileName}</span>
              <span className="max-w-full truncate">Finance: {financeFileName}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                From
                <input
                  type="date"
                  value={dateRange.from}
                  min={getDateBounds(records).from}
                  max={dateRange.to || getDateBounds(records).to}
                  onChange={(event) => setDateRange((current) => ({ ...current, from: event.target.value }))}
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm"
                  title="Global date filter uses Дата створення / lead creation date"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                To
                <input
                  type="date"
                  value={dateRange.to}
                  min={dateRange.from || getDateBounds(records).from}
                  max={getDateBounds(records).to}
                  onChange={(event) => setDateRange((current) => ({ ...current, to: event.target.value }))}
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm"
                  title="Global date filter uses Дата створення / lead creation date"
                />
              </label>
              <button
                type="button"
                onClick={() => setDateRange(getDateBounds(records))}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Reset dates
              </button>
              <button
                type="button"
                onClick={() => setUniqueOnly((current) => !current)}
                className={clsx(
                  "inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition",
                  uniqueOnly
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                )}
                title="Unique leads only excludes duplicate_flag = true rows"
              >
                {uniqueOnly ? "Unique leads only" : "All leads"}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.currentTarget.value = "";
              }}
            />
            <input
              ref={financeInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFinanceFile(file);
                event.currentTarget.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              <Upload className="h-4 w-4" />
              Upload CRM XLS
            </button>
            <button
              type="button"
              onClick={() => financeInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600"
            >
              <Upload className="h-4 w-4" />
              Upload finance report XLS
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              title="Reload sample"
            >
              <RefreshCw className="h-4 w-4" />
              Sample
            </button>
            <button
              type="button"
              onClick={() => void exportPdf("all")}
              disabled={isExporting}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              title="Export all report tabs into one PDF file"
            >
              <Download className="h-4 w-4" />
              {isExporting ? "Exporting..." : "Export PDF"}
            </button>
            </div>
          </div>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={clsx(
                  "inline-flex min-h-12 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition",
                  tab === item.id
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {error ? (
        <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 lg:px-8">
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 lg:px-8">
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">Updating analytics...</div>
        </div>
      ) : null}

      <section className="screen-report mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="pdf-ignore mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => void exportPdf("current")}
            disabled={isExporting}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            title="Export only the current report page into PDF"
          >
            <Download className="h-4 w-4" />
            {isExporting ? "Exporting..." : "Export this page to PDF"}
          </button>
        </div>
        {tab === "overview" ? <Overview analytics={analytics} /> : null}
        {tab === "sources" ? <Sources analytics={analytics} /> : null}
        {tab === "conversion" ? <Conversion analytics={analytics} /> : null}
        {tab === "cohorts" ? <Cohorts analytics={analytics} /> : null}
        {tab === "quality" ? <Quality analytics={analytics} /> : null}
      </section>

      {exportMode !== "none" ? (
        <div ref={exportRef} className="export-report">
          {exportMode === "all" || tab === "overview" ? (
            <ReportPage title="Overview">
              <Overview analytics={analytics} />
            </ReportPage>
          ) : null}
          {exportMode === "all" || tab === "sources" ? (
            <ReportPage title="Channels & services">
              <Sources analytics={analytics} />
            </ReportPage>
          ) : null}
          {exportMode === "all" || tab === "conversion" ? (
            <ReportPage title="Conversion">
              <Conversion analytics={analytics} />
            </ReportPage>
          ) : null}
          {exportMode === "all" || tab === "cohorts" ? (
            <ReportPage title="Cohorts">
              <Cohorts analytics={analytics} />
            </ReportPage>
          ) : null}
          {exportMode === "all" || tab === "quality" ? (
            <ReportPage title="Quality">
              <Quality analytics={analytics} />
            </ReportPage>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
