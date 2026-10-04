import type { DedicatedTop } from "@/lib/types";

const HANDS_MISSING = /hands were missing|poorly tracked/i;
const TOO_FEW_FRAMES = /too few landmark/i;
const NO_LANDMARKS = /landmarks were captured|no mediapipe landmarks/i;
const INVALID_FRAMES = /frame count is invalid/i;
const DISABLED = /disabled/i;
const INFERENCE_FAILED = /inference failed/i;
const LONG_CLIP = /longer than a single isolated sign|longer than a typical isolated sign/i;
const SEQUENCE_TOO_LONG = /limit for several signs/i;
const SEQUENCE_SPARSE = /too sparse to split/i;
const SEQUENCE_NO_SIGNS = /no separate signs were found|too many short movements/i;
const SEQUENCE_UNCLEAR = /^(.*?) for the dedicated model, so gemini video is used instead\.$/i;
const LIGHTING_BLAME = /brighter lighting/i;

export const LONG_CLIP_GEMINI_ERROR =
  "Google couldn’t read that longer clip. For the custom model, sign one word for under ~8 seconds.";
export const SEQUENCE_GEMINI_ERROR =
  "Google couldn’t read that longer clip. For the custom model, pause briefly between signs and keep both hands in frame.";

export function isLongClipSkipReason(reason?: string) {
  return LONG_CLIP.test(reason ?? "") || SEQUENCE_TOO_LONG.test(reason ?? "");
}

/** The custom model tried to read the clip as several signs and could not. */
export function isSignSequenceSkipReason(reason?: string) {
  return SEQUENCE_NO_SIGNS.test(reason ?? "") || SEQUENCE_UNCLEAR.test(reason ?? "");
}

/**
 * Primary line for a failed interpret. A length skip must not open with the
 * lighting sentence; quality skips and missing skip reasons still can.
 * More specific Gemini errors (busy, key, quota) pass through unchanged.
 */
export function userFacingInterpretError(input: {
  error: string;
  fallbackReason?: string;
}) {
  if (!LIGHTING_BLAME.test(input.error)) return input.error;
  if (isLongClipSkipReason(input.fallbackReason)) return LONG_CLIP_GEMINI_ERROR;
  if (isSignSequenceSkipReason(input.fallbackReason)) return SEQUENCE_GEMINI_ERROR;
  return input.error;
}

const LOW_CONFIDENCE = /confidence .+ was below/i;
const SPLIT = /split between/i;
const HIGH_ENTROPY = /uncertain across too many/i;

export function explainDedicatedSkip(input: {
  fallbackReason?: string;
  dedicatedTop?: DedicatedTop;
}): string | null {
  const reason = input.fallbackReason?.trim() ?? "";
  const guess = formatGuess(input.dedicatedTop);
  if (!reason && !guess) return null;

  if (HANDS_MISSING.test(reason)) {
    return "Custom model skipped: Hands were missing from too many frames.";
  }
  if (TOO_FEW_FRAMES.test(reason)) {
    return "Custom model skipped: Not enough of the sign was tracked.";
  }
  if (NO_LANDMARKS.test(reason)) {
    return "Custom model skipped: Hand tracking did not capture this clip.";
  }
  if (INVALID_FRAMES.test(reason)) {
    return "Custom model skipped: The tracking data looked incomplete.";
  }
  if (DISABLED.test(reason)) {
    return "Custom model skipped: The custom model is turned off.";
  }
  if (INFERENCE_FAILED.test(reason)) {
    return "Custom model skipped: It could not read this clip.";
  }
  if (SEQUENCE_TOO_LONG.test(reason)) {
    return "Custom model skipped: This clip is longer than about 30 seconds.";
  }
  if (SEQUENCE_SPARSE.test(reason)) {
    return "Custom model skipped: Not enough of the clip was tracked to split it into signs.";
  }
  if (SEQUENCE_NO_SIGNS.test(reason)) {
    return "Custom model skipped: It could not find separate signs in this clip.";
  }
  const unclear = SEQUENCE_UNCLEAR.exec(reason);
  if (unclear) {
    return `Custom model skipped: ${unclear[1]}.`;
  }
  if (LONG_CLIP.test(reason)) {
    return "Custom model skipped: This clip is longer than one sign.";
  }
  if (LOW_CONFIDENCE.test(reason) || (!reason && guess)) {
    return guess
      ? `Custom model skipped: Confidence was too low (best guess ${guess}).`
      : "Custom model skipped: Confidence was too low.";
  }
  if (SPLIT.test(reason)) {
    return guess
      ? `Custom model skipped: It was unsure between two signs (best guess ${guess}).`
      : "Custom model skipped: It was unsure between two signs.";
  }
  if (HIGH_ENTROPY.test(reason)) {
    return guess
      ? `Custom model skipped: It was unsure across too many signs (best guess ${guess}).`
      : "Custom model skipped: It was unsure across too many signs.";
  }

  if (guess) {
    return `Custom model skipped: Confidence was too low (best guess ${guess}).`;
  }
  return "Custom model skipped: It was not confident enough to use for this clip.";
}

function formatGuess(top?: DedicatedTop) {
  if (!top) return "";
  const gloss = top.gloss?.trim() || "";
  const label = top.glossLabel?.trim() || "";
  const name =
    label && gloss && label.toLowerCase() !== gloss.toLowerCase()
      ? `${label} (${gloss})`
      : gloss || label;
  if (!name) return "";
  const pct = Math.round(top.confidence * 100);
  if (!Number.isFinite(pct)) return name;
  return `${name} at ${pct}%`;
}
