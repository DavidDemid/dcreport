import * as XLSX from "xlsx";

export type DateIssue = { field: string; reason: "invalid" | "future" | "before_creation"; raw: string };
export type MetaSubmission = {
  leadId: string;
  formId: string;
  adId: string;
  isOrganic: boolean | null;
};
export type KommoLead = {
  id: string;
  row: number;
  title: string;
  contact: string;
  email: string;
  phone: string;
  owner: string;
  stage: string;
  reachedStages: string[];
  pipeline: string;
  service: string;
  originalService: string;
  qualifiedService: string;
  country: string;
  language: string;
  source: string;
  sourceRaw: string;
  sourceMethod: string;
  sourceEvidence?: string[];
  metaSubmissions?: MetaSubmission[];
  captureMethod: string;
  campaign: string;
  medium: string;
  relevancy: string;
  paymentStatus: string;
  sale: number | null;
  payments: number[];
  paymentAmounts?: (number | null)[];
  touches: number | null;
  migrated: boolean;
  oldId: string;
  createdAt: Date | null;
  importedAt: Date | null;
  modifiedAt: Date | null;
  firstContactAt: Date | null;
  inWorkAt: Date | null;
  agreementSentAt: Date | null;
  agreementSignedAt: Date | null;
  firstPaymentAt: Date | null;
  secondPaymentAt: Date | null;
  thirdPaymentAt: Date | null;
  fullPaymentAt: Date | null;
  handoverAt: Date | null;
  completedAt: Date | null;
  meetingBookedAt: Date | null;
  meetingHeldAt: Date | null;
  meetingCancelledAt: Date | null;
  meetingResult: string;
  nextTaskAt: Date | null;
  closedAt: Date | null;
  lostAt: Date | null;
  legacyLostAt: Date | null;
  rejectionReason: string;
  test: boolean;
  issues: DateIssue[];
  filled: string[];
  mergedIds: string[];
};
export type KommoDataset = { leads: KommoLead[]; asOf: Date; headers: string[] };
type Cell = string | number | boolean | Date | null | undefined;

const DAY = 86_400_000;
const value = (cell: Cell) => cell == null ? "" : String(cell).trim();
const key = (cell: Cell) => value(cell).replace(/^\uFEFF/, "").toLowerCase().replace(/\s+/g, " ");
const metaIdValue = (id: string) => id.trim().replace(/^l:/i, "").trim();

/** Consolidate provenance only; conflicting or missing organic flags never become paid. */
export function mergeMetaSubmissions(submissions: readonly MetaSubmission[]): MetaSubmission[] {
  const byId = new Map<string, MetaSubmission>();
  for (const submission of submissions) {
    const leadId = metaIdValue(submission.leadId);
    if (!leadId) continue;
    const normalized: MetaSubmission = {
      leadId, formId: metaIdValue(submission.formId), adId: metaIdValue(submission.adId),
      isOrganic: typeof submission.isOrganic === "boolean" ? submission.isOrganic : null,
    };
    const previous = byId.get(leadId);
    if (!previous) byId.set(leadId, normalized);
    else {
      previous.formId ||= normalized.formId;
      previous.adId ||= normalized.adId;
      if (previous.isOrganic !== normalized.isOrganic) previous.isOrganic = null;
    }
  }
  return [...byId.values()];
}
export const isoDay = (date: Date) => date.toISOString().slice(0, 10);
export const monthOf = (date: Date) => date.toISOString().slice(0, 7);
export const divide = (n: number, d: number): number | null => d ? n / d : null;
export const KOMMO_COLUMN_ALIASES = [
  ["Date Created", "Created on"], ["Last Modified", "Modified on"],
  ["Lead resp. user", "Respons. user"], ["Sale", "Lead sale €"], ["Main contact", "Fullname"],
  ["Work email (contact)", "Work email"], ["Personal email (contact)", "Personal email"], ["Other email (contact)", "Other email"],
  ["Mobile phone (contact)", "Mobile phone"], ["Work phone (contact)", "Work phone"], ["Other phone (contact)", "Other phone"],
  ["Country (contact)", "Country"], ["Language (contact)", "Language"],
] as const;

// Export timestamps have no UTC offset. Preserve their CRM calendar/time values.
export function parseKommoDate(cell: Cell): Date | null {
  if (cell instanceof Date) return Number.isFinite(cell.getTime()) ? cell : null;
  if (typeof cell === "number") {
    if (cell > 20_000 && cell < 100_000) return new Date(Date.UTC(1899, 11, 30) + cell * DAY);
    return null;
  }
  const raw = value(cell);
  if (!raw || /^(not closed|none|n\/a|0|-)$/i.test(raw)) return null;
  const european = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?(Z|[+-]\d{2}:\d{2})?$/);
  if (!european && !iso) return null;
  const parts = european ?? iso!;
  const year = Number(parts[european ? 3 : 1]);
  const month = Number(parts[2]);
  const day = Number(parts[european ? 1 : 3]);
  const hour = Number(parts[4] ?? 0), minute = Number(parts[5] ?? 0), second = Number(parts[6] ?? 0);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return null;
  const result = iso?.[7] && iso[7] !== "Z" ? new Date(raw) : date;
  return Number.isFinite(result.getTime()) ? result : null;
}

export function kommoNumber(cell: Cell): number | null {
  if (value(cell) === "") return null;
  const n = Number(value(cell).replace(/[\s\u00a0€$]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function kommoService(raw: string): string {
  const s = raw.toLowerCase();
  if (/\blt\b|lithuan/.test(s) && /citizen/.test(s)) return "Lithuanian citizenship by descent";
  if (/\blv\b|latvi/.test(s) && /citizen/.test(s)) return "Latvian citizenship by descent";
  if (/rbi|residen/.test(s) && /real.?estate/.test(s)) return "Latvia RBI through real estate";
  if (/rbi|residen/.test(s) && /\blt\b|lithuan/.test(s)) return "Lithuania residence through business / company";
  if (/rbi|residen/.test(s) && /company|investment|business/.test(s)) return "Latvia RBI through company / investment";
  if (/formation|registration|incorporation|company|business/.test(s)) return "Company / business registration";
  if (/50.?50|initialization/.test(s)) return "Citizenship eligibility assessment (50/50)";
  if (/partner/.test(s)) return "Partnership";
  return "Other / Unknown";
}

export const KOMMO_META_ADS_SOURCE = "Facebook / Instagram Ads";
export const KOMMO_META_CHAT_SOURCE = "Facebook / Instagram chat";
export const KOMMO_META_UNKNOWN_SOURCE = "Facebook / Instagram (source unknown)";

const isMetaSource = (raw: string) => /facebook|instagram|\bfb\b|\big\b|\bmeta\b|\bmessenger\b|\bm\.me\b/i.test(raw.replace(/[_-]/g, " "));
const isOrganicMeta = (raw: string) => /\borganic\b|\bunpaid\b|\b(?:not|non)\s+paid\b|\bno\s+ads?\b/i.test(raw.replace(/[_-]/g, " "));
const isPaidMeta = (raw: string) => !isOrganicMeta(raw) && /\b(?:ads?|advertising|advertisement|cpc|ppc|cpm|paid)\b/i.test(raw.replace(/[_-]/g, " "));

function metaChatCapture(raw: string): string | null {
  const text = raw.replace(/[_-]/g, " ");
  if (!isMetaSource(text) || !/\b(?:chat|messenger|direct|dm|inbox)\b|\bm\.me\b/i.test(text)) return null;
  if (/facebook|\bfb\b/i.test(text) && /instagram|\big\b/i.test(text)) return KOMMO_META_CHAT_SOURCE;
  return /instagram|\big\b/i.test(text) ? "Instagram chat" : "Messenger";
}

function sourceName(raw: string, medium = ""): string {
  const s = raw.toLowerCase();
  if (!s || /^(unknown|not set|\(not set\))$/.test(s)) return "Unknown";
  if (/google|gclid/.test(s)) return /organic|seo/.test(`${s} ${medium}`) ? "Organic Search" : "Google Ads";
  if (/bing|msclkid/.test(s)) return /organic/.test(medium) ? "Organic Search" : "Bing Ads";
  if (isMetaSource(raw)) {
    if (isOrganicMeta(`${raw} ${medium}`)) return "Organic Social";
    if (isPaidMeta(raw) || isPaidMeta(medium)) return KOMMO_META_ADS_SOURCE;
    return metaChatCapture(raw) ? KOMMO_META_CHAT_SOURCE : KOMMO_META_UNKNOWN_SOURCE;
  }
  if (/organic social/.test(s)) return "Organic Social";
  if (/organic|seo/.test(s)) return "Organic Search";
  if (/bridgewest|partner|simona/.test(s)) return "Partner";
  if (/chatgpt|perplexity|claude|\bai\b/.test(s)) return "AI referral";
  if (/calendly/.test(s)) return "Calendly";
  if (/whatsapp/.test(s)) return "WhatsApp";
  if (/website/.test(s)) return "Website / source unknown";
  if (/direct.*referral|referral.*direct/.test(s)) return "Direct / email / referral (mixed)";
  if (/direct|email|phone/.test(s)) return "Direct";
  if (/referral/.test(s)) return "Referral";
  if (/newsletter/.test(s)) return "Newsletter";
  return "Other";
}

function countryName(raw: string): string {
  const name = raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const codes: Record<string, string> = { USA: "US", UK: "GB" };
  const code = codes[name.toUpperCase()] ?? name.toUpperCase();
  if (/^[A-Z]{2}$/.test(code)) {
    try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? name; } catch { /* Keep original. */ }
  }
  return name || "Unknown";
}

function crmWallClockNow(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()));
}

export function normalizeKommoRows(rows: Cell[][], now = crmWallClockNow()): KommoDataset {
  const headerRow = rows.findIndex((row) => row.some((c) => key(c) === "lead stage") && row.some((c) => key(c) === "id"));
  if (headerRow < 0) throw new Error("This is not a Kommo leads export. Expected ID, Lead stage and Date Created columns.");
  const headers = rows[headerRow].map(value);
  const columns = new Map(headers.map((h, i) => [key(h), i]));
  for (const [canonical, alias] of KOMMO_COLUMN_ALIASES) {
    if (!columns.has(key(canonical)) && columns.has(key(alias))) columns.set(key(canonical), columns.get(key(alias))!);
  }
  for (const required of ["id", "lead stage", "date created"]) {
    if (!columns.has(required)) throw new Error(`Missing required Kommo column: ${required}`);
  }
  const get = (row: Cell[], ...names: string[]) => {
    for (const name of names) {
      const index = columns.get(key(name));
      if (index !== undefined && value(row[index])) return value(row[index]);
    }
    return "";
  };
  const rawCell = (row: Cell[], name: string): Cell => {
    const index = columns.get(key(name));
    return index === undefined ? "" : row[index];
  };
  const dataRows = rows.slice(headerRow + 1).filter((row) => get(row, "ID"));
  const observed = dataRows.flatMap((row) => [parseKommoDate(rawCell(row, "Last Modified")), parseKommoDate(rawCell(row, "Date Created"))])
    .filter((date): date is Date => Boolean(date && date <= now));
  const asOf = observed.length ? new Date(observed.reduce((maximum, d) => Math.max(maximum, d.getTime()), 0)) : now;
  const cutoff = new Date(`${isoDay(asOf)}T23:59:59.999Z`);

  const leads = dataRows.map((row, index): KommoLead => {
    const issues: DateIssue[] = [];
    function date(field: string, creation: Date | null = null, scheduled = false): Date | null {
      const raw = get(row, field);
      if (!raw || /^(not closed|none|n\/a|0|-)$/i.test(raw)) return null;
      const parsed = parseKommoDate(rawCell(row, field));
      if (!parsed) { issues.push({ field, reason: "invalid", raw }); return null; }
      const originalCell = rawCell(row, field);
      const dateOnly = typeof originalCell === "number" ? Number.isInteger(originalCell)
        : typeof originalCell === "string" && /^(\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})$/.test(raw);
      if (!scheduled && parsed > (dateOnly ? cutoff : asOf)) { issues.push({ field, reason: "future", raw }); return null; }
      // Date-only payments are valid throughout their stated creation day.
      if (creation && (dateOnly ? isoDay(parsed) < isoDay(creation) : parsed < creation)) { issues.push({ field, reason: "before_creation", raw }); return null; }
      return parsed;
    }
    const importedAt = date("Date Created");
    const oldId = get(row, "Old Lead ID");
    let originalCreatedAt = date("Date Created(from Planfix)");
    if (originalCreatedAt && importedAt && originalCreatedAt > importedAt) {
      issues.push({ field: "Date Created(from Planfix)", reason: "invalid", raw: get(row, "Date Created(from Planfix)") });
      originalCreatedAt = null;
    }
    const createdAt = originalCreatedAt ?? importedAt;
    const qualifiedService = get(row, "Qualified service");
    const originalService = get(row, "Original service interest");
    const utmTag = get(row, "utm_tag");
    const query = new URLSearchParams(utmTag.includes("?") ? utmTag.slice(utmTag.indexOf("?") + 1) : utmTag);
    const medium = get(row, "first_touch_medium", "utm_medium*", "utm_medium");
    const captureRaw = get(row, "Marketing Source");
    const typeRaw = get(row, "Type");
    // Bare platform labels also occur on lead forms; only explicit chat evidence qualifies.
    const chatCapture = metaChatCapture(typeRaw) ?? metaChatCapture(captureRaw)
      ?? (isMetaSource(captureRaw) ? metaChatCapture(`${captureRaw} ${typeRaw}`) : null);
    const firstSource = get(row, "first_touch_source");
    const firstMedium = get(row, "first_touch_medium");
    const utmSource = get(row, "utm_source*", "utm_source");
    const utmMedium = get(row, "utm_medium*", "utm_medium");
    const tagSource = query.get("utm_source") ?? "";
    const tagMedium = query.get("utm_medium") ?? "";
    const metaId = get(row, "FB lead id");
    const organicFlag = get(row, "Fb is organic");
    const organicForm = /^(true|yes|1)$/i.test(organicFlag);
    const paidForm = /^(false|no|0)$/i.test(organicFlag);
    const submissionId = metaIdValue(metaId);
    const metaSubmissions: MetaSubmission[] = submissionId ? [{
      leadId: submissionId, formId: metaIdValue(get(row, "FB form id")), adId: metaIdValue(get(row, "Fb ad id")),
      isOrganic: organicForm ? true : paidForm ? false : null,
    }] : [];
    const candidate = (method: string, raw: string, ownMedium: string) => ({
      method, raw, medium: ownMedium,
      source: sourceName(raw, isMetaSource(raw) ? ownMedium : medium),
      evidence: raw ? [`${method}: ${raw}`, ...(ownMedium ? [`medium: ${ownMedium}`] : [])] : [],
    });
    const sourceCandidates = [
      candidate("first_touch_source", firstSource, firstMedium),
      candidate("utm_source", utmSource, utmMedium),
      candidate("utm_tag", tagSource, tagMedium),
      candidate("click_id", get(row, "gclid*", "gclid") ? "google" : query.has("gclid") ? "google" : "", ""),
      { method: "meta_lead_id", raw: metaId, medium: "", source: !metaId ? "Unknown" : organicForm ? "Organic Social" : paidForm ? KOMMO_META_ADS_SOURCE : KOMMO_META_UNKNOWN_SOURCE,
        evidence: metaId ? [`FB lead id present; Fb is organic=${organicFlag || "not recorded"}`] : [] },
      candidate("Marketing Source", captureRaw, !firstSource && firstMedium ? firstMedium : !utmSource && utmMedium ? utmMedium : !tagSource ? tagMedium : ""),
      candidate("Type", chatCapture ? typeRaw : "", ""),
    ];
    // Resolve the platform by existing priority; lower Meta proof may clarify paid/organic,
    // but never replaces an earlier Google/other acquisition source with a capture route.
    const attributed = sourceCandidates.find(({ source }) => !["Unknown", "Other"].includes(source))
      ?? sourceCandidates.find(({ source }) => source === "Other");
    if (attributed && [KOMMO_META_UNKNOWN_SOURCE, KOMMO_META_CHAT_SOURCE].includes(attributed.source)) {
      const proof = sourceCandidates.slice(sourceCandidates.indexOf(attributed) + 1)
        .find(({ source }) => source === KOMMO_META_ADS_SOURCE || source === "Organic Social");
      if (proof) { attributed.source = proof.source; attributed.evidence.push(...proof.evidence); }
      else if (chatCapture) attributed.source = KOMMO_META_CHAT_SOURCE;
    }
    if (attributed && chatCapture) attributed.evidence.push(`captureMethod: ${chatCapture}`, ...(captureRaw ? [`Marketing Source: ${captureRaw}`] : []), ...(typeRaw ? [`Type: ${typeRaw}`] : []));
    if (attributed?.source === KOMMO_META_UNKNOWN_SOURCE) attributed.evidence.push("Meta platform recorded; paid, organic or chat attribution is not established by the available fields.");
    const captureMethod = chatCapture ?? (/calendly/i.test(captureRaw) ? "Calendly" : /website/i.test(captureRaw) ? "Website form" : metaId ? "Meta lead form" : typeRaw || "Not recorded");
    const lead: KommoLead = {
      id: get(row, "ID"), row: index + headerRow + 2, title: get(row, "Lead title"), contact: get(row, "Main contact"),
      email: get(row, "Work email (contact)", "Personal email (contact)", "Other email (contact)").toLowerCase(),
      phone: get(row, "Mobile phone (contact)", "Work phone (contact)", "Other phone (contact)"),
      owner: get(row, "Lead resp. user") || "Unassigned", stage: get(row, "Lead stage"), reachedStages: [get(row, "Lead stage")], pipeline: get(row, "Pipeline") || "Unknown",
      service: kommoService(qualifiedService || originalService), originalService, qualifiedService,
      country: countryName(get(row, "Country (contact)")), language: get(row, "Language (contact)") || "Unknown",
      source: attributed?.source ?? "Unknown", sourceRaw: attributed?.raw ?? "", sourceMethod: attributed?.method ?? "unknown", sourceEvidence: attributed?.evidence ?? [], metaSubmissions, captureMethod,
      campaign: get(row, "first_touch_campaign", "utm_campaign*", "utm_campaign") || query.get("utm_campaign") || "Not recorded", medium,
      relevancy: get(row, "Relevancy"), paymentStatus: get(row, "Payment status"), sale: kommoNumber(get(row, "Sale")),
      payments: ["Payment 1", "Payment 2", "Payment 3"].map((f) => kommoNumber(get(row, f)) ?? 0), touches: kommoNumber(get(row, "Touches made")),
      paymentAmounts: ["Payment 1", "Payment 2", "Payment 3"].map((f) => kommoNumber(get(row, f))),
      migrated: Boolean(oldId || get(row, "Date Created(from Planfix)")), oldId, createdAt, importedAt, modifiedAt: date("Last Modified"),
      firstContactAt: date("First contact at", createdAt), inWorkAt: date("TD_In work", createdAt), agreementSentAt: date("Agreement sent at", createdAt),
      agreementSignedAt: date("Agreement signed at", createdAt), firstPaymentAt: date("First payment at", createdAt), secondPaymentAt: date("Second payment at", createdAt),
      thirdPaymentAt: date("Third payment at", createdAt), fullPaymentAt: date("Full payment at", createdAt), handoverAt: date("Lawyer handover at", createdAt),
      completedAt: date("TD_Lawyer has completed the work", createdAt), meetingBookedAt: date("Meeting booked at", createdAt), meetingHeldAt: date("Meeting held at", createdAt),
      meetingCancelledAt: date("Meeting cancelled at", createdAt), meetingResult: get(row, "Meeting result"), nextTaskAt: date("Next Task", null, true), closedAt: date("Closed at", createdAt),
      lostAt: date("Lost_date_at", createdAt), legacyLostAt: date("Lost at(from Planfix)", createdAt), rejectionReason: get(row, "Real Reason for Rejection", "Reason for Rejection"),
      test: /^(true|yes|1|так|да|test)$/i.test(get(row, "test")), issues,
      filled: headers.filter((_, col) => value(row[col]) !== ""), mergedIds: [get(row, "ID")],
    };
    for (const [earlierField, laterField, label] of [
      ["firstPaymentAt", "secondPaymentAt", "Second payment at"], ["secondPaymentAt", "thirdPaymentAt", "Third payment at"],
      ["firstPaymentAt", "fullPaymentAt", "Full payment at"], ["meetingBookedAt", "meetingHeldAt", "Meeting held at"],
    ] as const) {
      const earlier = lead[earlierField], later = lead[laterField];
      if (earlier && later && isoDay(later) < isoDay(earlier)) {
        issues.push({ field: label, reason: "invalid", raw: get(row, label) }); lead[laterField] = null;
      }
    }
    return lead;
  });
  return { leads, asOf, headers };
}

export async function parseKommoWorkbook(buffer: ArrayBuffer): Promise<KommoDataset> {
  // Decode CSV as UTF-8 explicitly, avoiding XLSX's legacy codepage detection.
  const bytes = new Uint8Array(buffer);
  const zipped = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const binaryXls = bytes[0] === 0xd0 && bytes[1] === 0xcf;
  const workbook = zipped || binaryXls
    ? XLSX.read(buffer, { type: "array", cellDates: false, raw: true })
    : XLSX.read(new TextDecoder("utf-8").decode(bytes), { type: "string", raw: true });
  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Cell[]>(workbook.Sheets[name], { header: 1, blankrows: false, defval: "", raw: true });
    if (rows.slice(0, 20).some((row) => row.some((c) => key(c) === "lead stage"))) {
      const parsed = normalizeKommoRows(rows);
      if (parsed.leads.length && !parsed.leads.some((lead) => lead.createdAt)) throw new Error("No valid lead creation dates found. Check Date Created format and the export timezone before replacing the current dataset.");
      return parsed;
    }
  }
  throw new Error("No Kommo leads table found. Upload a CSV or XLSX export containing Lead stage and Date Created.");
}

function earliest(leads: KommoLead[], field: keyof KommoLead): Date | null {
  const dates = leads.map((l) => l[field]).filter((d): d is Date => d instanceof Date);
  return dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
}

export function cleanKommoLeads(leads: KommoLead[]) {
  const byId = new Map<string, KommoLead>();
  let repeatedIds = 0, tests = 0;
  for (const lead of leads) {
    if (lead.test) { tests++; continue; }
    const previous = byId.get(lead.id);
    if (previous) repeatedIds++;
    const latest = !previous || (lead.modifiedAt?.getTime() ?? lead.row) >= (previous.modifiedAt?.getTime() ?? previous.row);
    if (previous) byId.set(lead.id, {
      ...(latest ? lead : previous),
      metaSubmissions: mergeMetaSubmissions([...(previous.metaSubmissions ?? []), ...(lead.metaSubmissions ?? [])]),
    });
    else byId.set(lead.id, lead);
  }
  const groups = new Map<string, KommoLead[]>();
  for (const lead of byId.values()) {
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email) ? lead.email : "";
    const phone = lead.phone.replace(/\D/g, "");
    const identity = email ? `email:${email}` : phone.length >= 8 ? `phone:${phone}` : `id:${lead.id}`;
    const group = `${identity}|||${lead.service}`;
    groups.set(group, [...(groups.get(group) ?? []), lead]);
  }
  const records: KommoLead[] = [];
  let merged = 0;
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
    let cluster: KommoLead[] = [];
    const flush = () => {
      if (!cluster.length) return;
      const chronological = [...cluster].sort((a, b) => (a.modifiedAt?.getTime() ?? a.createdAt?.getTime() ?? 0) - (b.modifiedAt?.getTime() ?? b.createdAt?.getTime() ?? 0));
      const working = chronological.filter((l) => !/^double|duplicate$/i.test(l.rejectionReason));
      const candidates = working.length ? working : chronological;
      const latest = candidates[candidates.length - 1];
      const source = cluster.find((l) => l.source !== "Unknown" && l.source !== "Website / source unknown") ?? cluster.find((l) => l.source !== "Unknown") ?? latest;
      const combined: KommoLead = {
        ...latest, createdAt: earliest(cluster, "createdAt"), migrated: cluster.some((l) => l.migrated),
        relevancy: [...candidates].reverse().find((l) => l.relevancy)?.relevancy ?? "",
        source: source.source, sourceRaw: source.sourceRaw, sourceMethod: source.sourceMethod, sourceEvidence: source.sourceEvidence, campaign: source.campaign, medium: source.medium,
        metaSubmissions: mergeMetaSubmissions(cluster.flatMap((lead) => lead.metaSubmissions ?? [])),
        reachedStages: [...new Set(cluster.flatMap((l) => l.reachedStages))],
        paymentStatus: [...chronological].reverse().find((l) => l.paymentStatus)?.paymentStatus ?? "",
        // Monetary amounts belong to the same opportunity; never sum duplicated deal values.
        sale: Math.max(...cluster.map((l) => l.sale ?? 0)), payments: [0, 1, 2].map((i) => Math.max(...cluster.map((l) => l.payments[i]))),
        paymentAmounts: [0, 1, 2].map((i) => {
          const amounts = cluster.flatMap((l) => l.paymentAmounts?.[i] == null ? [] : [l.paymentAmounts[i]!]);
          return amounts.length ? Math.max(...amounts) : null;
        }),
        mergedIds: cluster.flatMap((l) => l.mergedIds), issues: cluster.flatMap((l) => l.issues), filled: [...new Set(cluster.flatMap((l) => l.filled))],
      };
      const dates = ["firstContactAt", "inWorkAt", "agreementSentAt", "agreementSignedAt", "firstPaymentAt", "secondPaymentAt", "thirdPaymentAt", "fullPaymentAt", "handoverAt", "completedAt", "meetingBookedAt", "meetingHeldAt"] as const;
      for (const field of dates) combined[field] = earliest(cluster, field);
      records.push(combined);
      merged += cluster.length - 1;
      cluster = [];
    };
    for (const lead of sorted) {
      const first = cluster[0];
      if (first && (!first.createdAt || !lead.createdAt || lead.createdAt.getTime() - first.createdAt.getTime() > 30 * DAY)) flush();
      cluster.push(lead);
    }
    flush();
  }
  return { records, repeatedIds, merged, tests, raw: leads.length };
}
