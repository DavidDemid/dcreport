"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, Search, Table2, X } from "lucide-react";
import { evidenceCsv, searchEvidence, type EvidenceRow, type EvidenceSource, type MetricEvidence } from "@/lib/metric-evidence";
import { useReportLanguage } from "./report-language";

const COPY = {
  en: {
    data: "Data", close: "Close data panel", formula: "Calculation", fields: "Fields used", scope: "Current selection",
    matched: "Contributing leads", base: "Calculation base", raw: "Original CRM records", unassessed: "Unassessed", notRelevant: "Not relevant", search: "Search by ID, name, owner or field value",
    export: "Export CSV", copy: "Copy lead ID", copied: "ID copied", empty: "No records match this search.",
    missing: "Not filled", owner: "Owner", service: "Service", source: "Channel", stage: "Stage", relevancy: "Relevancy", created: "Created",
    identifiers: "CRM IDs in this history", inspect: "Fields and source IDs", previous: "Previous page", next: "Next page",
    shown: "Shown", of: "of", page: "Page", rawNote: "Source history may include records created outside the selected period. These are supporting records, not additional leads in the KPI.",
    privacy: "CSV includes CRM contact details. Share only with authorized recipients.", unavailable: "Clipboard unavailable. Select the visible ID and copy it manually.",
    fraction: "Contributing leads / calculation base", total: "Records in this calculation", searchTotal: "Search results", zero: "No records in this calculation.", allFields: "All available record fields", sourceNote: "About these records",
  },
  ru: {
    data: "Данные", close: "Закрыть панель данных", formula: "Как считается", fields: "Поля расчёта", scope: "Текущий срез",
    matched: "Лиды в показателе", base: "База расчёта", raw: "Исходные записи CRM", unassessed: "Без оценки", notRelevant: "Нерелевантные", search: "Поиск по ID, имени, менеджеру или значению поля",
    export: "Скачать CSV", copy: "Скопировать ID лида", copied: "ID скопирован", empty: "По этому запросу записей нет.",
    missing: "Не заполнено", owner: "Менеджер", service: "Услуга", source: "Канал", stage: "Статус", relevancy: "Релевантность", created: "Создан",
    identifiers: "ID записей CRM в этой истории", inspect: "Поля и исходные ID", previous: "Предыдущая страница", next: "Следующая страница",
    shown: "Показано", of: "из", page: "Страница", rawNote: "В исходной истории могут быть записи, созданные вне выбранного периода. Они объясняют объединение, но не добавляют лидов в KPI.",
    privacy: "CSV содержит контактные данные CRM. Передавайте его только тем, у кого есть доступ к этим данным.", unavailable: "Буфер обмена недоступен. Выделите видимый ID и скопируйте вручную.",
    fraction: "Лиды в показателе / база расчёта", total: "Записей в расчёте", searchTotal: "Результаты поиска", zero: "В этом расчёте нет записей.", allFields: "Все доступные поля записи", sourceNote: "Об источнике этих записей",
  },
};
const smallButton = "inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40";

function RecordDetails({ row, fields }: { row: EvidenceRow; fields: string[] }) {
  const { language, t } = useReportLanguage();
  const c = COPY[language];
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  async function copyId() {
    try { await navigator.clipboard.writeText(row.id); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  }
  return <details className="group border-b border-slate-200 last:border-0" data-evidence-row={row.key}>
    <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-5 py-4 hover:bg-slate-50 focus-visible:outline-blue-600">
      <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold text-slate-950" translate="no">{row.name || `ID ${row.id}`}</span>
        <span className="mt-1 block break-words text-xs leading-5 text-slate-500"><span translate="no">ID {row.id} · {row.owner || c.missing}</span> · {row.created || c.missing}</span>
        <span className="mt-1 block break-words text-xs leading-5 text-slate-600">{t(row.service)} · {t(row.source)}</span>
      </span>
      <span className="min-w-0 max-w-[36%] text-right"><span className="block break-words text-xs font-medium leading-5 text-slate-700" translate="no">{row.relevancy || c.missing}</span><span className="block break-words text-xs leading-5 text-slate-500" translate="no">{row.stage}</span><ChevronDown size={15} className="ml-auto mt-1 text-slate-400 group-open:rotate-180" aria-label={c.inspect} /></span>
    </summary>
    <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-500">{c.identifiers}</p><p data-evidence-ids className="mt-1 break-words font-mono text-xs leading-5 text-slate-900" translate="no">{[...new Set([...row.mergedIds, row.id])].join(", ")}</p></div><button type="button" onClick={() => void copyId()} className={smallButton} aria-label={c.copy}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? c.copied : "ID"}</button></div>
      {copyError && <p role="status" className="mb-3 text-xs text-amber-800">{c.unavailable}</p>}
      <dl className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">{[
        [c.owner, row.owner], [c.service, row.service], [c.source, row.source], [c.stage, row.stage], [c.relevancy, row.relevancy], [c.created, row.created],
        ...Object.entries(row.fields).filter(([field]) => fields.includes(field)),
      ].map(([field, value], index) => <div key={`${field}-${index}`} className="min-w-0"><dt className="break-words text-[11px] font-medium leading-4 text-slate-500">{field}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-900" translate="no">{value || c.missing}</dd></div>)}</dl>
      <details className="mt-4 border-t border-slate-200 pt-3"><summary className="cursor-pointer text-xs font-medium text-blue-700">{c.allFields}</summary><dl className="mt-3 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">{Object.entries(row.fields).filter(([field]) => !fields.includes(field)).map(([field, value]) => <div key={field} className="min-w-0"><dt className="break-words text-[11px] font-medium leading-4 text-slate-500">{field}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-900" translate="no">{value || c.missing}</dd></div>)}</dl></details>
    </div>
  </details>;
}

export function MetricDataDrawer({ evidence, onClose }: { evidence: MetricEvidence; onClose: () => void }) {
  const { language, locale, t } = useReportLanguage();
  const c = COPY[language];
  const titleId = useId();
  const descriptionId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const scrollBody = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState("matched");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const tabs = useMemo(() => [
    { id: "matched", label: c.matched, rows: evidence.rows },
    ...(evidence.baseRows ? [{ id: "base", label: c.base, rows: evidence.baseRows }] : []),
    ...(evidence.segments ?? []).map((segment) => ({ ...segment, label: segment.id === "unassessed" ? c.unassessed : segment.id === "notRelevant" ? c.notRelevant : t(segment.label) })),
    ...(evidence.rawRows ? [{ id: "raw", label: c.raw, rows: evidence.rawRows }] : []),
  ], [evidence, c, t]);
  const active = tabs.find((item) => item.id === tab) ?? tabs[0];
  const results = useMemo(() => searchEvidence(active.rows, query), [active.rows, query]);
  const pageSize = 25;
  const pages = Math.max(1, Math.ceil(results.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const visible = results.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const format = (value: number) => new Intl.NumberFormat(locale).format(value);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    closeButton.current?.focus();
    return () => { element.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);

  function changeTab(id: string) { setTab(id); setQuery(""); setPage(0); scrollBody.current?.scrollTo({ top: 0 }); }
  function download() {
    const url = URL.createObjectURL(new Blob([evidenceCsv(results)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url;
    link.download = `crm-metric-data_${active.id}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return createPortal(<dialog ref={dialog} aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === dialog.current) onClose(); }} className="metric-data-drawer pdf-ignore fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/35 sm:w-[min(92vw,800px)] xl:w-[55vw] xl:max-w-[1000px]">
    <div className="flex h-full min-w-0 flex-col" onClick={(event) => event.stopPropagation()}>
      <header className="max-h-[38dvh] shrink-0 overflow-y-auto border-b border-slate-200 px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="mb-1 text-xs font-medium text-blue-700">{c.data}</p><h2 id={titleId} className="break-words text-lg font-semibold leading-6">{t(evidence.title)}</h2></div><button type="button" ref={closeButton} onClick={onClose} aria-label={c.close} title={c.close} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50"><X size={19} /></button></div>
        <p id={descriptionId} className="mt-3 text-sm leading-6 text-slate-600">{t(evidence.description)}</p>
        <div className="mt-3 border-l-2 border-blue-500 bg-blue-50 px-3 py-2"><p className="text-[11px] font-semibold text-blue-800">{c.formula}</p><p className="mt-1 break-words text-xs leading-5 text-blue-950">{t(evidence.formula)}</p>{evidence.numerator !== undefined && <p data-evidence-count className="mt-1 text-sm font-semibold tabular-nums text-blue-950">{format(evidence.numerator)}{evidence.denominator !== undefined ? ` / ${format(evidence.denominator)}` : ""}</p>}</div>
        {evidence.scope && <details className="mt-2 text-xs leading-5 text-slate-500"><summary className="cursor-pointer font-medium">{c.scope}</summary><p className="mt-1 break-words">{t(evidence.scope)}</p></details>}
      </header>
      <div className="max-h-[30dvh] shrink-0 overflow-y-auto border-b border-slate-200 px-5 py-3">
        <label className="flex min-h-10 items-center gap-2 rounded-md border border-slate-300 px-3"><Search size={16} className="shrink-0 text-slate-400" /><input type="search" aria-label={c.search} placeholder={c.search} value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} className="h-10 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-xs" /></label>
        <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label={c.data}>{tabs.map((item) => <button type="button" key={item.id} aria-pressed={active.id === item.id} onClick={() => changeTab(item.id)} className={`min-h-9 rounded-md border px-2 py-1 text-xs leading-5 ${active.id === item.id ? "border-blue-500 bg-blue-50 font-semibold text-blue-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{item.label} <span className="tabular-nums">({format(item.rows.length)})</span></button>)}</div>
      </div>
      <div ref={scrollBody} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3"><p className="text-xs font-medium leading-5 text-slate-600">{c.fields}: <span className="font-normal" translate="no">{evidence.fields.join(", ")}</span></p>{evidence.notice && <details className="mt-2 text-xs leading-5 text-slate-500"><summary className="cursor-pointer font-medium text-slate-600">{c.sourceNote}</summary><p className="mt-2">{t(evidence.notice)}</p></details>}{active.id === "raw" && <p className="mt-2 text-xs leading-5 text-amber-800">{c.rawNote}</p>}</div>
        <div aria-live="polite" className="px-5 py-3 text-xs text-slate-500">{query ? c.searchTotal : active.label}: {format(results.length)}</div>
        {visible.map((row) => <RecordDetails key={`${active.id}-${row.key}`} row={row} fields={evidence.fields} />)}
        {!visible.length && <p className="px-5 py-10 text-center text-sm text-slate-500">{query ? c.empty : c.zero}</p>}
      </div>
      <footer className="shrink-0 border-t border-slate-200 bg-white px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs tabular-nums text-slate-500">{c.shown} {results.length ? format(currentPage * pageSize + 1) : "0"}–{format(Math.min((currentPage + 1) * pageSize, results.length))} {c.of} {format(results.length)}</p><div className="flex items-center gap-2"><button type="button" title={c.privacy} onClick={download} disabled={!results.length} className={smallButton}><Download size={14} />{c.export}</button><button type="button" aria-label={c.previous} title={c.previous} disabled={currentPage === 0} onClick={() => { setPage(currentPage - 1); scrollBody.current?.scrollTo({ top: 0 }); }} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 disabled:opacity-40"><ChevronLeft size={16} /></button><span className="text-xs tabular-nums text-slate-600">{currentPage + 1}/{pages}</span><button type="button" aria-label={c.next} title={c.next} disabled={currentPage + 1 >= pages} onClick={() => { setPage(currentPage + 1); scrollBody.current?.scrollTo({ top: 0 }); }} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 disabled:opacity-40"><ChevronRight size={16} /></button></div></div>
      </footer>
    </div>
  </dialog>, document.body);
}

export function EvidenceButton({ evidence, compact = false }: { evidence: EvidenceSource; compact?: boolean }) {
  const { language } = useReportLanguage();
  const [open, setOpen] = useState<MetricEvidence | null>(null);
  const label = COPY[language].data;
  return <span className="pdf-ignore mt-3 block"><button type="button" title={label} onClick={() => setOpen(typeof evidence === "function" ? evidence() : evidence)} className={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white py-1 text-xs font-semibold text-blue-700 hover:border-blue-300 hover:bg-blue-50 ${compact ? "h-8 w-8" : "px-2.5"}`} aria-haspopup="dialog"><Table2 size={14} /><span className={compact ? "sr-only" : undefined}>{label}</span></button>{open && <MetricDataDrawer evidence={open} onClose={() => setOpen(null)} />}</span>;
}
