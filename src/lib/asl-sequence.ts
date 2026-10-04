import {
  assessLandmarkQuality,
  HANDS_MISSING_REASON,
  MAX_LANDMARK_FRAMES,
  MIN_HAND_FRAMES,
  POS_DIM,
} from "@/lib/asl-citizen";
import type { DedicatedPrediction } from "@/lib/asl-infer";
import { landmarksToFeatures } from "@/lib/asl-preprocess";
import { assessDedicatedPrediction } from "@/lib/asl-routing";
import {
  estimateLandmarkFps,
  segmentSigns,
  type SignSegment,
} from "@/lib/sign-segmentation";
import type { DedicatedTop } from "@/lib/types";

/** Looser than the isolated-sign path so a webcam phrase is not thrown away for one soft piece. */
export const SEQUENCE_THRESHOLD = 0.4;
export const SEQUENCE_MARGIN = 0.08;
export const SEQUENCE_MAX_ENTROPY = 0.88;
/** Below-gate top-1 still sent to Gemini text cleanup when a few segments agree enough. */
export const SEQUENCE_CANDIDATE_THRESHOLD = 0.28;

/** The recorder stops at 30 s; the extra 2 s covers auto-stop latency. */
export const MAX_SIGN_SEQUENCE_MS = 32_000;
export const MAX_SIGN_SEQUENCE_FRAMES = MAX_LANDMARK_FRAMES;
/** Below this the tracker dropped too many frames to find pauses between signs. */
export const MIN_SIGN_SEQUENCE_FPS = 5;
export const MAX_SIGN_SEQUENCE_SEGMENTS = 40;

export const NO_SIGNS_REASON =
  "No separate signs were found in this clip, so Gemini video is used instead of the dedicated model.";
export const TOO_MANY_SEGMENTS_REASON =
  "This clip broke into too many short movements to read as separate signs, so Gemini video is used instead of the dedicated model.";

export function isSignSequenceEnabled() {
  const raw = process.env.DEDICATED_ASL_SEQUENCE_ENABLED?.trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

export type SequenceGloss = DedicatedTop & { top: DedicatedTop[] };

type SegmentPrediction = Pick<
  DedicatedPrediction,
  "gloss" | "glossLabel" | "confidence" | "margin" | "normalizedEntropy" | "top"
>;

export type SignSequenceReading =
  | {
      ok: true;
      glosses: SequenceGloss[];
      total: number;
      confident: number;
      method: SignSegment["method"] | "mixed";
    }
  | { ok: false; reason: string; total: number; confident: number };

/**
 * Reads a clip that is longer than one isolated sign as several signs in a
 * row. Sequence gates are looser than the isolated-sign path. A majority of
 * segments, or two signs covering at least half the pieces, is enough; if
 * those fail, soft top-1 guesses still go to Gemini text cleanup. Otherwise
 * the clip falls back to Gemini video.
 */
export async function readSignSequence(input: {
  packed: Float32Array;
  frames: number;
  durationMs?: number;
  predict: (features: Float32Array) => Promise<SegmentPrediction>;
}): Promise<SignSequenceReading> {
  const { packed, frames, durationMs, predict } = input;

  if (typeof durationMs === "number" && durationMs > MAX_SIGN_SEQUENCE_MS) {
    return skip(
      `Clip is ${formatSeconds(durationMs)}s — longer than the ~30s limit for several signs in a row, so Gemini video is used instead of the dedicated model.`,
    );
  }
  if (frames > MAX_SIGN_SEQUENCE_FRAMES) {
    return skip(
      `Landmark sequence (${frames} frames) is longer than the ${MAX_SIGN_SEQUENCE_FRAMES}-frame limit for several signs in a row, so Gemini video is used instead of the dedicated model.`,
    );
  }
  const fps = estimateLandmarkFps(frames, durationMs);
  if (fps < MIN_SIGN_SEQUENCE_FPS) {
    return skip(
      `Landmark tracking was too sparse to split this ${formatSeconds(durationMs ?? 0)}s clip into signs, so Gemini video is used instead of the dedicated model.`,
    );
  }

  const { segments, handFrames } = segmentSigns(packed, frames, { fps });
  if (handFrames < MIN_HAND_FRAMES) return skip(HANDS_MISSING_REASON);
  if (!segments.length) return skip(NO_SIGNS_REASON);
  if (segments.length > MAX_SIGN_SEQUENCE_SEGMENTS) {
    return skip(TOO_MANY_SEGMENTS_REASON);
  }

  const sequenceGates = {
    threshold: SEQUENCE_THRESHOLD,
    margin: SEQUENCE_MARGIN,
    maxNormalizedEntropy: SEQUENCE_MAX_ENTROPY,
  };
  const accepted: SegmentPrediction[] = [];
  const candidates: SegmentPrediction[] = [];
  for (const segment of segments) {
    const length = segment.end - segment.start;
    const quality = assessLandmarkQuality({
      frames: length,
      poseFrames: length,
      handFrames: segment.handFrames,
    });
    if (quality.reason) continue;
    const features = landmarksToFeatures(
      packed.subarray(segment.start * POS_DIM, segment.end * POS_DIM),
      length,
    );
    const prediction = await predict(features);
    if (prediction.confidence >= SEQUENCE_CANDIDATE_THRESHOLD) {
      candidates.push(prediction);
    }
    if (assessDedicatedPrediction(prediction, sequenceGates).ok) {
      accepted.push(prediction);
    }
  }

  const total = segments.length;
  const method = sequenceMethod(segments);
  if (enoughSequenceHits(accepted.length, total)) {
    return {
      ok: true,
      glosses: mergeConsecutiveGlosses(accepted),
      total,
      confident: accepted.length,
      method,
    };
  }
  if (enoughSequenceHits(candidates.length, total) && candidates.length >= 2) {
    return {
      ok: true,
      glosses: mergeConsecutiveGlosses(candidates),
      total,
      confident: accepted.length,
      method,
    };
  }

  return skip(
    unclearSegmentsReason(accepted.length, total, method),
    total,
    accepted.length,
  );
}

/** Majority, or at least two signs covering half the pieces (a twitch should not sink a phrase). */
export function enoughSequenceHits(hits: number, total: number) {
  if (hits <= 0 || total <= 0) return false;
  if (hits * 2 > total) return true;
  return hits >= 2 && hits * 2 >= total;
}

/** HELLO, HELLO, NAME, HELLO → HELLO, NAME, HELLO. Keeps the most confident read of each run. */
export function mergeConsecutiveGlosses(
  predictions: Array<Pick<SegmentPrediction, "gloss" | "glossLabel" | "confidence" | "top">>,
): SequenceGloss[] {
  const merged: SequenceGloss[] = [];
  for (const prediction of predictions) {
    const last = merged[merged.length - 1];
    if (last && last.gloss === prediction.gloss) {
      if (prediction.confidence > last.confidence) {
        last.confidence = prediction.confidence;
        last.top = prediction.top;
      }
      continue;
    }
    merged.push({
      gloss: prediction.gloss,
      glossLabel: prediction.glossLabel,
      confidence: prediction.confidence,
      top: prediction.top,
    });
  }
  return merged;
}

function skip(reason: string, total = 0, confident = 0) {
  return { ok: false as const, reason, total, confident };
}

function sequenceMethod(segments: SignSegment[]): SignSegment["method"] | "mixed" {
  const first = segments[0]?.method ?? "pause";
  return segments.every((segment) => segment.method === first) ? first : "mixed";
}

function unclearSegmentsReason(
  confident: number,
  total: number,
  method: SignSegment["method"] | "mixed",
) {
  const tail = "clear enough for the dedicated model, so Gemini video is used instead.";
  if (total === 1) return `The one sign found was not ${tail}`;
  const noun = method === "pause" ? "signs" : "parts of the clip";
  if (confident === 0) return `None of the ${total} ${noun} were ${tail}`;
  return `Only ${confident} of ${total} ${noun} ${confident === 1 ? "was" : "were"} ${tail}`;
}

function formatSeconds(ms: number) {
  return (ms / 1000).toFixed(1).replace(/\.0$/, "");
}
