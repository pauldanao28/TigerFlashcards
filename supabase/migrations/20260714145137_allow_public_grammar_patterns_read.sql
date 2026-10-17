-- grammar_patterns is shared, non-sensitive reference content (same category as the
-- static kana chart) — allow anonymous reads so /learn/[level] can be browsed and
-- indexed without requiring login. user_grammar_scores (per-user mastery) stays
-- authenticated-only.
CREATE POLICY "grammar_patterns readable by anonymous users"
  ON grammar_patterns FOR SELECT
  TO anon
  USING (true);
