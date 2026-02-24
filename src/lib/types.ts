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
  passCount: number;
  failCount: number;
  totalTries: number;
  score: number; // This will store our % (0 to 100)
  alternatives?: string[];
  contextNote?: string;
}

// This helps us toggle between "JP -> EN" or "EN -> JP"
export type StudyMode = 'recognition' | 'production';