"use client";

import Link from "next/link";
import { History, ChartNoAxesCombined } from "lucide-react";
import { useReportLanguage } from "./report-language";

export function ReportSwitcher({ active }: { active: "planfix" | "kommo" }) {
  const { t } = useReportLanguage();
  return <nav aria-label={t("CRM report version")} className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
    <Link href="/" aria-current={active === "planfix" ? "page" : undefined} className={`inline-flex min-w-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${active === "planfix" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}><History size={16} className="shrink-0" />{t("Old Report for PlanFix")}</Link>
    <Link href="/kommo" aria-current={active === "kommo" ? "page" : undefined} className={`inline-flex min-w-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${active === "kommo" ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}><ChartNoAxesCombined size={16} className="shrink-0" />{t("New Report for Kommo")}</Link>
  </nav>;
}
