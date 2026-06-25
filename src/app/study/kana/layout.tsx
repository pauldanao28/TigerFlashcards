import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://flashkado.com";

export const metadata: Metadata = {
  title: "Hiragana & Katakana Flashcards — Free Interactive Kana Study",
  description:
    "Learn all 46 hiragana (あいうえお) and 46 katakana (アイウエオ) characters with free interactive flashcards and pronunciation audio. Quiz yourself with shuffled practice mode.",
  keywords: [
    "hiragana",
    "katakana",
    "learn hiragana",
    "learn katakana",
    "hiragana chart",
    "katakana chart",
    "hiragana flashcards",
    "katakana flashcards",
    "Japanese alphabet",
    "kana study",
    "あいうえお",
    "アイウエオ",
    "Japanese writing system",
    "free hiragana quiz",
  ],
  openGraph: {
    title: "Free Hiragana & Katakana Flashcards — FlashKado",
    description:
      "Master all 92 Japanese kana characters with interactive flashcards and audio pronunciation. Free forever.",
    url: `${siteUrl}/study/kana`,
  },
  alternates: {
    canonical: `${siteUrl}/study/kana`,
  },
};

export default function KanaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
