import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/apiAuth";
import { checkAndRecordUsage } from "@/lib/rateLimit";

// Same sentence + 【bracket】 generation as /api/quiz/sentences, plus multiple-choice
// (choices/answer/explanation) for the Weak Words Quiz — reviewing cards picked for
// being slow-reflex/weak/struggling (client-side selection, this route only writes
// the quiz content for whichever cards it's handed).

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

function kanjiChars(s: string): string[] {
  return Array.from(s).filter((ch) => /[一-龯㐀-䶿々〻]/.test(ch));
}

function bracketedIsValid(word: string, bracketed: string): boolean {
  const wk = kanjiChars(word);
  if (wk.length === 0) {
    const stem = word.length > 1 ? word.slice(0, -1) : word;
    return bracketed.startsWith(stem) || bracketed[0] === word[0];
  }
  const bk = kanjiChars(bracketed);
  return bk.length >= wk.length && wk.every((k, i) => bk[i] === k);
}

function repairBracket(word: string, sentenceJp: string): string {
  const raw = sentenceJp.replace(/【(.*?)】/g, "$1");

  const exactIdx = raw.indexOf(word);
  if (exactIdx >= 0) {
    return raw.slice(0, exactIdx) + `【${word}】` + raw.slice(exactIdx + word.length);
  }

  const wk = kanjiChars(word);
  if (wk.length > 0) {
    let searchFrom = 0;
    while (searchFrom < raw.length) {
      const firstKanjiIdx = raw.indexOf(wk[0], searchFrom);
      if (firstKanjiIdx === -1) break;
      let ri = firstKanjiIdx, ki = 0;
      while (ki < wk.length && ri < raw.length) {
        if (raw[ri] === wk[ki]) { ki++; ri++; }
        else if (/[ぁ-ん]/.test(raw[ri])) { ri++; }
        else break;
      }
      if (ki === wk.length) {
        while (ri < raw.length && /[ぁ-んー]/.test(raw[ri])) ri++;
        const conjugated = raw.slice(firstKanjiIdx, ri);
        return raw.slice(0, firstKanjiIdx) + `【${conjugated}】` + raw.slice(ri);
      }
      searchFrom = firstKanjiIdx + 1;
    }
  }

  return `【${word}】`;
}

function isRealSentence(jp: string, word: string): boolean {
  const stripped = jp.replace(/【.*?】/g, (m: string) => m.slice(1, -1)).trim();
  return stripped.length > word.length + 3;
}

interface RawQuestion {
  id?: number | string;
  sentence_jp?: string;
  sentence_en?: string;
  choices?: unknown;
  answer?: string;
  explanation?: string;
}

interface ValidatedQuestion {
  id: number;
  sentence_jp: string;
  sentence_en: string;
  choices: string[];
  answer: string;
  explanation: string;
}

function validateQuestions(raw: RawQuestion[], cards: { japanese: string }[]): ValidatedQuestion[] {
  const out: ValidatedQuestion[] = [];
  for (const q of raw) {
    const id = typeof q.id === "number" ? q.id : parseInt(String(q.id), 10);
    if (!Number.isFinite(id) || id < 0 || id >= cards.length) continue;

    const choices = Array.isArray(q.choices) ? q.choices.map((c) => String(c)).filter(Boolean) : [];
    const answer = typeof q.answer === "string" ? q.answer : "";
    if (choices.length !== 4 || !choices.includes(answer)) continue;

    const word = cards[id].japanese;
    const jp = q.sentence_jp ?? "";
    if (!isRealSentence(jp, word)) continue;
    const match = jp.match(/【(.*?)】/);
    const fixed = !match ? jp : bracketedIsValid(word, match[1]) ? jp : repairBracket(word, jp);

    out.push({
      id,
      sentence_jp: fixed,
      sentence_en: q.sentence_en ?? "",
      choices,
      answer,
      explanation: q.explanation ?? "",
    });
  }
  return out;
}

export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const usage = await checkAndRecordUsage(user.id, "quiz_weak_words");
  if (!usage.allowed) {
    return NextResponse.json({ error: "Daily limit reached — come back tomorrow!" }, { status: 429 });
  }

  try {
    const { cards } = await req.json();
    if (!Array.isArray(cards) || cards.length === 0) {
      return NextResponse.json({ error: "cards must be a non-empty array" }, { status: 400 });
    }

    const typedCards = cards as { japanese: string; reading: string; english: string }[];
    const wordList = typedCards
      .map((c, i) => `${i}. ${c.japanese}（${c.reading}）= ${c.english}`)
      .join("\n");

    const prompt = `You are generating a vocabulary review quiz for a Japanese learner, for words
they're specifically struggling with — slow to recall, low accuracy, or both.

For each numbered word below, do ALL of the following:
1. Write one short, natural Japanese sentence that uses the word (any natural conjugated
   form — dictionary form, て-form, た-form, ている, たい, polite/casual, whatever fits).
   Wrap ONLY the conjugated form of the target word as it appears in the sentence with【】.
2. Give a natural English translation of the sentence.
3. Write exactly 4 English answer choices for "what does the bracketed word mean here?" —
   exactly one must be the word's correct meaning (matching the given meaning below, close
   wording is fine), and the other three must be plausible-but-wrong meanings of similar
   difficulty and part of speech — not absurd or obviously wrong, so it actually tests
   recall. Put them in a random order, not always the same position.
4. Set "answer" to the exact text of the correct choice (must exactly match one of "choices").
5. Write one short (1 sentence) explanation of why that's the meaning, referencing the
   sentence context — not a grammar lecture, just enough to clarify a wrong guess.

The "id" field must be the number from the list (0, 1, 2, …) — copy it exactly.

Words:
${wordList}

Return ONLY a valid JSON array, no markdown, no explanation outside the fields:
[{"id":0,"sentence_jp":"今日も仕事を【頑張った】。","sentence_en":"I worked hard at my job again today.","choices":["tried hard","gave up","forgot","complained"],"answer":"tried hard","explanation":"頑張った is the past tense of 頑張る, meaning to try hard or persevere."}]`;

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Quiz generation timed out")), 40000)
    );

    const tryWithModel = async (modelId: string) => {
      const model = genAI.getGenerativeModel({
        model: modelId,
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192 },
      });
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
      if (Array.isArray(parsed)) return NextResponse.json({ questions: validateQuestions(parsed, typedCards) });
    } catch { /* fall through to recovery below */ }

    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        const parsed = JSON.parse(arrMatch[0]);
        if (Array.isArray(parsed)) return NextResponse.json({ questions: validateQuestions(parsed, typedCards) });
      } catch { /* fall through to recovery below */ }
    }

    const objectMatches = cleaned.match(/\{[^{}]*"sentence_jp"[^{}]*\}/g);
    if (objectMatches && objectMatches.length > 0) {
      const recovered = objectMatches.flatMap((m) => {
        try { return [JSON.parse(m)]; } catch { return []; }
      });
      if (recovered.length > 0) {
        return NextResponse.json({ questions: validateQuestions(recovered, typedCards) });
      }
    }

    return NextResponse.json({ error: "Failed to parse quiz" }, { status: 500 });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Weak words quiz generation failed", detail }, { status: 500 });
  }
}
