import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
