
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameStatus, GameState, PuzzleData } from './types';
import { generateGameRound, expandPool, SUBSEQUENT_BATCH_SIZE, POOL_LIMIT, ART_STYLES, THEMES } from './services/geminiService';
import { soundEffects } from './services/soundService';
import Button from './components/Button';
import LetterKey, { LetterStatus } from './components/LetterKey';

const MAX_ATTEMPTS = 4;
const MAX_PREFETCH = 2; // Keep 2 pre-fetched puzzles at all times

const FUN_LOADING_MESSAGES = [
  "Polishing the AI lens...",
  "Consulting the pixel oracle...",
  "Stretching digital canvases...",
  "Mixing artistic algorithms...",
  "Brewing visual riddles...",
  "Sharpening the neural brush...",
  "Inking the next mystery...",
  "Calibrating imagination...",
  "Fetching a new perspective...",
  "Weaving light and shadow...",
  "Summoning visual wonders..."
];

const FUN_READY_MESSAGES = [
  "Vision clear! ✨",
  "Riddle ready! 🚀",
  "Challenge locked & loaded! 🔥",
  "A new world awaits! 🌟",
  "Fresh pixels found! 💎",
  "The AI is ready for you! 🤖",
  "Next mystery prepared! 🔎",
  "Your next challenge is set! 🎯",
  "Pixels primed and ready! 🎨",
  "Ready to test your wit! 🧠"
];

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    status: GameStatus.IDLE,
    puzzle: null,
    nextPuzzles: [],
    userGuess: [],
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    guessedLetters: new Set()
  });

  const [tickerMessage, setTickerMessage] = useState(FUN_LOADING_MESSAGES[0]);
  const isFetchingNext = useRef(false);
  const hasExpandedPool = useRef(false);

  // Background pre-fetcher logic to maintain a queue
  const prefetchNextRound = useCallback(async () => {
    if (isFetchingNext.current || gameState.nextPuzzles.length >= MAX_PREFETCH) return;
    
    isFetchingNext.current = true;
    try {
      const nextPuzzle = await generateGameRound();
      setGameState(prev => ({ 
        ...prev, 
        nextPuzzles: [...prev.nextPuzzles, nextPuzzle] 
      }));
    } catch (error) {
      console.error("Failed to prefetch next round:", error);
    } finally {
      isFetchingNext.current = false;
    }
  }, [gameState.nextPuzzles.length]);

  // Content Pool Expansion Monitor: Expands exactly once when 2 puzzles are ready in the queue
  useEffect(() => {
    const isPoolReadyForExpansion = 
      gameState.nextPuzzles.length === 2 && 
      !hasExpandedPool.current;

    if (isPoolReadyForExpansion) {
      hasExpandedPool.current = true;
      console.debug("Expanding imagination engine pool...");
      expandPool(SUBSEQUENT_BATCH_SIZE);
    }
  }, [gameState.nextPuzzles.length]);

  // Ticker Logic: Rotate messages every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setGameState(current => {
        if (current.nextPuzzles.length > 0) {
          setTickerMessage(FUN_READY_MESSAGES[Math.floor(Math.random() * FUN_READY_MESSAGES.length)]);
        } else {
          setTickerMessage(FUN_LOADING_MESSAGES[Math.floor(Math.random() * FUN_LOADING_MESSAGES.length)]);
        }
        return current;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  /**
   * Starts a new round. 
   * Priority: 
   * 1. Pull from pre-fetched queue.
   * 2. Fallback to manual load if queue is empty.
   */
  const startNewGame = useCallback(async () => {
    if (gameState.nextPuzzles.length > 0) {
      setGameState(prev => {
        if (prev.nextPuzzles.length === 0) return prev;
        const [next, ...remaining] = prev.nextPuzzles;
        return {
          ...prev,
          status: GameStatus.PLAYING,
          puzzle: next,
          nextPuzzles: remaining,
          userGuess: new Array(next.word_length).fill(''),
          attempts: 0,
          guessedLetters: new Set()
        };
      });
      return;
    }

    setGameState(prev => ({ 
      ...prev, 
      status: GameStatus.LOADING, 
      userGuess: [], 
      attempts: 0, 
      guessedLetters: new Set() 
    }));

    try {
      const puzzle = await generateGameRound();
      setGameState(prev => ({
        ...prev,
        status: GameStatus.PLAYING,
        puzzle,
        userGuess: new Array(puzzle.word_length).fill(''),
        attempts: 0,
        guessedLetters: new Set()
      }));
    } catch (error) {
      console.error("Game load failed:", error);
      setGameState(prev => ({ ...prev, status: GameStatus.IDLE }));
      alert("Failed to generate a new puzzle. Please try again.");
    }
  }, [gameState.nextPuzzles.length]);

  // Constant monitoring to refill the queue
  useEffect(() => {
    if (gameState.status !== GameStatus.IDLE && gameState.nextPuzzles.length < MAX_PREFETCH) {
      const timer = setTimeout(prefetchNextRound, 500);
      return () => clearTimeout(timer);
    }
  }, [gameState.nextPuzzles.length, gameState.status, prefetchNextRound]);

  const handleLetterClick = (letter: string) => {
    if (!gameState.puzzle || gameState.status !== GameStatus.PLAYING) return;
    if (gameState.guessedLetters.has(letter)) return;

    const targetWord = gameState.puzzle.target_word_hidden.toUpperCase();
    const isCorrect = targetWord.includes(letter);
    
    const nextGuessed = new Set(gameState.guessedLetters);
    nextGuessed.add(letter);

    let nextAttempts = gameState.attempts;
    if (isCorrect) {
      soundEffects.correct();
    } else {
      soundEffects.incorrect();
      nextAttempts += 1;
    }

    const newUserGuess = targetWord.split('').map(char => 
      nextGuessed.has(char) ? char : ''
    );

    const isWon = newUserGuess.join('') === targetWord;
    const isLost = !isWon && nextAttempts >= gameState.maxAttempts;

    if (isWon) soundEffects.win();
    if (isLost) soundEffects.lose();

    setGameState(prev => ({
      ...prev,
      guessedLetters: nextGuessed,
      userGuess: newUserGuess,
      attempts: nextAttempts,
      status: isWon ? GameStatus.WON : isLost ? GameStatus.LOST : GameStatus.PLAYING
    }));
  };

  const getLetterStatus = (letter: string): LetterStatus => {
    if (!gameState.guessedLetters.has(letter)) return 'default';
    if (gameState.puzzle?.target_word_hidden.includes(letter)) return 'correct';
    return 'incorrect';
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 max-w-4xl mx-auto relative overflow-x-hidden text-slate-100">
      
      {/* Top Right Status Ticker */}
      {(gameState.status === GameStatus.PLAYING || gameState.status === GameStatus.LOADING || gameState.status === GameStatus.WON || gameState.status === GameStatus.LOST) && (
        <div className="fixed top-4 right-4 z-50 pointer-events-none hidden md:block">
          <div className={`
            flex items-center gap-2 px-4 py-2 rounded-full border border-slate-700/50 backdrop-blur-md shadow-2xl
            transition-all duration-1000 transform
            ${gameState.nextPuzzles.length > 0 ? 'bg-indigo-900/40' : 'bg-slate-900/40'}
          `}>
            <div className={`w-2 h-2 rounded-full ${gameState.nextPuzzles.length > 0 ? 'bg-indigo-400 animate-pulse' : 'bg-slate-600 animate-spin border border-t-transparent'}`}></div>
            <span key={tickerMessage} className="text-[10px] font-bold uppercase tracking-widest text-slate-300 animate-fade-in min-w-[120px]">
              {tickerMessage}
            </span>
            {gameState.nextPuzzles.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-indigo-500 text-white text-[8px] font-black">
                {gameState.nextPuzzles.length}x Ready
              </span>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="w-full text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-outfit font-extrabold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
          INSIGHT
        </h1>
        <p className="text-slate-400 mt-2 font-medium">Decode the visual riddle.</p>
      </header>

      {/* Main Game Area */}
      <main className="w-full flex-grow space-y-8">
        {gameState.status === GameStatus.IDLE && (
          <div className="flex flex-col items-center justify-center h-96 space-y-6">
            <div className="p-1 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-2xl shadow-indigo-500/20">
              <img src="https://picsum.photos/seed/lexilens/400/400" className="w-64 h-64 object-cover rounded-xl" alt="Game Preview" />
            </div>
            <Button onClick={startNewGame} className="text-xl px-12 py-4">
              Begin Adventure
            </Button>
          </div>
        )}

        {gameState.status === GameStatus.LOADING && (
          <div className="flex flex-col items-center justify-center h-96 space-y-4">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <div className="text-center space-y-1">
              <p className="text-indigo-300 font-semibold text-lg">{tickerMessage}</p>
              <p className="text-slate-500 text-sm">Crafting a unique artistic challenge</p>
            </div>
          </div>
        )}

        {(gameState.status === GameStatus.PLAYING || gameState.status === GameStatus.WON || gameState.status === GameStatus.LOST) && gameState.puzzle && (
          <div className="animate-fade-in space-y-6">
            
            {/* Image Section */}
            <div className="relative group mx-auto max-w-lg">
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
              <div className="relative aspect-square rounded-2xl overflow-hidden bg-slate-900 border border-slate-700 shadow-2xl">
                <img 
                  src={gameState.puzzle.image_url} 
                  alt="Puzzle hint" 
                  className="w-full h-full object-cover transition-opacity duration-500 opacity-100"
                />
              </div>
            </div>

            {/* Puzzle Elements */}
            <div className="text-center max-w-2xl mx-auto space-y-4">
              <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-700/50">
                <p className="text-xl md:text-2xl font-medium leading-relaxed italic text-slate-200">
                  {gameState.status === GameStatus.WON || gameState.status === GameStatus.LOST 
                    ? gameState.puzzle.original_caption_hidden
                    : gameState.puzzle.puzzle_data_for_user.redacted_caption.split('___').map((part, i, arr) => (
                      <React.Fragment key={i}>
                        {part}
                        {i < arr.length - 1 && <span className="text-indigo-400 font-bold underline decoration-indigo-500/50 underline-offset-4">_____</span>}
                      </React.Fragment>
                    ))
                  }
                </p>
              </div>
              
              <div className="flex justify-center items-center gap-6 text-sm font-semibold tracking-wider uppercase text-slate-500">
                <div className="flex items-center gap-2">
                  <span className={gameState.attempts >= gameState.maxAttempts - 1 ? 'text-rose-400' : 'text-slate-400'}>
                    Strikes: {gameState.attempts} / {gameState.maxAttempts}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {[...Array(gameState.maxAttempts)].map((_, i) => (
                    <div key={i} className={`w-4 h-2 rounded-full transition-colors duration-300 ${i < gameState.attempts ? 'bg-rose-500 shadow-sm shadow-rose-900' : 'bg-slate-700'}`} />
                  ))}
                </div>
                {gameState.nextPuzzles.length > 0 && gameState.status === GameStatus.PLAYING && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] animate-pulse">
                    <span className="w-1 h-1 bg-indigo-400 rounded-full"></span>
                    Next Puzzle Ready
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 justify-center my-6">
                {gameState.userGuess.map((char, i) => (
                  <div 
                    key={i} 
                    className={`
                      w-10 h-12 md:w-12 md:h-14 flex items-center justify-center 
                      text-2xl font-black border-b-4 rounded-t-lg
                      ${char 
                        ? 'border-indigo-400 bg-indigo-900/30 text-white animate-pop' 
                        : 'border-slate-600 bg-slate-900/50 text-transparent'}
                      transition-all duration-300
                    `}
                  >
                    {char}
                  </div>
                ))}
              </div>

              {gameState.status === GameStatus.PLAYING && (
                <div className="space-y-6 pt-2">
                  <div className="flex flex-wrap justify-center gap-2 max-w-md mx-auto">
                    {gameState.puzzle.puzzle_data_for_user.letter_pool.map((letter, i) => (
                      <LetterKey 
                        key={i} 
                        letter={letter} 
                        status={getLetterStatus(letter)}
                        onClick={handleLetterClick} 
                        isDisabled={gameState.status !== GameStatus.PLAYING}
                      />
                    ))}
                  </div>
                </div>
              )}

              {gameState.status === GameStatus.WON && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-8 rounded-2xl space-y-4 animate-bounce-slow">
                  <div className="flex justify-center gap-2">
                    {[...'GENIUS'].map((l, i) => <span key={i} className="text-4xl font-black text-emerald-400 animate-pop" style={{animationDelay: `${i*50}ms`}}>{l}</span>)}
                  </div>
                  <p className="text-slate-300">You revealed the word: <span className="text-emerald-400 font-bold tracking-widest">{gameState.puzzle.target_word_hidden}</span></p>
                  <Button onClick={startNewGame} className="mx-auto bg-emerald-600 hover:bg-emerald-500 px-12 py-4 text-lg">
                    Next Challenge
                  </Button>
                </div>
              )}

              {gameState.status === GameStatus.LOST && (
                <div className="bg-rose-500/10 border border-rose-500/30 p-8 rounded-2xl space-y-4">
                  <h2 className="text-3xl font-black text-rose-400">OUT OF ATTEMPTS</h2>
                  <p className="text-slate-300">The hidden word was: <span className="text-white font-bold tracking-widest">{gameState.puzzle.target_word_hidden}</span></p>
                  <Button onClick={startNewGame} variant="danger" className="mx-auto px-12 py-4 text-lg">
                    Reset for Next Challenge
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="mt-12 text-slate-600 text-[10px] md:text-xs text-center border-t border-slate-800/50 pt-6 w-full max-w-md pb-8">
        <p className="leading-relaxed">
          Instructions: Observe the image and click letters to fill the blanks. 
          Incorrect guesses count as strikes.
        </p>
      </footer>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.6s ease-out forwards;
        }
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-bounce-slow {
          animation: bounce-slow 3s infinite ease-in-out;
        }
        @keyframes pop {
          0% { transform: scale(0.8); opacity: 0; }
          70% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-pop {
          animation: pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
      `}</style>
    </div>
  );
};

export default App;
