import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { difficultyLabel } from "@/lib/scoring";

function nextLevelLabel(score: number): string {
  return difficultyLabel(Math.min(100, score + 20));
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

function kanjiChars(s: string): string[] {
  return Array.from(s).filter(ch => /[一-龯㐀-䶿々〻]/.test(ch));
}

function bracketedIsValid(word: string, bracketed: string): boolean {
  const wk = kanjiChars(word);
  if (wk.length === 0) {
    // Kana-only word (する, くる, etc.) — accept if bracketed starts with same char or stem
    const stem = word.length > 1 ? word.slice(0, -1) : word;
    return bracketed.startsWith(stem) || bracketed[0] === word[0];
  }
  const bk = kanjiChars(bracketed);
  // All kanji in target must appear at the start of bracketed's kanji sequence
  return bk.length >= wk.length && wk.every((k, i) => bk[i] === k);
}

function repairBracket(word: string, sentenceJp: string): string {
  const raw = sentenceJp.replace(/【(.*?)】/g, "$1");

  // 1. Exact dictionary form in sentence
  const exactIdx = raw.indexOf(word);
  if (exactIdx >= 0) {
    return raw.slice(0, exactIdx) + `【${word}】` + raw.slice(exactIdx + word.length);
  }

  // 2. Find kanji stem + trailing hiragana (conjugated form)
  const wk = kanjiChars(word);
  if (wk.length > 0) {
    let searchFrom = 0;
    while (searchFrom < raw.length) {
      const firstKanjiIdx = raw.indexOf(wk[0], searchFrom);
      if (firstKanjiIdx === -1) break;
      // Walk through the kanji sequence, skipping interleaved hiragana
      let ri = firstKanjiIdx, ki = 0;
      while (ki < wk.length && ri < raw.length) {
        if (raw[ri] === wk[ki]) { ki++; ri++; }
        else if (/[ぁ-ん]/.test(raw[ri])) { ri++; }
        else break;
      }
      if (ki === wk.length) {
        // Extend through trailing hiragana (conjugation ending)
        while (ri < raw.length && /[ぁ-んー]/.test(raw[ri])) ri++;
        const conjugated = raw.slice(firstKanjiIdx, ri);
        return raw.slice(0, firstKanjiIdx) + `【${conjugated}】` + raw.slice(ri);
      }
      searchFrom = firstKanjiIdx + 1;
    }
  }

  // 3. Last resort: bracket just the dictionary form (no real sentence context)
  return `【${word}】`;
}

function validateSentences(sentences: any[]): any[] {
  return sentences.map((s: any) => {
    const match = s.sentence_jp?.match(/【(.*?)】/);
    if (!match) return s; // no brackets — pass through as-is
    if (bracketedIsValid(s.word, match[1])) return s;
    return { ...s, sentence_jp: repairBracket(s.word, s.sentence_jp) };
  });
}

export async function POST(req: Request) {
  try {
    const { cards, difficulty = 30 } = await req.json();

    if (!Array.isArray(cards) || cards.length === 0) {
      return NextResponse.json({ error: "cards must be a non-empty array" }, { status: 400 });
    }

    const wordList = (cards as { japanese: string; reading: string; english: string }[])
      .map((c, i) => `${i + 1}. ${c.japanese}（${c.reading}）= ${c.english}`)
      .join("\n");

    const grammarTarget = difficultyLabel(difficulty);
    const nextTarget = nextLevelLabel(difficulty);

    const prompt = `You are a Japanese sentence generator for language learners.

For each word below, write one short, natural Japanese sentence that uses that word.

Rules:
- Grammar difficulty: ${grammarTarget}
- Sentence length: 1–2 short clauses, natural and concise
- Freely use any natural verb/adjective form — dictionary form, て-form, た-form, ている, てから, ないで, たい, polite/casual — whatever fits the sentence best
- Vary sentence structures across words (don't repeat the same pattern)
- Wrap ONLY the conjugated form of the target word as it appears in the sentence with【】
- The "word" field must always be the dictionary form (as given in the list)
- Provide a natural English translation
- Exposure rule: naturally include 1 vocabulary word from the next level up (${nextTarget}) somewhere in the sentence — not as the target word, just as supporting context to expose the learner to new words worth mining

Words:
${wordList}

Return ONLY a valid JSON array, no markdown, no explanation:
[{"word":"食べる","sentence_jp":"野菜を【食べてから】、デザートを食べよう。","sentence_en":"Let's eat dessert after eating vegetables."}]`;

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Sentence generation timed out")), 40000)
    );

    const tryWithModel = async (modelId: string) => {
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await Promise.race([model.generateContent(prompt), timeout]);
      return result.response.text();
    };

    let raw: string;
    try {
      raw = await tryWithModel("gemini-2.5-flash-lite");
    } catch {
      raw = await tryWithModel("gemini-2.5-flash");
    }

    const cleaned = raw
      .trimStart()
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/gm, "")
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return NextResponse.json({ sentences: validateSentences(parsed) });
    } catch {}

    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        const parsed = JSON.parse(arrMatch[0]);
        if (Array.isArray(parsed)) return NextResponse.json({ sentences: validateSentences(parsed) });
      } catch {}
    }

    return NextResponse.json({ error: "Failed to parse sentences" }, { status: 500 });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Sentence generation failed", detail }, { status: 500 });
  }
}
