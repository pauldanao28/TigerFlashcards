-- Shared reference library of JLPT grammar patterns, mirroring master_cards for vocabulary.
CREATE TABLE IF NOT EXISTS grammar_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL,
  reading text,
  meaning text NOT NULL,
  jlpt_level text NOT NULL CHECK (jlpt_level IN ('N5','N4','N3','N2','N1')),
  example_jp text,
  example_en text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pattern, jlpt_level)
);

ALTER TABLE grammar_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grammar_patterns readable by authenticated users"
  ON grammar_patterns FOR SELECT
  TO authenticated
  USING (true);

-- Per-user per-pattern mastery, mirroring user_scores for vocabulary cards.
CREATE TABLE IF NOT EXISTS user_grammar_scores (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_id uuid NOT NULL REFERENCES grammar_patterns(id) ON DELETE CASCADE,
  pass integer NOT NULL DEFAULT 0,
  fail integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  percent integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pattern_id)
);

ALTER TABLE user_grammar_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_grammar_scores owned by user - select"
  ON user_grammar_scores FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_grammar_scores owned by user - insert"
  ON user_grammar_scores FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_grammar_scores owned by user - update"
  ON user_grammar_scores FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_grammar_patterns_level ON grammar_patterns(jlpt_level);
CREATE INDEX IF NOT EXISTS idx_user_grammar_scores_user ON user_grammar_scores(user_id);
