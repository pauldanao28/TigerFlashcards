// Daily caps per AI-cost endpoint. Tune here — nothing else needs to change.
// Safe to import from client code (no Supabase client, no secrets) — the
// server-only enforcement lives in rateLimit.ts, which re-exports this.
export const AI_DAILY_LIMITS = {
  generate: 100,        // words card-generated per day
  chat: 20,              // sensei messages per day
  tts: 5,                 // Gemini voice plays per day (chat replies + listening quiz audio) — a free taste; browser voice fills in after this
  tts_preview: 20,        // voice-picker "preview" samples per day — kept separate so browsing voices never eats the tts tease
  quiz_grammar: 2,       // grammar quiz rounds per day
  quiz_sentences: 2,     // reading quiz rounds per day
  quiz_listening: 2,     // listening quiz rounds per day
} as const;

// Premium gets a higher ceiling, not a bypass — even a paying user shouldn't
// have truly unlimited AI spend (a script/abuse case could still cost more
// than the subscription covers). Admin accounts are the only fully-exempt
// tier, since those are internal/dev, not customer-facing.
export const AI_DAILY_LIMITS_PREMIUM = {
  generate: 500,
  chat: 100,
  tts: 60,
  tts_preview: 40,
  quiz_grammar: 10,
  quiz_sentences: 10,
  quiz_listening: 10,
} as const;

export type AiEndpoint = keyof typeof AI_DAILY_LIMITS;
