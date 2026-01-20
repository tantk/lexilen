
export interface PuzzleData {
  internal_thought_process: string;
  image_url: string;
  original_caption_hidden: string;
  target_word_hidden: string;
  word_length: number;
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

export interface GameState {
  status: GameStatus;
  puzzle: PuzzleData | null;
  nextPuzzle: PuzzleData | null;
  userGuess: string[];
  attempts: number;
  maxAttempts: number;
  editingImage: boolean;
  guessedLetters: Set<string>;
}
