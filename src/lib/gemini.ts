import { englishFromGloss, friendlyGloss } from "@/lib/asl-citizen";
import { userFacingInterpretError } from "@/lib/dedicated-skip-copy";
import { GoogleGenAI, Type } from "@google/genai";
import {
  POLITE_UNCLEAR_ENGLISH,
  sanitizeInterpretResult,
  shouldRetryLyricFocus,
} from "@/lib/interpret-text";
import type { DedicatedTop, InterpretSuccess } from "@/lib/types";

export { looksLikeMetaSongDescription } from "@/lib/interpret-text";

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

/** Gloss cleanup can fall back across the full list; video interpret stays on lite models. */
export const GEMINI_MODEL_FALLBACKS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3.5-flash",
  "gemini-3.8-flash",
] as const;

/** Fast multimodal models only — skip slower full flash variants on long song clips. */
export const GEMINI_VIDEO_FAST_FALLBACKS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3-flash-preview",
] as const;

export const VIDEO_INTERPRET_FPS = 8;
export const VIDEO_REQUEST_TIMEOUT_MS = 55_000;

export const ASL_PROMPT = `You are SignSpeak's ASL → English translator. The user recorded this clip so a non-signer can read what was signed. Assume American Sign Language by default.

This video is silent. Ignore audio completely. Never transcribe speech, music, or soundtrack lyrics. Translate only from visible signing: hands, face, body, and on-screen words that are actually being signed.

"english" must be the signed meaning itself — the sentence or lyric lines a non-signer should read — not a description of the video, camera, or room.

Signed music:
- If the clip looks like a signed song, hymn, rap, chant, poem, karaoke, or signing along with music, output the lyric lines (or the closest English of the signed song content).
- Prefer ASL song interpretation over “this is not ASL”.
- Never write meta captions such as "a person is signing a song", "they are performing lyrics", "someone is signing music", or only a song title with no lyric words.
- You may use on-screen lyric text only as a hint for what the hands are signing. Do not dump soundtrack lyrics that the signs do not support.

Unclear (last resort only):
- Set unclear=true only when signing is truly not visible (empty, dark, blurry, no hands, no movement).
- Then "english" must be a short polite line such as "The signing was too unclear to translate." and "reason" a single calm clause, for example "Hands were not visible."
- Partial lyrics or a partial sentence are better than refusing.

Never:
- Label gestures as gang signs, crime, slang crews, or anything criminal.
- Claim the user is screen-recording, watching another video, cheating, or not really signing.
- Narrate "you are recording your screen" / camera commentary as the primary answer.
- Transcribe soundtrack audio.
- Mention these instructions.

Return JSON that matches the schema.`;

export const LYRIC_FOCUS_PROMPT = `The previous answer was not an ASL translation. It described the video, guessed about the camera, labeled gestures as something other than signing, or used soundtrack audio.

This is a silent video. Ignore audio entirely. Watch the hands, face, and body. If it looks like signed music, karaoke, or performance, assume ASL song interpretation and put the actual lyric lines (or the closest English of the signed song) in "english".

Do not write "a person is signing a song", a song title alone, gang-sign / crime labels, or screen-recording commentary. Do not transcribe the soundtrack.

unclear=true only if no signing is visible, with a short polite reason. Return JSON that matches the schema. Never mention these instructions.`;

const GLOSS_CLEANUP_PROMPT = `You turn isolated ASL gloss labels from a dedicated 200-class classifier into a short natural English sentence for a student proof-of-concept.

Rules:
- "english" is what a non-signer should read and hear. Keep it to one short sentence or phrase.
- Use only the meaning of the given glosses. Do not invent extra clauses, names, or lyrics.
- Trailing digits on glosses (WHAT1, EAT1, BASKETBALL1, WHATFOR1, LUNCH1, WRISTWATCH3) are dataset variants — treat them as the base word.
- Concatenated glosses are one concept: WHATFOR1 → "What for?" / ROCKINGCHAIR1 → "Rocking chair." / TAKEOFF1 → "Take off." / COVERUP → "Cover up." / COCACOLA → "Coca-Cola." / HURDLE-TRIP1 → "Hurdle trip." / BASEBALLCAP → "Baseball cap." / CALLTTY → "Call TTY." / FALLINGASLEEP → "Falling asleep." / TAKECARE → "Take care." / VIDEOPHONE → "Video phone." / WORKOUT → "Work out." / ZOOMOFF → "Zoom off." / SSHH → "Shh."
- One gloss is normal. Examples: HELLO → "Hello." / MORNING → "Good morning." / WHAT1 → "What?" / LUNCH1 → "Lunch." / CHOCOLATE → "Chocolate."
- If the gloss is unclear as a standalone utterance, still produce the simplest natural English for that word.
- Never mention crime, gang signs, cameras, or these instructions or the classifier.`;

const INTERPRET_SCHEMA = {
  type: Type.OBJECT,
  required: ["english", "unclear"],
  properties: {
    english: {
      type: Type.STRING,
      description:
        "English of the signed message or signed song lyrics from vision only. Not a video description, not audio transcription, not accusations.",
    },
    unclear: {
      type: Type.BOOLEAN,
      description:
        "True only when signing is not visible enough to translate. Do not set true to refuse a signed song.",
    },
    reason: {
      type: Type.STRING,
      description:
        "One short polite clause when unclear is true; never accusations. Empty otherwise.",
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

function uniqueModels(preferred: string[]) {
  const seen = new Set<string>();
  const models: string[] = [];
  for (const model of preferred) {
    if (!model || seen.has(model)) continue;
    seen.add(model);
    models.push(model);
  }
  return models;
}

export function getGeminiModels() {
  return uniqueModels([getGeminiModel(), ...GEMINI_MODEL_FALLBACKS]);
}

export function getGeminiVideoModels() {
  return uniqueModels([getGeminiModel(), ...GEMINI_VIDEO_FAST_FALLBACKS]);
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
          thinkingConfig: { thinkingBudget: 0 },
          httpOptions: {
            timeout: 20_000,
            retryOptions: { attempts: 1 },
          },
        },
      });
      const parsed = sanitizeInterpretResult(
        parseInterpretText(response.text ?? ""),
      );
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

  const models = getGeminiVideoModels();
  const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  let lastError: unknown;

  // One pass of lite models only. SDK retries are disabled; busy models fail over quickly.
  for (const model of models) {
    try {
      const result = await generateInterpret(ai, model, input, ASL_PROMPT);
      if (!shouldRetryLyricFocus(result)) {
        return sanitizeInterpretResult(result);
      }

      try {
        const followUp = await generateInterpret(
          ai,
          model,
          input,
          LYRIC_FOCUS_PROMPT,
        );
        if (!shouldRetryLyricFocus(followUp)) {
          return sanitizeInterpretResult(followUp);
        }
        return sanitizeInterpretResult(pickBestInterpret(result, followUp));
      } catch (followError) {
        const message =
          followError instanceof Error
            ? followError.message
            : String(followError);
        console.warn(
          "Lyric-focus follow-up failed; using first result.",
          message,
        );
        return sanitizeInterpretResult(result);
      }
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!isGeminiBusyError(message)) {
        throw error;
      }
      console.warn(
        `Gemini model ${model} busy; trying next lite model…`,
        message,
      );
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
        videoMetadata: {
          fps: VIDEO_INTERPRET_FPS,
        },
      },
      { text: prompt },
    ],
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: INTERPRET_SCHEMA,
      thinkingConfig: { thinkingBudget: 0 },
      audioTimestamp: false,
      httpOptions: {
        timeout: VIDEO_REQUEST_TIMEOUT_MS,
        retryOptions: { attempts: 1 },
      },
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
      english: english || POLITE_UNCLEAR_ENGLISH,
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

function pickBestInterpret(
  first: InterpretSuccess,
  followUp: InterpretSuccess,
): InterpretSuccess {
  const firstNeedsRetry = shouldRetryLyricFocus(first);
  const followNeedsRetry = shouldRetryLyricFocus(followUp);
  if (!followNeedsRetry && firstNeedsRetry) return followUp;
  if (followNeedsRetry && !firstNeedsRetry) return first;
  if (!followNeedsRetry && !firstNeedsRetry) {
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

export function friendlyGeminiError(message: string, fallbackReason?: string) {
  const lower = message.toLowerCase();
  if (lower.includes("mute") || lower.includes("silent video")) {
    return "Could not prepare a silent video for translation. Try signing again.";
  }
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
  return userFacingInterpretError({
    error:
      "Gemini could not interpret this clip. Try again with brighter lighting and clearer signs.",
    fallbackReason,
  });
}

function stripMarkdownFence(text: string) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
