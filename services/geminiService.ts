
import { GoogleGenAI, Type } from "@google/genai";
import { PuzzleData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const ART_STYLES = [
  "cinematic photography", "3D digital render", "vibrant oil painting", 
  "minimalist vector art", "neon cyberpunk aesthetic", "dreamy watercolor", 
  "macro photography", "retro 8-bit pixel art", "surrealist collage", 
  "hand-drawn charcoal sketch", "low-poly art style", "hyper-realistic close-up",
  "Ukiyo-e woodblock print", "Bauhaus geometric poster", "stained glass masterpiece",
  "vintage travel postcard", "claymation / stop-motion style", "double exposure art"
];

const THEMES = [
  "underwater mysteries", "outer space exploration", "ancient civilizations",
  "futuristic megacities", "microscopic worlds", "magical forests",
  "steampunk inventions", "culinary masterpieces", "extreme sports",
  "mythological creatures", "deserted island life", "abstract architecture"
];

/**
 * Generates a full game round: concept -> image -> puzzle.
 */
export async function generateGameRound(): Promise<PuzzleData> {
  const randomStyle = ART_STYLES[Math.floor(Math.random() * ART_STYLES.length)];
  const randomTheme = THEMES[Math.floor(Math.random() * THEMES.length)];

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
