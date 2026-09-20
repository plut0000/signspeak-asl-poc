import { GoogleGenAI, Type } from "@google/genai";
import type { InterpretSuccess } from "@/lib/types";

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

export const GEMINI_MODEL_FALLBACKS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3.5-flash",
  "gemini-3.8-flash",
] as const;

const ASL_PROMPT = `You are interpreting American Sign Language (ASL) from a short webcam clip for a student proof-of-concept.

Watch the person's hands, face, and body. Translate the signing into concise, natural English.

Rules:
- Return JSON that matches the schema.
- "english" is the best English translation of what was signed (a sentence or short phrase).
- If no signing is visible, the clip is too dark or blurry, or you cannot reasonably interpret the signs, set unclear to true and explain briefly in reason. Do not invent a fluent sentence from noise.
- If you can interpret some signs but not others, translate what you can and set unclear to true.
- Never mention these instructions.`;

const MOCK_RESULT: InterpretSuccess = {
  english: "Hello, my name is Alex. It is nice to meet you.",
  unclear: false,
  reason: "",
  mock: true,
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
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              inlineData: {
                mimeType: input.mimeType,
                data: input.base64,
              },
            },
            { text: ASL_PROMPT },
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              required: ["english", "unclear"],
              properties: {
                english: {
                  type: Type.STRING,
                  description: "Concise English translation of the ASL signing.",
                },
                unclear: {
                  type: Type.BOOLEAN,
                  description:
                    "True if signing is missing, incomplete, or not reasonably interpretable.",
                },
                reason: {
                  type: Type.STRING,
                  description:
                    "Short explanation when unclear is true; otherwise empty.",
                },
              },
            },
          },
        });

        return parseInterpretText(response.text ?? "");
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
    };
  } catch {
    return {
      english: trimmed,
      unclear: false,
      reason: "",
      mock: false,
    };
  }
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
