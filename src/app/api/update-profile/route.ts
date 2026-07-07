import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { messages, currentProfile } = await req.json();

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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
- For arrays: ADD new items to existing ones, never remove existing items
- level: JLPT estimate (N5 / N4 / N3 / N2 / N1 / unknown)
- native_language: their native language if revealed
- hobbies: interests they mention
- weak_points: grammar/vocab patterns they struggle with (be specific, e.g. "て-form conjugation", "は vs が")
- strong_points: things they handle correctly and confidently
- preferred_topics: topics they enjoy or ask about
- notes: any other useful teaching observations (keep concise)

If nothing new is learned about a field, keep its existing value exactly as-is.

Return ONLY valid JSON, no explanation, no markdown:
{
  "level": "...",
  "native_language": "...",
  "hobbies": [],
  "weak_points": [],
  "strong_points": [],
  "preferred_topics": [],
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
