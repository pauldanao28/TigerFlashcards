// Daily caps per AI-cost endpoint. Tune here — nothing else needs to change.
// Safe to import from client code (no Supabase client, no secrets) — the
// server-only enforcement lives in rateLimit.ts, which re-exports this.
export const AI_DAILY_LIMITS = {
  generate: 200,        // words card-generated per day
  chat: 80,              // sensei messages per day
  tts: 400,               // audio clips played per day (fires on every card flip)
  quiz_grammar: 15,       // grammar quiz rounds per day
  quiz_sentences: 15,     // reading quiz rounds per day
  quiz_listening: 15,     // listening quiz rounds per day
} as const;

// Premium gets a higher ceiling, not a bypass — even a paying user shouldn't
// have truly unlimited AI spend (a script/abuse case could still cost more
// than the subscription covers). Admin accounts are the only fully-exempt
// tier, since those are internal/dev, not customer-facing.
export const AI_DAILY_LIMITS_PREMIUM = {
  generate: 1000,
  chat: 400,
  tts: 2000,
  quiz_grammar: 75,
  quiz_sentences: 75,
  quiz_listening: 75,
} as const;

export type AiEndpoint = keyof typeof AI_DAILY_LIMITS;
