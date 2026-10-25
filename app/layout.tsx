import type { Metadata } from "next";
import "./globals.css";
import { ReportLanguageProvider } from "@/components/report-language";

export const metadata: Metadata = {
  title: "DC CRM Analytics",
  description: "Interactive CRM dashboards from uploaded XLSX exports",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body><ReportLanguageProvider>{children}</ReportLanguageProvider></body>
    </html>
  );
}
