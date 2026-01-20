
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

function playTone(freq: number, type: OscillatorType, duration: number, volume: number = 0.1) {
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
  
  gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.start();
  oscillator.stop(audioCtx.currentTime + duration);
}

export const soundEffects = {
  correct: () => {
    playTone(600, 'sine', 0.1, 0.1);
    setTimeout(() => playTone(900, 'sine', 0.15, 0.1), 50);
  },
  incorrect: () => {
    playTone(150, 'sawtooth', 0.3, 0.05);
  },
  win: () => {
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 'sine', 0.5, 0.1), i * 100);
    });
  },
  lose: () => {
    const notes = [392.00, 311.13, 261.63]; // G4, Eb4, C4
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 'square', 0.6, 0.03), i * 200);
    });
  }
};
