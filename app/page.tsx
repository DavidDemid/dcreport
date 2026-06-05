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
  LogOut,
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
import {
  Analytics,
  buildAnalytics,
  formatCurrency,
  formatNumber,
  formatPercent,
  hasAgreementSigned,
  isQualifiedActive,
} from "@/lib/analytics";
import { cleanLeadRecords, CRMRecord, LeadCleanupResult, monthKey, parseWorkbook } from "@/lib/crm";
import { FinanceChannelCostRecord, FinanceData, parseFinanceWorkbook } from "@/lib/finance";

type Tab = "overview" | "sources" | "conversion" | "cohorts" | "financial" | "quality";

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#be123c", "#475569"];

const tabs: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "sources", label: "Channels & services", icon: Filter },
  { id: "conversion", label: "Conversion", icon: Activity },
  { id: "cohorts", label: "Cohorts", icon: Layers3 },
  { id: "financial", label: "Financial funnel", icon: FileSpreadsheet },
  { id: "quality", label: "Quality", icon: CheckCircle2 },
];

const DB_NAME = "dc-crm-analytics";
const DB_VERSION = 1;
const FILE_STORE = "files";
const CRM_FILE_KEY = "crm-v3";
const FINANCE_FILE_KEY = "finance-april-2026";

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
  "Service cohorts": "Separate cohort tables by normalized product/service. Each service shows latest 10 monthly cohorts and payment timing.",
  "Cohort conversion trend": "Compares cohort quality: active-qualified rate, current paid proxy, paid with date by M5, and rejected rate.",
  "Financial monthly table": "Compares selected month actuals against plan, previous month, and 3-month averages from the finance workbook.",
  "Financial funnel": "Shows the monthly funnel from clicks to leads, signed contracts, sales, revenue, and profit after marketing.",
  "Lead chart": "Compares raw CRM-created records, clean CRM leads after cleanup, and finance-file lead totals by month.",
  "Money chart": "Separates large money metrics from lead counts: sales value, revenue, marketing cost, and profit after marketing.",
  "Contracts chart": "Tracks signed contracts and the available split by Lithuania, Latvia, and RBI/residence contracts from the finance file.",
  "Country-level financial performance": "Country and service rows for the selected month, using CRM leads and estimated marketing cost by lead share.",
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

function allocateFinanceToRecords(finance: FinanceData | undefined, baseRecords: CRMRecord[], selectedRecords: CRMRecord[]): FinanceData | undefined {
  if (!finance) return undefined;
  if (baseRecords.length === selectedRecords.length) return finance;

  const countBySourceMonth = (records: CRMRecord[]) => {
    const map = new Map<string, number>();
    for (const record of records) {
      const month = monthKey(record.createdAt);
      if (month === "Unknown") continue;
      const key = `${record.source}|||${month}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  };

  const baseBySourceMonth = countBySourceMonth(baseRecords);
  const selectedBySourceMonth = countBySourceMonth(selectedRecords);
  const channelCosts: FinanceChannelCostRecord[] = finance.channelCosts
    .map((record) => {
      const key = `${record.source}|||${record.month}`;
      const baseCount = baseBySourceMonth.get(key) ?? 0;
      const selectedCount = selectedBySourceMonth.get(key) ?? 0;
      return {
        ...record,
        amount: baseCount ? record.amount * (selectedCount / baseCount) : 0,
      };
    })
    .filter((record) => record.amount > 0);

  const allocatedCostByMonth = new Map<string, number>();
  for (const cost of channelCosts) {
    allocatedCostByMonth.set(cost.month, (allocatedCostByMonth.get(cost.month) ?? 0) + cost.amount);
  }

  const baseByMonth = new Map<string, number>();
  const selectedByMonth = new Map<string, number>();
  for (const record of baseRecords) {
    const month = monthKey(record.createdAt);
    if (month !== "Unknown") baseByMonth.set(month, (baseByMonth.get(month) ?? 0) + 1);
  }
  for (const record of selectedRecords) {
    const month = monthKey(record.createdAt);
    if (month !== "Unknown") selectedByMonth.set(month, (selectedByMonth.get(month) ?? 0) + 1);
  }

  return {
    channelCosts,
    monthly: finance.monthly.map((record) => {
      const baseCount = baseByMonth.get(record.month) ?? 0;
      const selectedCount = selectedByMonth.get(record.month) ?? 0;
      const share = baseCount ? selectedCount / baseCount : 0;
      return {
        ...record,
        revenue: record.revenue * share,
        marketingCost: allocatedCostByMonth.get(record.month) ?? record.marketingCost * share,
        profitAfterMarketing: record.profitAfterMarketing * share,
        signedContracts: record.signedContracts * share,
        clicks: (record.clicks ?? 0) * share,
        leads: (record.leads ?? 0) * share,
        paidTrafficCost: (record.paidTrafficCost ?? 0) * share,
        sales: (record.sales ?? 0) * share,
        ltContracts: (record.ltContracts ?? 0) * share,
        lvContracts: (record.lvContracts ?? 0) * share,
        rbiContracts: (record.rbiContracts ?? 0) * share,
      };
    }),
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

async function saveReportFile(key: string, name: string, buffer: ArrayBuffer) {
  const db = await openReportsDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, "readwrite");
    tx.objectStore(FILE_STORE).put({ name, buffer, savedAt: Date.now() }, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadReportFile(key: string): Promise<{ name: string; buffer: ArrayBuffer } | null> {
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
  exportSplit = false,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  help?: string;
  exportSplit?: boolean;
}) {
  const helpText = help ?? panelHelp[title];

  return (
    <section className={clsx("rounded-lg border border-slate-200 bg-white p-5 shadow-sm", exportSplit && "pdf-split-ok")}>
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

function ServiceFilter({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (services: string[]) => void;
}) {
  const allSelected = !selected.length || selected.length === options.length;
  const label = allSelected
    ? "All services"
    : selected.length === 1
      ? selected[0]
      : `${selected.length} services`;

  function toggle(service: string) {
    const current = allSelected ? options : selected;
    const next = current.includes(service)
      ? current.filter((item) => item !== service)
      : [...current, service];
    onChange(next.length === options.length ? [] : next);
  }

  return (
    <details className="relative">
      <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">
        <Filter className="h-4 w-4" />
        <span className="max-w-48 truncate">{label}</span>
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
        <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <button
            type="button"
            onClick={() => onChange([])}
            className="rounded-md px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
          >
            All
          </button>
          <span className="text-xs text-slate-500">{options.length} available</span>
        </div>
        <div className="grid max-h-72 gap-1 overflow-y-auto">
          {options.map((service) => (
            <label key={service} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={allSelected || selected.includes(service)}
                onChange={() => toggle(service)}
                className="mt-0.5"
              />
              <span className="leading-snug">{service}</span>
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}

type ReportScope = {
  rawTotal: number;
  rawDateTotal: number;
  cleanTotal: number;
  dateAndQualityTotal: number;
  visibleTotal: number;
  hasActiveFilters: boolean;
  filterDescription: string;
};

function FilterSummary({ scope, onReset }: { scope: ReportScope; onReset?: () => void }) {
  if (!scope.hasActiveFilters) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold">Filtered view is active</div>
          <div className="mt-1 text-amber-800">
            Showing {formatNumber(scope.visibleTotal)} rows in the current report view. Selected period has {formatNumber(scope.rawDateTotal)} CRM-created records and {formatNumber(scope.cleanTotal)} clean leads from {formatNumber(scope.rawTotal)} rows in the full CRM file. {scope.filterDescription}
          </div>
        </div>
        {onReset ? (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
          >
            Reset all filters
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Overview({ analytics, scope, onResetFilters }: { analytics: Analytics; scope: ReportScope; onResetFilters?: () => void }) {
  return (
    <div className="space-y-5">
      <FilterSummary scope={scope} onReset={onResetFilters} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total leads"
          value={formatNumber(analytics.total)}
          sub={`${analytics.dateRange} · ${formatNumber(analytics.uniqueTotal)} unique · ${formatNumber(scope.rawTotal)} rows in CRM file`}
          help="Leads in the current report view after date, unique, and service filters. The full CRM file total is shown in the subtitle."
        />
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
    <div className="overflow-hidden">
      <table className="w-full table-fixed text-xs lg:text-sm">
        <colgroup>
          <col className="w-[15%]" />
          {Array.from({ length: 14 }).map((_, index) => (
            <col key={index} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase leading-tight text-slate-500">
            <th className="px-1.5 py-3">{kind === "source" ? "Channel" : "Service"}</th>
            <th className="px-1.5 py-3 text-right">Leads</th>
            <th className="px-1.5 py-3 text-right">Clients</th>
            <th className="px-1.5 py-3 text-right">Full paid</th>
            <th className="px-1.5 py-3 text-right">Share</th>
            <th className="px-1.5 py-3 text-right">Relevant</th>
            <th className="px-1.5 py-3 text-right">Qualified / Active</th>
            <th className="px-1.5 py-3 text-right">Rejected</th>
            <th className="px-1.5 py-3 text-right">Agr. sent</th>
            <th className="px-1.5 py-3 text-right">Agr. signed</th>
            <th className="px-1.5 py-3 text-right">Client rate</th>
            <th className="px-1.5 py-3 text-right">Full paid rate</th>
            <th className="px-1.5 py-3 text-right">Spend</th>
            <th className="px-1.5 py-3 text-right">CPL</th>
            <th className="px-1.5 py-3 text-right">CAC</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-slate-100">
              <td className="break-words px-1.5 py-3 font-medium leading-snug text-slate-950">{row.name}</td>
              <td className="px-1.5 py-3 text-right">{formatNumber(row.leads)}</td>
              <td className="px-1.5 py-3 text-right font-medium text-slate-950">{formatNumber(row.clients)}</td>
              <td className="px-1.5 py-3 text-right font-medium text-slate-950">{formatNumber(row.fullPaidClients)}</td>
              <td className="px-1.5 py-3 text-right">{formatPercent(row.share)}</td>
              <td className="px-1.5 py-3 text-right">{formatPercent(row.relevantStrictRate)}</td>
              <td className="px-1.5 py-3 text-right">{formatPercent(row.qualifiedActiveRate)}</td>
              <td className="px-1.5 py-3 text-right">{formatPercent(row.rejectionRate)}</td>
              <td className="px-1.5 py-3 text-right">{formatPercent(row.agreementSentRate)}</td>
              <td className="px-1.5 py-3 text-right">{formatPercent(row.agreementSignedRate)}</td>
              <td className="px-1.5 py-3 text-right">{formatPercent(row.clientRate)}</td>
              <td className="px-1.5 py-3 text-right">{formatPercent(row.fullPaidClientRate)}</td>
              <td className="px-1.5 py-3 text-right">{formatCurrency(row.marketingSpend)}</td>
              <td className="px-1.5 py-3 text-right">{formatCurrency(row.cpl)}</td>
              <td className="px-1.5 py-3 text-right">{formatCurrency(row.cac)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ServiceChannelTable({ rows, showService = true }: { rows: Analytics["serviceChannelRows"]; showService?: boolean }) {
  return (
    <div className="overflow-hidden">
      <table className="w-full table-fixed text-xs lg:text-sm">
        <colgroup>
          {showService ? <col className="w-[15%]" /> : null}
          <col className={showService ? "w-[12%]" : "w-[15%]"} />
          {Array.from({ length: 11 }).map((_, index) => (
            <col key={index} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase leading-tight text-slate-500">
            {showService ? <th className="px-1.5 py-3">Service</th> : null}
            <th className="px-1.5 py-3">Channel</th>
            <th className="px-1.5 py-3 text-right">Leads</th>
            <th className="px-1.5 py-3 text-right">Clients</th>
            <th className="px-1.5 py-3 text-right">Full paid</th>
            <th className="px-1.5 py-3 text-right">Relevant</th>
            <th className="px-1.5 py-3 text-right">Qualified</th>
            <th className="px-1.5 py-3 text-right">Rejected</th>
            <th className="px-1.5 py-3 text-right">Agr. sent</th>
            <th className="px-1.5 py-3 text-right">Agr. signed</th>
            <th className="px-1.5 py-3 text-right">Spend</th>
            <th className="px-1.5 py-3 text-right">CPL</th>
            <th className="px-1.5 py-3 text-right">CAC</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.service}-${row.source}`} className="border-b border-slate-100">
              {showService ? <td className="break-words px-1.5 py-3 font-medium leading-snug text-slate-950">{row.service}</td> : null}
              <td className="break-words px-1.5 py-3 leading-snug text-slate-700">{row.source}</td>
              <td className="px-1.5 py-3 text-right">{formatNumber(row.leads)}</td>
              <td className="px-1.5 py-3 text-right font-medium text-slate-950">{formatNumber(row.clients)}</td>
              <td className="px-1.5 py-3 text-right font-medium text-slate-950">{formatNumber(row.fullPaidClients)}</td>
              <td className="px-1.5 py-3 text-right">{formatPercent(row.relevantStrictRate)}</td>
              <td className="px-1.5 py-3 text-right">{formatPercent(row.qualifiedActiveRate)}</td>
              <td className="px-1.5 py-3 text-right">{formatPercent(row.rejectionRate)}</td>
              <td className="px-1.5 py-3 text-right">{formatPercent(row.agreementSentRate)}</td>
              <td className="px-1.5 py-3 text-right">{formatPercent(row.agreementSignedRate)}</td>
              <td className="px-1.5 py-3 text-right">
                <span title={row.attributionNote}>{formatCurrency(row.marketingSpend)}</span>
              </td>
              <td className="px-1.5 py-3 text-right">{formatCurrency(row.cpl)}</td>
              <td className="px-1.5 py-3 text-right">{formatCurrency(row.cac)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Sources({ analytics, scope, onResetFilters }: { analytics: Analytics; scope: ReportScope; onResetFilters?: () => void }) {
  const serviceChannelGroups = useMemo(() => {
    const grouped = new Map<string, Analytics["serviceChannelRows"]>();
    for (const row of analytics.serviceChannelRows) {
      grouped.set(row.service, [...(grouped.get(row.service) ?? []), row]);
    }
    return [...grouped.entries()]
      .map(([service, rows]) => ({
        service,
        rows: rows.sort((a, b) => b.leads - a.leads),
        leads: rows.reduce((sum, row) => sum + row.leads, 0),
        clients: rows.reduce((sum, row) => sum + row.clients, 0),
        fullPaidClients: rows.reduce((sum, row) => sum + row.fullPaidClients, 0),
        spend: rows.reduce((sum, row) => sum + row.marketingSpend, 0),
      }))
      .sort((a, b) => b.leads - a.leads);
  }, [analytics.serviceChannelRows]);

  return (
    <div className="space-y-5">
      <FilterSummary scope={scope} onReset={onResetFilters} />

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Lead acquisition by channel">
          <div style={{ height: Math.max(340, analytics.sourceRows.length * 50) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.sourceRows} layout="vertical" margin={{ left: 12, right: 12 }}>
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

      {serviceChannelGroups.map((group) => (
        <Panel
          key={group.service}
          title={`Channel performance: ${group.service}`}
          help="Channel metrics inside this service only. Spend is allocated from finance channel spend by lead share in the selected service filter."
        >
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-medium text-slate-500">Leads</div>
              <div className="mt-1 text-lg font-semibold text-slate-950">{formatNumber(group.leads)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-medium text-slate-500">Clients</div>
              <div className="mt-1 text-lg font-semibold text-slate-950">{formatNumber(group.clients)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-medium text-slate-500">Full paid</div>
              <div className="mt-1 text-lg font-semibold text-slate-950">{formatNumber(group.fullPaidClients)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-medium text-slate-500">Allocated spend</div>
              <div className="mt-1 text-lg font-semibold text-slate-950">{formatCurrency(group.spend)}</div>
            </div>
          </div>
          <ServiceChannelTable rows={group.rows} showService={false} />
        </Panel>
      ))}

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
              <div className="break-words text-sm font-semibold leading-snug text-slate-950">{row.source}</div>
              <div className="mt-1 break-words text-xs leading-snug text-slate-500">{row.service}</div>
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
        <KpiCard label="Duplicates" value={formatPercent(analytics.duplicateRate)} sub="Repeated identity rows" help="Rows marked duplicate_flag or repeated by email, Google Client ID, counterparty, or title." tone="red" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="CPL" value={formatCurrency(analytics.finance.cpl)} sub="Marketing spend / leads" help="Average marketing spend needed to generate one CRM lead." />
        <KpiCard label="CPQL" value={formatCurrency(analytics.finance.cpql)} sub="Marketing spend / qualified-active leads" help="Average marketing spend per qualified or active-proxy lead." />
        <KpiCard label="CAC" value={formatCurrency(analytics.finance.cac)} sub="Marketing spend / clients" help="Average marketing spend per first-payment client." tone="amber" />
        <KpiCard label="Cost per signed contract" value={formatCurrency(analytics.finance.costPerSignedContract)} sub="Finance signed contracts" help="Marketing spend divided by signed contracts from the finance report." tone="green" />
        <KpiCard
          label="CRM signed value"
          value={analytics.crmSignedSalesValue ? formatCurrency(analytics.crmSignedSalesValue) : "n/a"}
          sub={analytics.crmSignedSalesValue ? `${formatPercent(analytics.crmSignedSalesCoverage)} signed rows covered` : "deal_value_actual is empty"}
          help="Potential CRM Sales: sum of deal_value_actual for rows that reached agreement signed. Current export does not fill this field, so finance Sales remains the reliable signed-contract value."
          tone={analytics.crmSignedSalesValue ? "green" : "amber"}
        />
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
          <div style={{ height: Math.max(360, analytics.sourceRows.length * 54) }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={analytics.sourceRows}>
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
          <div style={{ height: Math.max(360, analytics.serviceRows.length * 58) }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={analytics.serviceRows}>
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
  const serviceCohortGroups = useMemo(() => {
    const groups = new Map<string, Analytics["serviceCohorts"]>();
    for (const row of analytics.serviceCohorts) {
      groups.set(row.service, [...(groups.get(row.service) ?? []), row]);
    }
    return [...groups.entries()]
      .map(([service, rows]) => ({
        service,
        rows: rows.sort((a, b) => b.cohort.localeCompare(a.cohort)).slice(0, 10),
        totalLeads: rows.reduce((sum, row) => sum + row.leads, 0),
      }))
      .sort((a, b) => b.totalLeads - a.totalLeads);
  }, [analytics.serviceCohorts]);

  return (
    <div className="space-y-5">
      <Note>
        M0-M5 use only real <strong>first_payment_at</strong> dates. Paid leads without a payment date are excluded from M0-M5 and shown separately as <strong>Paid date unknown</strong>.
      </Note>

      <Panel title="Monthly cohorts">
        <div className="overflow-hidden">
          <table className="w-full table-fixed text-xs lg:text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase leading-tight text-slate-500">
                <th className="px-1.5 py-3">Cohort</th>
                <th className="px-1.5 py-3 text-right">Leads</th>
                <th className="px-1.5 py-3 text-right">Qualified / Active</th>
                <th className="px-1.5 py-3 text-right">Paid</th>
                <th className="px-1.5 py-3 text-right">Rejected</th>
                {["M0", "M1", "M2", "M3", "M4", "M5"].map((label) => (
                  <th key={label} className="px-1.5 py-3 text-center">
                    {label}
                  </th>
                ))}
                <th className="px-1.5 py-3 text-right">Paid date unknown</th>
              </tr>
            </thead>
            <tbody>
              {analytics.cohorts.map((row) => (
                <tr key={row.cohort} className="border-b border-slate-100">
                  <td className="px-1.5 py-3 font-medium text-slate-950">{row.label}</td>
                  <td className="px-1.5 py-3 text-right">{formatNumber(row.leads)}</td>
                  <td className="px-1.5 py-3 text-right">{formatPercent(row.qualifiedActiveRate)}</td>
                  <td className="px-1.5 py-3 text-right">{formatPercent(row.clientRate)}</td>
                  <td className="px-1.5 py-3 text-right">{formatPercent(row.rejectionRate)}</td>
                  {(["m0", "m1", "m2", "m3", "m4", "m5"] as const).map((key) => (
                    <td key={key} className="px-1.5 py-2 text-center">
                      <span
                        className="inline-flex min-w-12 justify-center rounded-md px-1.5 py-1 font-medium text-slate-950"
                        style={{ backgroundColor: heat(row[key]) }}
                      >
                        {formatPercent(row[key])}
                      </span>
                    </td>
                  ))}
                  <td className="px-1.5 py-3 text-right">
                    <div className="font-medium text-slate-950">{formatPercent(row.paidDateUnknownRate)}</div>
                    <div className="text-xs text-slate-500">{formatNumber(row.paidDateUnknown)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-950">Service cohorts</h2>
          <InfoHint text="Separate cohort table per service. Each table shows the latest 10 creation-month cohorts for that service. M0-M5 use real first_payment_at only." />
        </div>
      </section>

      {serviceCohortGroups.map(({ service, rows }) => (
        <Panel key={service} title={`Service cohorts: ${service}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">Latest {rows.length} cohorts</span>
          </div>
          <div className="overflow-hidden">
          <table className="w-full table-fixed text-xs lg:text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase leading-tight text-slate-500">
                  <th className="px-1.5 py-3">Cohort</th>
                  <th className="px-1.5 py-3 text-right">Leads</th>
                  <th className="px-1.5 py-3 text-right">Qualified / Active</th>
                  <th className="px-1.5 py-3 text-right">Paid</th>
                  <th className="px-1.5 py-3 text-right">Rejected</th>
                  {["M0", "M1", "M2", "M3", "M4", "M5"].map((label) => (
                    <th key={label} className="px-1.5 py-3 text-center">
                      {label}
                    </th>
                  ))}
                  <th className="px-1.5 py-3 text-right">Paid date unknown</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.service}-${row.cohort}`} className="border-b border-slate-100">
                    <td className="px-1.5 py-3 font-medium text-slate-950">{row.label}</td>
                    <td className="px-1.5 py-3 text-right">{formatNumber(row.leads)}</td>
                    <td className="px-1.5 py-3 text-right">{formatPercent(row.qualifiedActiveRate)}</td>
                    <td className="px-1.5 py-3 text-right">{formatPercent(row.currentPaidRate)}</td>
                    <td className="px-1.5 py-3 text-right">{formatPercent(row.rejectionRate)}</td>
                    {(["m0", "m1", "m2", "m3", "m4", "m5"] as const).map((key) => (
                      <td key={key} className="px-1.5 py-2 text-center">
                        <span
                          className="inline-flex min-w-12 justify-center rounded-md px-1.5 py-1 font-medium text-slate-950"
                          style={{ backgroundColor: heat(row[key]) }}
                        >
                          {formatPercent(row[key])}
                        </span>
                      </td>
                    ))}
                    <td className="px-1.5 py-3 text-right">
                      <div className="font-medium text-slate-950">{formatPercent(row.paidDateUnknownRate)}</div>
                      <div className="text-xs text-slate-500">{formatNumber(row.paidDateUnknown)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}

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

type FinancialMetricRow = {
  label: string;
  type: "number" | "currency" | "percent";
  actual: number | null;
  plan?: number | null;
  planAvg?: number | null;
  avg?: number | null;
  previous?: number | null;
};

function formatMetricValue(value: number | null | undefined, type: FinancialMetricRow["type"]) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  if (type === "currency") return formatCurrency(value);
  if (type === "percent") return formatPercent(value);
  return formatNumber(value);
}

function financialDelta(actual: number | null | undefined, base: number | null | undefined, type: FinancialMetricRow["type"]) {
  if (actual === null || actual === undefined || base === null || base === undefined || Number.isNaN(actual) || Number.isNaN(base)) return "n/a";
  return formatMetricValue(actual - base, type);
}

function countryNote(leads: number, qualified: number, signedContracts: number, cpl: number | null, conversionRate: number) {
  if (leads >= 20 && signedContracts === 0) return "High lead volume, no contracts. Check quality or sales follow-up.";
  if (signedContracts > 0 && conversionRate >= 0.08) return "Strong conversion. Candidate for budget focus.";
  if (cpl !== null && cpl > 150 && signedContracts === 0) return "High estimated CPL without contracts.";
  if (qualified > 0 && signedContracts === 0) return "Qualified pipeline exists, contract conversion not visible yet.";
  return "Monitor.";
}

function countryFinancialRows(rawRecords: CRMRecord[], cleanRecords: CRMRecord[], month: string, marketingCost: number, paidTrafficCost: number, revenue: number, sales: number, financeSignedContracts: number) {
  const rawMonthRecords = rawRecords.filter((record) => monthKey(record.createdAt) === month);
  const monthRecords = cleanRecords.filter((record) => monthKey(record.createdAt) === month);
  const rawGrouped = new Map<string, CRMRecord[]>();
  for (const record of rawMonthRecords) {
    const country = record.country || "Unknown";
    const key = `${country}|||${record.reportingService}`;
    rawGrouped.set(key, [...(rawGrouped.get(key) ?? []), record]);
  }
  const grouped = new Map<string, CRMRecord[]>();
  for (const record of monthRecords) {
    const country = record.country || "Unknown";
    const key = `${country}|||${record.reportingService}`;
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }

  return [...grouped.entries()]
    .map(([key, group]) => {
      const [country, service] = key.split("|||");
      const leads = group.length;
      const rawLeads = rawGrouped.get(key)?.length ?? leads;
      const qualified = group.filter(isQualifiedActive).length;
      const crmSignedProxy = group.filter(hasAgreementSigned).length;
      const crmSalesValue = group.reduce((sum, record) => sum + (record.dealValueActual ?? 0), 0);
      const share = monthRecords.length ? leads / monthRecords.length : 0;
      const estimatedCost = marketingCost * share;
      const estimatedPaidTrafficCost = paidTrafficCost * share;
      const estimatedRevenue = revenue * share;
      const estimatedSales = sales * share;
      const signedContracts = financeSignedContracts * share;
      const salesValue = crmSalesValue || estimatedSales;
      const conversionRate = leads ? signedContracts / leads : 0;
      const cpl = estimatedCost && leads ? estimatedCost / leads : null;
      return {
        country,
        service,
        rawLeads,
        leads,
        qualified,
        signedContracts,
        crmSignedProxy,
        salesValue,
        estimatedRevenue,
        estimatedCost,
        estimatedPaidTrafficCost,
        cpl,
        cpql: estimatedCost && qualified ? estimatedCost / qualified : null,
        costPerContract: estimatedCost && signedContracts ? estimatedCost / signedContracts : null,
        conversionRate,
        note: countryNote(leads, qualified, signedContracts, cpl, conversionRate),
      };
    })
    .filter((row) => row.leads > 0)
    .sort((a, b) => b.leads - a.leads);
}

function FinancialReport({
  analytics,
  records,
  rawRecords,
  cleanupResult,
  financeData,
}: {
  analytics: Analytics;
  records: CRMRecord[];
  rawRecords: CRMRecord[];
  cleanupResult: LeadCleanupResult;
  financeData: FinanceData | null;
}) {
  const financialAnalytics = useMemo(
    () => (financeData ? buildAnalytics(records, financeData) : analytics),
    [analytics, financeData, records],
  );
  const months = financialAnalytics.monthly
    .filter((row) => row.revenue || row.marketingSpend || row.sales || row.clicks || row.financeLeads || row.signedContracts)
    .sort((a, b) => b.month.localeCompare(a.month));
  const [selectedMonth, setSelectedMonth] = useState(months[0]?.month ?? "");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedCountryService, setSelectedCountryService] = useState("");
  const [selectedCountrySource, setSelectedCountrySource] = useState("");
  const activeMonth = months.find((row) => row.month === selectedMonth) ?? months[0];
  const previousMonth = activeMonth ? months.find((row) => row.month < activeMonth.month) : undefined;
  const rawMonthlyCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const record of rawRecords) {
      const key = monthKey(record.createdAt);
      if (key === "Unknown") continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [rawRecords]);
  const sourceFilteredCleanRecords = activeMonth && selectedCountrySource
    ? records.filter((record) => monthKey(record.createdAt) !== activeMonth.month || record.source === selectedCountrySource)
    : records;
  const sourceFilteredRawRecords = activeMonth && selectedCountrySource
    ? rawRecords.filter((record) => monthKey(record.createdAt) !== activeMonth.month || record.source === selectedCountrySource)
    : rawRecords;
  const activeCleanMonthRecords = activeMonth ? records.filter((record) => monthKey(record.createdAt) === activeMonth.month) : [];
  const sourceCleanMonthRecords = activeMonth && selectedCountrySource
    ? activeCleanMonthRecords.filter((record) => record.source === selectedCountrySource)
    : activeCleanMonthRecords;
  const countryFinanceShare = activeCleanMonthRecords.length ? sourceCleanMonthRecords.length / activeCleanMonthRecords.length : 1;
  const countryRowsBase = activeMonth
    ? countryFinancialRows(
      sourceFilteredRawRecords,
      sourceFilteredCleanRecords,
      activeMonth.month,
      activeMonth.marketingSpend * countryFinanceShare,
      activeMonth.paidTrafficCost * countryFinanceShare,
      activeMonth.revenue * countryFinanceShare,
      activeMonth.sales * countryFinanceShare,
      activeMonth.signedContracts * countryFinanceShare,
    )
    : [];
  const countryOptions = [...new Set(countryRowsBase.map((row) => row.country))].sort((a, b) => a.localeCompare(b));
  const countryServiceOptions = [...new Set(countryRowsBase.map((row) => row.service))].sort((a, b) => a.localeCompare(b));
  const countrySourceOptions = useMemo(
    () => (activeMonth
      ? [...new Set(records.filter((record) => monthKey(record.createdAt) === activeMonth.month).map((record) => record.source))].sort((a, b) => a.localeCompare(b))
      : []),
    [activeMonth, records],
  );
  const countryRows = countryRowsBase
    .filter((row) => !selectedCountry || row.country === selectedCountry)
    .filter((row) => !selectedCountryService || row.service === selectedCountryService)
    .slice(0, 24);
  const trendRows = [...months].sort((a, b) => a.month.localeCompare(b.month));

  useEffect(() => {
    if (!months.length) return;
    if (!selectedMonth || !months.some((row) => row.month === selectedMonth)) setSelectedMonth(months[0].month);
  }, [months, selectedMonth]);

  useEffect(() => {
    if (selectedCountry && !countryOptions.includes(selectedCountry)) setSelectedCountry("");
    if (selectedCountryService && !countryServiceOptions.includes(selectedCountryService)) setSelectedCountryService("");
    if (selectedCountrySource && !countrySourceOptions.includes(selectedCountrySource)) setSelectedCountrySource("");
  }, [countryOptions, countryServiceOptions, countrySourceOptions, selectedCountry, selectedCountryService, selectedCountrySource]);

  if (!activeMonth) {
    return (
      <Panel title="Financial funnel">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Finance workbook is loaded, but no monthly financial rows were found. Upload `DC-Finance-march-2026.xlsx` or a workbook with a `Main numbers` sheet.
        </div>
      </Panel>
    );
  }

  const financeLeads = activeMonth.financeLeads;
  const cleanLeads = activeMonth.leads;
  const crmCreatedLeads = rawMonthlyCounts.get(activeMonth.month) ?? cleanLeads;
  const previousCleanLeads = previousMonth?.leads ?? 0;
  const previousFinanceLeads = previousMonth?.financeLeads ?? 0;
  const previousCrmCreatedLeads = previousMonth ? rawMonthlyCounts.get(previousMonth.month) ?? previousCleanLeads : 0;
  const previousLeadBase = previousCleanLeads || previousFinanceLeads || previousCrmCreatedLeads;
  const leadCountMismatch = Boolean(financeLeads && cleanLeads && Math.abs(financeLeads - cleanLeads) / financeLeads > 0.05);
  const cpl = cleanLeads ? activeMonth.marketingSpend / cleanLeads : null;
  const costPerContract = activeMonth.costPerSignedContract ?? (activeMonth.signedContracts ? activeMonth.marketingSpend / activeMonth.signedContracts : null);
  const paidTrafficCpl = cleanLeads ? activeMonth.paidTrafficCost / cleanLeads : null;
  const leadToContract = cleanLeads ? activeMonth.signedContracts / cleanLeads : null;
  const clickToLead = activeMonth.clicks ? cleanLeads / activeMonth.clicks : null;
  const salesToRevenue = activeMonth.sales ? activeMonth.revenue / activeMonth.sales : null;
  const financialTrendRows = trendRows.map((row) => ({
    ...row,
    crmCreatedLeads: rawMonthlyCounts.get(row.month) ?? row.leads,
    cleanLeads: row.leads,
  }));
  const metricRows: FinancialMetricRow[] = [
    { label: "Sessions", type: "number", actual: null },
    { label: "Clicks", type: "number", actual: activeMonth.clicks, avg: activeMonth.avgClicks, previous: previousMonth?.clicks },
    { label: "CRM created leads", type: "number", actual: crmCreatedLeads, previous: previousCrmCreatedLeads || null },
    { label: "Clean leads", type: "number", actual: cleanLeads, avg: activeMonth.avgLeads, previous: previousCleanLeads || null },
    { label: "Finance leads", type: "number", actual: financeLeads || null, avg: activeMonth.avgLeads, previous: previousFinanceLeads || null },
    { label: "Signed contracts", type: "number", actual: activeMonth.signedContracts, avg: activeMonth.avgSignedContracts, previous: previousMonth?.signedContracts },
    { label: "Lithuania contracts", type: "number", actual: activeMonth.ltContracts, previous: previousMonth?.ltContracts },
    { label: "Latvia contracts", type: "number", actual: activeMonth.lvContracts, previous: previousMonth?.lvContracts },
    { label: "Other / RBI contracts", type: "number", actual: activeMonth.rbiContracts, previous: previousMonth?.rbiContracts },
    { label: "Sales value", type: "currency", actual: activeMonth.sales, avg: activeMonth.avgSales, previous: previousMonth?.sales },
    { label: "Revenue received", type: "currency", actual: activeMonth.revenue, avg: activeMonth.avgRevenue, previous: previousMonth?.revenue },
    { label: "Marketing cost", type: "currency", actual: activeMonth.marketingSpend, avg: activeMonth.avgMarketingCost, previous: previousMonth?.marketingSpend },
    { label: "Paid traffic cost", type: "currency", actual: activeMonth.paidTrafficCost, avg: activeMonth.avgPaidTrafficCost, previous: previousMonth?.paidTrafficCost },
    {
      label: "Profit after marketing",
      type: "currency",
      actual: activeMonth.profitAfterMarketing,
      plan: activeMonth.planProfitAfterMarketing,
      planAvg: activeMonth.planProfitAfterMarketing3MonthAverage,
      avg: activeMonth.avgProfitAfterMarketing,
      previous: previousMonth?.profitAfterMarketing,
    },
    { label: "CPL", type: "currency", actual: cpl, previous: previousCleanLeads ? (previousMonth?.marketingSpend ?? 0) / previousCleanLeads : null },
    { label: "Paid traffic CPL", type: "currency", actual: paidTrafficCpl, previous: previousCleanLeads ? (previousMonth?.paidTrafficCost ?? 0) / previousCleanLeads : null },
    { label: "Cost per signed contract", type: "currency", actual: costPerContract, previous: previousMonth?.costPerSignedContract },
    { label: "Click to lead conversion", type: "percent", actual: clickToLead },
    { label: "Lead to contract conversion", type: "percent", actual: leadToContract, previous: previousLeadBase ? (previousMonth?.signedContracts ?? 0) / previousLeadBase : previousMonth?.leadToContractRate },
    { label: "Revenue / sales relation", type: "percent", actual: salesToRevenue },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Marketing & sales funnel</h2>
          <p className="mt-1 text-sm text-slate-600">
            Latest available finance month: <strong>{months[0]?.label}</strong>. CRM created leads are raw CRM rows by `Дата створення`; Clean leads remove duplicates and obvious technical/system records; finance leads are shown only as validation.
          </p>
        </div>
        <select
          value={activeMonth.month}
          onChange={(event) => setSelectedMonth(event.target.value)}
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800"
        >
          {months.map((row) => (
            <option key={row.month} value={row.month}>{row.label}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Sessions" value="n/a" sub="GA4 source not connected" help="Website sessions should come from GA4 or website analytics. The current finance file has clicks, but not sessions." />
        <KpiCard label="Clicks" value={formatNumber(activeMonth.clicks)} sub="All traffic clicks from finance" help="Total clicks from the monthly finance funnel, not only CRM rows." />
        <KpiCard label="CRM created leads" value={formatNumber(crmCreatedLeads)} sub="Raw CRM rows by creation date" help="All CRM records where `Дата створення` falls in the selected month, before cleanup." tone="blue" />
        <KpiCard label="Clean leads" value={formatNumber(cleanLeads)} sub={`${formatNumber(Math.max(0, crmCreatedLeads - cleanLeads))} removed by cleanup`} help="CRM-created records after removing duplicates and obvious technical/system/test records. This is the default lead base for management metrics." tone="green" />
        <KpiCard label="Finance leads" value={financeLeads ? formatNumber(financeLeads) : "n/a"} sub="Finance file validation" help="Lead count from Jonas finance file, used as a comparison check, not as the default CRM funnel base." tone="blue" />
        <KpiCard label="Signed contracts" value={formatNumber(activeMonth.signedContracts)} sub={`${formatNumber(activeMonth.ltContracts)} LT · ${formatNumber(activeMonth.lvContracts)} LV · ${formatNumber(activeMonth.rbiContracts)} other/RBI`} help="Signed contracts from the finance workbook. Other/RBI is the remaining contracts after LT and LV where no separate RBI contract field exists." tone="green" />
        <KpiCard label="Sales" value={formatCurrency(activeMonth.sales)} sub="Signed contract value" help="Sales means contract value signed in the month, not cash received." tone="green" />
        <KpiCard label="Revenue" value={formatCurrency(activeMonth.revenue)} sub="Cash received" help="Actual money received from clients during the selected month." />
        <KpiCard label="Marketing cost" value={formatCurrency(activeMonth.marketingSpend)} sub="Total marketing cost" help="Total monthly marketing expenditure from finance." tone="amber" />
        <KpiCard label="Paid traffic cost" value={formatCurrency(activeMonth.paidTrafficCost)} sub="Google/Bing/paid traffic" help="Paid traffic cost excludes non-PPC marketing items where the finance file separates them." tone="amber" />
        <KpiCard label="Profit after marketing" value={formatCurrency(activeMonth.profitAfterMarketing)} sub="Revenue - marketing cost" help="Revenue received minus total marketing cost." tone="green" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="CPL" value={formatCurrency(cpl)} sub="Marketing cost / clean leads" help="Average marketing cost per clean CRM lead." />
        <KpiCard label="Paid traffic CPL" value={formatCurrency(paidTrafficCpl)} sub="Paid traffic / clean leads" help="Paid traffic cost divided by clean CRM leads." />
        <KpiCard label="Cost per signed contract" value={formatCurrency(costPerContract)} sub="Marketing cost / contracts" help="Total marketing cost divided by signed contracts." tone="amber" />
        <KpiCard label="Lead to contract" value={formatPercent(leadToContract ?? 0)} sub="Signed contracts / clean leads" help="Signed contracts from finance divided by clean CRM leads." tone="green" />
      </div>

      {leadCountMismatch ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Lead count audit for {activeMonth.label}: finance workbook shows <strong>{formatNumber(financeLeads)}</strong> leads, while CRM cleanup gives <strong>{formatNumber(cleanLeads)}</strong> clean leads.
          Difference is over 5%, so use this month as a validation checkpoint before making budget decisions.
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
        Cleanup rules in current date range: duplicates <strong>{formatNumber(cleanupResult.excluded.duplicate)}</strong>, technical/system <strong>{formatNumber(cleanupResult.excluded.technical)}</strong>, invalid identity <strong>{formatNumber(cleanupResult.excluded.invalid)}</strong>, test/demo <strong>{formatNumber(cleanupResult.excluded.test)}</strong>.
      </div>

      <Panel title="Financial funnel">
        <div className="grid gap-3 md:grid-cols-5">
          {[
            { label: "Clicks", value: formatNumber(activeMonth.clicks), sub: clickToLead === null ? "n/a" : `${formatPercent(clickToLead)} click to lead` },
            { label: "Clean leads", value: formatNumber(cleanLeads), sub: leadToContract === null ? "n/a" : `${formatPercent(leadToContract)} lead to contract` },
            { label: "Signed contracts", value: formatNumber(activeMonth.signedContracts), sub: activeMonth.signedContracts ? `${formatCurrency(activeMonth.sales / activeMonth.signedContracts)} sales / contract` : "n/a" },
            { label: "Sales", value: formatCurrency(activeMonth.sales), sub: salesToRevenue === null ? "n/a" : `${formatPercent(salesToRevenue)} revenue / sales` },
            { label: "Revenue", value: formatCurrency(activeMonth.revenue), sub: `${formatCurrency(activeMonth.profitAfterMarketing)} profit after marketing` },
          ].map((step) => (
            <div key={step.label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase text-slate-500">{step.label}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">{step.value}</div>
              <div className="mt-1 text-sm text-slate-600">{step.sub}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Lead chart" exportSplit>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={financialTrendRows}>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => formatNumber(numericValue(value))} />
              <Legend />
              <Bar isAnimationActive={false} dataKey="crmCreatedLeads" fill="#94a3b8" name="CRM created leads" radius={[3, 3, 0, 0]} />
              <Bar isAnimationActive={false} dataKey="cleanLeads" fill="#2563eb" name="Clean leads" radius={[3, 3, 0, 0]} />
              <Line isAnimationActive={false} type="monotone" dataKey="financeLeads" stroke="#16a34a" strokeWidth={2} name="Finance leads" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Money chart" exportSplit>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={financialTrendRows}>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(value) => `€${Math.round(Number(value) / 1000)}k`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => formatCurrency(numericValue(value))} />
              <Legend />
              <Line isAnimationActive={false} type="monotone" dataKey="sales" stroke="#7c3aed" strokeWidth={2} name="Sales value" dot={false} />
              <Line isAnimationActive={false} type="monotone" dataKey="revenue" stroke="#0891b2" strokeWidth={2} name="Revenue" dot={false} />
              <Line isAnimationActive={false} type="monotone" dataKey="marketingSpend" stroke="#f59e0b" strokeWidth={2} name="Marketing cost" dot={false} />
              <Line isAnimationActive={false} type="monotone" dataKey="profitAfterMarketing" stroke="#dc2626" strokeWidth={2} name="Profit after marketing" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Contracts chart" exportSplit>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={financialTrendRows}>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => formatNumber(numericValue(value))} />
              <Legend />
              <Bar isAnimationActive={false} dataKey="signedContracts" fill="#16a34a" name="Signed contracts" radius={[3, 3, 0, 0]} />
              <Line isAnimationActive={false} type="monotone" dataKey="ltContracts" stroke="#2563eb" strokeWidth={2} name="Lithuania contracts" dot={false} />
              <Line isAnimationActive={false} type="monotone" dataKey="lvContracts" stroke="#7c3aed" strokeWidth={2} name="Latvia contracts" dot={false} />
              <Line isAnimationActive={false} type="monotone" dataKey="rbiContracts" stroke="#f59e0b" strokeWidth={2} name="RBI / residence contracts" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Financial monthly table" exportSplit>
        <div className="overflow-hidden">
          <table className="w-full table-fixed text-xs lg:text-sm">
            <colgroup>
              <col className="w-[22%]" />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase leading-tight text-slate-500">
                <th className="px-2 py-3">Metric</th>
                <th className="px-2 py-3 text-right">Plan / target</th>
                <th className="px-2 py-3 text-right">Actual this month</th>
                <th className="px-2 py-3 text-right">Previous</th>
                <th className="px-2 py-3 text-right">Vs previous</th>
                <th className="px-2 py-3 text-right">Vs target</th>
                <th className="px-2 py-3 text-right">3-mo avg</th>
                <th className="px-2 py-3 text-right">Plan 3-mo avg</th>
              </tr>
            </thead>
            <tbody>
              {metricRows.map((row) => (
                <tr key={row.label} className="border-b border-slate-100">
                  <td className="break-words px-2 py-3 font-medium text-slate-950">{row.label}</td>
                  <td className="px-2 py-3 text-right">{formatMetricValue(row.plan, row.type)}</td>
                  <td className="px-2 py-3 text-right font-semibold text-slate-950">{formatMetricValue(row.actual, row.type)}</td>
                  <td className="px-2 py-3 text-right">{formatMetricValue(row.previous, row.type)}</td>
                  <td className="px-2 py-3 text-right">{financialDelta(row.actual, row.previous, row.type)}</td>
                  <td className="px-2 py-3 text-right">{financialDelta(row.actual, row.plan, row.type)}</td>
                  <td className="px-2 py-3 text-right">{formatMetricValue(row.avg, row.type)}</td>
                  <td className="px-2 py-3 text-right">{formatMetricValue(row.planAvg, row.type)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Country-level financial performance" exportSplit>
        <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Country rows use clean CRM leads for conversion and allocate finance contracts, sales, revenue, and costs by clean-lead share. CRM created leads are shown separately for audit.
        </div>
        <div className="pdf-ignore mb-4 flex flex-wrap gap-2">
          <select
            value={selectedCountry}
            onChange={(event) => setSelectedCountry(event.target.value)}
            className="h-10 max-w-64 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800"
          >
            <option value="">All countries</option>
            {countryOptions.map((country) => (
              <option key={country} value={country}>{country}</option>
            ))}
          </select>
          <select
            value={selectedCountryService}
            onChange={(event) => setSelectedCountryService(event.target.value)}
            className="h-10 max-w-80 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800"
          >
            <option value="">All service directions</option>
            {countryServiceOptions.map((service) => (
              <option key={service} value={service}>{service}</option>
            ))}
          </select>
          <select
            value={selectedCountrySource}
            onChange={(event) => setSelectedCountrySource(event.target.value)}
            className="h-10 max-w-64 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800"
          >
            <option value="">All sources</option>
            {countrySourceOptions.map((source) => (
              <option key={source} value={source}>{source}</option>
            ))}
          </select>
        </div>
        <div className="overflow-hidden">
          <table className="w-full table-fixed text-xs lg:text-sm">
            <colgroup>
              <col className="w-[11%]" />
              <col className="w-[13%]" />
              {Array.from({ length: 11 }).map((_, index) => <col key={index} />)}
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase leading-tight text-slate-500">
                <th className="px-1 py-3">Country</th>
                <th className="px-1 py-3">Service direction</th>
                <th className="px-1 py-3 text-right">CRM created</th>
                <th className="px-1 py-3 text-right">Clean leads</th>
                <th className="px-1 py-3 text-right">Qualified</th>
                <th className="px-1 py-3 text-right">Signed est.</th>
                <th className="px-1 py-3 text-right">Sales value</th>
                <th className="px-1 py-3 text-right">Revenue</th>
                <th className="px-1 py-3 text-right">Mkt. cost</th>
                <th className="px-1 py-3 text-right">Paid cost</th>
                <th className="px-1 py-3 text-right">CPL</th>
                <th className="px-1 py-3 text-right">CPQL</th>
                <th className="px-1 py-3 text-right">Cost / contract</th>
                <th className="px-1 py-3 text-right">Conv.</th>
                <th className="px-1 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {countryRows.map((row) => (
                <tr key={`${row.country}-${row.service}`} className="border-b border-slate-100">
                  <td className="break-words px-1 py-3 font-medium text-slate-950">{row.country}</td>
                  <td className="break-words px-1 py-3 text-slate-700">{row.service}</td>
                  <td className="px-1 py-3 text-right">{formatNumber(row.rawLeads)}</td>
                  <td className="px-1 py-3 text-right">{formatNumber(row.leads)}</td>
                  <td className="px-1 py-3 text-right">{formatNumber(row.qualified)}</td>
                  <td className="px-1 py-3 text-right font-medium text-slate-950">{formatNumber(row.signedContracts)}</td>
                  <td className="px-1 py-3 text-right">{formatCurrency(row.salesValue)}</td>
                  <td className="px-1 py-3 text-right">{formatCurrency(row.estimatedRevenue)}</td>
                  <td className="px-1 py-3 text-right">{formatCurrency(row.estimatedCost)}</td>
                  <td className="px-1 py-3 text-right">{formatCurrency(row.estimatedPaidTrafficCost)}</td>
                  <td className="px-1 py-3 text-right">{formatCurrency(row.cpl)}</td>
                  <td className="px-1 py-3 text-right">{formatCurrency(row.cpql)}</td>
                  <td className="px-1 py-3 text-right">{formatCurrency(row.costPerContract)}</td>
                  <td className="px-1 py-3 text-right">{formatPercent(row.conversionRate)}</td>
                  <td className="break-words px-1 py-3 text-slate-600">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
        <KpiCard label="Duplicate rate" value={formatPercent(analytics.duplicateRate)} sub="Repeated identity rows" help="Rows marked duplicate_flag or repeated by email, Google Client ID, counterparty, or title." tone="red" />
        <KpiCard label="Full payment coverage" value={formatPercent(analytics.fullPaidClientRate)} sub="Full payment or completed" help="Share of leads that reached full payment or completed status." tone="green" />
      </div>

      <Panel title="Field completeness" exportSplit>
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
  const [fileName, setFileName] = useState("Works with clients 3 sample");
  const [financeFileName, setFinanceFileName] = useState("April-2026 sample");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [uniqueOnly, setUniqueOnly] = useState(true);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMode, setExportMode] = useState<"none" | "current" | "all">("none");
  const inputRef = useRef<HTMLInputElement>(null);
  const financeInputRef = useRef<HTMLInputElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    async function loadSample() {
      try {
        const savedCrm = await loadReportFile(CRM_FILE_KEY).catch(() => null);
        const savedFinance = await loadReportFile(FINANCE_FILE_KEY).catch(() => null);
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

  const dateFilteredRawRecords = useMemo(() => {
    const fromDate = dateFromInput(dateRange.from);
    const toDate = dateFromInput(dateRange.to, true);

    return records.filter((record) => {
      if (!fromDate && !toDate) return true;
      if (!record.createdAt) return false;
      if (fromDate && record.createdAt < fromDate) return false;
      if (toDate && record.createdAt > toDate) return false;
      return true;
    });
  }, [dateRange.from, dateRange.to, records]);

  const cleanupResult = useMemo<LeadCleanupResult>(() => cleanLeadRecords(dateFilteredRawRecords), [dateFilteredRawRecords]);
  const dateAndQualityFilteredRecords = uniqueOnly ? cleanupResult.records : dateFilteredRawRecords;

  const serviceOptions = useMemo(
    () => [...new Set(dateAndQualityFilteredRecords.map((record) => record.reportingService))]
      .sort((a, b) => a.localeCompare(b)),
    [dateAndQualityFilteredRecords],
  );

  useEffect(() => {
    setSelectedServices((current) => current.filter((service) => serviceOptions.includes(service)));
  }, [serviceOptions]);

  const filteredRecords = useMemo(() => {
    if (!selectedServices.length || selectedServices.length === serviceOptions.length) return dateAndQualityFilteredRecords;
    const selected = new Set(selectedServices);
    return dateAndQualityFilteredRecords.filter((record) => selected.has(record.reportingService));
  }, [dateAndQualityFilteredRecords, selectedServices, serviceOptions.length]);

  const rawFilteredRecords = useMemo(() => {
    if (!selectedServices.length || selectedServices.length === serviceOptions.length) return dateFilteredRawRecords;
    const selected = new Set(selectedServices);
    return dateFilteredRawRecords.filter((record) => selected.has(record.reportingService));
  }, [dateFilteredRawRecords, selectedServices, serviceOptions.length]);

  const dateFilteredFinance = useMemo(
    () => filterFinanceData(financeData, dateRange.from, dateRange.to),
    [dateRange.from, dateRange.to, financeData],
  );

  const filteredFinance = useMemo(
    () => allocateFinanceToRecords(dateFilteredFinance, dateAndQualityFilteredRecords, filteredRecords),
    [dateAndQualityFilteredRecords, dateFilteredFinance, filteredRecords],
  );

  const analytics = useMemo(() => buildAnalytics(filteredRecords, filteredFinance), [filteredFinance, filteredRecords]);
  const activeTab = tabs.find((item) => item.id === tab) ?? tabs[0];
  const fullDateBounds = useMemo(() => getDateBounds(records), [records]);
  const selectedServiceNames = selectedServices.length && selectedServices.length !== serviceOptions.length
    ? selectedServices
    : [];
  const dateFilterActive = Boolean(records.length && (dateRange.from !== fullDateBounds.from || dateRange.to !== fullDateBounds.to));
  const serviceFilterActive = selectedServiceNames.length > 0;
  const hasActiveFilters = dateFilterActive || !uniqueOnly || serviceFilterActive;
  const filterDescription = [
    dateFilterActive ? `Date range: ${dateRange.from || "start"} to ${dateRange.to || "end"}.` : "",
    uniqueOnly ? "" : "CRM created leads mode is enabled.",
    serviceFilterActive ? `Service filter: ${selectedServiceNames.join(", ")}.` : "",
  ].filter(Boolean).join(" ");
  const reportScope: ReportScope = {
    rawTotal: records.length,
    rawDateTotal: dateFilteredRawRecords.length,
    cleanTotal: cleanupResult.cleanCount,
    dateAndQualityTotal: dateAndQualityFilteredRecords.length,
    visibleTotal: filteredRecords.length,
    hasActiveFilters,
    filterDescription,
  };

  function resetAllFilters() {
    setDateRange(fullDateBounds);
    setUniqueOnly(true);
    setSelectedServices([]);
  }

  async function handleFile(file: File) {
    setError("");
    setIsLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parseWorkbook(buffer);
      setRecords(parsed);
      setDateRange(getDateBounds(parsed));
      setUniqueOnly(true);
      setSelectedServices([]);
      setFileName(file.name);
      await saveReportFile(CRM_FILE_KEY, file.name, buffer.slice(0));
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
      await saveReportFile(FINANCE_FILE_KEY, file.name, buffer.slice(0));
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
      const margin = 4;
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
          const canSplitBlock = block.classList.contains("pdf-split-ok");
          if (shouldMoveWholeBlock && blocksOnCurrentPdfPage > 0 && !canSplitBlock) {
            pdf.addPage();
            cursorY = margin;
            blocksOnCurrentPdfPage = 0;
          }

          if (imageHeight <= contentHeight && !(canSplitBlock && imageHeight > remainingHeight && remainingHeight > 35)) {
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
              <span>{formatNumber(analytics.total)} leads</span>
              <span>{uniqueOnly ? "Clean leads" : "CRM created leads"}</span>
              <span>{!selectedServices.length || selectedServices.length === serviceOptions.length ? "All services" : `${selectedServices.length} selected services`}</span>
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
                onClick={resetAllFilters}
                className={clsx(
                  "inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition",
                  hasActiveFilters
                    ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                    : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50",
                )}
                title="Reset date, unique, and service filters"
              >
                Reset all filters
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
                title="Clean leads remove duplicates and obvious technical/system records. CRM created leads shows raw CRM-created rows for the selected date range."
              >
                {uniqueOnly ? "Clean leads" : "CRM created leads"}
              </button>
              <ServiceFilter options={serviceOptions} selected={selectedServices} onChange={setSelectedServices} />
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
            <form action="/api/logout" method="post">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </form>
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
        {tab === "overview" ? <Overview analytics={analytics} scope={reportScope} onResetFilters={resetAllFilters} /> : null}
        {tab === "sources" ? <Sources analytics={analytics} scope={reportScope} onResetFilters={resetAllFilters} /> : null}
        {tab === "conversion" ? <Conversion analytics={analytics} /> : null}
        {tab === "cohorts" ? <Cohorts analytics={analytics} /> : null}
        {tab === "financial" ? <FinancialReport analytics={analytics} records={filteredRecords} rawRecords={rawFilteredRecords} cleanupResult={cleanupResult} financeData={financeData} /> : null}
        {tab === "quality" ? <Quality analytics={analytics} /> : null}
      </section>

      {exportMode !== "none" ? (
        <div ref={exportRef} className="export-report">
          {exportMode === "all" || tab === "overview" ? (
            <ReportPage title="Overview">
              <Overview analytics={analytics} scope={reportScope} />
            </ReportPage>
          ) : null}
          {exportMode === "all" || tab === "sources" ? (
            <ReportPage title="Channels & services">
              <Sources analytics={analytics} scope={reportScope} />
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
          {exportMode === "all" || tab === "financial" ? (
            <ReportPage title="Financial funnel">
              <FinancialReport analytics={analytics} records={filteredRecords} rawRecords={rawFilteredRecords} cleanupResult={cleanupResult} financeData={financeData} />
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
