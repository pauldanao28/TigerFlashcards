ALTER TABLE master_cards ADD COLUMN IF NOT EXISTS jlpt_level TEXT CHECK (jlpt_level IN ('N5','N4','N3','N2','N1'));
