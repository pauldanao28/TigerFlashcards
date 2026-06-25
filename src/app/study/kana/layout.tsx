import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hiragana & Katakana Study",
  description:
    "Learn and quiz yourself on all 46 Hiragana and 46 Katakana characters. Free interactive kana study tool with pronunciation audio.",
  keywords: [
    "hiragana",
    "katakana",
    "learn hiragana",
    "learn katakana",
    "Japanese alphabet",
    "kana study",
  ],
};

export default function KanaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
