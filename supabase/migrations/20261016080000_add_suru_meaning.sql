-- The English meaning of a suru-capable noun's する usage, which can differ from the
-- noun's own "english" field (急行 = "express train" as a noun, but 急行する = "to
-- rush/proceed directly" as a verb — a genuinely different meaning, not just a form
-- change). Nullable, filled in the same way as the other grammar fields: by Gemini at
-- generation time for new words, lazily from Jisho for old ones.
alter table master_cards add column if not exists suru_meaning text;
