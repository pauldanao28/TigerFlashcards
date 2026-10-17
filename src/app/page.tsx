import HomeClient from "@/components/HomeClient";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://flashkado.com";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "FlashKado",
  url: siteUrl,
  description:
    "AI-powered Japanese flashcard app with spaced repetition, JLPT vocabulary packs, friend streaks, and kana study tools.",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "AI-generated Japanese flashcards",
    "Spaced repetition algorithm",
    "JLPT N5–N1 vocabulary",
    "Hiragana and Katakana study",
    "Friend progress tracking",
    "Daily study streaks",
  ],
  inLanguage: ["en", "ja"],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomeClient />
    </>
  );
}
