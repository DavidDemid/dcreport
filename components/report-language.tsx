"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Globe } from "lucide-react";
import { translateReportText, type ReportLanguage, type ReportTranslator } from "@/lib/report-i18n";

export type { ReportLanguage } from "@/lib/report-i18n";
export { translateReportNode } from "@/lib/report-i18n";
type ReportLanguageContext = {
  language: ReportLanguage;
  locale: "en-GB" | "ru-RU";
  setLanguage: (language: ReportLanguage) => void;
  t: ReportTranslator;
};
const STORAGE_KEY = "dc-report-language";
const LanguageContext = createContext<ReportLanguageContext>({ language: "en", locale: "en-GB", setLanguage: () => {}, t: (text) => text });

export function ReportLanguageProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState<ReportLanguage>("en");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "ru") updateLanguage(saved);
    } catch { /* A blocked storage area must not prevent using the report. */ }
    function storageChanged(event: StorageEvent) {
      if (event.key === STORAGE_KEY && (event.newValue === "en" || event.newValue === "ru" || event.newValue === null)) updateLanguage(event.newValue ?? "en");
    }
    window.addEventListener("storage", storageChanged);
    return () => window.removeEventListener("storage", storageChanged);
  }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const setLanguage = useCallback((next: ReportLanguage) => {
    if (next !== "en" && next !== "ru") return;
    updateLanguage(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Keep the in-memory choice when persistence is unavailable. */ }
  }, []);
  const value = useMemo<ReportLanguageContext>(() => ({
    language, locale: language === "ru" ? "ru-RU" : "en-GB", setLanguage,
    t: (text) => translateReportText(text, language),
  }), [language, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useReportLanguage(): ReportLanguageContext {
  return useContext(LanguageContext);
}

export function LanguageSelector() {
  const { language, setLanguage, t } = useReportLanguage();
  return <label className="inline-flex h-10 max-w-full items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700">
    <Globe size={16} className="shrink-0" aria-hidden="true" />
    <select data-language-selector aria-label={t("Interface language")} value={language} onChange={(event) => setLanguage(event.target.value as ReportLanguage)} className="h-full min-w-0 bg-transparent text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
      <option value="en" lang="en">English</option><option value="ru" lang="ru">Русский</option>
    </select>
  </label>;
}
