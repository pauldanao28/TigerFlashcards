import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TigerCards AI",
  description: "Advanced Japanese Learning",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="antialiased bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}