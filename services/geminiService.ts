
import { GoogleGenAI, Type } from "@google/genai";
import { PuzzleData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Configuration for dynamic pool expansion
export const POOL_LIMIT = 50;
export const INITIAL_BATCH_SIZE = 5; 
export const SUBSEQUENT_BATCH_SIZE = 45;

/**
 * Utility to retry API calls with exponential backoff.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 2000
): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const status = error?.status || (typeof error?.message === 'string' && error.message.includes('429') ? 'RESOURCE_EXHAUSTED' : null);
      const isRetryable = status === 'RESOURCE_EXHAUSTED' || status === 'UNAVAILABLE' || error?.status === 503 || error?.status === 429;

      if (i < maxRetries && isRetryable) {
        const delay = initialDelay * Math.pow(2, i) + Math.random() * 1000;
        console.warn(`Retry ${i + 1}/${maxRetries} after ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export const ART_STYLES: string[] = [
  "bioluminescent organic art",
  "origami paper craft",
  "vaporwave 80s glitch",
  "isometric clay render",
  "charcoal sketch on aged parchment",
  "stained glass mosaic",
  "neon-noir synthwave palette",
  "cybernetic botanical illustration",
  "minimalist geometric flat design"
];

export const THEMES: string[] = [
  "cluttered detective office",
  "flying islands",
  "forgotten library of giants",
  "underwater jazz club",
  "steampunk clockwork factory",
  "intergalactic botanical garden",
  "post-apocalyptic candy shop",
  "mythological olympus peak",
  "cyberpunk street market"
];

export async function expandPool(count: number) {
  if (ART_STYLES.length >= POOL_LIMIT && THEMES.length >= POOL_LIMIT) return;
  try {
    const response = await withRetry(() => ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: `Generate ${count} highly creative and unique art styles and themes for a visual riddle game. Avoid clichés like 'detective' or 'space'. Return JSON {styles: string[], themes: string[]}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            styles: { type: Type.ARRAY, items: { type: Type.STRING } },
            themes: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["styles", "themes"]
        }
      }
    }));
    const data = JSON.parse(response.text || '{}') as { styles?: string[]; themes?: string[] };
    if (data.styles) data.styles.forEach(s => { if (!ART_STYLES.includes(s) && ART_STYLES.length < POOL_LIMIT) ART_STYLES.push(s); });
    if (data.themes) data.themes.forEach(t => { if (!THEMES.includes(t) && THEMES.length < POOL_LIMIT) THEMES.push(t); });
  } catch (e) { console.error("Pool expansion failed", e); }
}

export async function generateGameRound(): Promise<PuzzleData> {
  const randomStyle = ART_STYLES[Math.floor(Math.random() * ART_STYLES.length)];
  const randomTheme = THEMES[Math.floor(Math.random() * THEMES.length)];

  // Step 1: Conceptualize
  const conceptResponse = await withRetry(() => ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `You are a visual riddle master. Your goal is to create a unique and challenging visual puzzle.
    Theme: ${randomTheme}
    Art Style: ${randomStyle}
    
    CRITICAL INSTRUCTION: 
    1. Select a target NOUN related to the theme that is exactly 6 to 10 letters long.
    2. AVOID STEREOTYPES: Do NOT pick the most obvious object (e.g., if the theme is 'detective', do NOT use 'typewriter' or 'magnifier'). Instead, pick something specific, evocative, and unexpected (e.g., 'FEDORA', 'ASHTRAY', 'REVOLVER', 'CARPET').
    3. Write a 1-sentence caption describing a scene in the style of ${randomStyle} that includes that noun.
    
    Return JSON:
    {
      "concept_prompt": "Highly detailed image generation prompt",
      "target_word": "THE_WORD",
      "caption": "The full descriptive sentence",
      "thought": "Brief logic"
    }`,
    config: {
      temperature: 1.0, // Increase temperature for more creative word choice
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          concept_prompt: { type: Type.STRING },
          target_word: { type: Type.STRING },
          caption: { type: Type.STRING },
          thought: { type: Type.STRING },
        },
        required: ["concept_prompt", "target_word", "caption", "thought"]
      }
    }
  }));

  const concept = JSON.parse(conceptResponse.text || '{}');
  const rawWord = (concept.target_word || "MYSTERY").trim().toUpperCase();
  const targetWord = rawWord.length < 3 ? "MYSTERY" : rawWord;
  const caption = (concept.caption || `A mysterious scene featuring a ${targetWord.toLowerCase()}.`).trim();

  // Step 2: Generate Image
  const imageResponse = await withRetry(() => ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: concept.concept_prompt || `A ${randomStyle} painting of ${randomTheme}` }] },
    config: { imageConfig: { aspectRatio: "1:1" } }
  }));

  let imageUrl = "https://picsum.photos/seed/fallback/800/800";
  if (imageResponse.candidates?.[0]) {
    for (const part of imageResponse.candidates[0].content.parts) {
      if (part.inlineData) {
        imageUrl = `data:image/png;base64,${part.inlineData.data}`;
        break;
      }
    }
  }

  // Step 3: Create Puzzle
  const uniqueLetters = Array.from(new Set(targetWord.split(''))) as string[];
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const poolSet = new Set<string>(uniqueLetters);
  while (poolSet.size < 12) poolSet.add(alphabet[Math.floor(Math.random() * alphabet.length)]);
  const letterPool = Array.from(poolSet).sort(() => Math.random() - 0.5);

  const redactedCaption = caption.replace(new RegExp(targetWord, 'gi'), "___");

  return {
    internal_thought_process: concept.thought || "Riddle generated.",
    image_url: imageUrl,
    original_caption_hidden: caption,
    target_word_hidden: targetWord,
    word_length: targetWord.length,
    art_style: randomStyle,
    theme: randomTheme,
    puzzle_data_for_user: {
      redacted_caption: redactedCaption,
      letter_pool: letterPool
    }
  };
}
