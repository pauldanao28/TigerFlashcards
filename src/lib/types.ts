export interface FlashcardData {
  id: string;
  japanese: string;
  reading: string;    // Furigana/Kana
  english: string;
  
  // Advanced AI-driven metadata
  level?: number;     // JLPT Level (1-5)
  partOfSpeech?: 'verb' | 'noun' | 'adjective' | 'particle';
  exampleSentence?: {
    jp: string;
    en: string;
  };
  
  // Spaced Repetition (FSRS) Data
  alternatives?: string[];
  contextNote?: string;
  scores: {
    jp_to_en: { pass: number; fail: number; total: number; percent: number };
    en_to_jp: { pass: number; fail: number; total: number; percent: number };
  };
}

// This helps us toggle between "JP -> EN" or "EN -> JP"
export type StudyMode = 'recognition' | 'production';