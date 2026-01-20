
import { GoogleGenAI, Type } from "@google/genai";
import { PuzzleData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Configuration for dynamic pool expansion
export const POOL_LIMIT = 50;
export const INITIAL_BATCH_SIZE = 5; // Represented by the hardcoded items below
export const SUBSEQUENT_BATCH_SIZE = 45;

/**
 * Initial content coded in for speed as requested.
 * Using const and mutation ensures that all modules see the same updated array instance.
 */
export const ART_STYLES: string[] = [
  "bioluminescent organic art",
  "origami paper craft",
  "vaporwave 80s glitch",
  "isometric clay render",
  "charcoal sketch on aged parchment"
];

export const THEMES: string[] = [
  "cluttered detective office",
  "flying islands",
  "forgotten library of giants",
  "underwater jazz club",
  "steampunk clockwork factory"
];

/**
 * Expands the ART_STYLES and THEMES arrays using a lightweight model.
 * @param count The number of new items to attempt to generate for each category.
 */
export async function expandPool(count: number) {
  // Stop if we've reached the target limit for both
  if (ART_STYLES.length >= POOL_LIMIT && THEMES.length >= POOL_LIMIT) return;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: `Generate ${count} unique and highly creative art styles and ${count} unique and creative themes for a visual word-guessing game. 
      
      Requirements:
      - Art styles: Describe a specific visual medium, lighting technique, or complex aesthetic (e.g., 'cybernetic renaissance painting', 'stamped ink block print', 'hyper-realistic gelatinous sculpture', 'lo-fi anime watercolor'). 
      - Themes: Describe a specific setting, subject matter, or narrative concept (e.g., 'nomadic turtle city', 'candy-coated apocalypse', 'intergalactic bazaar', 'solarpunk botanical garden').
      
      Be evocative and diverse. Avoid generic terms.
      
      Return a JSON object with:
      - styles: string[]
      - themes: string[]`,
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
    });

    const data = JSON.parse(response.text || '{}');
    
    // Use mutation to ensure the exported reference remains valid and updated
    if (data.styles && Array.isArray(data.styles)) {
      data.styles.forEach((s: string) => {
        if (!ART_STYLES.includes(s) && ART_STYLES.length < POOL_LIMIT) {
          ART_STYLES.push(s);
        }
      });
    }
    
    if (data.themes && Array.isArray(data.themes)) {
      data.themes.forEach((t: string) => {
        if (!THEMES.includes(t) && THEMES.length < POOL_LIMIT) {
          THEMES.push(t);
        }
      });
    }
    
    console.debug(`Pool Expansion Success: Styles Count: ${ART_STYLES.length}, Themes Count: ${THEMES.length}`);
  } catch (error) {
    console.error("AI Pool Expansion failed:", error);
  }
}

/**
 * Generates a full game round: concept -> image -> puzzle.
 * Uses the dynamically expanded ART_STYLES and THEMES.
 */
export async function generateGameRound(): Promise<PuzzleData> {
  const sPool = ART_STYLES.length > 0 ? ART_STYLES : [
    "cinematic photography", "vibrant oil painting", "digital 3D render"
  ];
  const tPool = THEMES.length > 0 ? THEMES : [
    "outer space", "ancient ruins", "cyberpunk city"
  ];
  
  const randomStyle = sPool[Math.floor(Math.random() * sPool.length)];
  const randomTheme = tPool[Math.floor(Math.random() * tPool.length)];

  // Step 1: Conceptualize using a text-optimized model
  const conceptResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `You are the AI Game Master for a visual word-guessing game. 
    Your mission is to create a COMPLETELY UNIQUE AND DIVERSE visual riddle. 
    
    CRITICAL INSTRUCTIONS:
    - Theme focus: ${randomTheme}.
    - Style Context: The image should be in the style of: ${randomStyle}.
    - Target Word: Must be a specific NOUN, VERB, or ADJECTIVE strictly LONGER than 5 letters (6+ letters).
    - Concept: Think of something unusual, unexpected, or visually striking. Avoid common objects like "apples" or "cars" unless they are presented in a wild way.
    - The caption must use the target word naturally.
    
    Generate a JSON object with:
    - concept_prompt: A highly detailed, vivid prompt for an image generator including the style ${randomStyle} and the theme ${randomTheme}. Focus on specific lighting, unusual camera angles, and textures.
    - target_word: The chosen word (6+ letters).
    - caption: The full sentence describing the image.
    - thought: A very brief explanation of the subject.`,
    config: {
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
  });

  const concept = JSON.parse(conceptResponse.text || '{}') as {
    concept_prompt: string;
    target_word: string;
    caption: string;
    thought: string;
  };
  const targetWord = concept.target_word.toUpperCase();

  // Step 2: Generate the image using the specialized image model
  const imageResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: concept.concept_prompt }]
    },
    config: {
      imageConfig: { aspectRatio: "1:1" }
    }
  });

  let imageUrl = "";
  const candidates = imageResponse.candidates;
  if (candidates && candidates.length > 0) {
    for (const part of candidates[0].content.parts) {
      if (part.inlineData) {
        imageUrl = `data:image/png;base64,${part.inlineData.data}`;
        break;
      }
    }
  }

  // Step 3: Create Puzzle Elements
  const uniqueLetters = Array.from(new Set(targetWord.split('')));
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const poolSet = new Set<string>(uniqueLetters);
  
  while (poolSet.size < 12) {
    const randomChar = alphabet[Math.floor(Math.random() * alphabet.length)];
    poolSet.add(randomChar);
  }

  const letterPool = Array.from(poolSet).sort(() => Math.random() - 0.5);
  const redactedCaption = concept.caption.replace(
    new RegExp(concept.target_word, 'gi'), 
    "_".repeat(concept.target_word.length)
  );

  return {
    internal_thought_process: concept.thought,
    image_url: imageUrl,
    original_caption_hidden: concept.caption,
    target_word_hidden: targetWord,
    word_length: targetWord.length,
    puzzle_data_for_user: {
      redacted_caption: redactedCaption,
      letter_pool: letterPool
    }
  };
}
