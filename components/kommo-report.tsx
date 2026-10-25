"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, BarChart3, CalendarDays, CheckCircle2, Download, FileSpreadsheet, Filter, Layers3, LoaderCircle, LogOut, RotateCcw, Upload, Users } from "lucide-react";
import { FinanceData, parseFinanceWorkbook } from "@/lib/finance";
import { cleanKommoLeads, isoDay, KommoDataset, parseKommoWorkbook } from "@/lib/kommo";
import { bounds, filterLeads, Scope } from "@/lib/kommo-analytics";
import { loadReportFile, saveReportFile } from "@/lib/report-files";
import { exportDashboardPdf } from "@/lib/report-pdf";
import { ReportSwitcher } from "./report-switcher";
import { Hint, MultiFilter, num } from "./kommo-ui";
import { downloadLeadCsv, MarketingPage, MarketingView, SalesPage, SalesView, ViewContext, ViewOptions } from "./kommo-views";
import { KommoQuality } from "./kommo-quality";
import { DateRangePicker } from "./date-range-picker";
import { LanguageSelector, useReportLanguage } from "./report-language";

const CRM_KEY = "kommo-v1";
const FINANCE_KEY = "finance-april-2026";
const MARKETING: { id: MarketingPage; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 }, { id: "channels", label: "Channels & Services", icon: Filter },
  { id: "conversions", label: "Conversions", icon: Activity }, { id: "cohorts", label: "Cohorts", icon: Layers3 },
  { id: "finance", label: "Finance & Reconciliation", icon: FileSpreadsheet }, { id: "quality", label: "Quality", icon: CheckCircle2 },
];
const SALES: { id: SalesPage; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 }, { id: "managers", label: "Managers", icon: Users },
  { id: "pipeline", label: "Pipeline & Response", icon: Activity }, { id: "actions", label: "Next Actions", icon: CheckCircle2 },
];
const initialScope: Scope = { from: "", to: "", services: [], sources: [], owners: [], origin: "all" };
const initialOptions: ViewOptions = { cohortEvent: "firstPaymentAt", cohortMode: "cumulative", conversionChannel: "", queueSearch: "", queueAction: "", queuePage: 0 };
const btn = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50";

export default function KommoReport() {
  const { language, t } = useReportLanguage();
  const [dataset, setDataset] = useState<KommoDataset | null>(null);
  const [finance, setFinance] = useState<FinanceData | null>(null);
  const [crmName, setCrmName] = useState("");
  const [financeName, setFinanceName] = useState("");
  const [scope, setScope] = useState<Scope>(initialScope);
  const [clean, setClean] = useState(true);
  const [area, setArea] = useState<"marketing" | "sales">("marketing");
  const [marketingPage, setMarketingPage] = useState<MarketingPage>("overview");
  const [salesPage, setSalesPage] = useState<SalesPage>("overview");
  const [sla, setSla] = useState(60);
  const [staleDays, setStaleDays] = useState(7);
  const [optionsState, setOptionsState] = useState<ViewOptions>(initialOptions);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<string[]>([]);
  const [exportMode, setExportMode] = useState<"current" | "all" | null>(null);
  const [exporting, setExporting] = useState(false);
  const crmInput = useRef<HTMLInputElement>(null), financeInput = useRef<HTMLInputElement>(null), pdfRoot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    async function restore() {
      const saved = await Promise.allSettled([loadReportFile(CRM_KEY), loadReportFile(FINANCE_KEY)]);
      const warnings: string[] = [];
      for (let i = 0; i < saved.length; i++) {
        const result = saved[i];
        if (result.status === "rejected") { warnings.push("Browser storage could not be restored. Files can still be uploaded for this session."); continue; }
        const file = result.value;
        if (!file) continue;
        try {
          if (i === 0) {
            const parsed = await parseKommoWorkbook(file.buffer);
            const dates = bounds(parsed.leads);
            if (active) { setDataset(parsed); setCrmName(file.name); setScope({ ...initialScope, ...dates }); }
          } else {
            const parsed = await parseFinanceWorkbook(file.buffer);
            if (active) { setFinance(parsed); setFinanceName(file.name); }
          }
        } catch (e) { warnings.push(e instanceof Error ? e.message : "A saved file could not be parsed. Upload it again."); }
      }
      if (active) { setNotice([...new Set(warnings)]); setBusy(false); }
    }
    void restore();
    return () => { active = false; };
  }, []);

  async function upload(file: File, type: "crm" | "finance") {
    setBusy(true); setError(""); setNotice([]);
    try {
      const buffer = await file.arrayBuffer();
      if (type === "crm") {
        const parsed = await parseKommoWorkbook(buffer);
        if (!parsed.leads.length) throw new Error("The Kommo export has headers but contains no leads. The previous dataset has been retained.");
        const dates = bounds(parsed.leads);
        setDataset(parsed); setCrmName(file.name); setScope({ ...initialScope, ...dates }); setClean(true); setOptionsState(initialOptions);
      } else { const parsed = await parseFinanceWorkbook(buffer); setFinance(parsed); setFinanceName(file.name); }
      try { await saveReportFile(type === "crm" ? CRM_KEY : FINANCE_KEY, file.name, buffer); }
      catch { setNotice(["The report is updated for this session. Browser storage is unavailable, so this file will need to be uploaded after reopening."]); }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not import the selected file."); }
    finally { setBusy(false); }
  }

  const cleanup = useMemo(() => cleanKommoLeads(dataset?.leads ?? []), [dataset]);
  const prepared = useMemo(() => clean ? cleanup.records : dataset?.leads ?? [], [clean, cleanup.records, dataset]);
  const selected = useMemo(() => filterLeads(prepared, scope), [prepared, scope]);
  const rawSelected = useMemo(() => filterLeads(dataset?.leads ?? [], scope), [dataset, scope]);
  const options = useMemo(() => ({
    services: [...new Set(prepared.map((l) => l.service))].sort(), sources: [...new Set(prepared.map((l) => l.source))].sort(), owners: [...new Set(prepared.map((l) => l.owner))].sort(),
  }), [prepared]);
  const asOf = dataset?.asOf ?? new Date();
  const selectionLabel = [scope.from || t("Start"), scope.to || t("End"), t(clean ? "clean leads" : "CRM rows"), scope.services.map(t).join(", ") || t("All services"), scope.sources.map(t).join(", ") || t("All channels"), scope.owners.join(", ") || t("All managers"), t(scope.origin === "native" ? "Native Kommo only" : scope.origin === "migrated" ? "Migrated from PlanFix" : "All origins"), `${t("Snapshot")} ${isoDay(asOf)}`].join(" / ");
  const ctx: ViewContext = { leads: selected, base: prepared, raw: rawSelected, rawBase: dataset?.leads, selectionLabel, finance, scope, asOf, sla, staleDays, options: optionsState, onOptionsChange: (patch) => setOptionsState((current) => ({ ...current, ...patch })), onFinanceOpen: () => { setArea("marketing"); setMarketingPage("finance"); } };
  const activePage = area === "marketing" ? marketingPage : salesPage;
  const activeLabel = (area === "marketing" ? MARKETING : SALES).find((t) => t.id === activePage)!.label;
  const period = scope.from === scope.to ? scope.from || "All dates" : `${scope.from || "Start"} to ${scope.to || "End"}`;
  const displayPeriod = scope.from === scope.to ? scope.from || t("All dates") : `${scope.from || t("Start")} ${t("to")} ${scope.to || t("End")}`;
  const originLabel = scope.origin === "native" ? "Native Kommo only" : scope.origin === "migrated" ? "Migrated from PlanFix" : "All origins";
  const noClosedHistory = Boolean(dataset && !dataset.leads.some((l) => l.closedAt || /lost|rejected|won|successful/i.test(l.stage)));

  function reportMessage(message: string): string {
    const columnPrefix = "Missing required Kommo column: ";
    if (message.startsWith(columnPrefix)) return `${t("Missing required Kommo column:")} ${message.slice(columnPrefix.length)}`;
    const exportPrefix = "Could not export the dashboard PDF: ";
    if (message.startsWith(exportPrefix)) return `${t("Could not export the dashboard PDF:")} ${t(message.slice(exportPrefix.length))}`;
    return t(message);
  }

  function reset() { setScope({ ...initialScope, ...bounds(dataset?.leads ?? []) }); setClean(true); setOptionsState(initialOptions); }

  function renderPage(report: "marketing" | "sales", page: MarketingPage | SalesPage) {
    if (report === "sales") return <SalesView page={page as SalesPage} ctx={ctx} />;
    if (page === "quality") return <KommoQuality leads={selected} allLeads={dataset?.leads ?? []} headers={dataset?.headers ?? []} asOf={asOf} />;
    return <MarketingView page={page as Exclude<MarketingPage, "quality">} ctx={ctx} />;
  }

  async function exportPdf(mode: "current" | "all") {
    if (exporting || !dataset) return;
    setExporting(true); setError(""); setExportMode(mode);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (!pdfRoot.current) throw new Error("The export view has not mounted yet.");
      const name = mode === "all" ? "full-report" : `${area}-${activePage}`;
      await exportDashboardPdf(pdfRoot.current, `dc-kommo-${name}_${scope.from || "start"}_to_${scope.to || "end"}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not export the report."); }
    finally { setExporting(false); setExportMode(null); }
  }

  return <main lang={language} className="kommo-dashboard min-h-screen bg-[#f7f8fa] pb-10">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-[1560px] px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><ReportSwitcher active="kommo" /><div className="flex flex-wrap items-center gap-3"><LanguageSelector /><form action="/api/logout" method="post"><button className={btn} type="submit"><LogOut size={14} />{t("Logout")}</button></form></div></div>
        <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0"><div className="mb-1 text-xs font-semibold text-blue-700">DE CIVITATE / KOMMO</div><h1 className="text-2xl font-semibold text-slate-950">{t("Sales & Marketing Analytics")}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs leading-5 text-slate-500"><span className="inline-flex items-center gap-1"><CalendarDays size={13} />{displayPeriod}</span><span>{num(selected.length)} {t(clean ? "clean leads" : "CRM rows")}</span>{dataset && <span>{t("Snapshot")}: {asOf.toISOString().replace("T", " ").slice(0, 19)} / {t("CRM time")}<Hint text="Latest valid Date Created or Last Modified in the uploaded file. Timestamps have no timezone offset; calendar/time values are preserved exactly as exported. The dashboard is a file snapshot, not live CRM." /></span>}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={crmInput} type="file" accept=".csv,.xlsx,.xls" className="hidden" aria-label={t("Kommo CRM file")} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, "crm"); e.currentTarget.value = ""; }} />
            <input ref={financeInput} type="file" accept=".xlsx,.xls" className="hidden" aria-label={t("Finance workbook")} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, "finance"); e.currentTarget.value = ""; }} />
            <button type="button" disabled={busy || exporting} onClick={() => crmInput.current?.click()} className={`${btn} !border-blue-700 !bg-blue-700 !text-white hover:!bg-blue-800`}><Upload size={15} />{t("Upload Kommo CSV / XLS")}</button>
            <button type="button" disabled={busy || exporting} onClick={() => financeInput.current?.click()} className={btn}><Upload size={15} />{t("Upload finance report XLS")}</button>
            <button type="button" disabled={!dataset || busy || exporting} onClick={() => void exportPdf("all")} className={btn}>{exporting ? <LoaderCircle size={15} className="animate-spin" /> : <Download size={15} />}{t(exporting ? "Exporting PDF..." : "Export full PDF")}</button>
          </div>
        </div>
        {(crmName || financeName) && <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs leading-5 text-slate-500"><span className="max-w-full break-all">{t("CRM")}: {crmName || t("Not uploaded")}</span><span className="max-w-full break-all">{t("Finance")}: {financeName || t("Not uploaded")}<Hint text="The finance workbook is shared by PlanFix and Kommo in this browser. Uploading another finance file replaces that shared saved workbook, not either CRM export." /></span></div>}
      </div>
    </header>

    <div className="mx-auto max-w-[1560px] px-4 sm:px-6">
      {busy && <div role="status" className="mt-4 flex items-center gap-2 rounded-md bg-blue-50 p-3 text-sm text-blue-800"><LoaderCircle size={16} className="animate-spin" />{t("Reading report data...")}</div>}
      {error && <div role="alert" className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800">{reportMessage(error)}</div>}
      {notice.length > 0 && <div role="status" className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{notice.map(reportMessage).join(" ")}</div>}

      {!dataset && !busy ? <section className="py-12">
        <div className="max-w-2xl"><FileSpreadsheet size={32} className="text-blue-700" /><h2 className="mt-5 text-xl font-semibold">{t("Kommo report")}</h2><p className="mt-3 text-sm leading-7 text-slate-600">{t("Upload your Kommo leads export and the monthly finance workbook.")}</p><div className="mt-5 flex flex-wrap gap-3"><button onClick={() => crmInput.current?.click()} type="button" className={btn}><Upload size={16} />{t("Upload Kommo CSV / XLS")}</button><button onClick={() => financeInput.current?.click()} type="button" className={btn}><Upload size={16} />{t("Upload finance report XLS")}</button></div><p className="mt-5 text-xs leading-6 text-slate-500">{t("Files stay in this browser. PlanFix and Kommo exports are stored separately.")}</p></div>
      </section> : dataset && <>
        <div className="mt-5 grid gap-3 border-b border-slate-200 pb-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="self-end"><DateRangePicker value={{ from: scope.from, to: scope.to }} onChange={(dates) => setScope((current) => ({ ...current, ...dates }))} bounds={bounds(dataset.leads)} anchorDate={isoDay(asOf)} disabled={busy || exporting} /></div>
          <div className="self-end"><MultiFilter label="Services" values={options.services} selected={scope.services} onChange={(services) => setScope({ ...scope, services })} /></div>
          <div className="self-end"><MultiFilter label="Channels" values={options.sources} selected={scope.sources} onChange={(sources) => setScope({ ...scope, sources })} /></div>
          <div className="self-end"><MultiFilter label="Managers" values={options.owners} selected={scope.owners} onChange={(owners) => setScope({ ...scope, owners })} /></div>
          <div className="flex flex-wrap items-center gap-2 md:col-span-2 xl:col-span-4">
            <button type="button" aria-pressed={clean} onClick={() => setClean((v) => !v)} className={`${btn} ${clean ? "!border-blue-300 !bg-blue-50 !text-blue-700" : ""}`}><CheckCircle2 size={14} />{t(clean ? "Clean leads" : "All CRM rows")}</button>
            <select aria-label={t("Lead origin")} value={scope.origin} onChange={(e) => setScope({ ...scope, origin: e.target.value as Scope["origin"] })} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-xs"><option value="all">{t("All origins")}</option><option value="native">{t("Native Kommo only")}</option><option value="migrated">{t("Migrated from PlanFix")}</option></select>
            <Hint text="Migrated means Old Lead ID or the original PlanFix creation field was filled. Native means no migration flag was recorded; it is not independent proof of acquisition in Kommo." />
            <button type="button" onClick={reset} className={btn}><RotateCcw size={14} />{t("Reset all filters")}</button>
            <Hint text="Date filters use original lead creation, not import date. Clean leads consolidate matching email (or phone when email is absent), same service, within 30 days. Names alone never merge people. Duplicate markers never delete the only available lead. PlanFix records and Kommo records are never combined across report modes." />
            <span className="text-xs leading-5 text-slate-500">{t("File")}: {num(dataset.leads.length)} {t("rows")} / {num(cleanup.records.length)} {t("clean")} / {num(cleanup.merged + cleanup.repeatedIds)} {t("duplicate rows")} / {num(cleanup.tests)} {t("explicit tests")}</span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label={t("Report department")} className="inline-flex rounded-md border border-slate-200 bg-white p-1">{(["marketing", "sales"] as const).map((a) => <button role="tab" aria-selected={area === a} type="button" key={a} onClick={() => setArea(a)} className={`inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-semibold ${area === a ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}>{a === "sales" ? <Users size={16} /> : <BarChart3 size={16} />}{t(a === "sales" ? "Sales Report" : "Marketing Report")}</button>)}</div>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={exporting} onClick={() => void exportPdf("current")} className={btn}><Download size={14} />{t("Export this page to PDF")}</button><button type="button" title={t("CSV contains the selected CRM records and contact details in their original language. Share it only with authorized recipients.")} onClick={() => downloadLeadCsv(selected, `kommo-leads_${scope.from}_to_${scope.to}`)} className={btn}><Download size={14} />{t("Export leads CSV")}</button></div>
        </div>
        <nav aria-label={t(area === "marketing" ? "marketing pages" : "sales pages")} className="mt-3 flex flex-wrap border-b border-slate-200">{(area === "marketing" ? MARKETING : SALES).map((tab) => { const Icon = tab.icon; return <button key={tab.id} type="button" aria-current={activePage === tab.id ? "page" : undefined} onClick={() => area === "marketing" ? setMarketingPage(tab.id as MarketingPage) : setSalesPage(tab.id as SalesPage)} className={`inline-flex min-h-12 items-center gap-2 border-b-2 px-3 text-xs font-semibold ${activePage === tab.id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-900"}`}><Icon size={15} />{t(tab.label)}</button>; })}</nav>
        {noClosedHistory && <p className="mt-3 text-xs leading-5 text-amber-800">{t("Open-stage snapshot: closed-won / closed-lost leads are absent. Conversion and CAC describe the exported population; full historical performance requires an export including closed leads.")}</p>}
        {area === "sales" && <div className="my-4 flex flex-wrap items-center gap-4 text-xs text-slate-600"><label className="flex items-center gap-2">{t("First-contact SLA")}<input aria-label={t("First-contact SLA minutes")} type="number" min={1} max={10080} value={sla} onChange={(e) => setSla(Math.min(10080, Math.max(1, Number(e.target.value) || 1)))} className="w-20 rounded border border-slate-300 bg-white p-2" />{t("min")}</label><label className="flex items-center gap-2">{t("Stale after")}<input aria-label={t("Stale opportunity days")} type="number" min={1} max={365} value={staleDays} onChange={(e) => setStaleDays(Math.min(365, Math.max(1, Number(e.target.value) || 1)))} className="w-16 rounded border border-slate-300 bg-white p-2" />{t("days")}</label><Hint text="These thresholds control the action queue and SLA comparisons. They are management settings, not targets contained in the export. Elapsed time is in calendar hours, not working hours." /></div>}
        <div className="mt-5 space-y-5" data-active-report={`${area}-${activePage}`}>
          {selected.length || (area === "marketing" && (marketingPage === "finance" || marketingPage === "quality")) ? renderPage(area, activePage) : <div className="border border-slate-200 bg-white px-5 py-12 text-center"><h2 className="text-base font-semibold">{t("No leads match these filters")}</h2><button onClick={reset} type="button" className={`${btn} mt-4`}><RotateCcw size={14} />{t("Reset all filters")}</button></div>}
        </div>
      </>}
    </div>
    {exportMode && dataset && <div ref={pdfRoot} className="kommo-pdf-root absolute left-[-20000px] top-0 w-[1280px] bg-white p-5" data-report-title={`De Civitate / Kommo / ${period}`} aria-hidden="true">
      {(exportMode === "all" ? [...MARKETING.map((tab) => ({ area: "marketing" as const, ...tab })), ...SALES.map((tab) => ({ area: "sales" as const, ...tab }))] : [{ area, id: activePage, label: activeLabel }]).map((tab) => <section key={`${tab.area}-${tab.id}`} data-report-section className="space-y-5 pb-5"><h2 className="text-xl font-semibold">{t(tab.area === "marketing" ? "Marketing" : "Sales")} / {t(tab.label)}</h2><div data-report-block data-report-context className="border-b border-slate-200 pb-3 text-xs leading-6 text-slate-600">{num(selected.length)} {t(clean ? "clean leads" : "CRM rows")} | {scope.services.map((service) => t(service)).join(", ") || t("All services")} | {scope.sources.map((source) => t(source)).join(", ") || t("All channels")} | {scope.owners.join(", ") || t("All managers")} | {t("Snapshot")} {isoDay(asOf)} | {t(originLabel)}{tab.area === "sales" ? ` | SLA ${sla} ${t("min")} | ${t("Stale")} ${staleDays} ${t("days")}` : ""}{noClosedHistory && <p className="text-amber-800">{t("Open-stage snapshot. Closed-won/lost history is absent; conversions and CAC cover this export only.")}</p>}</div>{renderPage(tab.area, tab.id)}</section>)}
    </div>}
  </main>;
}
