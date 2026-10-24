-- Cached kanji mnemonic (radical breakdown + memory story) for the back-of-card
-- "remember this kanji" helper. Lives on master_cards, not user_scores, because a
-- word's kanji origin doesn't depend on who's studying it — generated once via
-- Gemini on first request, then reused by every user who sees the same word.
alter table master_cards
  add column if not exists mnemonic jsonb;
