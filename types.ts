
export interface PuzzleData {
  internal_thought_process: string;
  image_url: string;
  original_caption_hidden: string;
  target_word_hidden: string;
  word_length: number;
  art_style: string;
  theme: string;
  category: string;
  puzzle_data_for_user: {
    redacted_caption: string;
    letter_pool: string[];
  };
}

export enum GameStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  PLAYING = 'PLAYING',
  WON = 'WON',
  LOST = 'LOST'
}

export interface HistoryItem {
  puzzle: PuzzleData;
  outcome: 'WON' | 'LOST';
  timestamp: number;
}

export interface GameState {
  status: GameStatus;
  puzzle: PuzzleData | null;
  nextPuzzles: PuzzleData[];
  userGuess: string[];
  attempts: number;
  maxAttempts: number;
  guessedLetters: Set<string>;
  score: {
    won: number;
    lost: number;
  };
  history: HistoryItem[];
}
