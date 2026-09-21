import type { DedicatedTop } from "@/lib/types";

const HANDS_MISSING = /hands were missing|poorly tracked/i;
const TOO_FEW_FRAMES = /too few landmark/i;
const NO_LANDMARKS = /landmarks were captured|no mediapipe landmarks/i;
const INVALID_FRAMES = /frame count is invalid/i;
const DISABLED = /disabled/i;
const INFERENCE_FAILED = /inference failed/i;
const LONG_CLIP = /longer than a single isolated sign|longer than a typical isolated sign/i;
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
