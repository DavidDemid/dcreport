import * as XLSX from "xlsx";

type RawCell = string | number | boolean | Date | null | undefined;

export type FinanceMonthlyRecord = {
  month: string;
  revenue: number;
  marketingCost: number;
  profitAfterMarketing: number;
  signedContracts: number;
  sessions?: number;
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
  avgSessions?: number;
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

function normalizeMonth(value: RawCell): number | null {
  const raw = text(value).toLowerCase().replaceAll(".", "");
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const fullMonths = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const shortIndex = months.findIndex((month) => raw.startsWith(month));
  if (shortIndex >= 0) return shortIndex;
  const fullIndex = fullMonths.findIndex((month) => raw.startsWith(month));
  return fullIndex >= 0 ? fullIndex : null;
}

function parseMonthKey(value: RawCell): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return monthKey(value.getUTCFullYear(), value.getUTCMonth());
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 20_000) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 24 * 60 * 60 * 1000);
    if (!Number.isNaN(date.getTime())) return monthKey(date.getUTCFullYear(), date.getUTCMonth());
  }

  const raw = text(value).trim();
  const iso = raw.match(/^(20\d{2})[-/.](0?[1-9]|1[0-2])(?:[-/.]\d{1,2})?$/);
  if (iso) return monthKey(Number(iso[1]), Number(iso[2]) - 1);

  const named = raw.match(/^([A-Za-z]+)[\s./-]+(\d{2}|20\d{2})$/);
  if (!named) return null;
  const month = normalizeMonth(named[1]);
  if (month === null) return null;
  const shortYear = Number(named[2]);
  const year = shortYear < 100 ? 2000 + shortYear : shortYear;
  return monthKey(year, month);
}

function normalizedLabel(value: RawCell): string {
  return text(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.:]+$/g, "")
    .trim();
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

const MAIN_NUMBER_SECTIONS = [
  "profit after marketing expenditure",
  "revenue",
  "sales",
  "marketing cost",
  "signed contracts",
  "# of leads",
  "# of clicks",
  "# of sessions",
  "conversion lead / contract",
];

type MainNumberSection = {
  start: number;
  end: number;
};

function findSection(rows: RawCell[][], heading: string, requiredRow?: string): MainNumberSection | null {
  const target = normalizedLabel(heading);
  const required = requiredRow ? normalizedLabel(requiredRow) : null;

  for (let start = 0; start < rows.length; start += 1) {
    if (normalizedLabel(rows[start]?.[0]) !== target) continue;
    let end = rows.length;
    for (let row = start + 1; row < rows.length; row += 1) {
      if (MAIN_NUMBER_SECTIONS.includes(normalizedLabel(rows[row]?.[0]))) {
        end = row;
        break;
      }
    }
    if (!required || rows.slice(start + 1, end).some((row) => normalizedLabel(row[0]) === required)) {
      return { start, end };
    }
  }
  return null;
}

function sectionRow(rows: RawCell[][], section: MainNumberSection | null, labels: string[]): RawCell[] | undefined {
  if (!section) return undefined;
  const targets = labels.map(normalizedLabel);
  return rows
    .slice(section.start + 1, section.end)
    .find((row) => targets.includes(normalizedLabel(row[0])));
}

function rowValue(row: RawCell[] | undefined, column: number): number {
  return numberValue(row?.[column]);
}

function parseMainNumbers(rows: RawCell[][]): FinanceMonthlyRecord[] {
  const profit = findSection(rows, "Profit after marketing expenditure", "Act. result month");
  const revenue = findSection(rows, "Revenue", "Act. result month");
  const sales = findSection(rows, "Sales", "Act. result month");
  const marketing = findSection(rows, "Marketing cost", "Act. result month");
  const contracts = findSection(rows, "Signed contracts", "Act. result month");
  const leads = findSection(rows, "# of leads", "Act. result month");
  const clicks = findSection(rows, "# of clicks", "Act. result month");
  const sessions = findSection(rows, "# of sessions", "Total");
  const headerSection = profit ?? revenue ?? sales ?? marketing ?? contracts ?? leads ?? clicks ?? sessions;
  if (!headerSection) return [];

  const profitActual = sectionRow(rows, profit, ["Act. result month"]);
  const profitPlan = sectionRow(rows, profit, ["Plan month"]);
  const profitAverage = sectionRow(rows, profit, ["Act. result 3 months average"]);
  const profitPlanAverage = sectionRow(rows, profit, ["Plan 3 months av.", "Plan 3 months average"]);
  const revenueActual = sectionRow(rows, revenue, ["Act. result month"]);
  const revenueAverage = sectionRow(rows, revenue, ["Act. result 3 months average"]);
  const salesActual = sectionRow(rows, sales, ["Act. result month"]);
  const salesAverage = sectionRow(rows, sales, ["Act. result 3 months average"]);
  const marketingActual = sectionRow(rows, marketing, ["Act. result month"]);
  const marketingAverage = sectionRow(rows, marketing, ["Act. result 3 months average"]);
  const paidTraffic = sectionRow(rows, marketing, ["Paid traffic all", "Paid traffic"]);
  const paidTrafficAverage = sectionRow(rows, marketing, ["Paid traffic 3 months average"]);
  const contractsActual = sectionRow(rows, contracts, ["Act. result month"]);
  const contractsAverage = sectionRow(rows, contracts, ["Act. result 3 months average"]);
  const ltContracts = sectionRow(rows, contracts, ["LT contracts"]);
  const lvContracts = sectionRow(rows, contracts, ["LV contracts"]);
  const leadsActual = sectionRow(rows, leads, ["Act. result month"]);
  const leadsAverage = sectionRow(rows, leads, ["Act. result 3 months average"]);
  const clicksActual = sectionRow(rows, clicks, ["Act. result month"]);
  const clicksAverage = sectionRow(rows, clicks, ["Act. result 3 months average"]);
  const sessionsActual = sectionRow(rows, sessions, ["Total", "Act. result month"]);
  const sessionsAverage = sectionRow(rows, sessions, ["3 mo avg", "Act. result 3 months average"]);
  const header = rows[headerSection.start] ?? [];
  const records: FinanceMonthlyRecord[] = [];

  for (let column = 1; column < header.length; column += 1) {
    const month = parseMonthKey(header[column]);
    if (!month) continue;
    const signedContracts = rowValue(contractsActual, column);
    const lt = rowValue(ltContracts, column);
    const lv = rowValue(lvContracts, column);
    const record: FinanceMonthlyRecord = {
      month,
      revenue: rowValue(revenueActual, column),
      marketingCost: rowValue(marketingActual, column),
      profitAfterMarketing: rowValue(profitActual, column),
      signedContracts,
      sessions: rowValue(sessionsActual, column),
      clicks: rowValue(clicksActual, column),
      leads: rowValue(leadsActual, column),
      paidTrafficCost: rowValue(paidTraffic, column),
      sales: rowValue(salesActual, column),
      planProfitAfterMarketing: rowValue(profitPlan, column),
      planProfitAfterMarketing3MonthAverage: rowValue(profitPlanAverage, column),
      avgProfitAfterMarketing: rowValue(profitAverage, column),
      avgRevenue: rowValue(revenueAverage, column),
      avgSales: rowValue(salesAverage, column),
      avgMarketingCost: rowValue(marketingAverage, column),
      avgPaidTrafficCost: rowValue(paidTrafficAverage, column),
      avgSignedContracts: rowValue(contractsAverage, column),
      avgSessions: rowValue(sessionsAverage, column),
      avgLeads: rowValue(leadsAverage, column),
      avgClicks: rowValue(clicksAverage, column),
      ltContracts: lt,
      lvContracts: lv,
      rbiContracts: Math.max(0, signedContracts - lt - lv),
    };
    const hasActualData = [
      record.revenue,
      record.marketingCost,
      record.profitAfterMarketing,
      record.signedContracts,
      record.sessions,
      record.clicks,
      record.leads,
      record.paidTrafficCost,
      record.sales,
    ].some((value) => Boolean(value));
    if (hasActualData) records.push(record);
  }

  return records;
}

function parseMainNumberChannelCosts(rows: RawCell[][]): FinanceChannelCostRecord[] {
  const marketing = findSection(rows, "Marketing cost", "Act. result month");
  if (!marketing) return [];
  const header = rows[marketing.start] ?? [];
  const categories: Array<{ labels: string[]; source: string }> = [
    { labels: ["Paid traffic google"], source: "Google Ads" },
    { labels: ["Paid traffic bing"], source: "Bing Ads" },
    { labels: ["Paid traffic facebook", "Paid traffic instagram"], source: "Facebook / Instagram" },
    { labels: ["Bridgewest (affiliate partner)", "Simona (affiliate partner)"], source: "Partner" },
  ];
  const records: FinanceChannelCostRecord[] = [];

  for (const category of categories) {
    for (const label of category.labels) {
      const row = sectionRow(rows, marketing, [label]);
      if (!row) continue;
      for (let column = 1; column < header.length; column += 1) {
        const month = parseMonthKey(header[column]);
        const amount = rowValue(row, column);
        if (!month || amount <= 0) continue;
        records.push({ month, category: text(row[0]), source: category.source, amount });
      }
    }
  }
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

function analysisMonth(rows: RawCell[][], monthly: FinanceMonthlyRecord[]): string | null {
  const comparison = rows
    .map((row) => text(row[0]))
    .find((label) => /[a-z]+\s+vs\s+[a-z]+/i.test(label));
  const monthName = comparison?.match(/^([a-z]+)/i)?.[1];
  const monthIndex = monthName ? normalizeMonth(monthName) : null;
  if (monthIndex === null) return latestMonth(monthly);
  return monthly
    .map((record) => record.month)
    .filter((month) => Number(month.slice(5, 7)) - 1 === monthIndex)
    .sort((a, b) => b.localeCompare(a))[0] ?? null;
}

export async function parseFinanceWorkbook(file: ArrayBuffer): Promise<FinanceData> {
  const workbook = XLSX.read(file, {
    cellDates: false,
    raw: true,
    type: "array",
  });

  const sheetByName = (name: string) => {
    const target = name.trim().toLowerCase();
    const sheetName = workbook.SheetNames.find((item) => item.trim().toLowerCase() === target);
    return sheetName ? workbook.Sheets[sheetName] : undefined;
  };

  const actualSheet = sheetByName("Actual results");
  const costSheet = sheetByName("Marketing cost");
  const mainNumbersSheet = sheetByName("Main numbers");
  const analysisSheet = sheetByName("1st Analysis");
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
    const detailedChannelCosts = parseMainNumberChannelCosts(mainNumbersRows);
    const detailedMonths = new Set(detailedChannelCosts.map((record) => record.month));
    const fallbackChannelCosts = parseAnalysisCosts(analysisRows, analysisMonth(analysisRows, monthly), monthly)
      .filter((record) => !detailedMonths.has(record.month));
    if (!monthly.length) {
      throw new Error("No monthly finance data found. Check that the Main numbers sheet contains month headers and Act. result month rows.");
    }
    return {
      monthly,
      channelCosts: [...detailedChannelCosts, ...fallbackChannelCosts],
    };
  }

  const monthly = parseActualResults(actualRows);
  if (!monthly.length) {
    throw new Error("No supported finance data found. Expected a Main numbers sheet or Actual results sheet.");
  }
  return { monthly, channelCosts: parseMarketingCosts(costRows) };
}
