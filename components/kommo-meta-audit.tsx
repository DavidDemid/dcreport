"use client";

import { filterLeads } from "@/lib/kommo-analytics";
import { KOMMO_META_ADS_SOURCE, KOMMO_META_UNKNOWN_SOURCE, type KommoLead } from "@/lib/kommo";
import { summarizeMetaEvidence } from "@/lib/kommo-meta";
import { buildKommoEvidence } from "@/lib/kommo-metric-evidence";
import { EvidenceButton } from "./metric-data-drawer";
import { Panel, num } from "./kommo-ui";
import { useReportLanguage } from "./report-language";
import type { ViewContext } from "./kommo-views";

const COPY = {
  en: {
    title: "Meta: acquisition source vs form records",
    help: "Acquisition source and a paid Meta form are different facts. A returning customer can submit a Meta form on an existing CRM lead. These counts use CRM creation dates, not the form submission date.",
    scope: "Audit across all channels. Service, manager, origin and cleanup settings remain applied. Only the right-hand column removes the creation-date filter.",
    metric: "Evidence", selected: "Selected creation dates", all: "All creation dates", source: "Meta Ads: acquisition source",
    records: "CRM leads with a confirmed paid Meta form", ids: "Unique paid submissions (FB lead ID)", duplicates: "Repeated paid form links across CRM leads",
    conflicts: "Paid Meta forms under another acquisition source", noForm: "Meta Ads without confirmed paid form evidence", unknown: "Forms with unknown organic / paid flag",
    unresolved: "Meta leads: paid / organic / chat not established",
    classification: "Facebook or Instagram alone does not identify an ad or a chat. Unresolved leads stay separate from both; use Data to inspect them. Only explicit chat evidence identifies a chat. Confirmed original acquisition sources are preserved.",
    collisions: "CRM leads sharing a Meta ID across different contacts",
    collisionNote: "A Meta ID linked to different emails or phone numbers needs an integration check. This is a potential collision, not proof that the people are duplicates; records are not automatically deleted or reattributed.",
    dates: "No Meta submission timestamp is used in this view. Counts follow CRM creation cohorts, not monthly form submissions in Ads Manager.",
    export: "An open-stage-only export can omit rejected or closed leads. Export all stages, all pipelines and the full history to reconcile campaign totals. Missing rows cannot be recovered from this file.",
    missing: "The FB lead id column is absent. Form counts are unavailable; source counts still use the available attribution fields.",
    missingFlag: "Fb is organic is absent. A form ID alone does not confirm that a form was paid.",
    fields: "Fields: FB lead id, FB form id, Fb ad id, Fb is organic, source attribution, original CRM creation date.",
    evidence: "Confirmed paid form means a Facebook lead ID and an explicit false organic flag. Repeated IDs are not additional unique form submissions. Ads without a form ID can be website leads; they are not automatically invalid.",
    formula: "Count of CRM lead records matching this evidence, without changing their original acquisition source or creation date.",
    unavailable: "Unavailable", noClosed: "Open-stage snapshot",
  },
  ru: {
    title: "Meta: источник привлечения и записи форм",
    help: "Источник привлечения и платная форма Meta — разные факты. Повторный клиент может отправить форму, связанную с уже существующим лидом. Здесь используются даты создания CRM-лидов, а не отправки форм.",
    scope: "Проверка по всем каналам. Услуги, менеджеры, происхождение и режим очистки сохранены. Только правая колонка снимает фильтр даты создания.",
    metric: "Подтверждение", selected: "Выбранные даты создания", all: "Все даты создания", source: "Meta Ads: источник привлечения",
    records: "CRM-лиды с подтверждённой платной формой Meta", ids: "Уникальные платные заявки (FB lead ID)", duplicates: "Повторные связи одной формы с CRM-лидами",
    conflicts: "Платные формы Meta под другим источником", noForm: "Meta Ads без подтверждённой платной формы", unknown: "Формы без явной отметки платная / органическая",
    unresolved: "Meta-лиды: реклама / органика / чат не определены",
    classification: "Одно значение Facebook или Instagram не доказывает рекламу или чат. Неуточнённые лиды учитываются отдельно от обеих групп; кнопка «Данные» открывает их список. Для чата нужен явный признак переписки. Подтверждённый исходный канал привлечения сохраняется.",
    collisions: "CRM-лиды с одним Meta ID на разных контактах",
    collisionNote: "Один Meta ID на разных email или телефонах требует проверки интеграции. Это потенциальная коллизия, а не доказательство дубля людей: записи не удаляются и не переносятся на другой канал автоматически.",
    dates: "В этом блоке не используется время отправки формы Meta. Показатели относятся к когортам создания CRM-лидов, а не к месяцу отправки форм в Ads Manager.",
    export: "Выгрузка только активных этапов может не включать отклонённых и закрытых лидов. Для сверки кампаний выгрузите все этапы, все воронки и всю историю. Отсутствующие строки невозможно восстановить из этого файла.",
    missing: "В выгрузке отсутствует столбец FB lead id. Количество форм недоступно; источники продолжают определяться по доступным полям атрибуции.",
    missingFlag: "В выгрузке отсутствует Fb is organic. Один ID формы не подтверждает платное привлечение.",
    fields: "Поля: FB lead id, FB form id, Fb ad id, Fb is organic, атрибуция источника, исходная дата создания CRM-лида.",
    evidence: "Подтверждённая платная форма: есть Facebook lead ID и явное false в признаке органики. Повторный ID не является новой уникальной формой. Реклама без ID формы может вести на сайт — это не делает лид ошибочным.",
    formula: "Количество записей CRM с этим подтверждением. Исходный источник привлечения и дата создания не меняются.",
    unavailable: "Недоступно", noClosed: "Срез активных этапов",
  },
};

export function KommoMetaAudit({ ctx }: { ctx: ViewContext }) {
  const { language } = useReportLanguage();
  const c = COPY[language];
  const scope = { ...ctx.scope, sources: [] };
  const selected = filterLeads(ctx.base, scope);
  const all = filterLeads(ctx.base, { ...scope, from: "", to: "" });
  const selectedEvidence = summarizeMetaEvidence(selected), allEvidence = summarizeMetaEvidence(all);
  const hasColumn = (header: string) => ctx.headers?.some((value) => value.trim().toLowerCase() === header.toLowerCase()) ?? all.some((lead) => lead.filled.includes(header));
  const hasId = hasColumn("FB lead id");
  const hasFlag = hasColumn("Fb is organic");
  const noClosed = !ctx.rawBase?.some((lead) => lead.closedAt || /closed|lost|rejected|won|successful/i.test(lead.stage));
  type Row = { title: string; a: number; b: number; records?: KommoLead[]; allRecords?: KommoLead[]; form?: boolean; paid?: boolean };
  const rows: Row[] = [
    { title: c.source, a: selected.filter((lead) => lead.source === KOMMO_META_ADS_SOURCE).length, b: all.filter((lead) => lead.source === KOMMO_META_ADS_SOURCE).length, records: selected.filter((lead) => lead.source === KOMMO_META_ADS_SOURCE), allRecords: all.filter((lead) => lead.source === KOMMO_META_ADS_SOURCE) },
    { title: c.unresolved, a: selected.filter((lead) => lead.source === KOMMO_META_UNKNOWN_SOURCE).length, b: all.filter((lead) => lead.source === KOMMO_META_UNKNOWN_SOURCE).length, records: selected.filter((lead) => lead.source === KOMMO_META_UNKNOWN_SOURCE), allRecords: all.filter((lead) => lead.source === KOMMO_META_UNKNOWN_SOURCE) },
    { title: c.records, a: selectedEvidence.paidRecords.length, b: allEvidence.paidRecords.length, records: selectedEvidence.paidRecords, allRecords: allEvidence.paidRecords, form: true, paid: true },
    { title: c.ids, a: selectedEvidence.paidFormIds.length, b: allEvidence.paidFormIds.length, form: true, paid: true },
    { title: c.duplicates, a: selectedEvidence.duplicatePaidLinks, b: allEvidence.duplicatePaidLinks, form: true, paid: true },
    { title: c.conflicts, a: selectedEvidence.otherSourceRecords.length, b: allEvidence.otherSourceRecords.length, records: selectedEvidence.otherSourceRecords, allRecords: allEvidence.otherSourceRecords, form: true, paid: true },
    { title: c.noForm, a: selectedEvidence.adsWithoutPaidFormRecords.length, b: allEvidence.adsWithoutPaidFormRecords.length, records: selectedEvidence.adsWithoutPaidFormRecords, allRecords: allEvidence.adsWithoutPaidFormRecords, form: true },
    { title: c.unknown, a: selectedEvidence.unknownOrganicRecords.length, b: allEvidence.unknownOrganicRecords.length, records: selectedEvidence.unknownOrganicRecords, allRecords: allEvidence.unknownOrganicRecords, form: true },
    { title: c.collisions, a: selectedEvidence.identityCollisionRecords.length, b: allEvidence.identityCollisionRecords.length, records: selectedEvidence.identityCollisionRecords, allRecords: allEvidence.identityCollisionRecords, form: true },
  ];
  function dataButton(row: Row, records: KommoLead[] | undefined, allDates: boolean) {
    if (!records || (row.form && (!hasId || (row.paid && !hasFlag)))) return null;
    return <EvidenceButton compact evidence={() => {
      const evidence = buildKommoEvidence("all", records, { raw: ctx.rawBase, language, scope: `${allDates ? c.all : `${ctx.scope.from || "..."} / ${ctx.scope.to || "..."}`} / ${c.scope}` });
      return { ...evidence, title: row.title, description: c.help, formula: c.formula, fields: [...new Set([...evidence.fields, "metaSubmissions"])], denominator: undefined, notice: `${c.classification} ${c.evidence} ${c.dates} ${c.collisionNote}` };
    }} />;
  }
  return <Panel title={c.title} help={c.help}>
    <p className="mb-3 text-xs leading-5 text-slate-500">{c.scope}</p>
    <p className="mb-4 text-sm leading-6 text-slate-700">{c.dates}</p>
    <p className="mb-3 text-xs leading-5 text-slate-600">{c.classification}</p>
    {!hasId && <p className="mb-3 border-l-2 border-amber-400 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">{c.missing}</p>}
    {hasId && !hasFlag && <p className="mb-3 text-xs leading-5 text-amber-900">{c.missingFlag}</p>}
    <table data-meta-audit className="w-full table-fixed text-xs tabular-nums"><colgroup><col style={{ width: "52%" }} /><col /><col /></colgroup>
      <thead><tr className="border-b border-slate-200 bg-slate-50"><th className="break-words px-2 py-3 text-left font-medium text-slate-600">{c.metric}</th><th className="break-words px-2 py-3 text-right font-medium text-slate-600">{c.selected}</th><th className="break-words px-2 py-3 text-right font-medium text-slate-600">{c.all}</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.title} className="border-b border-slate-100 last:border-0"><th scope="row" className="break-words px-2 py-3 text-left align-top font-normal leading-5 text-slate-700">{row.title}</th><td className="px-2 py-3 text-right align-top font-semibold text-slate-950">{row.form && (!hasId || (row.paid && !hasFlag)) ? c.unavailable : num(row.a)}{dataButton(row, row.records, false)}</td><td className="px-2 py-3 text-right align-top font-semibold text-slate-950">{row.form && (!hasId || (row.paid && !hasFlag)) ? c.unavailable : num(row.b)}{dataButton(row, row.allRecords, true)}</td></tr>)}</tbody>
    </table>
    <p className="mt-4 text-xs leading-5 text-slate-500">{c.evidence}</p>
    <p className="mt-2 text-xs leading-5 text-slate-500" translate="no">{c.fields}</p>
    {allEvidence.suspiciousFormIds.length > 0 && <p className="mt-2 text-xs leading-5 text-amber-900">{c.collisionNote}</p>}
    {noClosed && <p className="mt-3 border-l-2 border-amber-400 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"><span className="font-semibold">{c.noClosed}: </span>{c.export}</p>}
  </Panel>;
}
