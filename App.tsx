
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameStatus, GameState, PuzzleData, HistoryItem } from './types';
import { generateGameRound, expandPool, SUBSEQUENT_BATCH_SIZE, POOL_LIMIT, ART_STYLES, THEMES } from './services/geminiService';
import { soundEffects } from './services/soundService';
import { musicService } from './services/musicalService';
import Button from './components/Button';
import LetterKey, { LetterStatus } from './components/LetterKey';

const MAX_ATTEMPTS = 4;
const MAX_PREFETCH = 2; 
const MAX_HISTORY = 12; // Memory limit: only keep the last 12 riddles

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
    guessedLetters: new Set(),
    score: {
      won: 0,
      lost: 0
    },
    history: []
  });

  const [tickerMessage, setTickerMessage] = useState(FUN_LOADING_MESSAGES[0]);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isPrefetching, setIsPrefetching] = useState(false);
  const [volume, setVolume] = useState(0.3);
  const [selectedHistoryImage, setSelectedHistoryImage] = useState<string | null>(null);
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);
  
  const isFetchingNext = useRef(false);
  const hasExpandedPool = useRef(false);
  const prefetchCooldown = useRef(0);

  // Music Management
  useEffect(() => {
    if (gameState.status === GameStatus.PLAYING && gameState.puzzle?.image_url) {
      musicService.start(
        gameState.puzzle.image_url, 
        gameState.puzzle.art_style, 
        gameState.puzzle.theme
      ).catch(console.error);
    } else if (gameState.status === GameStatus.WON || gameState.status === GameStatus.LOST || gameState.status === GameStatus.IDLE) {
      musicService.stop();
    }
  }, [gameState.status, gameState.puzzle?.image_url, gameState.puzzle?.art_style, gameState.puzzle?.theme]);

  // Click away to close expanded info
  useEffect(() => {
    const handleClick = () => setIsInfoExpanded(false);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Handle volume change
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    musicService.setVolume(val);
  };

  // Background pre-fetcher logic
  const prefetchNextRound = useCallback(async () => {
    if (isFetchingNext.current || gameState.nextPuzzles.length >= MAX_PREFETCH || Date.now() < prefetchCooldown.current) return;
    
    isFetchingNext.current = true;
    setIsPrefetching(true);
    try {
      setIsRetrying(false);
      const nextPuzzle = await generateGameRound();
      if (nextPuzzle.target_word_hidden.length >= 3) {
        setGameState(prev => ({ 
          ...prev, 
          nextPuzzles: [...prev.nextPuzzles, nextPuzzle] 
        }));
      }
    } catch (error: any) {
      console.error("Failed to prefetch next round:", error);
      prefetchCooldown.current = Date.now() + 5000;
      setIsRetrying(true);
    } finally {
      isFetchingNext.current = false;
      setIsPrefetching(false);
    }
  }, [gameState.nextPuzzles.length]);

  // Content Pool Expansion Monitor
  useEffect(() => {
    const isPoolReadyForExpansion = 
      gameState.nextPuzzles.length === 2 && 
      !hasExpandedPool.current;

    if (isPoolReadyForExpansion) {
      hasExpandedPool.current = true;
      expandPool(SUBSEQUENT_BATCH_SIZE);
    }
  }, [gameState.nextPuzzles.length]);

  // Ticker Logic
  useEffect(() => {
    const interval = setInterval(() => {
      if (isRetrying) {
        setTickerMessage("Adjusting frequency... 📡");
      } else if (gameState.nextPuzzles.length > 0) {
        setTickerMessage(FUN_READY_MESSAGES[Math.floor(Math.random() * FUN_READY_MESSAGES.length)]);
      } else {
        setTickerMessage(FUN_LOADING_MESSAGES[Math.floor(Math.random() * FUN_LOADING_MESSAGES.length)]);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [isRetrying, gameState.nextPuzzles.length]);

  const archiveCurrentPuzzle = (prev: GameState): HistoryItem[] => {
    if (!prev.puzzle || (prev.status !== GameStatus.WON && prev.status !== GameStatus.LOST)) return prev.history;
    
    const newHistoryItem: HistoryItem = {
      puzzle: prev.puzzle,
      outcome: prev.status === GameStatus.WON ? 'WON' : 'LOST',
      timestamp: Date.now()
    };
    
    return [newHistoryItem, ...prev.history].slice(0, MAX_HISTORY);
  };

  const startNewGame = useCallback(async () => {
    if (gameState.nextPuzzles.length > 0) {
      setGameState(prev => {
        if (prev.nextPuzzles.length === 0) return prev;
        const [next, ...remaining] = prev.nextPuzzles;
        const updatedHistory = archiveCurrentPuzzle(prev);

        return {
          ...prev,
          status: GameStatus.PLAYING,
          puzzle: next,
          nextPuzzles: remaining,
          userGuess: new Array(next.word_length).fill(''),
          attempts: 0,
          guessedLetters: new Set(),
          history: updatedHistory
        };
      });
      return;
    }

    setGameState(prev => ({ 
      ...prev, 
      status: GameStatus.LOADING, 
      userGuess: [], 
      attempts: 0, 
      guessedLetters: new Set(),
      history: archiveCurrentPuzzle(prev)
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
    } catch (error: any) {
      console.error("Game load failed:", error);
      setGameState(prev => ({ ...prev, status: GameStatus.IDLE }));
      alert("AI signal interrupted. Please try again.");
    }
  }, [gameState.nextPuzzles.length, gameState.status, gameState.puzzle]);

  useEffect(() => {
    if (gameState.status !== GameStatus.IDLE && gameState.nextPuzzles.length < MAX_PREFETCH) {
      const timer = setTimeout(prefetchNextRound, 1000);
      return () => clearTimeout(timer);
    }
  }, [gameState.nextPuzzles.length, gameState.status, prefetchNextRound]);

  const handleLetterClick = (letter: string) => {
    if (!gameState.puzzle || gameState.status !== GameStatus.PLAYING) return;
    if (gameState.guessedLetters.has(letter)) return;

    const targetWord = gameState.puzzle.target_word_hidden.toUpperCase();
    if (!targetWord) return;

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
      status: isWon ? GameStatus.WON : isLost ? GameStatus.LOST : GameStatus.PLAYING,
      score: {
        won: isWon ? prev.score.won + 1 : prev.score.won,
        lost: isLost ? prev.score.lost + 1 : prev.score.lost,
      }
    }));
  };

  const getLetterStatus = (letter: string): LetterStatus => {
    if (!gameState.guessedLetters.has(letter)) return 'default';
    if (gameState.puzzle?.target_word_hidden.includes(letter)) return 'correct';
    return 'incorrect';
  };

  const closeZoom = () => setSelectedHistoryImage(null);

  return (
    <div className="min-h-screen flex flex-col items-center p-2 md:p-8 max-w-4xl mx-auto relative overflow-x-hidden text-slate-100 pb-20 md:pb-48">
      
      {/* Zoom Overlay */}
      {selectedHistoryImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-12 animate-fade-in"
          onClick={closeZoom}
        >
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl"></div>
          <div className="relative max-w-5xl w-full max-h-full flex items-center justify-center">
            <img 
              src={selectedHistoryImage} 
              alt="Zoomed memory" 
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-slate-700/50 animate-pop"
              onClick={(e) => e.stopPropagation()}
            />
            <button 
              className="absolute top-0 right-0 -translate-y-full mb-4 p-2 bg-slate-800 hover:bg-slate-700 rounded-full transition-colors"
              onClick={closeZoom}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
      )}

      {/* Desktop Top Left Score Tracker */}
      <div className="fixed top-4 left-4 z-50 pointer-events-none hidden md:block">
        <div className="flex items-center gap-4 px-5 py-2.5 rounded-full bg-slate-900/40 backdrop-blur-md border border-slate-700/50 shadow-2xl">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400/90">Solved</span>
            <span className="text-sm font-bold text-white tabular-nums">{gameState.score.won}</span>
          </div>
          <div className="w-[1px] h-3 bg-slate-700"></div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-rose-500"></div>
            <span className="text-[10px] font-black uppercase tracking-widest text-rose-400/90">Failed</span>
            <span className="text-sm font-bold text-white tabular-nums">{gameState.score.lost}</span>
          </div>
        </div>
      </div>

      {/* Top Right Status Ticker */}
      {(gameState.status !== GameStatus.IDLE) && (
        <div className="fixed top-4 right-4 z-50 pointer-events-none hidden md:block">
          <div className={`
            flex flex-col gap-1.5 p-1 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-2xl overflow-hidden
            transition-all duration-1000 transform
            ${isRetrying ? 'bg-rose-900/40' : gameState.nextPuzzles.length > 0 ? 'bg-indigo-900/40' : 'bg-slate-900/40'}
          `}>
            <div className="flex items-center gap-2 px-3 py-1">
              <div className={`w-2 h-2 rounded-full ${isRetrying ? 'bg-rose-400 animate-pulse' : isPrefetching ? 'bg-indigo-400 animate-pulse' : gameState.nextPuzzles.length > 0 ? 'bg-emerald-400' : 'bg-slate-600'}`}></div>
              <span key={tickerMessage} className="text-[10px] font-bold uppercase tracking-widest text-slate-300 animate-fade-in min-w-[140px]">
                {tickerMessage}
              </span>
              {gameState.nextPuzzles.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-indigo-500 text-white text-[8px] font-black">
                  {gameState.nextPuzzles.length}x Ready
                </span>
              )}
            </div>
            
            <div className="h-1 w-full bg-slate-800/50 flex gap-0.5 px-0.5 pb-0.5">
              {[...Array(MAX_PREFETCH)].map((_, i) => {
                const isLoaded = i < gameState.nextPuzzles.length;
                const isCurrentFetch = isPrefetching && i === gameState.nextPuzzles.length;
                return (
                  <div 
                    key={i} 
                    className={`
                      h-full flex-grow rounded-full transition-all duration-700
                      ${isLoaded ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]' : isCurrentFetch ? 'bg-indigo-500/40 animate-pulse' : 'bg-slate-700/50'}
                    `}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Volume Slider - Bottom Right */}
      <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-3 bg-slate-900/60 backdrop-blur-md p-2 px-4 rounded-full border border-slate-700/50 shadow-2xl transition-all hover:bg-slate-900/80 group">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400 opacity-60 group-hover:opacity-100 transition-opacity">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
        <input 
          type="range" 
          min="0" 
          max="0.8" 
          step="0.01" 
          value={volume} 
          onChange={handleVolumeChange}
          className="w-24 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
        />
      </div>

      <header className="w-full text-center mb-2 md:mb-8">
        <h1 className="hidden md:block text-4xl md:text-5xl font-outfit font-extrabold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
          INSIGHT
        </h1>
        <p className="hidden md:block text-slate-400 mt-2 font-medium">Because the answer is right there in the image!</p>
      </header>

      <main className="w-full flex-grow space-y-2 md:space-y-8">
        {gameState.status === GameStatus.IDLE && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-6">
            <div className="p-1 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-2xl shadow-indigo-500/20">
              <img src="https://picsum.photos/seed/insight/400/400" className="w-48 h-48 md:w-64 md:h-64 object-cover rounded-xl" alt="Game Preview" />
            </div>
            <Button onClick={startNewGame} className="text-xl px-12 py-4">
              Begin Adventure
            </Button>
            <p className="text-slate-500 text-xs text-center max-w-xs leading-relaxed">
              Every image generates its own unique procedural soundtrack. Enable your sound for the full experience.
            </p>
          </div>
        )}

        {gameState.status === GameStatus.LOADING && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <div className="text-center space-y-1">
              <p className="text-indigo-300 font-semibold text-lg">{tickerMessage}</p>
              <p className="text-slate-500 text-sm">Crafting a unique intellectual challenge</p>
            </div>
          </div>
        )}

        {(gameState.status === GameStatus.PLAYING || gameState.status === GameStatus.WON || gameState.status === GameStatus.LOST) && gameState.puzzle && (
          <div className="animate-fade-in space-y-1 md:space-y-6">
            
            <div className="relative group mx-auto w-full max-w-[90vw] md:max-w-lg aspect-square">
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
              <div className="relative w-full h-full rounded-2xl overflow-hidden bg-slate-900 border border-slate-700 shadow-2xl">
                <img 
                  src={gameState.puzzle.image_url} 
                  alt="Puzzle hint" 
                  className="w-full h-full object-cover transition-opacity duration-500 opacity-100"
                />
              </div>
            </div>

            <div className="text-center max-w-2xl mx-auto space-y-1.5 md:space-y-6">
              {/* Informational Badges with Toggle for Mobile */}
              <div className="relative flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
                <button 
                  onClick={() => setIsInfoExpanded(!isInfoExpanded)}
                  className="md:hidden flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800/80 border border-indigo-500/40 shadow-xl mb-1 mt-1 active:scale-95 transition-transform"
                >
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
                    {isInfoExpanded ? 'Hide Details' : 'Round Details & Score'}
                  </span>
                </button>
                
                <div className={`
                  flex flex-col md:flex-row flex-wrap justify-center items-center gap-1.5 md:gap-3 animate-fade-in py-2
                  ${isInfoExpanded ? 'flex' : 'hidden md:flex'}
                `}>
                  {/* Mobile Score Tracking (Only in Info Section) */}
                  <div className="md:hidden flex items-center gap-3 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-slate-700/50 mb-1">
                    <div className="flex items-center gap-1.5">
                       <span className="text-[9px] font-black uppercase text-emerald-400">Wins:</span>
                       <span className="text-xs font-bold">{gameState.score.won}</span>
                    </div>
                    <div className="w-[1px] h-3 bg-slate-700"></div>
                    <div className="flex items-center gap-1.5">
                       <span className="text-[9px] font-black uppercase text-rose-400">Loss:</span>
                       <span className="text-xs font-bold">{gameState.score.lost}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-1 md:py-1.5 rounded-full bg-indigo-900/40 border border-indigo-500/40 shadow-lg">
                    <span className="text-[8px] md:text-[10px] font-black uppercase tracking-tighter text-indigo-400">Domain</span>
                    <span className="text-[10px] md:text-xs font-semibold text-slate-100">{gameState.puzzle.category}</span>
                  </div>
                  <div className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-1 md:py-1.5 rounded-full bg-cyan-900/40 border border-cyan-500/40 shadow-lg">
                    <span className="text-[8px] md:text-[10px] font-black uppercase tracking-tighter text-cyan-400">Style</span>
                    <span className="text-[10px] md:text-xs font-semibold text-slate-100">{gameState.puzzle.art_style}</span>
                  </div>
                  <div className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-1 md:py-1.5 rounded-full bg-purple-900/40 border border-purple-500/40 shadow-lg">
                    <span className="text-[8px] md:text-[10px] font-black uppercase tracking-tighter text-purple-400">Theme</span>
                    <span className="text-[10px] md:text-xs font-semibold text-slate-100">{gameState.puzzle.theme}</span>
                  </div>
                </div>
              </div>

              <div className="p-2 md:p-4 rounded-xl bg-slate-800/30 border border-slate-700/50 shadow-inner mx-2 md:mx-0">
                <p className="text-sm md:text-2xl font-medium leading-relaxed italic text-slate-200">
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
              
              <div className="flex justify-center items-center gap-4 md:gap-6 text-[10px] md:text-sm font-semibold tracking-wider uppercase text-slate-500">
                <div className="flex items-center gap-2">
                  <span className={gameState.attempts >= gameState.maxAttempts - 1 ? 'text-rose-400' : 'text-slate-400'}>
                    Strikes: {gameState.attempts} / {gameState.maxAttempts}
                  </span>
                </div>
                <div className="flex gap-1 md:gap-1.5">
                  {[...Array(gameState.maxAttempts)].map((_, i) => (
                    <div key={i} className={`w-3 md:w-4 h-1.5 md:h-2 rounded-full transition-colors duration-300 ${i < gameState.attempts ? 'bg-rose-500 shadow-sm shadow-rose-900' : 'bg-slate-700'}`} />
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-1 md:gap-2 justify-center my-1.5 md:my-6 px-4">
                {gameState.userGuess.map((char, i) => (
                  <div 
                    key={i} 
                    className={`
                      w-7 h-9 md:w-12 md:h-14 flex items-center justify-center 
                      text-lg md:text-2xl font-black border-b-2 md:border-b-4 rounded-t-lg
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
                <div className="space-y-1 md:space-y-6 pt-0.5 md:pt-2 px-1 md:px-0">
                  <div className="flex flex-wrap justify-center gap-1 md:gap-2 max-w-md mx-auto">
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
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 md:p-8 rounded-2xl space-y-4 animate-bounce-slow shadow-lg shadow-emerald-500/5 mx-2 md:mx-0">
                  <div className="flex justify-center gap-2">
                    {[...'GENIUS'].map((l, i) => <span key={i} className="text-2xl md:text-4xl font-black text-emerald-400 animate-pop" style={{animationDelay: `${i*50}ms`}}>{l}</span>)}
                  </div>
                  <p className="text-slate-300 text-xs md:text-base">You revealed the word: <span className="text-emerald-400 font-bold tracking-widest uppercase">{gameState.puzzle.target_word_hidden}</span></p>
                  <Button onClick={startNewGame} className="mx-auto bg-emerald-600 hover:bg-emerald-500 px-8 md:px-12 py-3 md:py-4 text-base md:text-lg">
                    Next Challenge
                  </Button>
                </div>
              )}

              {gameState.status === GameStatus.LOST && (
                <div className="bg-rose-500/10 border border-rose-500/30 p-4 md:p-8 rounded-2xl space-y-4 shadow-lg shadow-rose-500/5 mx-2 md:mx-0">
                  <h2 className="text-xl md:text-3xl font-black text-rose-400">OUT OF ATTEMPTS</h2>
                  <p className="text-slate-300 text-xs md:text-base">The hidden word was: <span className="text-white font-bold tracking-widest uppercase">{gameState.puzzle.target_word_hidden}</span></p>
                  <Button onClick={startNewGame} variant="danger" className="mx-auto px-8 md:px-12 py-3 md:py-4 text-base md:text-lg">
                    Reset for Next Challenge
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* The Chronicle - History Gallery */}
        {gameState.history.length > 0 && (
          <div className="pt-8 md:pt-12 animate-fade-in relative px-2 md:px-0">
            <div className="flex items-center gap-4 mb-4 md:mb-6">
              <div className="h-px flex-grow bg-slate-800"></div>
              <div className="flex flex-col items-center gap-1">
                <h3 className="text-[10px] md:text-xs font-black uppercase tracking-[0.3em] text-slate-500">The Chronicle</h3>
                <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Memories ({gameState.history.length})</span>
              </div>
              <div className="h-px flex-grow bg-slate-800"></div>
            </div>
            
            <div className="relative group/chronicle">
              <div className="flex gap-4 overflow-x-auto pb-8 px-4 -mx-4 no-scrollbar scroll-smooth snap-x snap-mandatory">
                {gameState.history.map((item, i) => (
                  <div 
                    key={item.timestamp} 
                    className="flex-shrink-0 w-24 md:w-40 snap-start group/item cursor-pointer transition-transform hover:-translate-y-2 animate-pop"
                    style={{ animationDelay: `${i * 100}ms` }}
                    onClick={(e) => { e.stopPropagation(); setSelectedHistoryImage(item.puzzle.image_url); }}
                  >
                    <div className={`
                      relative aspect-square rounded-xl overflow-hidden border-2 mb-2
                      ${item.outcome === 'WON' ? 'border-emerald-500/30 shadow-lg shadow-emerald-500/10' : 'border-rose-500/30 shadow-lg shadow-rose-500/10'}
                      group-hover/item:border-white/40 transition-colors duration-300
                    `}>
                      <img src={item.puzzle.image_url} className="w-full h-full object-cover" alt="Past Riddle" />
                      <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white drop-shadow-lg md:w-6 md:h-6"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                      </div>
                      <div className={`
                        absolute top-1 right-1 w-4 h-4 md:w-5 md:h-5 rounded-full flex items-center justify-center shadow-lg
                        ${item.outcome === 'WON' ? 'bg-emerald-500' : 'bg-rose-500'}
                      `}>
                        {item.outcome === 'WON' ? (
                          <svg className="w-2.5 h-2.5 md:w-3 md:h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>
                        ) : (
                          <svg className="w-2.5 h-2.5 md:w-3 md:h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/></svg>
                        )}
                      </div>
                    </div>
                    <div className="text-center">
                      <p className={`text-[8px] md:text-[10px] font-black uppercase tracking-widest ${item.outcome === 'WON' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {item.puzzle.target_word_hidden}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-4 md:mt-12 text-slate-600 text-[8px] md:text-xs text-center border-t border-slate-800/50 pt-6 w-full max-w-md pb-8 px-4">
        <p className="leading-relaxed">
          Observe the image and click letters to fill the blanks. 
          Incorrect guesses count as strikes. Subjects range from Science to Cinema.
          Click chronicle images to enlarge them.
        </p>
      </footer>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.4s ease-out forwards;
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
          70% { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-pop {
          animation: pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 12px;
          width: 12px;
          border-radius: 50%;
          background: #6366f1;
          cursor: pointer;
          box-shadow: 0 0 5px rgba(99, 102, 241, 0.5);
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};

export default App;
