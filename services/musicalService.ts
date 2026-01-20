
/**
 * Dynamic Procedural Music Service
 * Uses deterministic hashing to map any Style/Theme to a unique Sonic Profile.
 */

let audioCtx: AudioContext | null = null;
let currentLoop: number | null = null;
let masterGain: GainNode | null = null;
let delayNode: DelayNode | null = null;
let feedbackGain: GainNode | null = null;
let currentVolumeLevel = 0.3;

interface ImageAnalysis {
  brightness: number;
  hue: number;
  complexity: number;
  samples: number[];
}

interface MusicalProfile {
  oscType: OscillatorType;
  scale: number[];
  tempo: number;
  delayAmount: number;
  filterResonance: number;
}

// A wider array of musical modes for variety
const MODES = [
  [1, 1.122, 1.260, 1.498, 1.682],             // Pentatonic Major (Bright)
  [1, 1.059, 1.189, 1.335, 1.498, 1.587],      // Phrygian (Mysterious)
  [1, 1.122, 1.260, 1.414, 1.498, 1.682, 1.888], // Lydian (Dreamy)
  [1, 1.122, 1.189, 1.335, 1.498, 1.587, 1.782], // Aeolian (Melancholic)
  [1, 1.122, 1.189, 1.335, 1.498, 1.682, 1.782], // Dorian (Cool/Jazz)
  [1, 1.059, 1.122, 1.260, 1.414, 1.498, 1.587], // Locrian (Tense/Dark)
  [1, 1.260, 1.498, 1.587, 1.888],             // In-Sen (Japanese Mystery)
  [1, 1.059, 1.260, 1.414, 1.498, 1.888]       // Custom Ethereal
];

const OSCILLATORS: OscillatorType[] = ['sine', 'triangle', 'square', 'sawtooth'];

/**
 * Deterministic hash function for strings
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

async function analyzeImage(imageUrl: string): Promise<ImageAnalysis> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve({ brightness: 0.5, hue: 0, complexity: 0.5, samples: [0.5] });
      canvas.width = 16;
      canvas.height = 16;
      ctx.drawImage(img, 0, 0, 16, 16);
      const data = ctx.getImageData(0, 0, 16, 16).data;
      let totalLuma = 0;
      const samples: number[] = [];
      for (let i = 0; i < data.length; i += 4) {
        const luma = (0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]);
        totalLuma += luma;
        samples.push(luma / 255);
      }
      const avgLuma = totalLuma / samples.length;
      const variance = samples.reduce((acc, val) => acc + Math.pow(val - (avgLuma/255), 2), 0) / samples.length;
      resolve({
        brightness: avgLuma / 255,
        hue: (data[0] + data[1] + data[2]) % 360,
        complexity: Math.min(variance * 20, 1),
        samples: samples
      });
    };
    img.onerror = () => resolve({ brightness: 0.5, hue: 0, complexity: 0.5, samples: [0.5] });
    img.src = imageUrl;
  });
}

/**
 * Maps Style and Theme to a deterministic musical profile
 */
function getDynamicProfile(style: string, theme: string, brightness: number): MusicalProfile {
  const styleHash = hashString(style);
  const themeHash = hashString(theme);
  
  // Style determines the "Instrument" (Timbre)
  const oscType = OSCILLATORS[styleHash % OSCILLATORS.length];
  
  // Theme determines the "Mood" (Scale)
  const modeIdx = themeHash % MODES.length;
  const baseFreq = 110.0 + (styleHash % 60); // Variations in base frequency (A2 to B2 range)
  const scale = MODES[modeIdx].map(r => baseFreq * r);
  
  // Combine factors for tempo and atmosphere
  const tempo = 0.3 + ((themeHash % 50) / 100) + (1 - brightness) * 0.3;
  const delayAmount = 0.1 + ((styleHash % 40) / 100);
  const filterResonance = 5 + (themeHash % 15);

  return { oscType, scale, tempo, delayAmount, filterResonance };
}

export const musicService = {
  start: async (imageUrl: string, style: string, theme: string) => {
    musicService.stop();
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    const analysis = await analyzeImage(imageUrl);
    const profile = getDynamicProfile(style, theme, analysis.brightness);
    
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
    masterGain.gain.linearRampToValueAtTime(currentVolumeLevel, audioCtx.currentTime + 1.5);

    delayNode = audioCtx.createDelay(1.0);
    delayNode.delayTime.setValueAtTime(profile.tempo * 0.75, audioCtx.currentTime);
    feedbackGain = audioCtx.createGain();
    feedbackGain.gain.setValueAtTime(profile.delayAmount, audioCtx.currentTime);
    delayNode.connect(feedbackGain);
    feedbackGain.connect(delayNode);
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(analysis.brightness * 1200 + 400, audioCtx.currentTime);
    filter.Q.setValueAtTime(profile.filterResonance, audioCtx.currentTime);

    filter.connect(masterGain);
    delayNode.connect(masterGain);
    masterGain.connect(audioCtx.destination);

    let step = 0;
    const playStep = () => {
      if (!audioCtx || !masterGain) return;
      const now = audioCtx.currentTime;
      const val = analysis.samples[step % analysis.samples.length];
      
      if (val > 0.22) {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = profile.oscType;
        
        // Pick note from scale based on pixel brightness
        const noteIdx = Math.floor(val * profile.scale.length) % profile.scale.length;
        let freq = profile.scale[noteIdx];
        if (val > 0.75) freq *= 2; // Arpeggiate up for bright pixels
        
        osc.frequency.setValueAtTime(freq, now);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.2, now + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, now + profile.tempo * 1.8);
        
        osc.connect(g);
        g.connect(filter);
        if (profile.delayAmount > 0) g.connect(delayNode!);
        
        osc.start(now);
        osc.stop(now + profile.tempo * 1.8);
      }

      // Foundational Bass layer
      if (step % 8 === 0) {
        const bass = audioCtx.createOscillator();
        const bassG = audioCtx.createGain();
        bass.type = 'sine';
        bass.frequency.setValueAtTime(profile.scale[0] * 0.5, now);
        bassG.gain.setValueAtTime(0, now);
        bassG.gain.linearRampToValueAtTime(0.3, now + 0.15);
        bassG.gain.exponentialRampToValueAtTime(0.0001, now + profile.tempo * 6);
        bass.connect(bassG);
        bassG.connect(filter);
        bass.start(now);
        bass.stop(now + profile.tempo * 6);
      }

      step++;
      currentLoop = window.setTimeout(playStep, profile.tempo * 1000);
    };

    playStep();
  },

  setVolume: (value: number) => {
    currentVolumeLevel = value;
    if (masterGain && audioCtx) {
      masterGain.gain.setTargetAtTime(value, audioCtx.currentTime, 0.1);
    }
  },

  stop: () => {
    if (currentLoop) clearTimeout(currentLoop);
    currentLoop = null;
    if (masterGain && audioCtx) {
      masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.2);
      const oldGain = masterGain;
      setTimeout(() => oldGain.disconnect(), 1300);
      masterGain = null;
    }
  }
};
