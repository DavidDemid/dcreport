import * as XLSX from "xlsx";

type RawCell = string | number | boolean | Date | null | undefined;

export type FinanceMonthlyRecord = {
  month: string;
  revenue: number;
  marketingCost: number;
  profitAfterMarketing: number;
  signedContracts: number;
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

export async function parseFinanceWorkbook(file: ArrayBuffer): Promise<FinanceData> {
  const workbook = XLSX.read(file, {
    cellDates: false,
    raw: true,
    type: "array",
  });

  const actualSheet = workbook.Sheets["Actual results"];
  const costSheet = workbook.Sheets["Marketing cost"];
  const actualRows = actualSheet
    ? XLSX.utils.sheet_to_json<RawCell[]>(actualSheet, { header: 1, blankrows: false, defval: "", raw: true })
    : [];
  const costRows = costSheet
    ? XLSX.utils.sheet_to_json<RawCell[]>(costSheet, { header: 1, blankrows: false, defval: "", raw: true })
    : [];

  return {
    monthly: parseActualResults(actualRows),
    channelCosts: parseMarketingCosts(costRows),
  };
}
