
import React from 'react';

export type LetterStatus = 'default' | 'correct' | 'incorrect';

interface LetterKeyProps {
  letter: string;
  onClick: (letter: string) => void;
  status: LetterStatus;
  isDisabled: boolean;
}

// Fix: Added LetterKeyProps to React.FC generic to resolve property 'letter', 'onClick', 'status', and 'isDisabled' not existing on type '{}' errors.
const LetterKey: React.FC<LetterKeyProps> = ({ letter, onClick, status, isDisabled }) => {
  const getStatusStyles = () => {
    switch (status) {
      case 'correct':
        return 'bg-emerald-600/40 border-emerald-500 text-emerald-100 shadow-lg shadow-emerald-500/20';
      case 'incorrect':
        return 'bg-rose-900/40 border-rose-800 text-rose-300/50 line-through scale-95 opacity-50';
      default:
        return 'bg-slate-700 border-indigo-500/30 text-white hover:border-indigo-400 hover:bg-slate-600 hover:-translate-y-1 shadow-md shadow-indigo-900/10';
    }
  };

  return (
    <button
      onClick={() => onClick(letter)}
      disabled={isDisabled || status !== 'default'}
      className={`
        w-10 h-12 md:w-16 md:h-16 flex items-center justify-center 
        text-lg md:text-2xl font-bold rounded-lg border-2 
        transition-all duration-200 transform active:scale-90
        ${getStatusStyles()}
        ${isDisabled && status === 'default' ? 'cursor-not-allowed opacity-30' : ''}
      `}
    >
      {letter}
    </button>
  );
};

export default LetterKey;
