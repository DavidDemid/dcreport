"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import clsx from "clsx";
import {
  addDays, addMonths, calendarDays, clampDateRange, DATE_RANGE_PRESETS, dateRangeError, formatDateRange,
  localISODate, parseISODate, presetDateRange, startOfMonth,
} from "@/lib/date-range";
import type { DateRange, DateRangePreset } from "@/lib/date-range";
import { translateReportNode, useReportLanguage } from "./report-language";

export type { DateRange } from "@/lib/date-range";
export type DateRangePickerProps = {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Export extent for All time; capped at browser-local today, not a historical selection limit. */
  bounds?: DateRange;
  /** ISO day used by relative presets; defaults to the browser's local calendar date. */
  anchorDate?: string;
  disabled?: boolean;
};

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";
const iconButton = `inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30 ${focusRing}`;

export function DateRangePicker({ value, onChange, bounds, anchorDate, disabled = false }: DateRangePickerProps) {
  const { t, locale, language } = useReportLanguage();
  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, index, 1)))), [locale]);
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 5, 1 + index));
    return { long: new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(date), short: new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(date) };
  }), [locale]);
  const dayLabel = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }), [locale]);
  const shortDate = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }), [locale]);
  function formatRange(range: DateRange) {
    if (language === "en") return formatDateRange(range);
    const from = parseISODate(range.from), to = parseISODate(range.to);
    if (!from && !to) return t("All time");
    if (from && to && range.from === range.to) return shortDate.format(from);
    return `${from ? shortDate.format(from) : t("Start")} - ${to ? shortDate.format(to) : t("No end date")}`;
  }
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(value);
  const [invalidInputs, setInvalidInputs] = useState({ from: false, to: false });
  const [month, setMonth] = useState("");
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [hoverDay, setHoverDay] = useState("");
  const [focusedDay, setFocusedDay] = useState("");
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const today = localISODate(new Date());
  const latestMonth = startOfMonth(today);
  const anchor = anchorDate && parseISODate(anchorDate) && anchorDate < today ? anchorDate : today;
  const futureInput = Boolean((parseISODate(draft.from) && draft.from > today) || (parseISODate(draft.to) && draft.to > today));
  const error = futureInput ? language === "ru" ? "Нельзя выбрать дату позже сегодняшнего дня." : "Dates cannot be later than today."
    : invalidInputs.from || invalidInputs.to ? "Enter a valid date in each field." : dateRangeError(draft, today);
  const selectedPreset = DATE_RANGE_PRESETS.find(({ id: preset }) => {
    const range = presetDateRange(preset, anchor, bounds, today);
    return draft.from === range.from && draft.to === range.to;
  })?.id || "custom";

  function close() {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }

  function show() {
    const range = clampDateRange(value, today);
    const firstDay = [range.from, range.to, anchor].find((day) => parseISODate(day)) || today;
    setDraft(range);
    setInvalidInputs({ from: false, to: false });
    setMonth(startOfMonth(firstDay));
    setFocusedDay(firstDay);
    setSelectingEnd(false);
    setHoverDay("");
    setOpen(true);
  }

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useLayoutEffect(() => {
    if (!open) return;
    function reposition() {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const rect = trigger.getBoundingClientRect();
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const x = viewport?.offsetLeft ?? 0;
      const y = viewport?.offsetTop ?? 0;
      panel.style.maxHeight = `${Math.max(120, height - 16)}px`;
      panel.style.maxWidth = `${Math.max(0, width - 16)}px`;
      const panelRect = panel.getBoundingClientRect();
      const below = rect.bottom + 8;
      const above = rect.top - panelRect.height - 8;
      setPosition({
        left: Math.max(x + 8, Math.min(rect.right - panelRect.width, x + width - panelRect.width - 8)),
        top: below + panelRect.height <= y + height - 8 ? below : above >= y + 8 ? above : y + 8,
      });
    }
    reposition();
    fromRef.current?.focus({ preventScroll: true });
    const observer = new ResizeObserver(reposition);
    if (panelRef.current) observer.observe(panelRef.current);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    window.visualViewport?.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("scroll", reposition);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.visualViewport?.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("scroll", reposition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) {
        setOpen(false);
        const focusTarget = event.target instanceof Element
          ? event.target.closest("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex], [contenteditable='true']") : null;
        if (!focusTarget) {
          event.preventDefault();
          triggerRef.current?.focus({ preventScroll: true });
        }
      }
    }
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);

  function panelKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
    if (event.key === "Tab") {
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex='0']") || [])
        .filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }

  function choosePreset(preset: DateRangePreset) {
    const range = presetDateRange(preset, anchor, bounds, today);
    setDraft(range);
    setInvalidInputs({ from: false, to: false });
    const day = range.from || range.to || anchor;
    setMonth(startOfMonth(day));
    setFocusedDay(day);
    setSelectingEnd(false);
    setHoverDay("");
  }

  function editDate(key: keyof DateRange, day: string, valid: boolean) {
    setDraft((current) => ({ ...current, [key]: day }));
    setInvalidInputs((current) => ({ ...current, [key]: !valid }));
    setSelectingEnd(false);
    setHoverDay("");
    if (parseISODate(day)) {
      const focus = day > today ? today : day;
      setMonth(startOfMonth(focus));
      setFocusedDay(focus);
    }
  }

  function chooseDay(day: string) {
    if (disabled || !parseISODate(day) || day > today) return;
    setInvalidInputs({ from: false, to: false });
    if (selectingEnd && draft.from) {
      setDraft({ from: day < draft.from ? day : draft.from, to: day < draft.from ? draft.from : day });
      setSelectingEnd(false);
    } else {
      setDraft({ from: day, to: day });
      setSelectingEnd(true);
    }
    setFocusedDay(day);
    setHoverDay("");
  }

  function focusDate(day: string) {
    if (!parseISODate(day)) return;
    if (day > today) day = today;
    setFocusedDay(day);
    const twoMonths = window.matchMedia("(min-width: 768px)").matches;
    const endMonth = twoMonths ? addMonths(month, 1) || month : month;
    if (day < month || startOfMonth(day) > endMonth) setMonth(startOfMonth(day));
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLButtonElement>(`[data-date="${day}"]:not(:disabled)`)?.focus());
  }

  function dayKeys(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    const date = parseISODate(day)!;
    const offset = (date.getUTCDay() + 6) % 7;
    const next = {
      ArrowLeft: () => addDays(day, -1), ArrowRight: () => addDays(day, 1),
      ArrowUp: () => addDays(day, -7), ArrowDown: () => addDays(day, 7),
      Home: () => addDays(day, -offset), End: () => addDays(day, 6 - offset),
      PageUp: () => addMonths(day, event.shiftKey ? -12 : -1),
      PageDown: () => addMonths(day, event.shiftKey ? 12 : 1),
    }[event.key];
    if (next) { event.preventDefault(); focusDate(next()); }
  }

  function jumpMonth(visibleMonth: string, offset: number) {
    if (!parseISODate(visibleMonth) || startOfMonth(visibleMonth) > latestMonth) return;
    const next = addMonths(startOfMonth(visibleMonth), -offset);
    if (next) { setMonth(next); setFocusedDay(visibleMonth); }
  }

  function calendar(visibleMonth: string, offset: number) {
    if (!visibleMonth) return null;
    const year = Number(visibleMonth.slice(0, 4));
    const monthIndex = Number(visibleMonth.slice(5, 7)) - 1;
    const label = `${months[monthIndex]} ${year}`;
    const futureMonth = visibleMonth > latestMonth;
    const maxYear = Number(today.slice(0, 4));
    const maxMonthIndex = Number(today.slice(5, 7)) - 1;
    const years = [anchor, today, draft.from, draft.to, bounds?.from, bounds?.to, visibleMonth]
      .filter((day): day is string => Boolean(day && parseISODate(day))).map((day) => Number(day.slice(0, 4)));
    const minYear = Math.min(1900, ...years);
    const days = calendarDays(visibleMonth);
    const selectable = days.filter((day): day is string => Boolean(day && day <= today));
    const tabDay = [focusedDay, draft.from, today, visibleMonth].find((day) => selectable.includes(day)) || selectable[0];
    const nextMonth = addMonths(visibleMonth, 1);
    const preview = selectingEnd && hoverDay ? { from: hoverDay < draft.from ? hoverDay : draft.from, to: hoverDay < draft.from ? draft.from : hoverDay } : draft;
    return <section key={offset} aria-label={`${offset ? "Second" : "First"} calendar`} className={clsx("min-w-0", offset === 1 && "hidden md:block")}>
      <div className="mb-3 flex items-center gap-1">
        <button type="button" title="Previous month" aria-label={`Previous month, ${offset ? "second" : "first"} calendar`} disabled={!addMonths(month, -1)} onClick={() => jumpMonth(addMonths(visibleMonth, -1), offset)} className={iconButton}><ChevronLeft size={16} aria-hidden="true" /></button>
        {futureMonth ? <div className="flex h-9 min-w-0 flex-1 items-center justify-center text-sm font-semibold text-slate-500">{label}</div> : <>
          <select aria-label={`Month, ${offset ? "second" : "first"} calendar`} value={monthIndex} onChange={(event) => jumpMonth(`${String(year).padStart(4, "0")}-${String(Number(event.target.value) + 1).padStart(2, "0")}-01`, offset)} className={`h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-1 text-sm font-semibold text-slate-800 ${focusRing}`}>
            {months.map((name, index) => (year < maxYear || index <= maxMonthIndex) && <option key={name} value={index}>{name}</option>)}
          </select>
          <select aria-label={`Year, ${offset ? "second" : "first"} calendar`} value={year} onChange={(event) => jumpMonth(`${event.target.value.padStart(4, "0")}-${String(Number(event.target.value) === maxYear ? Math.min(monthIndex, maxMonthIndex) + 1 : monthIndex + 1).padStart(2, "0")}-01`, offset)} className={`h-9 w-[76px] shrink-0 rounded-md border border-slate-200 bg-white px-1 text-sm font-semibold text-slate-800 ${focusRing}`}>
            {Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </>}
        <button type="button" title="Next month" aria-label={`Next month, ${offset ? "second" : "first"} calendar`} disabled={!nextMonth || nextMonth > latestMonth} onClick={() => jumpMonth(nextMonth, offset)} className={iconButton}><ChevronRight size={16} aria-hidden="true" /></button>
      </div>
      <table role="grid" aria-label={label} className="w-full table-fixed border-collapse text-center text-sm" onMouseLeave={() => setHoverDay("")}>
        <thead><tr>{weekdays.map((name) => <th key={name.long} scope="col" abbr={name.long} className="h-8 text-xs font-medium text-slate-500"><span aria-hidden="true">{language === "en" ? name.short.slice(0, 2) : name.short}</span><span className="sr-only">{name.long}</span></th>)}</tr></thead>
        <tbody>{Array.from({ length: 6 }, (_, row) => <tr key={row}>{days.slice(row * 7, row * 7 + 7).map((day, column) => {
          const available = Boolean(day && day <= today);
          const endpoint = available && (day === preview.from || day === preview.to);
          const inRange = Boolean(available && day && preview.from && preview.to && day >= preview.from && day <= preview.to);
          return <td key={column} aria-selected={day ? inRange : undefined} className={clsx("h-9 p-0", inRange && "bg-blue-50", day === preview.from && "rounded-l-md", day === preview.to && "rounded-r-md")}>
            {day && <button type="button" data-date={day} disabled={!available} aria-label={dayLabel.format(parseISODate(day)!)} aria-current={day === today ? "date" : undefined} tabIndex={day === tabDay ? 0 : -1} onClick={() => chooseDay(day)} onFocus={() => setFocusedDay(day)} onMouseEnter={() => available && selectingEnd && setHoverDay(day)} onKeyDown={(event) => dayKeys(event, day)} className={clsx("relative mx-auto flex h-9 w-full max-w-10 items-center justify-center rounded-md font-medium disabled:cursor-not-allowed disabled:opacity-30", focusRing, endpoint ? "bg-blue-700 text-white hover:bg-blue-800" : available ? "text-slate-700 hover:bg-blue-100" : "text-slate-400", day === today && !endpoint && "font-bold text-blue-700 underline decoration-blue-500 underline-offset-4")}>{Number(day.slice(8))}</button>}
          </td>;
        })}</tr>)}</tbody>
      </table>
    </section>;
  }

  function apply() {
    const maxDay = localISODate(new Date());
    if (error || disabled || dateRangeError(draft, maxDay) || (fromRef.current && !fromRef.current.validity.valid) || (toRef.current && !toRef.current.validity.valid)) return;
    onChange(clampDateRange(draft, maxDay));
    close();
  }

  const dayCount = draft.from && draft.to && !error ? Math.round((parseISODate(draft.to)!.getTime() - parseISODate(draft.from)!.getTime()) / 86400000) + 1 : null;

  return translateReportNode(<>
    <button ref={triggerRef} type="button" aria-label="Date range" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} title={`Relative date preset reference: ${anchor}`} disabled={disabled} onClick={() => open ? close() : show()} className={`inline-flex h-10 max-w-full items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}>
      <CalendarDays size={16} className="shrink-0" aria-hidden="true" /><span className="min-w-0 truncate">{formatRange(value)}</span><ChevronDown size={14} className="shrink-0" aria-hidden="true" />
    </button>
    {open && createPortal(translateReportNode(<div ref={panelRef} id={id} role="dialog" lang={language} aria-label="Date range" aria-describedby={`${id}-status`} onKeyDown={panelKeys} onClickCapture={(event) => {
      // Safari leaves focus in native date editors when clicking a button.
      if (event.target instanceof Element) event.target.closest("button")?.focus({ preventScroll: true });
    }} style={position} className="fixed z-50 w-[360px] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white text-slate-800 shadow-xl md:w-[780px]">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2"><div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1"><h2 className="text-sm font-semibold">Date range</h2>{anchor !== today && <p className="text-xs text-slate-500">Reference: <time dateTime={anchor}>{formatRange({ from: anchor, to: anchor })}</time></p>}</div><button type="button" aria-label="Cancel date selection" title="Cancel date selection" onClick={close} className={iconButton}><X size={16} aria-hidden="true" /></button></div>
      <div className="md:grid md:grid-cols-[144px_minmax(0,1fr)]">
        <aside aria-label="Date presets" className="hidden border-r border-slate-200 p-2 md:block">
          {DATE_RANGE_PRESETS.map(({ id: preset, label }) => <button key={preset} type="button" aria-pressed={selectedPreset === preset} onClick={() => choosePreset(preset)} title={preset === "last3months" ? "Previous 3 complete calendar months" : undefined} className={clsx("flex min-h-9 w-full items-center justify-between gap-1 rounded-md px-3 py-2 text-left text-sm", focusRing, selectedPreset === preset ? "bg-blue-50 font-semibold text-blue-800" : "text-slate-600 hover:bg-slate-50")}>{label}{selectedPreset === preset && <Check size={14} className="shrink-0" aria-hidden="true" />}</button>)}
        </aside>
        <div className="min-w-0 p-3 sm:p-4">
          <select aria-label="Date preset" value={selectedPreset} onChange={(event) => event.target.value !== "custom" && choosePreset(event.target.value as DateRangePreset)} className={`mb-3 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm md:hidden ${focusRing}`}><option value="custom">Custom dates</option>{DATE_RANGE_PRESETS.map(({ id: preset, label }) => <option key={preset} value={preset}>{label}</option>)}</select>
          <div className="mb-4 grid grid-cols-2 gap-3">
            {(["from", "to"] as const).map((key) => <label key={key} className="grid min-w-0 gap-1 text-xs font-semibold text-slate-600">{key === "from" ? "From" : "To"}<input ref={key === "from" ? fromRef : toRef} aria-label={key === "from" ? "From date" : "To date"} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} type="date" min="0001-01-01" max={today} value={draft[key]} onChange={(event) => editDate(key, event.target.value, event.target.validity.valid)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); apply(); } }} className={`h-10 w-full min-w-0 max-w-full rounded-md border border-slate-300 bg-white px-2 text-sm font-medium text-slate-800 ${focusRing}`} /></label>)}
          </div>
          <div className="grid min-w-0 gap-5 md:grid-cols-2">{calendar(month, 0)}{calendar(addMonths(month, 1), 1)}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
        <div className="min-w-0 text-xs" aria-live="polite" aria-atomic="true"><span id={`${id}-status`} className="text-slate-500">{selectingEnd ? "Select an end date" : dayCount ? `${dayCount.toLocaleString(locale)} ${dayCount === 1 ? "day" : "days"}` : "All available dates"}</span>{error && <p id={`${id}-error`} className="mt-1 text-red-700">{error}</p>}</div>
        <div className="ml-auto flex items-center gap-2"><button type="button" onClick={close} className={`h-9 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 ${focusRing}`}>Cancel</button><button type="button" aria-label="Apply dates" disabled={Boolean(error) || disabled} onClick={apply} className={`h-9 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}>Apply</button></div>
      </div>
    </div>, t), document.body)}
  </>, t);
}
