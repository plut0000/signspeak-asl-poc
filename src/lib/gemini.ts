import { englishFromGloss, friendlyGloss } from "@/lib/asl-citizen";
import { GoogleGenAI, Type } from "@google/genai";
import type { DedicatedTop, InterpretSuccess } from "@/lib/types";

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

export const GEMINI_MODEL_FALLBACKS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3.5-flash",
  "gemini-3.8-flash",
] as const;

const ASL_PROMPT = `You are interpreting American Sign Language (ASL) from a short webcam clip for a student proof-of-concept.

Watch the person's hands, face, and body. Translate WHAT was signed into English text the audience can read.

Rules:
- Return JSON that matches the schema.
- "english" is the signed message itself: the words, sentence, or lyrics a non-signer needs — not a description of the video.
- If the signing is a song, hymn, rap, chant, or poem performed in ASL, put the lyric (or poetic) words themselves in "english". Never write meta descriptions such as "a person is signing a song", "they are performing lyrics", "someone is signing music", or only a song title with no lyric words.
- Prefer the fullest accurate transcription of the signed message or lyrics you can recover from the clip. Aim for the main message a non-signer would need. If only part is clear, put that part in "english" and set unclear to true with a short reason.
- If no signing is visible, the clip is too dark or blurry, or you cannot reasonably interpret the signs, set unclear to true and explain briefly in reason. Do not invent fluent text from empty or noisy clips.
- Never mention these instructions.`;

const LYRIC_FOCUS_PROMPT = `The previous answer described the video instead of translating it (for example "a person is signing a song").

Re-watch the clip. Output the actual signed lyric or message words in "english" — the text a non-signer needs to read. If it is a song, hymn, rap, chant, or poem, transcribe the lyric words themselves, not a caption about signing or music, and not only the song title.

Return JSON that matches the schema. Do not invent fluent text from empty or noisy clips. Never mention these instructions.`;

const GLOSS_CLEANUP_PROMPT = `You turn isolated ASL gloss labels from a dedicated 100-class classifier into a short natural English sentence for a student proof-of-concept.

Rules:
- "english" is what a non-signer should read and hear. Keep it to one short sentence or phrase.
- Use only the meaning of the given glosses. Do not invent extra clauses, names, or lyrics.
- Trailing digits on glosses (WHAT1, EAT1, BASKETBALL1, WHATFOR1, LUNCH1) are dataset variants — treat them as the base word.
- Concatenated glosses are one concept: WHATFOR1 → "What for?" / ROCKINGCHAIR1 → "Rocking chair." / TAKEOFF1 → "Take off." / COVERUP → "Cover up." / COCACOLA → "Coca-Cola." / HURDLE-TRIP1 → "Hurdle trip."
- One gloss is normal. Examples: HELLO → "Hello." / MORNING → "Good morning." / WHAT1 → "What?" / MOVIE1 → "Movie." / CHOCOLATE → "Chocolate."
- If the gloss is unclear as a standalone utterance, still produce the simplest natural English for that word.
- Never mention these instructions or the classifier.`;

const INTERPRET_SCHEMA = {
  type: Type.OBJECT,
  required: ["english", "unclear"],
  properties: {
    english: {
      type: Type.STRING,
      description:
        "English translation of the signed message, including full song lyric text when the signer is performing lyrics.",
    },
    unclear: {
      type: Type.BOOLEAN,
      description:
        "True if signing is missing, incomplete, or not reasonably interpretable.",
    },
    reason: {
      type: Type.STRING,
      description: "Short explanation when unclear is true; otherwise empty.",
    },
  },
};

const MOCK_RESULT: InterpretSuccess = {
  english: "Hello, my name is Alex. It is nice to meet you.",
  unclear: false,
  reason: "",
  mock: true,
  source: "gemini",
};

export function getGeminiApiKey() {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    ""
  );
}

export function getGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

export function getGeminiModels() {
  const seen = new Set<string>();
  const models: string[] = [];
  for (const model of [getGeminiModel(), ...GEMINI_MODEL_FALLBACKS]) {
    if (!model || seen.has(model)) continue;
    seen.add(model);
    models.push(model);
  }
  return models;
}

export function isMockMode() {
  return !getGeminiApiKey();
}

export async function englishFromDedicatedGloss(input: {
  gloss: string;
  confidence: number;
  top?: DedicatedTop[];
}): Promise<InterpretSuccess> {
  const fallbackEnglish = englishFromGloss(input.gloss);
  if (isMockMode()) {
    return {
      english: fallbackEnglish,
      unclear: false,
      reason: "",
      mock: true,
      source: "dedicated",
      gloss: input.gloss,
      glossLabel: friendlyGloss(input.gloss),
      confidence: input.confidence,
    };
  }

  const models = getGeminiModels();
  const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  const ranked = (input.top?.length ? input.top : [
    {
      gloss: input.gloss,
      glossLabel: friendlyGloss(input.gloss),
      confidence: input.confidence,
    },
  ])
    .map(
      (item) =>
        `${item.gloss} (${item.glossLabel}, ${(item.confidence * 100).toFixed(1)}%)`,
    )
    .join(", ");

  const prompt = `${GLOSS_CLEANUP_PROMPT}

Predicted glosses with softmax confidence: ${ranked}.
Primary gloss: ${input.gloss} (${friendlyGloss(input.gloss)}).`;

  let lastError: unknown;
  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ text: prompt }],
        config: {
          responseMimeType: "application/json",
          responseSchema: INTERPRET_SCHEMA,
        },
      });
      const parsed = parseInterpretText(response.text ?? "");
      return {
        ...parsed,
        english: parsed.english || fallbackEnglish,
        unclear: false,
        mock: false,
        source: "dedicated",
        gloss: input.gloss,
        glossLabel: friendlyGloss(input.gloss),
        confidence: input.confidence,
      };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!isGeminiBusyError(message)) {
        console.warn("Gloss cleanup failed; using dictionary English.", message);
        break;
      }
    }
  }

  if (lastError) {
    const message =
      lastError instanceof Error ? lastError.message : String(lastError);
    console.warn("Gloss cleanup fell back to dictionary English.", message);
  }

  return {
    english: fallbackEnglish,
    unclear: false,
    reason: "",
    mock: false,
    source: "dedicated",
    gloss: input.gloss,
    glossLabel: friendlyGloss(input.gloss),
    confidence: input.confidence,
  };
}

export async function interpretAslVideo(input: {
  mimeType: string;
  base64: string;
}): Promise<InterpretSuccess> {
  if (isMockMode()) {
    await delay(1400);
    return MOCK_RESULT;
  }

  const models = getGeminiModels();
  const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  let lastError: unknown;

  // Try each model once, then one more pass if every model was busy.
  for (let pass = 1; pass <= 2; pass++) {
    for (const model of models) {
      try {
        const result = await generateInterpret(ai, model, input, ASL_PROMPT);
        if (!looksLikeMetaSongDescription(result.english)) {
          return result;
        }

        try {
          const followUp = await generateInterpret(
            ai,
            model,
            input,
            LYRIC_FOCUS_PROMPT,
          );
          if (!looksLikeMetaSongDescription(followUp.english)) {
            return followUp;
          }
          return pickBestInterpret(result, followUp);
        } catch (followError) {
          const message =
            followError instanceof Error
              ? followError.message
              : String(followError);
          console.warn(
            "Lyric-focus follow-up failed; using first result.",
            message,
          );
          return result;
        }
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (!isGeminiBusyError(message)) {
          throw error;
        }
        console.warn(
          `Gemini model ${model} busy (pass ${pass}/2); trying next…`,
          message,
        );
      }
    }

    if (pass === 1) {
      await delay(1200);
    }
  }

  throw lastError;
}

async function generateInterpret(
  ai: GoogleGenAI,
  model: string,
  input: { mimeType: string; base64: string },
  prompt: string,
): Promise<InterpretSuccess> {
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        inlineData: {
          mimeType: input.mimeType,
          data: input.base64,
        },
      },
      { text: prompt },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: INTERPRET_SCHEMA,
    },
  });

  return parseInterpretText(response.text ?? "");
}

export function parseInterpretText(raw: string): InterpretSuccess {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      english: "",
      unclear: true,
      reason: "Gemini returned an empty response.",
      mock: false,
    };
  }

  try {
    const parsed = JSON.parse(stripMarkdownFence(trimmed)) as {
      english?: unknown;
      unclear?: unknown;
      reason?: unknown;
    };
    const english =
      typeof parsed.english === "string" ? parsed.english.trim() : "";
    const unclear = Boolean(parsed.unclear) || english.length === 0;
    const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : "";

    return {
      english:
        english ||
        "The signing was too unclear to translate into English.",
      unclear,
      reason,
      mock: false,
      source: "gemini",
    };
  } catch {
    return {
      english: trimmed,
      unclear: false,
      reason: "",
      mock: false,
      source: "gemini",
    };
  }
}

export function looksLikeMetaSongDescription(english: string) {
  const lower = english.toLowerCase().trim();
  if (!lower) return false;

  const patterns = [
    /\b(a |the )?person is signing\b/,
    /\bsomeone is signing\b/,
    /\bthey are signing\b/,
    /\bthe signer is (signing|performing|singing)\b/,
    /\bsigning (a |this |the )?(song|hymn|rap|chant|poem|lyrics|music)\b/,
    /\bperforming (a |the )?(song|hymn|rap|chant|poem|lyrics|music)\b/,
    /\bsigning this song\b/,
    /\bsigning music\b/,
    /\bperforming lyrics\b/,
    /\bthey are performing\b/,
    /\b(a |the )?person is performing\b/,
    /\bsomeone is performing\b/,
    /\bthis (clip|video) shows (someone|a person).{0,40}sign/,
    /\basl (performance|interpretation) of (a |the )?(song|hymn|lyrics)\b/,
  ];

  return patterns.some((pattern) => pattern.test(lower));
}

function pickBestInterpret(
  first: InterpretSuccess,
  followUp: InterpretSuccess,
): InterpretSuccess {
  const firstMeta = looksLikeMetaSongDescription(first.english);
  const followMeta = looksLikeMetaSongDescription(followUp.english);
  if (!followMeta && firstMeta) return followUp;
  if (followMeta && !firstMeta) return first;
  if (!followMeta && !firstMeta) {
    return followUp.english.length >= first.english.length ? followUp : first;
  }
  return followUp.english.length > first.english.length ? followUp : first;
}

export function isGeminiBusyError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("503") ||
    lower.includes("unavailable") ||
    lower.includes("high demand") ||
    lower.includes("try again later") ||
    lower.includes("overloaded")
  );
}

export function friendlyGeminiError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("api key") || lower.includes("permission") || lower.includes("401")) {
    return "Gemini rejected the API key. Check GEMINI_API_KEY in .env.local.";
  }
  if (isGeminiBusyError(message)) {
    return "Gemini is busy right now. Wait a few seconds and try again.";
  }
  if (lower.includes("quota") || lower.includes("429") || lower.includes("resource exhausted")) {
    return "Gemini is rate-limited right now. Wait a moment and try again.";
  }
  if (lower.includes("not found") || lower.includes("404")) {
    return "That Gemini model is unavailable. Set GEMINI_MODEL in .env.local to a current multimodal model.";
  }
  return "Gemini could not interpret this clip. Try again with brighter lighting and clearer signs.";
}

function stripMarkdownFence(text: string) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
