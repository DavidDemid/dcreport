import * as XLSX from "xlsx";

export type CRMRecord = {
  rowNumber: number;
  id: string;
  counterparty: string;
  title: string;
  createdAt: Date | null;
  status: string;
  relevant: string;
  assignee: string;
  service: string;
  country: string;
  utmTag: string;
  googleClientId: string;
  language: string;
  type: string;
  email: string;
  rejectionReason: string;
  source: string;
  sourceRaw: string;
  sourceMethod: "first_touch_source" | "utm_source" | "utm_tag_parsed" | "legacy_name" | "unknown";
  normalizedSource: string;
  completedAt: Date | null;
  agreementSentAt: Date | null;
  agreementSignedAt: Date | null;
  dealValueActual: number | null;
  duplicateFlag: string;
  firstContactAt: Date | null;
  firstPaymentAt: Date | null;
  firstResponseAt: Date | null;
  firstTouchCampaign: string;
  firstTouchContent: string;
  firstTouchMedium: string;
  firstTouchSource: string;
  fullPaymentAt: Date | null;
  lawyerHandoverAt: Date | null;
  lostAt: Date | null;
  meetingBookedAt: Date | null;
  meetingHeldAt: Date | null;
  originalServiceInterest: string;
  paymentStatus: string;
  qualifiedService: string;
  analyticsService: string;
  reportingService: string;
  analyticsServiceMethod: "qualified_service" | "original_service_interest" | "service_group";
  utmCampaign: string;
  utmContent: string;
  utmMedium: string;
  utmSource: string;
};

type RawCell = string | number | boolean | Date | null | undefined;

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;

function text(value: RawCell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  return String(value).trim();
}

function identityText(value: string): string {
  return value
    .replace(/^calendly:\s*/i, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}@.]+/gu, " ")
    .trim();
}

export function leadIdentityKey(record: Pick<CRMRecord, "email" | "googleClientId" | "counterparty" | "title" | "id" | "rowNumber">): string {
  const email = identityText(record.email);
  if (email) return `email:${email}`;

  const googleClientId = identityText(record.googleClientId);
  if (googleClientId) return `gclid:${googleClientId}`;

  const counterparty = identityText(record.counterparty);
  if (counterparty) return `counterparty:${counterparty}`;

  const title = identityText(record.title);
  if (title) return `title:${title}`;

  return record.id ? `id:${record.id}` : `row:${record.rowNumber}`;
}

export type LeadCleanupRule = "duplicate" | "technical" | "invalid" | "test";

export type LeadCleanupResult = {
  records: CRMRecord[];
  excluded: Record<LeadCleanupRule, number>;
  rawCount: number;
  cleanCount: number;
};

const DEDUPE_WINDOW_MS = 30 * DAY_MS;

function leadDedupeKey(record: CRMRecord): string {
  return `${leadIdentityKey(record)}|||${record.reportingService}`;
}

export function isDuplicateFlag(value: string): boolean {
  return ["true", "yes", "y", "1", "так", "да"].includes(value.trim().toLowerCase());
}

function isDuplicateClosure(record: CRMRecord): boolean {
  const status = record.status.trim().toUpperCase();
  const reason = record.rejectionReason.trim().toUpperCase();
  return reason === "DOUBLE" || (isDuplicateFlag(record.duplicateFlag) && status === "REJECTED");
}

function hasUsableIdentity(record: CRMRecord): boolean {
  return Boolean(
    identityText(record.email)
    || identityText(record.googleClientId)
    || identityText(record.counterparty)
    || identityText(record.title),
  );
}

function technicalReason(record: CRMRecord): LeadCleanupRule | null {
  const email = record.email.trim().toLowerCase();
  const haystack = [
    record.title,
    record.counterparty,
    record.sourceRaw,
    record.source,
    record.type,
    record.status,
    record.rejectionReason,
    email,
  ].join(" ").toLowerCase();

  if (/\b(test|testing|demo|internal check)\b/.test(haystack)) return "test";
  if (!hasUsableIdentity(record)) return "invalid";
  if (
    email.startsWith("noreply@")
    || email.startsWith("no-reply@")
    || email.startsWith("support@")
    || /\b(wise|noreply|no-reply|notification|system|internal mail|planfix|2invoice|payment notification|automated service|maxeltracker)\b/.test(haystack)
  ) {
    return "technical";
  }

  return null;
}

function firstDate(records: CRMRecord[], getter: (record: CRMRecord) => Date | null): Date | null {
  return records
    .map(getter)
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
}

function latestFilled<T>(records: CRMRecord[], getter: (record: CRMRecord) => T, filled: (value: T) => boolean): T | null {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const value = getter(records[index]);
    if (filled(value)) return value;
  }
  return null;
}

function latestText(records: CRMRecord[], getter: (record: CRMRecord) => string): string {
  return latestFilled(records, getter, (value) => Boolean(value.trim())) ?? "";
}

function latestKnownText(records: CRMRecord[], getter: (record: CRMRecord) => string): string {
  return latestFilled(records, getter, (value) => Boolean(value.trim()) && value.trim().toLowerCase() !== "unknown") ?? "";
}

function consolidateLeadCluster(cluster: CRMRecord[]): CRMRecord {
  const sorted = [...cluster].sort(
    (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) || a.rowNumber - b.rowNumber,
  );
  const operational = sorted.filter((record) => !isDuplicateClosure(record));
  const currentCandidates = operational.length ? operational : sorted;
  const current = currentCandidates[currentCandidates.length - 1];
  const relevantCandidates = operational.length ? operational : sorted;
  const relevant = latestText(relevantCandidates, (record) => record.relevant);
  const sourceRecord = sorted.find((record) => record.source !== "Unknown");
  const maxDealValue = sorted.reduce<number | null>((maximum, record) => {
    if (record.dealValueActual === null) return maximum;
    return maximum === null ? record.dealValueActual : Math.max(maximum, record.dealValueActual);
  }, null);

  return {
    ...current,
    id: latestText(currentCandidates, (record) => record.id) || current.id,
    counterparty: latestText(currentCandidates, (record) => record.counterparty) || latestText(sorted, (record) => record.counterparty),
    title: latestText(currentCandidates, (record) => record.title) || latestText(sorted, (record) => record.title),
    createdAt: firstDate(sorted, (record) => record.createdAt),
    relevant,
    service: latestKnownText(currentCandidates, (record) => record.service) || current.service,
    country: latestKnownText(currentCandidates, (record) => record.country) || "Unknown",
    googleClientId: latestText(sorted, (record) => record.googleClientId),
    language: latestKnownText(currentCandidates, (record) => record.language) || "Unknown",
    email: latestText(sorted, (record) => record.email),
    completedAt: firstDate(sorted, (record) => record.completedAt),
    agreementSentAt: firstDate(sorted, (record) => record.agreementSentAt),
    agreementSignedAt: firstDate(sorted, (record) => record.agreementSignedAt),
    dealValueActual: maxDealValue,
    duplicateFlag: "false",
    firstContactAt: firstDate(sorted, (record) => record.firstContactAt),
    firstPaymentAt: firstDate(sorted, (record) => record.firstPaymentAt),
    firstResponseAt: firstDate(sorted, (record) => record.firstResponseAt),
    fullPaymentAt: firstDate(sorted, (record) => record.fullPaymentAt),
    lawyerHandoverAt: firstDate(sorted, (record) => record.lawyerHandoverAt),
    // A duplicate-closure row must not make an actively worked consolidated lead look rejected.
    lostAt: current.lostAt,
    meetingBookedAt: firstDate(sorted, (record) => record.meetingBookedAt),
    meetingHeldAt: firstDate(sorted, (record) => record.meetingHeldAt),
    paymentStatus: latestText(sorted, (record) => record.paymentStatus),
    qualifiedService: latestText(currentCandidates, (record) => record.qualifiedService),
    originalServiceInterest: latestText(currentCandidates, (record) => record.originalServiceInterest),
    analyticsService: current.analyticsService,
    reportingService: current.reportingService,
    analyticsServiceMethod: current.analyticsServiceMethod,
    ...(sourceRecord
      ? {
          source: sourceRecord.source,
          sourceRaw: sourceRecord.sourceRaw,
          sourceMethod: sourceRecord.sourceMethod,
          normalizedSource: sourceRecord.normalizedSource,
          utmTag: sourceRecord.utmTag,
          firstTouchCampaign: sourceRecord.firstTouchCampaign,
          firstTouchContent: sourceRecord.firstTouchContent,
          firstTouchMedium: sourceRecord.firstTouchMedium,
          firstTouchSource: sourceRecord.firstTouchSource,
          utmCampaign: sourceRecord.utmCampaign,
          utmContent: sourceRecord.utmContent,
          utmMedium: sourceRecord.utmMedium,
          utmSource: sourceRecord.utmSource,
        }
      : {}),
  };
}

export function cleanLeadRecords(records: CRMRecord[]): LeadCleanupResult {
  const excluded: Record<LeadCleanupRule, number> = {
    duplicate: 0,
    technical: 0,
    invalid: 0,
    test: 0,
  };
  const candidates: CRMRecord[] = [];

  for (const record of records) {
    const baseReason = technicalReason(record);
    if (baseReason) {
      excluded[baseReason] += 1;
    } else {
      candidates.push(record);
    }
  }

  const grouped = new Map<string, CRMRecord[]>();
  for (const record of candidates) {
    const key = leadDedupeKey(record);
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }

  const clean: CRMRecord[] = [];
  for (const group of grouped.values()) {
    const sorted = [...group].sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) || a.rowNumber - b.rowNumber);
    let cluster: CRMRecord[] = [];
    let clusterStart = 0;

    const flushCluster = () => {
      if (!cluster.length) return;
      if (cluster.every(isDuplicateClosure)) {
        excluded.duplicate += cluster.length;
        cluster = [];
        return;
      }
      clean.push(consolidateLeadCluster(cluster));
      excluded.duplicate += cluster.length - 1;
      cluster = [];
    };

    for (const record of sorted) {
      const recordTime = record.createdAt?.getTime() ?? 0;
      if (!cluster.length) {
        cluster = [record];
        clusterStart = recordTime;
        continue;
      }
      if (recordTime && clusterStart && recordTime - clusterStart <= DEDUPE_WINDOW_MS) {
        cluster.push(record);
      } else {
        flushCluster();
        cluster = [record];
        clusterStart = recordTime;
      }
    }
    flushCluster();
  }

  const sortedClean = clean.sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) || a.rowNumber - b.rowNumber);
  return {
    records: sortedClean,
    excluded,
    rawCount: records.length,
    cleanCount: sortedClean.length,
  };
}

function numberValue(value: RawCell): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = text(value).replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseCRMDate(value: RawCell): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value) && value > 1) {
    return new Date(EXCEL_EPOCH + value * DAY_MS);
  }

  const raw = text(value);
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 1) {
    return new Date(EXCEL_EPOCH + numeric * DAY_MS);
  }

  const normalized = raw.replace(/(\d{2})\.(\d{2})\.(\d{4})/, "$3-$2-$1");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pick(row: RawCell[], index: number): RawCell {
  return row[index] ?? "";
}

function parseUtmSource(utmTag: string): string {
  if (!utmTag) return "";
  try {
    const query = utmTag.includes("?") ? utmTag.slice(utmTag.indexOf("?") + 1) : utmTag;
    const params = new URLSearchParams(query);
    return text(params.get("utm_source"));
  } catch {
    return "";
  }
}

function normalizeSource(value: string): string {
  const raw = value.trim();
  const lower = raw.toLowerCase();
  if (!raw) return "Unknown";
  if (lower.includes("google") || lower.includes("gclid")) return "Google Ads";
  if (lower.includes("bing") || lower.includes("msclkid")) return "Bing Ads";
  if (lower.includes("facebook") || lower.includes("fb") || lower.includes("instagram") || lower.includes("ig")) return "Facebook / Instagram";
  if (lower.includes("organic") || lower.includes("seo")) return "Organic Search";
  if (lower.includes("direct") || lower.includes("email") || lower.includes("phone")) return "Direct";
  if (lower.includes("referral") || lower.includes("refer")) return "Referral";
  if (lower.includes("bridgewest") || lower.includes("partner")) return "Partner";
  if (lower.includes("whatsapp")) return "WhatsApp";
  if (lower.includes("calendly")) return "Calendly";
  if (lower.includes("website") || lower.includes("form")) return "Direct";
  if (lower.includes("other")) return "Other";
  return "Other";
}

function inferSource(
  rowSource: string,
  firstTouchSource: string,
  utmSource: string,
  utmTag: string,
): Pick<CRMRecord, "source" | "sourceRaw" | "sourceMethod" | "normalizedSource"> {
  const parsedUtmSource = parseUtmSource(utmTag);
  const candidates = [
    { raw: firstTouchSource, method: "first_touch_source" as const },
    { raw: utmSource, method: "utm_source" as const },
    { raw: parsedUtmSource, method: "utm_tag_parsed" as const },
    { raw: rowSource, method: "legacy_name" as const },
  ];
  const selected = candidates.find((candidate) => candidate.raw);

  if (!selected) {
    return { source: "Unknown", sourceRaw: "", sourceMethod: "unknown", normalizedSource: "Unknown" };
  }

  return {
    source: normalizeSource(selected.raw),
    sourceRaw: selected.raw,
    sourceMethod: selected.method,
    normalizedSource: normalizeSource(selected.raw),
  };
}

function inferAnalyticsService(
  serviceGroup: string,
  originalServiceInterest: string,
  qualifiedService: string,
): Pick<CRMRecord, "analyticsService" | "reportingService" | "analyticsServiceMethod"> {
  const selected = qualifiedService || originalServiceInterest || serviceGroup || "Unknown";
  const method = qualifiedService
    ? "qualified_service"
    : originalServiceInterest
      ? "original_service_interest"
      : "service_group";

  return {
    analyticsService: selected,
    reportingService: normalizeReportingService(selected),
    analyticsServiceMethod: method,
  };
}

function normalizeReportingService(value: string): string {
  const raw = value.trim();
  const lower = raw.toLowerCase();
  if (!raw || lower === "unknown") return "Other / Unknown";
  if ((lower.includes("lithuan") || /\blt\b/.test(lower)) && lower.includes("citizen")) return "Lithuanian citizenship by descent";
  if ((lower.includes("latv") || /\blv\b/.test(lower)) && lower.includes("citizen")) return "Latvian citizenship by descent";
  if (
    lower.includes("real estate") ||
    lower.includes("real-estate") ||
    ((lower.includes("latv") || /\blv\b/.test(lower)) && lower.includes("rbi") && lower.includes("estate"))
  ) {
    return "Latvia RBI through real estate";
  }
  if (
    lower.includes("rbi") ||
    lower.includes("residence by")
  ) {
    if ((lower.includes("latv") || /\blv\b/.test(lower)) && (lower.includes("company") || lower.includes("investment"))) {
      return "Latvia RBI through company / investment";
    }
    return "Latvia RBI through real estate";
  }
  if (
    lower.includes("residence through") ||
    (lower.includes("residence") && (lower.includes("company") || lower.includes("business")))
  ) {
    return "Lithuania residence through business / company";
  }
  if (
    lower.includes("company") ||
    lower.includes("business") ||
    lower.includes("registration") ||
    lower.includes("incorporation") ||
    lower.includes("formation")
  ) {
    return "Company / business registration";
  }
  return "Other / Unknown";
}

export function normalizeRows(rows: RawCell[][]): CRMRecord[] {
  return rows
    .slice(1)
    .map((row, rowIndex) => {
      const sourceName = text(pick(row, 15));
      const firstTouchSource = text(pick(row, 33));
      const utmSource = text(pick(row, 56));
      const utmTag = text(pick(row, 9));
      const serviceGroup = text(pick(row, 7)) || "Unknown";
      const originalServiceInterest = text(pick(row, 42));
      const qualifiedService = text(pick(row, 48));
      const sourceInfo = inferSource(sourceName, firstTouchSource, utmSource, utmTag);
      const serviceInfo = inferAnalyticsService(serviceGroup, originalServiceInterest, qualifiedService);

      return {
        rowNumber: rowIndex + 2,
        id: text(pick(row, 0)).replace(/\.0+$/, ""),
        counterparty: text(pick(row, 1)),
        title: text(pick(row, 2)),
        createdAt: parseCRMDate(pick(row, 3)),
        status: text(pick(row, 4)) || "Unknown",
        relevant: text(pick(row, 5)),
        assignee: text(pick(row, 6)),
        service: serviceGroup,
        country: text(pick(row, 8)) || "Unknown",
        utmTag,
        googleClientId: text(pick(row, 10)),
        language: text(pick(row, 11)) || "Unknown",
        type: text(pick(row, 12)),
        email: text(pick(row, 13)),
        rejectionReason: text(pick(row, 14)),
        ...sourceInfo,
        completedAt: parseCRMDate(pick(row, 20)),
        agreementSentAt: parseCRMDate(pick(row, 21)),
        agreementSignedAt: parseCRMDate(pick(row, 23)),
        dealValueActual: numberValue(pick(row, 25)),
        duplicateFlag: text(pick(row, 26)),
        firstContactAt: parseCRMDate(pick(row, 27)),
        firstPaymentAt: parseCRMDate(pick(row, 28)),
        firstResponseAt: parseCRMDate(pick(row, 29)),
        firstTouchCampaign: text(pick(row, 30)),
        firstTouchContent: text(pick(row, 31)),
        firstTouchMedium: text(pick(row, 32)),
        firstTouchSource,
        fullPaymentAt: parseCRMDate(pick(row, 35)),
        lawyerHandoverAt: parseCRMDate(pick(row, 37)),
        lostAt: parseCRMDate(pick(row, 39)),
        meetingBookedAt: parseCRMDate(pick(row, 40)),
        meetingHeldAt: parseCRMDate(pick(row, 41)),
        originalServiceInterest,
        paymentStatus: text(pick(row, 47)),
        qualifiedService,
        ...serviceInfo,
        utmCampaign: text(pick(row, 54)),
        utmContent: text(pick(row, 55)),
        utmMedium: text(pick(row, 18)) || text(pick(row, 32)),
        utmSource,
      };
    })
    .filter((record) => record.id || record.counterparty || record.title);
}

export async function parseWorkbook(file: ArrayBuffer): Promise<CRMRecord[]> {
  const workbook = XLSX.read(file, {
    cellDates: false,
    raw: true,
    type: "array",
  });
  const sheetName =
    workbook.SheetNames.find((name) => /crm export|sheet1/i.test(name)) ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<RawCell[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: true,
  });
  return normalizeRows(rows);
}

export function compactDate(date: Date | null): string {
  if (!date) return "n/a";
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" }).format(date);
}

export function monthKey(date: Date | null): string {
  if (!date) return "Unknown";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  if (key === "Unknown") return key;
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "short", year: "2-digit" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

export function monthDiff(from: Date, to: Date): number {
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();
}
