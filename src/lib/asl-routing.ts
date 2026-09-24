import {
  DEFAULT_DEDICATED_THRESHOLD,
  getDedicatedThreshold,
} from "@/lib/asl-citizen";

type DedicatedDecisionInput = {
  glossLabel: string;
  confidence: number;
  margin: number;
  normalizedEntropy: number;
  top: Array<{ glossLabel: string; confidence: number }>;
};

/** Isolated ASL Citizen signs are typically 1–4s. A slow one-word demo still fits; longer clips stay on Gemini. */
export const MAX_ISOLATED_SIGN_MS = 8_000;
/** ~7.9s at the browser's 66ms landmark sample interval. */
export const MAX_ISOLATED_SIGN_FRAMES = 120;
export const DEFAULT_DEDICATED_MARGIN = 0.15;
/** Softmax entropy / ln(classes). Uniform over the vocab is 1. */
export const DEFAULT_MAX_NORMALIZED_ENTROPY = 0.75;

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value));
}

function envUnit(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? clampUnit(value) : fallback;
}

function envPositiveInt(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function getDedicatedMargin() {
  return envUnit("DEDICATED_ASL_MARGIN", DEFAULT_DEDICATED_MARGIN);
}

export function getDedicatedMaxNormalizedEntropy() {
  return envUnit(
    "DEDICATED_ASL_MAX_ENTROPY",
    DEFAULT_MAX_NORMALIZED_ENTROPY,
  );
}

export function getMaxIsolatedSignMs() {
  return envPositiveInt("DEDICATED_ASL_MAX_MS", MAX_ISOLATED_SIGN_MS);
}

export function getMaxIsolatedSignFrames() {
  return envPositiveInt("DEDICATED_ASL_MAX_FRAMES", MAX_ISOLATED_SIGN_FRAMES);
}

export function parseDurationMs(raw: FormDataEntryValue | null) {
  if (raw == null || raw === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return value;
}

export function assessIsolatedSignBudget(input: {
  frames: number;
  durationMs?: number;
}): { ok: true } | { ok: false; reason: string } {
  const maxMs = getMaxIsolatedSignMs();
  const maxFrames = getMaxIsolatedSignFrames();
  const durationMs = input.durationMs;

  if (typeof durationMs === "number" && durationMs > maxMs) {
    const seconds = (durationMs / 1000).toFixed(1).replace(/\.0$/, "");
    return {
      ok: false,
      reason: `Clip is ${seconds}s — longer than a single isolated sign, so Gemini video is used instead of the dedicated model.`,
    };
  }

  if (input.frames > maxFrames) {
    return {
      ok: false,
      reason: `Landmark sequence (${input.frames} frames) is longer than a typical isolated sign, so Gemini video is used instead of the dedicated model.`,
    };
  }

  return { ok: true };
}

export function assessDedicatedPrediction(
  prediction: DedicatedDecisionInput,
): { ok: true } | { ok: false; reason: string } {
  const threshold = getDedicatedThreshold();
  const minMargin = getDedicatedMargin();
  const maxEntropy = getDedicatedMaxNormalizedEntropy();

  if (prediction.confidence < threshold) {
    return {
      ok: false,
      reason: `Dedicated model confidence ${(prediction.confidence * 100).toFixed(0)}% was below ${Math.round(threshold * 100)}%.`,
    };
  }

  if (prediction.margin < minMargin) {
    const second = prediction.top[1];
    const secondText = second
      ? `${second.glossLabel} ${(second.confidence * 100).toFixed(0)}%`
      : "another class";
    return {
      ok: false,
      reason: `Dedicated model was split between ${prediction.glossLabel} (${(prediction.confidence * 100).toFixed(0)}%) and ${secondText}.`,
    };
  }

  if (prediction.normalizedEntropy > maxEntropy) {
    return {
      ok: false,
      reason: "Dedicated model was uncertain across too many glosses.",
    };
  }

  return { ok: true };
}

export function dedicatedRoutingSettings() {
  return {
    threshold: getDedicatedThreshold(),
    margin: getDedicatedMargin(),
    maxNormalizedEntropy: getDedicatedMaxNormalizedEntropy(),
    maxIsolatedMs: getMaxIsolatedSignMs(),
    maxIsolatedFrames: getMaxIsolatedSignFrames(),
    defaultThreshold: DEFAULT_DEDICATED_THRESHOLD,
  };
}
