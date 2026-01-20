
import { GoogleGenAI, Type } from "@google/genai";
import { PuzzleData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Configuration for dynamic pool expansion
export const POOL_LIMIT = 60;
export const INITIAL_BATCH_SIZE = 8; 
export const SUBSEQUENT_BATCH_SIZE = 15; // Optimized for performance and variety

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

export const DOMAINS: string[] = [
  "Fauna & Wildlife",
  "Chronicles of History",
  "The Scientific Frontier",
  "Global Geography & Landmarks",
  "Philosophical Paradoxes",
  "Economic Power & Markets",
  "Cultural Heritage & Traditions",
  "Cinematic Masterpieces"
];

// Stores specific instructions for each domain to ensure high-quality generation
export const DOMAIN_RULES: Record<string, string> = {
  "Fauna & Wildlife": "Focus on the animal's distinct anatomy, habitat, and wild personality. Use textures that highlight fur, scales, or feathers.",
  "Chronicles of History": "Ensure period-accurate clothing, architecture, and technology. Capture the gravitas of a historical era.",
  "The Scientific Frontier": "Incorporate laboratory equipment, mathematical symbols, or macroscopic biological views. Use clean, precise aesthetics.",
  "Global Geography & Landmarks": "Focus on unique geological formations, iconic monuments, or specific regional atmospheres (e.g., misty fjords, sun-drenched savannas).",
  "Philosophical Paradoxes": "Use surrealism, visual metaphors, and abstract geometry to represent complex thoughts like 'Dualism' or 'The Void'.",
  "Economic Power & Markets": "Feature elements like trading floors, stacks of currency, industrial machinery, or abstract representations of supply and demand.",
  "Cultural Heritage & Traditions": "Highlight traditional garments, local crafts, sacred ceremonies, and the vibrant colors of specific world cultures.",
  "Cinematic Masterpieces": "Apply film-making tropes like anamorphic flares, Dutch angles, or technicolor grading. Evoke the 'look' of a specific genre (Noir, Sci-Fi, etc.)."
};

export const ART_STYLES: string[] = [
  "cinematic street photography with heavy grain",
  "expressive oil portraiture with thick impasto",
  "dynamic action manga ink wash",
  "vaporwave 80s glitch",
  "isometric clay render",
  "charcoal sketch on aged parchment",
  "neon-noir synthwave palette",
  "cybernetic botanical illustration",
  "theatrical renaissance lighting",
  "classic Hollywood film noir",
  "18th-century scientific engraving",
  "surrealist dreamscape"
];

export const THEMES: string[] = [
  "an intense scientific breakthrough",
  "a majestic animal in its natural habitat",
  "a pivotal moment in human history",
  "a bustling international marketplace",
  "an abstract representation of time and fate",
  "a traditional cultural ceremony",
  "an iconic shot from a classic movie",
  "a breathtaking geographic landmark"
];

export async function expandPool(count: number) {
  if (ART_STYLES.length >= POOL_LIMIT && THEMES.length >= POOL_LIMIT) return;
  try {
    const response = await withRetry(() => ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: `You are expanding a pool of creative concepts for a visual riddle game called InSight.
      Generate ${count} new art styles, themes, and intellectual domains.
      
      RULES FOR DOMAINS:
      1. Every domain must have a short 'rule' for an image generator.
      2. Cover diverse topics: Sports, Gastronomy, Mythology, Architecture, Outer Space, Psychology, etc.
      3. Maintain the balance: Styles should include both "Character-Driven" and "Atmospheric" vibes.
      
      Return JSON { styles: string[], themes: string[], domains: { name: string, rule: string }[] }`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            styles: { type: Type.ARRAY, items: { type: Type.STRING } },
            themes: { type: Type.ARRAY, items: { type: Type.STRING } },
            domains: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  rule: { type: Type.STRING }
                },
                required: ["name", "rule"]
              }
            }
          },
          required: ["styles", "themes", "domains"]
        }
      }
    }));
    
    const data = JSON.parse(response.text || '{}') as { 
      styles?: string[]; 
      themes?: string[]; 
      domains?: { name: string, rule: string }[] 
    };

    if (data.styles) data.styles.forEach(s => { if (!ART_STYLES.includes(s) && ART_STYLES.length < POOL_LIMIT) ART_STYLES.push(s); });
    if (data.themes) data.themes.forEach(t => { if (!THEMES.includes(t) && THEMES.length < POOL_LIMIT) THEMES.push(t); });
    if (data.domains) {
      data.domains.forEach(d => {
        if (!DOMAINS.includes(d.name) && DOMAINS.length < POOL_LIMIT) {
          DOMAINS.push(d.name);
          DOMAIN_RULES[d.name] = d.rule;
        }
      });
    }
  } catch (e) { console.error("Pool expansion failed", e); }
}

export async function generateGameRound(): Promise<PuzzleData> {
  const randomStyle = ART_STYLES[Math.floor(Math.random() * ART_STYLES.length)];
  const randomTheme = THEMES[Math.floor(Math.random() * THEMES.length)];
  const randomDomain = DOMAINS[Math.floor(Math.random() * DOMAINS.length)];
  const domainRule = DOMAIN_RULES[randomDomain] || "Create an evocative scene fitting this domain.";
  
  const isHumanCentric = Math.random() > 0.5;

  const conceptResponse = await withRetry(() => ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `You are a visual riddle master. Domain: ${randomDomain}. 
    Create a ${isHumanCentric ? 'Character-Driven' : 'Atmospheric'} visual puzzle.
    Theme: ${randomTheme}
    Art Style: ${randomStyle}
    
    SPECIAL DOMAIN RULE: ${domainRule}

    INSTRUCTIONS: 
    - Provide exactly ONE target word that is a common noun (6-10 letters).
    - The target word must be present in the image.
    - DO NOT use the word "MYSTERY" as the target word.
    
    ${isHumanCentric ? 
      `1. CHARACTER FOCUS: Feature a person or creature with emotion.
       2. TARGET WORD: A noun (6-10 letters) that is central to their action (e.g. 'LANTERN', 'BACKPACK', 'HELMET').` :
      `1. ATMOSPHERIC FOCUS: Focus on an iconic object. No humans.
       2. TARGET WORD: A noun (6-10 letters) that is the focal object itself (e.g. 'TELESCOPE', 'MONOLITH', 'TAPESTRY').`
    }
    
    Return JSON:
    {
      "concept_prompt": "Prompt for image generation",
      "target_word": "THE_ACTUAL_WORD",
      "caption": "A sentence describing the scene with the word included",
      "thought": "Intellectual logic for this domain"
    }`,
    config: {
      temperature: 1.0,
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
  
  // Robust word extraction: remove quotes, spaces, and non-alpha characters
  const rawWord = (concept.target_word || "").replace(/[^a-zA-Z]/g, "").trim().toUpperCase();
  const targetWord = rawWord.length >= 3 && rawWord !== "MYSTERY" ? rawWord : "PUZZLE"; // Better fallback than mystery
  
  const caption = (concept.caption || `A scene from the ${randomDomain} domain.`).trim();

  const imageResponse = await withRetry(() => ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: `${concept.concept_prompt}. Masterpiece quality, highly detailed, ${randomStyle}.` }] },
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

  const uniqueLetters = Array.from(new Set(targetWord.split(''))) as string[];
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const poolSet = new Set<string>(uniqueLetters);
  while (poolSet.size < 12) poolSet.add(alphabet[Math.floor(Math.random() * alphabet.length)]);
  const letterPool = Array.from(poolSet).sort(() => Math.random() - 0.5);

  const redactedCaption = caption.replace(new RegExp(targetWord, 'gi'), "___");

  return {
    internal_thought_process: concept.thought || "Domain logic applied.",
    image_url: imageUrl,
    original_caption_hidden: caption,
    target_word_hidden: targetWord,
    word_length: targetWord.length,
    art_style: randomStyle,
    theme: randomTheme,
    category: randomDomain,
    puzzle_data_for_user: {
      redacted_caption: redactedCaption,
      letter_pool: letterPool
    }
  };
}
