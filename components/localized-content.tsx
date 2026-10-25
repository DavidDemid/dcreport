"use client";

import { type ReactNode } from "react";
import { translateReportNode, useReportLanguage } from "./report-language";

export function LocalizedContent({ children }: { children: ReactNode }) {
  const { t } = useReportLanguage();
  return translateReportNode(children, t);
}
