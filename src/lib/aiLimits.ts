// Daily caps per AI-cost endpoint. Tune here — nothing else needs to change.
// Safe to import from client code (no Supabase client, no secrets) — the
// server-only enforcement lives in rateLimit.ts, which re-exports this.
export const AI_DAILY_LIMITS = {
  generate: 150,         // words card-generated per day
  chat: 50,               // sensei messages per day
  tts: 0,                 // Gemini voice plays per day (chat replies + listening quiz audio) —
                          // the priciest call in the app; free tier always falls back to the
                          // browser's own speech synthesis instead. Premium-only for now.
  tts_preview: 0,         // voice-picker "preview" samples per day — same gate as tts
  quiz_grammar: 8,       // grammar quiz rounds per day
  quiz_sentences: 8,     // reading quiz rounds per day
  quiz_listening: 8,     // listening quiz rounds per day
  reader_generate: 15,    // AI-written reading passages per day
  reader_annotate: 25,    // passages glossed (pasted or generated) per day
  reader_ask: 30,         // "ask about this passage" questions per day
  mnemonic: 30,           // kanji mnemonics generated per day — most taps hit the
                          // master_cards cache and never reach this limit at all
  learning_insights: 5,   // admin-only "analyze my progress" narrative per day
  line_explain: 50,       // "Explain this line" (Reader sentences / Watch captions) per day —
                          // repeat views of a line are cached client-side and don't count
} as const;

// Premium gets a higher ceiling, not a bypass — even a paying user shouldn't
// have truly unlimited AI spend (a script/abuse case could still cost more
// than the subscription covers). Admin accounts are the only fully-exempt
// tier, since those are internal/dev, not customer-facing.
export const AI_DAILY_LIMITS_PREMIUM = {
  generate: 750,
  chat: 200,
  tts: 80,
  tts_preview: 60,
  quiz_grammar: 30,
  quiz_sentences: 30,
  quiz_listening: 30,
  reader_generate: 50,
  reader_annotate: 80,
  reader_ask: 100,
  mnemonic: 80,
  learning_insights: 15,
  line_explain: 150,
} as const;

export type AiEndpoint = keyof typeof AI_DAILY_LIMITS;
