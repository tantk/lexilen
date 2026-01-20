
import { GoogleGenAI, Type } from "@google/genai";
import { PuzzleData } from "../types";

// Always use the process.env.API_KEY directly as per guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates a full game round: concept -> image -> puzzle.
 */
export async function generateGameRound(): Promise<PuzzleData> {
  // Step 1 & 2: Conceptualize and get target details
  const conceptResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `You are the AI Game Master for a visual word-guessing game. 
    Think of a distinct visual concept (object, action, or setting). 
    Choose a Target Word (noun/verb/adj, minimum 6 letters).
    Create a concise caption with this word.
    Generate a JSON object with:
    - concept_prompt: A descriptive prompt for an image generator (vivid, detailed).
    - target_word: The chosen word.
    - caption: The full sentence.
    - thought: Why you chose this.`,
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

  // Access the text property directly and cast to the expected structure to resolve unknown types
  const concept = JSON.parse(conceptResponse.text || '{}') as {
    concept_prompt: string;
    target_word: string;
    caption: string;
    thought: string;
  };
  const targetWord = concept.target_word.toUpperCase();

  // Step 2: Generate the image
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
  // Access candidates and parts safely to find the image data
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

/**
 * Edits the existing image based on a user prompt.
 */
export async function editImage(base64Image: string, editPrompt: string): Promise<string> {
  const pureBase64 = base64Image.split(',')[1] || base64Image;
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          inlineData: {
            data: pureBase64,
            mimeType: 'image/png'
          }
        },
        { text: editPrompt }
      ]
    }
  });

  // Extract the image from candidates as per guidelines
  const candidates = response.candidates;
  if (candidates && candidates.length > 0) {
    for (const part of candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  }
  
  throw new Error("Failed to edit image");
}
