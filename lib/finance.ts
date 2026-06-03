import * as XLSX from "xlsx";

type RawCell = string | number | boolean | Date | null | undefined;

export type FinanceMonthlyRecord = {
  month: string;
  revenue: number;
  marketingCost: number;
  profitAfterMarketing: number;
  signedContracts: number;
  clicks?: number;
  leads?: number;
  paidTrafficCost?: number;
  sales?: number;
  planProfitAfterMarketing?: number;
  planProfitAfterMarketing3MonthAverage?: number;
  planRevenue?: number;
  planRevenue3MonthAverage?: number;
  planSales?: number;
  planSales3MonthAverage?: number;
  planMarketingCost?: number;
  planMarketingCost3MonthAverage?: number;
  avgProfitAfterMarketing?: number;
  avgRevenue?: number;
  avgSales?: number;
  avgMarketingCost?: number;
  avgPaidTrafficCost?: number;
  avgSignedContracts?: number;
  avgLeads?: number;
  avgClicks?: number;
  ltContracts?: number;
  lvContracts?: number;
  rbiContracts?: number;
};

export type FinanceChannelCostRecord = {
  month: string;
  category: string;
  source: string;
  amount: number;
};

export type FinanceData = {
  monthly: FinanceMonthlyRecord[];
  channelCosts: FinanceChannelCostRecord[];
};

function text(value: RawCell): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function numberValue(value: RawCell): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(text(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthKey(year: number, zeroBasedMonth: number): string {
  return `${year}-${String(zeroBasedMonth + 1).padStart(2, "0")}`;
}

function excelSerialMonth(value: RawCell): string | null {
  const serial = numberValue(value);
  if (!serial) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 24 * 60 * 60 * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return monthKey(date.getUTCFullYear(), date.getUTCMonth());
}

function normalizeMonth(value: RawCell): number | null {
  const raw = text(value).toLowerCase().replace(".", "");
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const fullMonths = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const shortIndex = months.findIndex((month) => raw.startsWith(month));
  if (shortIndex >= 0) return shortIndex;
  const fullIndex = fullMonths.findIndex((month) => raw.startsWith(month));
  return fullIndex >= 0 ? fullIndex : null;
}

function normalizeFinanceSource(category: string): string {
  const raw = category.toLowerCase();
  if (raw.includes("google") || raw.includes("clickcease")) return "Google Ads";
  if (raw.includes("bing")) return "Bing Ads";
  if (raw.includes("fb") || raw.includes("instagram") || raw.includes("smm")) return "Facebook / Instagram";
  if (raw.includes("seo") || raw.includes("netpeak") || raw.includes("seranking")) return "Organic Search";
  if (raw.includes("bridgewest")) return "Partner";
  return "Other";
}

function actualResultMonthForRow(rowIndex: number, monthCell: RawCell): string | null {
  const month = normalizeMonth(monthCell);
  if (month === null) return null;
  const offset = rowIndex - 2;
  const absoluteMonth = 5 + offset;
  const year = 2022 + Math.floor(absoluteMonth / 12);
  return monthKey(year, month);
}

function marketingCostMonthForColumn(colIndex: number, monthCell: RawCell): string | null {
  const month = normalizeMonth(monthCell);
  if (month === null) return null;

  if (colIndex <= 16) {
    const step = 16 - colIndex;
    const absoluteMonth = step;
    const year = 2025 + Math.floor(absoluteMonth / 12);
    return monthKey(year, month);
  }

  const step = colIndex - 17;
  const absoluteMonth = 5 + step;
  const year = 2022 + Math.floor(absoluteMonth / 12);
  return monthKey(year, month);
}

function parseActualResults(rows: RawCell[][]): FinanceMonthlyRecord[] {
  return rows
    .slice(2)
    .map((row, index) => {
      const month = actualResultMonthForRow(index + 2, row[0]);
      if (!month) return null;
      return {
        month,
        revenue: numberValue(row[1]),
        marketingCost: numberValue(row[2]),
        profitAfterMarketing: numberValue(row[4]),
        signedContracts: numberValue(row[5]),
      };
    })
    .filter((record): record is FinanceMonthlyRecord => Boolean(record));
}

function parseMarketingCosts(rows: RawCell[][]): FinanceChannelCostRecord[] {
  const monthRow = rows[3] ?? [];
  const categoryRows = rows.slice(4);
  const records: FinanceChannelCostRecord[] = [];

  for (const row of categoryRows) {
    const category = text(row[0]);
    if (!category) continue;
    for (let col = 1; col < row.length; col += 1) {
      const month = marketingCostMonthForColumn(col, monthRow[col]);
      const amount = numberValue(row[col]);
      if (!month || !amount) continue;
      records.push({
        month,
        category,
        source: normalizeFinanceSource(category),
        amount,
      });
    }
  }

  return records;
}

function parseMainNumbers(rows: RawCell[][]): FinanceMonthlyRecord[] {
  const monthCells = rows[0]?.slice(1) ?? [];
  const months = monthCells.map(excelSerialMonth);
  const records: FinanceMonthlyRecord[] = [];

  function value(rowIndex: number, colIndex: number): number {
    return numberValue(rows[rowIndex]?.[colIndex + 1]);
  }

  months.forEach((month, index) => {
    if (!month) return;
    records.push({
      month,
      revenue: value(6, index),
      marketingCost: value(12, index),
      profitAfterMarketing: value(1, index),
      signedContracts: value(17, index),
      clicks: value(25, index),
      leads: value(28, index) || value(22, index),
      paidTrafficCost: value(14, index),
      sales: value(9, index),
      planProfitAfterMarketing: value(2, index),
      planProfitAfterMarketing3MonthAverage: value(4, index),
      avgProfitAfterMarketing: value(3, index),
      avgRevenue: value(7, index),
      avgSales: value(10, index),
      avgMarketingCost: value(13, index),
      avgPaidTrafficCost: value(15, index),
      avgSignedContracts: value(18, index),
      avgLeads: value(23, index),
      avgClicks: value(26, index),
      ltContracts: value(19, index),
      lvContracts: value(20, index),
      rbiContracts: Math.max(0, value(17, index) - value(19, index) - value(20, index)),
    });
  });

  return records;
}

function latestMonth(monthly: FinanceMonthlyRecord[]): string | null {
  return monthly.map((record) => record.month).sort((a, b) => b.localeCompare(a))[0] ?? null;
}

function sumRow(row: RawCell[] | undefined, start = 1, end = row?.length ?? 0): number {
  if (!row) return 0;
  let sum = 0;
  for (let index = start; index < end; index += 1) sum += numberValue(row[index]);
  return sum;
}

function parseAnalysisCosts(rows: RawCell[][], month: string | null, monthly: FinanceMonthlyRecord[]): FinanceChannelCostRecord[] {
  if (!month) return [];
  const records: FinanceChannelCostRecord[] = [];
  const current = monthly.find((record) => record.month === month);
  const google = sumRow(rows.find((row) => text(row[0]).toLowerCase() === "google"), 1, 6);
  const bing = sumRow(rows.find((row) => text(row[0]).toLowerCase() === "bing"), 1, 6);
  const facebook = sumRow(rows.find((row) => text(row[0]).toLowerCase() === "facebook"), 1, 6);
  const instagram = sumRow(rows.find((row) => text(row[0]).toLowerCase() === "instagram"), 1, 6);
  const totalSpentRow = rows.find((row) => text(row[0]).toLowerCase() === "total spent");
  const partner = numberValue(totalSpentRow?.[6]);
  const known = google + bing + facebook + instagram + partner;
  const other = Math.max(0, (current?.marketingCost ?? 0) - known);

  const add = (category: string, source: string, amount: number) => {
    if (amount > 0) records.push({ month, category, source, amount });
  };

  add("Google", "Google Ads", google);
  add("Bing", "Bing Ads", bing);
  add("Facebook / Instagram", "Facebook / Instagram", facebook + instagram);
  add("BridgeWest", "Partner", partner);
  add("Other marketing cost", "Other", other);
  return records;
}

export async function parseFinanceWorkbook(file: ArrayBuffer): Promise<FinanceData> {
  const workbook = XLSX.read(file, {
    cellDates: false,
    raw: true,
    type: "array",
  });

  const actualSheet = workbook.Sheets["Actual results"];
  const costSheet = workbook.Sheets["Marketing cost"];
  const mainNumbersSheet = workbook.Sheets["Main numbers"];
  const analysisSheet = workbook.Sheets["1st Analysis"];
  const actualRows = actualSheet
    ? XLSX.utils.sheet_to_json<RawCell[]>(actualSheet, { header: 1, blankrows: false, defval: "", raw: true })
    : [];
  const costRows = costSheet
    ? XLSX.utils.sheet_to_json<RawCell[]>(costSheet, { header: 1, blankrows: false, defval: "", raw: true })
    : [];
  const mainNumbersRows = mainNumbersSheet
    ? XLSX.utils.sheet_to_json<RawCell[]>(mainNumbersSheet, { header: 1, blankrows: false, defval: "", raw: true })
    : [];
  const analysisRows = analysisSheet
    ? XLSX.utils.sheet_to_json<RawCell[]>(analysisSheet, { header: 1, blankrows: false, defval: "", raw: true })
    : [];

  if (mainNumbersRows.length) {
    const monthly = parseMainNumbers(mainNumbersRows);
    return {
      monthly,
      channelCosts: parseAnalysisCosts(analysisRows, latestMonth(monthly), monthly),
    };
  }

  return {
    monthly: parseActualResults(actualRows),
    channelCosts: parseMarketingCosts(costRows),
  };
}
