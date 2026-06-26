import type { Metadata } from "next";
import HomeClient from "@/components/HomeClient";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://flashkado.com";

export const metadata: Metadata = {
  title: "FlashKado — Free AI Japanese Flashcards & JLPT Vocabulary",
  description:
    "Learn Japanese vocabulary faster with AI-powered flashcards and spaced repetition. Free JLPT N5–N1 study tool with hiragana, katakana, friend streaks, and smart card scheduling.",
  alternates: {
    canonical: siteUrl,
  },
};

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

      {/* Server-rendered content for crawlers — hidden visually */}
      <section aria-label="About FlashKado" className="sr-only">
        <h1>Free AI Japanese Flashcards — FlashKado</h1>
        <p>
          FlashKado is a free Japanese vocabulary app that uses AI-powered
          flashcards and spaced repetition to help you learn faster and forget
          less. Study JLPT N5 through N1 vocabulary, master hiragana and
          katakana, and track your progress with daily study streaks.
        </p>

        <h2>How FlashKado Works</h2>
        <p>
          Type any Japanese word and our AI instantly generates a complete
          flashcard with the reading (furigana), English meaning, part of
          speech, and a natural example sentence. The spaced repetition
          algorithm then schedules each card based on your personal accuracy —
          hard words appear more often, easy words less — so you reach fluency
          in the least amount of study time.
        </p>

        <h2>Features</h2>
        <ul>
          <li>AI-generated flashcards with readings, meanings, and example sentences</li>
          <li>Spaced repetition scheduling based on your personal accuracy</li>
          <li>JLPT N5, N4, N3, N2, and N1 vocabulary packs</li>
          <li>Hiragana and katakana study with audio pronunciation</li>
          <li>Friend streaks — study with friends and track each other's daily progress</li>
          <li>Daily study goals with streak tracking</li>
          <li>Free forever — no credit card required</li>
        </ul>

        <h2>Study by JLPT Level</h2>
        <p>
          FlashKado covers all five levels of the Japanese Language Proficiency
          Test. Whether you are a complete beginner targeting JLPT N5 or an
          advanced learner preparing for JLPT N1, you can build your vocabulary
          deck and study at your own pace.
        </p>
        <ul>
          <li><a href="/jlpt/n5">JLPT N5 Flashcards — Beginner (~800 words)</a></li>
          <li><a href="/jlpt/n4">JLPT N4 Flashcards — Elementary (~1,500 words)</a></li>
          <li><a href="/jlpt/n3">JLPT N3 Flashcards — Intermediate (~3,750 words)</a></li>
          <li><a href="/jlpt/n2">JLPT N2 Flashcards — Upper-Intermediate (~6,000 words)</a></li>
          <li><a href="/jlpt/n1">JLPT N1 Flashcards — Advanced (~10,000 words)</a></li>
        </ul>

        <h2>Free Hiragana and Katakana Study</h2>
        <p>
          New to Japanese? Start with our free{" "}
          <a href="/study/kana">hiragana and katakana study tool</a>. Quiz
          yourself on all 92 kana characters with audio pronunciation and
          instant feedback. No account required.
        </p>

        <h2>Why Spaced Repetition?</h2>
        <p>
          Spaced repetition is the most scientifically proven method for
          long-term vocabulary retention. Instead of cramming, FlashKado shows
          you each word at the exact moment you are about to forget it —
          locking it into long-term memory with the fewest possible reviews.
          Studies show spaced repetition can be up to 200% more efficient than
          traditional flashcard study.
        </p>
      </section>
    </>
  );
}
