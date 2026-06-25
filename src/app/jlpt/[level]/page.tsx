import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

const JLPT_DATA = {
  n5: {
    level: "N5",
    label: "Beginner",
    wordCount: "~800",
    description:
      "The JLPT N5 is the entry level of the Japanese Language Proficiency Test. It covers basic vocabulary used in everyday situations — greetings, numbers, directions, food, and common objects.",
    topics: ["Greetings & introductions", "Numbers & time", "Food & drink", "Colors & adjectives", "Basic verbs", "Family & people"],
    sampleWords: [
      { japanese: "食べる", reading: "たべる", english: "to eat" },
      { japanese: "大きい", reading: "おおきい", english: "big" },
      { japanese: "学校", reading: "がっこう", english: "school" },
      { japanese: "友達", reading: "ともだち", english: "friend" },
      { japanese: "水", reading: "みず", english: "water" },
      { japanese: "電車", reading: "でんしゃ", english: "train" },
    ],
    tip: "N5 is the perfect starting point. Most learners can reach this level in 3–6 months of consistent study.",
  },
  n4: {
    level: "N4",
    label: "Elementary",
    wordCount: "~1,500",
    description:
      "JLPT N4 expands on N5 with more complex grammar patterns and a broader vocabulary set covering daily life, hobbies, work, and simple opinions.",
    topics: ["Daily routines", "Shopping & money", "Transportation", "Hobbies", "Simple opinions", "Weather & seasons"],
    sampleWords: [
      { japanese: "練習", reading: "れんしゅう", english: "practice" },
      { japanese: "困る", reading: "こまる", english: "to be troubled" },
      { japanese: "予定", reading: "よてい", english: "schedule / plan" },
      { japanese: "説明", reading: "せつめい", english: "explanation" },
      { japanese: "急ぐ", reading: "いそぐ", english: "to hurry" },
      { japanese: "集める", reading: "あつめる", english: "to collect" },
    ],
    tip: "Passing N4 is a common milestone for anime fans — you'll understand the majority of dialogue in slice-of-life shows.",
  },
  n3: {
    level: "N3",
    label: "Intermediate",
    wordCount: "~3,750",
    description:
      "JLPT N3 bridges the gap between beginner and advanced. It tests reading comprehension of everyday topics and listening to natural-speed conversations.",
    topics: ["News & current events", "Workplace situations", "Abstract ideas", "Opinions & persuasion", "Problem solving", "Culture & society"],
    sampleWords: [
      { japanese: "影響", reading: "えいきょう", english: "influence / effect" },
      { japanese: "判断", reading: "はんだん", english: "judgment / decision" },
      { japanese: "増加", reading: "ぞうか", english: "increase" },
      { japanese: "記録", reading: "きろく", english: "record" },
      { japanese: "原因", reading: "げんいん", english: "cause / reason" },
      { japanese: "解決", reading: "かいけつ", english: "resolution / solution" },
    ],
    tip: "N3 is where many learners plateau. Consistent vocabulary drilling with spaced repetition is the fastest path through it.",
  },
  n2: {
    level: "N2",
    label: "Upper-Intermediate",
    wordCount: "~6,000",
    description:
      "JLPT N2 is a near-professional level recognized by many Japanese employers. It requires understanding complex written Japanese and fast spoken language.",
    topics: ["Business communication", "Academic texts", "Technical topics", "Literature excerpts", "Formal speech", "News articles"],
    sampleWords: [
      { japanese: "把握", reading: "はあく", english: "grasp / understanding" },
      { japanese: "促進", reading: "そくしん", english: "promotion / acceleration" },
      { japanese: "懸念", reading: "けねん", english: "concern / worry" },
      { japanese: "概念", reading: "がいねん", english: "concept / notion" },
      { japanese: "維持", reading: "いじ", english: "maintenance / preservation" },
      { japanese: "負担", reading: "ふたん", english: "burden / load" },
    ],
    tip: "N2 holders can work in many Japanese companies. Many university programs accept N2 as proof of language proficiency.",
  },
  n1: {
    level: "N1",
    label: "Advanced",
    wordCount: "~10,000",
    description:
      "JLPT N1 is the highest level, requiring mastery of nuanced vocabulary, complex grammar, and the ability to read virtually any Japanese text including legal and academic documents.",
    topics: ["Legal & official documents", "Academic research", "Classical Japanese elements", "Nuanced expressions", "Rare kanji", "Complex sentence patterns"],
    sampleWords: [
      { japanese: "逡巡", reading: "しゅんじゅん", english: "hesitation / wavering" },
      { japanese: "醸成", reading: "じょうせい", english: "fostering / cultivating" },
      { japanese: "凌駕", reading: "りょうが", english: "to surpass / to excel" },
      { japanese: "齟齬", reading: "そご", english: "discrepancy / contradiction" },
      { japanese: "払拭", reading: "ふっしょく", english: "to wipe away / dispel" },
      { japanese: "俯瞰", reading: "ふかん", english: "bird's-eye view / overview" },
    ],
    tip: "Less than 35% of test takers pass N1. The key differentiator is deep vocabulary — you need to know words you've rarely seen before.",
  },
};

type Level = keyof typeof JLPT_DATA;

export async function generateStaticParams() {
  return Object.keys(JLPT_DATA).map((level) => ({ level }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ level: string }>;
}): Promise<Metadata> {
  const { level } = await params;
  const data = JLPT_DATA[level as Level];
  if (!data) return {};

  return {
    title: `Free JLPT ${data.level} Flashcards — ${data.label} Japanese Vocabulary`,
    description: `Study ${data.wordCount} JLPT ${data.level} vocabulary words with free AI-powered flashcards and spaced repetition. ${data.tip}`,
    keywords: [
      `JLPT ${data.level}`,
      `JLPT ${data.level} vocabulary`,
      `JLPT ${data.level} flashcards`,
      `JLPT ${data.level} study`,
      `${data.label} Japanese`,
      "free Japanese flashcards",
      "JLPT study app",
    ],
    openGraph: {
      title: `Free JLPT ${data.level} Flashcards — FlashKado`,
      description: `Study ${data.wordCount} JLPT ${data.level} vocabulary words with AI-powered spaced repetition. Free forever.`,
    },
  };
}

export default async function JLPTLevelPage({
  params,
}: {
  params: Promise<{ level: string }>;
}) {
  const { level } = await params;
  const data = JLPT_DATA[level as Level];
  if (!data) notFound();

  const allLevels = ["n5", "n4", "n3", "n2", "n1"] as const;

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Nav */}
      <nav className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-indigo-600 font-black text-xl tracking-tight italic uppercase">
          FlashKado
        </Link>
        <Link
          href="/login"
          className="bg-indigo-600 text-white px-5 py-2 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors"
        >
          Start Free
        </Link>
      </nav>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-16 pb-12 text-center">
        <span className="inline-block bg-indigo-100 text-indigo-700 font-black text-xs uppercase tracking-widest px-3 py-1 rounded-full mb-4">
          JLPT {data.level} · {data.label}
        </span>
        <h1 className="text-4xl md:text-5xl font-black text-slate-900 leading-tight mb-4">
          Free JLPT {data.level} Japanese Flashcards
        </h1>
        <p className="text-lg text-slate-500 max-w-xl mx-auto mb-8">
          {data.description}
        </p>
        <Link
          href="/login"
          className="inline-block bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black text-base uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
        >
          Study JLPT {data.level} Free →
        </Link>
        <p className="text-xs text-slate-400 mt-3 font-medium">No credit card. Free forever.</p>
      </section>

      {/* Stats bar */}
      <section className="bg-white border-y border-slate-100 py-8">
        <div className="max-w-3xl mx-auto px-6 grid grid-cols-3 gap-6 text-center">
          <div>
            <div className="text-3xl font-black text-indigo-600">{data.wordCount}</div>
            <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">Vocabulary Words</div>
          </div>
          <div>
            <div className="text-3xl font-black text-indigo-600">AI</div>
            <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">Powered Cards</div>
          </div>
          <div>
            <div className="text-3xl font-black text-indigo-600">Free</div>
            <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">Always</div>
          </div>
        </div>
      </section>

      {/* Sample words */}
      <section className="max-w-3xl mx-auto px-6 py-14">
        <h2 className="text-2xl font-black text-slate-800 mb-2">
          Sample JLPT {data.level} Vocabulary
        </h2>
        <p className="text-slate-400 text-sm mb-6">
          A preview of words you&apos;ll learn. FlashKado adds example sentences, readings, and context notes to every card.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.sampleWords.map((word) => (
            <div
              key={word.japanese}
              className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-4 shadow-sm"
            >
              <div className="text-2xl font-black text-slate-900 w-16 text-center shrink-0">
                {word.japanese}
              </div>
              <div>
                <div className="text-xs text-slate-400 font-medium">{word.reading}</div>
                <div className="text-sm font-bold text-slate-700">{word.english}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Topics */}
      <section className="bg-white border-y border-slate-100 py-14">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-black text-slate-800 mb-6">
            What You&apos;ll Study at JLPT {data.level}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {data.topics.map((topic) => (
              <div
                key={topic}
                className="bg-indigo-50 text-indigo-700 text-sm font-bold rounded-xl px-4 py-3 text-center"
              >
                {topic}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tip */}
      <section className="max-w-3xl mx-auto px-6 py-14">
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6">
          <div className="text-xs font-black uppercase tracking-widest text-amber-500 mb-2">Study Tip</div>
          <p className="text-slate-700 font-medium">{data.tip}</p>
        </div>
      </section>

      {/* How FlashKado helps */}
      <section className="bg-indigo-600 py-14">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-black text-white mb-4">
            Why FlashKado for JLPT {data.level}?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-10 text-left">
            {[
              { title: "AI Card Generation", body: "Type any Japanese word and get a full flashcard with reading, meaning, example sentence, and context — instantly." },
              { title: "Spaced Repetition", body: "Our algorithm shows you hard words more often and easy words less, so you learn in the least amount of time." },
              { title: "Friend Streaks", body: "Study with friends, see each other's daily progress, and keep each other accountable with streak tracking." },
            ].map((feat) => (
              <div key={feat.title} className="bg-indigo-500 rounded-2xl p-5">
                <div className="font-black text-white text-sm uppercase tracking-wide mb-2">{feat.title}</div>
                <p className="text-indigo-100 text-sm leading-relaxed">{feat.body}</p>
              </div>
            ))}
          </div>
          <Link
            href="/login"
            className="inline-block mt-10 bg-white text-indigo-600 px-8 py-4 rounded-2xl font-black text-base uppercase tracking-widest hover:bg-indigo-50 transition-colors"
          >
            Start Studying JLPT {data.level} Free
          </Link>
        </div>
      </section>

      {/* Other levels */}
      <section className="max-w-3xl mx-auto px-6 py-14">
        <h2 className="text-xl font-black text-slate-800 mb-6">Other JLPT Levels</h2>
        <div className="flex flex-wrap gap-3">
          {allLevels
            .filter((l) => l !== level)
            .map((l) => (
              <Link
                key={l}
                href={`/jlpt/${l}`}
                className="bg-white border border-slate-200 text-slate-700 font-bold px-5 py-2 rounded-xl text-sm hover:border-indigo-300 hover:text-indigo-600 transition-colors"
              >
                JLPT {l.toUpperCase()}
              </Link>
            ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 py-8 text-center text-xs text-slate-400">
        <Link href="/" className="text-indigo-600 font-bold">FlashKado</Link>
        {" · "}
        <Link href="/privacy" className="hover:text-slate-600">Privacy Policy</Link>
        {" · "}
        Free AI Japanese Flashcards
      </footer>
    </main>
  );
}
