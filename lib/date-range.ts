export type DateRange = { from: string; to: string };

export const DATE_RANGE_PRESETS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 days" },
  { id: "last14", label: "Last 14 days" },
  { id: "last30", label: "Last 30 days" },
  { id: "thismonth", label: "This month" },
  { id: "lastmonth", label: "Last month" },
  { id: "last3months", label: "Last 3 months" },
  { id: "thisyear", label: "This year" },
  { id: "alltime", label: "All time" },
] as const;

export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number]["id"];

export function parseISODate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

export function isoDate(date: Date): string {
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 1 && date.getUTCFullYear() <= 9999
    ? date.toISOString().slice(0, 10) : "";
}

export function localISODate(date: Date): string {
  const day = new Date(0);
  day.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  return isoDate(day);
}

export function addDays(value: string, days: number): string {
  const date = parseISODate(value);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

export function startOfMonth(value: string): string {
  return parseISODate(value) ? `${value.slice(0, 7)}-01` : "";
}

export function addMonths(value: string, months: number): string {
  const date = parseISODate(value);
  if (!date) return "";
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const end = new Date(date);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(day, end.getUTCDate()));
  return isoDate(date);
}

export function dateRangeError(range: DateRange, maxDay?: string): string | null {
  if ((range.from && !parseISODate(range.from)) || (range.to && !parseISODate(range.to))) {
    return "Enter a valid date in each field.";
  }
  if (range.from && range.to && range.from > range.to) return "From date must be on or before To date.";
  if (maxDay !== undefined) {
    if (!parseISODate(maxDay)) return "Enter a valid maximum date.";
    if (range.from > maxDay || range.to > maxDay) return `Dates must be on or before ${maxDay}.`;
  }
  return null;
}

/** Limit endpoints to maxDay; an open end becomes the explicit maximum. */
export function clampDateRange(range: DateRange, maxDay: string): DateRange {
  if (!parseISODate(maxDay)) return { ...range };
  return { from: range.from > maxDay ? maxDay : range.from, to: !range.to || range.to > maxDay ? maxDay : range.to };
}

// Bounds describe the export, not selection limits. Finance can predate the CRM.
export function presetDateRange(preset: DateRangePreset, anchorDate: string, bounds?: DateRange, maxDay?: string): DateRange {
  if (maxDay && parseISODate(maxDay)) {
    const anchor = parseISODate(anchorDate) && anchorDate > maxDay ? maxDay : anchorDate;
    return clampDateRange(presetDateRange(preset, anchor, bounds), maxDay);
  }
  if (preset === "alltime") return bounds && !dateRangeError(bounds) ? { ...bounds } : { from: "", to: "" };
  if (!parseISODate(anchorDate)) return { from: "", to: "" };
  const month = startOfMonth(anchorDate);
  switch (preset) {
    case "today": return { from: anchorDate, to: anchorDate };
    case "yesterday": return { from: addDays(anchorDate, -1) || anchorDate, to: addDays(anchorDate, -1) || anchorDate };
    case "last7": return { from: addDays(anchorDate, -6) || "0001-01-01", to: anchorDate };
    case "last14": return { from: addDays(anchorDate, -13) || "0001-01-01", to: anchorDate };
    case "last30": return { from: addDays(anchorDate, -29) || "0001-01-01", to: anchorDate };
    case "thismonth": return { from: month, to: anchorDate };
    case "lastmonth": return { from: addMonths(month, -1) || month, to: addDays(month, -1) || anchorDate };
    case "last3months": return { from: addMonths(month, -3) || "0001-01-01", to: addDays(month, -1) || anchorDate };
    case "thisyear": return { from: `${anchorDate.slice(0, 4)}-01-01`, to: anchorDate };
  }
}

export function calendarDays(month: string): (string | null)[] {
  const date = parseISODate(startOfMonth(month));
  if (!date) return [];
  const offset = (date.getUTCDay() + 6) % 7;
  const end = new Date(date);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= end.getUTCDate() ? `${month.slice(0, 7)}-${String(day).padStart(2, "0")}` : null;
  });
}

const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function formatDateRange(range: DateRange): string {
  const from = parseISODate(range.from);
  const to = parseISODate(range.to);
  if (!from && !to) return "All time";
  if (from && to && range.from === range.to) return shortDate.format(from);
  return `${from ? shortDate.format(from) : "Start"} - ${to ? shortDate.format(to) : "Present"}`;
}
