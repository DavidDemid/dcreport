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

function identityEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : "";
}

function usableIdentityText(value: string): string {
  const normalized = identityText(value);
  if (!normalized) return "";
  if (["unknown", "n a", "na", "none", "null", "website form", "lead", "task.counterparty.name"].includes(normalized)) return "";
  return normalized;
}

export function leadIdentityKey(record: Pick<CRMRecord, "email" | "googleClientId" | "counterparty" | "title" | "id" | "rowNumber">): string {
  const email = identityEmail(record.email);
  if (email) return `email:${email}`;

  const googleClientId = usableIdentityText(record.googleClientId);
  if (googleClientId) return `gclid:${googleClientId}`;

  const counterparty = usableIdentityText(record.counterparty);
  if (counterparty) return `counterparty:${counterparty}`;

  const title = usableIdentityText(record.title);
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
const MAX_SAFE_IDENTITY_GROUP_SIZE = 25;

function leadDedupeKey(record: CRMRecord): string {
  return `${leadIdentityKey(record)}|||${record.reportingService}`;
}

function secondaryIdentityKey(record: CRMRecord): string {
  const counterparty = usableIdentityText(record.counterparty);
  if (counterparty) return `counterparty:${counterparty}`;
  const title = usableIdentityText(record.title);
  if (title) return `title:${title}`;
  return record.id ? `id:${record.id}` : `row:${record.rowNumber}`;
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
    identityEmail(record.email)
    || usableIdentityText(record.googleClientId)
    || usableIdentityText(record.counterparty)
    || usableIdentityText(record.title)
    || record.id.trim(),
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
    record.rejectionReason,
    email,
  ].join(" ").toLowerCase();

  if (/\b(test|testing|demo|internal check)\b/.test(haystack)) return "test";
  if (!hasUsableIdentity(record)) return "invalid";
  if (
    email.startsWith("noreply@")
    || email.startsWith("no-reply@")
    || email.startsWith("support@")
    || /\b(wise|noreply|no-reply|notification|system|planfix|2invoice|payment notification|automated service|maxeltracker)\b/.test(haystack)
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
    rejectionReason: current.rejectionReason.trim().toUpperCase() === "DOUBLE" ? "" : current.rejectionReason,
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

  const safeGroups: CRMRecord[][] = [];
  for (const [key, group] of grouped.entries()) {
    if (group.length <= MAX_SAFE_IDENTITY_GROUP_SIZE) {
      safeGroups.push(group);
      continue;
    }

    const subdivided = new Map<string, CRMRecord[]>();
    for (const record of group) {
      const secondaryKey = `${key}|||${secondaryIdentityKey(record)}`;
      subdivided.set(secondaryKey, [...(subdivided.get(secondaryKey) ?? []), record]);
    }
    safeGroups.push(...subdivided.values());
  }

  const clean: CRMRecord[] = [];
  for (const group of safeGroups) {
    const sorted = [...group].sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) || a.rowNumber - b.rowNumber);
    let cluster: CRMRecord[] = [];
    let clusterStart = 0;

    const flushCluster = () => {
      if (!cluster.length) return;
      // A duplicate flag is evidence for consolidation, not enough evidence to
      // delete a person when the matching primary CRM row is absent.
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

function normalizedHeader(value: RawCell): string {
  return text(value).replace(/^\uFEFF/, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function headerIndex(headers: RawCell[], names: string[], fallback: number): number {
  const targets = new Set(names.map((name) => normalizedHeader(name)));
  const index = headers.findIndex((header) => targets.has(normalizedHeader(header)));
  return index >= 0 ? index : fallback;
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
  const headers = rows[0] ?? [];
  const columns = {
    id: headerIndex(headers, ["Номер", "Number", "ID"], 0),
    counterparty: headerIndex(headers, ["Контрагент", "Counterparty"], 1),
    title: headerIndex(headers, ["Назва", "Title", "Lead name"], 2),
    createdAt: headerIndex(headers, ["Дата створення", "Creation date", "Created at", "created_at"], 3),
    status: headerIndex(headers, ["Статус", "Status"], 4),
    relevant: headerIndex(headers, ["Relevant"], 5),
    assignee: headerIndex(headers, ["Виконавці", "Assignees", "Assignee"], 6),
    service: headerIndex(headers, ["Service (group)", "Service group"], 7),
    country: headerIndex(headers, ["Country"], 8),
    utmTag: headerIndex(headers, ["UTM tag"], 9),
    googleClientId: headerIndex(headers, ["Google Client ID", "google_client_id"], 10),
    language: headerIndex(headers, ["LANGUAGE", "Language"], 11),
    type: headerIndex(headers, ["Type"], 12),
    email: headerIndex(headers, ["E-mail Counterparty", "Email Counterparty", "E-mail", "Email"], 13),
    rejectionReason: headerIndex(headers, ["Reason for Rejection", "Rejection reason"], 14),
    legacySource: headerIndex(headers, ["Name"], 15),
    utmMediumLegacy: headerIndex(headers, ["utm_medium"], 18),
    completedAt: headerIndex(headers, ["Дата отримання статусу «Завершене»", "Completed at", "completed_at"], 20),
    agreementSentAt: headerIndex(headers, ["agreement_sent_at"], 21),
    agreementSignedAt: headerIndex(headers, ["agreement_signed_at"], 23),
    dealValueActual: headerIndex(headers, ["deal_value_actual"], 25),
    duplicateFlag: headerIndex(headers, ["duplicate_flag"], 26),
    firstContactAt: headerIndex(headers, ["first_contact_at"], 27),
    firstPaymentAt: headerIndex(headers, ["first_payment_at"], 28),
    firstResponseAt: headerIndex(headers, ["first_response_at"], 29),
    firstTouchCampaign: headerIndex(headers, ["first_touch_campaign"], 30),
    firstTouchContent: headerIndex(headers, ["first_touch_content"], 31),
    firstTouchMedium: headerIndex(headers, ["first_touch_medium"], 32),
    firstTouchSource: headerIndex(headers, ["first_touch_source"], 33),
    fullPaymentAt: headerIndex(headers, ["full_payment_at"], 35),
    lawyerHandoverAt: headerIndex(headers, ["lawyer_handover_at"], 37),
    lostAt: headerIndex(headers, ["lost_at"], 39),
    meetingBookedAt: headerIndex(headers, ["meeting_booked_at"], 40),
    meetingHeldAt: headerIndex(headers, ["meeting_held_at"], 41),
    originalServiceInterest: headerIndex(headers, ["original_service_interest"], 42),
    paymentStatus: headerIndex(headers, ["payment_status"], 47),
    qualifiedService: headerIndex(headers, ["qualified_service"], 48),
    utmCampaign: headerIndex(headers, ["utm_campaign"], 54),
    utmContent: headerIndex(headers, ["utm_content"], 55),
    utmSource: headerIndex(headers, ["utm_source"], 56),
  };

  return rows
    .slice(1)
    .map((row, rowIndex) => {
      const sourceName = text(pick(row, columns.legacySource));
      const firstTouchSource = text(pick(row, columns.firstTouchSource));
      const utmSource = text(pick(row, columns.utmSource));
      const utmTag = text(pick(row, columns.utmTag));
      const serviceGroup = text(pick(row, columns.service)) || "Unknown";
      const originalServiceInterest = text(pick(row, columns.originalServiceInterest));
      const qualifiedService = text(pick(row, columns.qualifiedService));
      const sourceInfo = inferSource(sourceName, firstTouchSource, utmSource, utmTag);
      const serviceInfo = inferAnalyticsService(serviceGroup, originalServiceInterest, qualifiedService);

      return {
        rowNumber: rowIndex + 2,
        id: text(pick(row, columns.id)).replace(/\.0+$/, ""),
        counterparty: text(pick(row, columns.counterparty)),
        title: text(pick(row, columns.title)),
        createdAt: parseCRMDate(pick(row, columns.createdAt)),
        status: text(pick(row, columns.status)) || "Unknown",
        relevant: text(pick(row, columns.relevant)),
        assignee: text(pick(row, columns.assignee)),
        service: serviceGroup,
        country: text(pick(row, columns.country)) || "Unknown",
        utmTag,
        googleClientId: text(pick(row, columns.googleClientId)),
        language: text(pick(row, columns.language)) || "Unknown",
        type: text(pick(row, columns.type)),
        email: text(pick(row, columns.email)),
        rejectionReason: text(pick(row, columns.rejectionReason)),
        ...sourceInfo,
        completedAt: parseCRMDate(pick(row, columns.completedAt)),
        agreementSentAt: parseCRMDate(pick(row, columns.agreementSentAt)),
        agreementSignedAt: parseCRMDate(pick(row, columns.agreementSignedAt)),
        dealValueActual: numberValue(pick(row, columns.dealValueActual)),
        duplicateFlag: text(pick(row, columns.duplicateFlag)),
        firstContactAt: parseCRMDate(pick(row, columns.firstContactAt)),
        firstPaymentAt: parseCRMDate(pick(row, columns.firstPaymentAt)),
        firstResponseAt: parseCRMDate(pick(row, columns.firstResponseAt)),
        firstTouchCampaign: text(pick(row, columns.firstTouchCampaign)),
        firstTouchContent: text(pick(row, columns.firstTouchContent)),
        firstTouchMedium: text(pick(row, columns.firstTouchMedium)),
        firstTouchSource,
        fullPaymentAt: parseCRMDate(pick(row, columns.fullPaymentAt)),
        lawyerHandoverAt: parseCRMDate(pick(row, columns.lawyerHandoverAt)),
        lostAt: parseCRMDate(pick(row, columns.lostAt)),
        meetingBookedAt: parseCRMDate(pick(row, columns.meetingBookedAt)),
        meetingHeldAt: parseCRMDate(pick(row, columns.meetingHeldAt)),
        originalServiceInterest,
        paymentStatus: text(pick(row, columns.paymentStatus)),
        qualifiedService,
        ...serviceInfo,
        utmCampaign: text(pick(row, columns.utmCampaign)),
        utmContent: text(pick(row, columns.utmContent)),
        utmMedium: text(pick(row, columns.utmMediumLegacy)) || text(pick(row, columns.firstTouchMedium)),
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
