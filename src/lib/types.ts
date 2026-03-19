// 1. The Global Library Content (from master_cards table)
export interface MasterCard {
  id: string;
  creator_id: string;
  japanese: string;
  reading: string;
  english: string;
  level?: number;
  partOfSpeech?: 'verb' | 'noun' | 'adjective' | 'particle' | string;
  exampleSentence?: {
    jp: string;
    en: string;
  };
  alternatives?: string[];
  contextNote?: string;
  is_public: boolean;
  created_at: string;
}

// 2. The Personal Progress (from user_scores table)
export interface UserScore {
  user_id: string;
  card_id: string;
  score: number; // Overall rank/mastery
  next_review_at: string;
  last_reviewed_at?: string;
  scores_json: {
    jp_to_en: ModeStats;
    en_to_jp: ModeStats;
  };
}

export interface ModeStats {
  pass: number;
  fail: number;
  total: number;
  percent: number;
}

// 3. The "Joined" Type for the UI (Used in Study/Stats pages)
// This is what your Supabase join queries will return
export type FlashcardData = MasterCard & {
  score: number;
  scores: UserScore['scores_json'];
  next_review_at: string;
};

export type StudyMode = 'recognition' | 'production';