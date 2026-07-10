import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { messages, currentProfile } = await req.json();

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const conversation = messages
      .map((m: { role: string; content: string }) =>
        `${m.role === "user" ? "Student" : "Teacher"}: ${m.content}`
      )
      .join("\n");

    const prompt = `You are analyzing a Japanese language learning conversation to update a student profile.

Current profile:
${JSON.stringify(currentProfile ?? {}, null, 2)}

Recent conversation:
${conversation}

Based on this conversation, update what you know about the student. Rules:
- Only update a field if you have clear evidence from this conversation
- For arrays: ADD new items to existing ones, never remove existing items, deduplicate
- level: JLPT estimate (N5 / N4 / N3 / N2 / N1 / unknown)
- native_language: their native language if revealed
- motivation: why they are learning Japanese (e.g. "anime", "work", "travel to Japan", "family")
- occupation: their job or field if mentioned (e.g. "software engineer", "student", "teacher")
- learning_goals: specific goals they express (e.g. "pass JLPT N3", "watch anime without subtitles", "hold basic conversations")
- hobbies: personal interests they mention beyond Japanese study
- weak_points: general areas they struggle with (vocab, reading kanji, etc.)
- strong_points: things they handle correctly and confidently
- common_errors: recurring specific mistakes observed (e.g. "forgets を after direct objects", "overuses ます in casual speech") — only concrete observed errors
- grammar_weak_points: specific grammar patterns they struggle with (e.g. "て-form conjugation", "は vs が distinction", "conditional たら/ば/と", "passive voice", "〜てしまう usage") — be precise, add only patterns with clear evidence from THIS conversation
- preferred_topics: topics they enjoy discussing or ask about often
- personality: brief learning-style note (e.g. "likes humor", "prefers detailed explanations", "needs encouragement") — update if new evidence, otherwise keep
- vocabulary_introduced: Japanese words/phrases explicitly taught or explained in this conversation (romaji not needed; keep list under 50 total, drop oldest if over)
- recent_topics: the last 5–10 topics or themes discussed (e.g. "anime", "weekend plans", "food", "JLPT prep") — keep most recent, drop oldest beyond 10
- personal_facts: specific personal facts the student revealed (e.g. "好きな食べ物: ラーメン", "出身: フィリピン", "好きなアニメ: ワンピース", "好きなスポーツ: バスケ") — add when student reveals preferences; never remove; keep concise; deduplicate
- notes: any other useful teaching observations (keep concise, 1–2 sentences max)

If nothing new is learned about a field, keep its existing value exactly as-is.

Return ONLY valid JSON, no explanation, no markdown:
{
  "level": "...",
  "native_language": "...",
  "motivation": "...",
  "occupation": "...",
  "learning_goals": [],
  "hobbies": [],
  "weak_points": [],
  "strong_points": [],
  "common_errors": [],
  "preferred_topics": [],
  "personality": "...",
  "vocabulary_introduced": [],
  "grammar_weak_points": [],
  "recent_topics": [],
  "personal_facts": [],
  "notes": "..."
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in response");

    return NextResponse.json(JSON.parse(match[0]));
  } catch (e) {
    console.error("update-profile error:", e);
    // Return the existing profile unchanged on failure
    const { currentProfile } = await req.json().catch(() => ({ currentProfile: {} }));
    return NextResponse.json(currentProfile ?? {});
  }
}
