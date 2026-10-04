import {
  COORDS,
  HAND_LANDMARKS,
  LEFT_HAND_OFFSET,
  LEFT_SHOULDER,
  MIN_LANDMARK_FRAMES,
  POS_DIM,
  RIGHT_HAND_OFFSET,
  RIGHT_SHOULDER,
} from "@/lib/asl-citizen";

/** The browser samples landmarks every 66 ms (`use-landmark-tracker.ts`). */
export const DEFAULT_LANDMARK_FPS = 1000 / 66;
/** Same frame budget as one isolated sign on the single-sign path. */
export const MAX_SEGMENT_FRAMES = 120;
/** A motion run longer than this has no usable pause inside, so it is re-split with sliding windows. */
export const MAX_SIGN_RUN_MS = 4_000;
export const SLIDING_WINDOW_MS = 2_000;
export const SLIDING_STRIDE_MS = 1_000;
/** Shorter still stretches (turning points of slow signs, tracking blips) stay inside the sign. */
export const MIN_PAUSE_MS = 400;
/** Shorter bursts of motion inside a pause are landmark jitter, not a sign. */
export const MIN_MOTION_MS = 280;
/** Keep a bit of the neighbouring pause so a real webcam sign is not cut at the wrist stop. */
export const SEGMENT_PAD_MS = 280;
/** Motion shorter than this is a twitch, not a vocab sign. */
export const MIN_SIGN_MS = 600;
/** Adjacent pause-segments this close were split by a tracking blip. */
export const MERGE_GAP_MS = 180;
const SMOOTH_MS = 200;
/** Wrist speeds are in shoulder widths per second; signing hands move well above 1. */
export const MIN_PAUSE_SPEED = 0.3;
export const MAX_PAUSE_SPEED = 0.6;
/** Pause threshold as a share of the clip's 90th-percentile wrist speed. */
export const PAUSE_SPEED_RATIO = 0.25;

const EPS = 1e-6;
const HAND_SLOTS = [LEFT_HAND_OFFSET, RIGHT_HAND_OFFSET] as const;

export type SignSegment = {
  /** First frame, inclusive. */
  start: number;
  /** Last frame, exclusive. */
  end: number;
  method: "pause" | "window";
  handFrames: number;
};

export type SignSegmentation = {
  segments: SignSegment[];
  fps: number;
  handFrames: number;
  pauseSpeed: number;
};

export function estimateLandmarkFps(frames: number, durationMs?: number) {
  if (typeof durationMs !== "number" || !(durationMs > 0) || frames < 2) {
    return DEFAULT_LANDMARK_FPS;
  }
  return frames / (durationMs / 1000);
}

/**
 * Splits a packed landmark clip (frames × 225 floats) into single-sign
 * segments. Pauses are stretches where both wrists are still or no hand is
 * tracked; long motion runs without a pause fall back to sliding windows.
 */
export function segmentSigns(
  packed: Float32Array,
  frames: number,
  options: { fps?: number } = {},
): SignSegmentation {
  if (!Number.isInteger(frames) || frames < 0) {
    throw new Error("Landmark frame count is invalid.");
  }
  if (packed.length < frames * POS_DIM) {
    throw new Error("Landmark buffer is shorter than the reported frame count.");
  }

  const fps = options.fps && options.fps > 0 ? options.fps : DEFAULT_LANDMARK_FPS;
  const toFrames = (ms: number) => Math.round((ms * fps) / 1000);
  const minPause = Math.max(2, toFrames(MIN_PAUSE_MS));
  const minMotion = Math.max(2, toFrames(MIN_MOTION_MS));
  const pad = toFrames(SEGMENT_PAD_MS);
  const minSign = Math.max(MIN_LANDMARK_FRAMES, toFrames(MIN_SIGN_MS));
  const mergeGap = toFrames(MERGE_GAP_MS);
  const maxRun = Math.min(
    MAX_SEGMENT_FRAMES,
    Math.max(minSign, toFrames(MAX_SIGN_RUN_MS)),
  );
  const window = Math.min(
    MAX_SEGMENT_FRAMES,
    Math.max(minSign, toFrames(SLIDING_WINDOW_MS)),
  );
  const stride = Math.min(window, Math.max(1, toFrames(SLIDING_STRIDE_MS)));

  const present = handPresence(packed, frames);
  const anyHand = new Uint8Array(frames);
  let handFrames = 0;
  for (let t = 0; t < frames; t++) {
    anyHand[t] = present[0][t] | present[1][t];
    handFrames += anyHand[t];
  }

  const { speed, tracked } = wristSpeeds(packed, frames, present, fps, minPause);
  const pauseSpeed = pauseThreshold(speed, tracked);
  const still = new Uint8Array(frames);
  for (let t = 0; t < frames; t++) {
    still[t] = !anyHand[t] || speed[t] < pauseSpeed ? 1 : 0;
  }
  for (const [a, b] of runsOf(still, 0)) {
    if (b - a < minMotion) still.fill(1, a, b);
  }

  const pauses = runsOf(still, 1).filter(([a, b]) => b - a >= minPause);
  const segments: SignSegment[] = [];
  let cursor = 0;
  for (const [pauseStart, pauseEnd] of [...pauses, [frames, frames]]) {
    if (pauseStart > cursor) {
      const motionStart = cursor;
      const motionEnd = pauseStart;
      // Pad only after the unpadded run is long enough; otherwise a twitch
      // plus pause padding becomes a fourth "sign" on real webcam clips.
      if (motionEnd - motionStart >= minSign) {
        let start = Math.max(0, motionStart - pad);
        let end = Math.min(frames, motionEnd + pad);
        const trimmed = trimUntrackedEdges(start, end, anyHand);
        if (trimmed.end - trimmed.start >= minSign) {
          start = trimmed.start;
          end = trimmed.end;
        }
        if (end - start >= minSign) {
          const windowed = end - start > maxRun;
          const pieces = windowed
            ? slidingWindows(start, end, window, stride)
            : [[start, end] as const];
          for (const [a, b] of pieces) {
            segments.push({
              start: a,
              end: b,
              method: windowed ? "window" : "pause",
              handFrames: countOnes(anyHand, a, b),
            });
          }
        }
      }
    }
    cursor = pauseEnd;
  }

  return {
    segments: mergeCloseSegments(segments, anyHand, mergeGap, minSign),
    fps,
    handFrames,
    pauseSpeed,
  };
}

function handPresence(packed: Float32Array, frames: number) {
  const present = HAND_SLOTS.map(() => new Uint8Array(frames));
  HAND_SLOTS.forEach((slot, index) => {
    for (let t = 0; t < frames; t++) {
      const from = t * POS_DIM + slot * COORDS;
      const to = from + HAND_LANDMARKS * COORDS;
      for (let i = from; i < to; i++) {
        if (packed[i] !== 0) {
          present[index][t] = 1;
          break;
        }
      }
    }
  });
  return present;
}

function shoulderScale(packed: Float32Array, frames: number) {
  const widths: number[] = [];
  for (let t = 0; t < frames; t++) {
    const ls = t * POS_DIM + LEFT_SHOULDER * COORDS;
    const rs = t * POS_DIM + RIGHT_SHOULDER * COORDS;
    const width = Math.hypot(packed[ls] - packed[rs], packed[ls + 1] - packed[rs + 1]);
    if (width > EPS) widths.push(width);
  }
  if (!widths.length) return EPS;
  widths.sort((a, b) => a - b);
  return widths[Math.floor(widths.length / 2)];
}

/**
 * Per-frame wrist speed (shoulder widths / s). A hand that drops out for a
 * few frames is measured across the gap, so a tracking blip does not read as
 * a pause.
 */
function wristSpeeds(
  packed: Float32Array,
  frames: number,
  present: Uint8Array[],
  fps: number,
  maxGap: number,
) {
  const scale = shoulderScale(packed, frames);
  const half = Math.floor((fps * SMOOTH_MS) / 2000);
  const speed = new Float32Array(frames);
  const tracked = new Uint8Array(frames);

  HAND_SLOTS.forEach((slot, index) => {
    const has = present[index];
    const x = new Float32Array(frames);
    const y = new Float32Array(frames);
    for (let t = 0; t < frames; t++) {
      if (!has[t]) continue;
      // Symmetric window only: a lopsided average next to a gap halves the apparent speed.
      let radius = 0;
      while (
        radius < half &&
        t - radius - 1 >= 0 &&
        t + radius + 1 < frames &&
        has[t - radius - 1] &&
        has[t + radius + 1]
      ) {
        radius += 1;
      }
      let sx = 0;
      let sy = 0;
      for (let u = t - radius; u <= t + radius; u++) {
        const off = u * POS_DIM + slot * COORDS;
        sx += packed[off];
        sy += packed[off + 1];
      }
      x[t] = sx / (2 * radius + 1);
      y[t] = sy / (2 * radius + 1);
    }
    let previous = -1;
    for (let t = 0; t < frames; t++) {
      if (!has[t]) continue;
      const gap = t - previous;
      if (previous >= 0 && gap <= maxGap) {
        tracked[t] = 1;
        const value =
          (Math.hypot(x[t] - x[previous], y[t] - y[previous]) / scale / gap) * fps;
        if (value > speed[t]) speed[t] = value;
      }
      previous = t;
    }
  });

  return { speed, tracked };
}

function pauseThreshold(speed: Float32Array, tracked: Uint8Array) {
  const values: number[] = [];
  for (let t = 0; t < speed.length; t++) {
    if (tracked[t]) values.push(speed[t]);
  }
  if (!values.length) return MIN_PAUSE_SPEED;
  values.sort((a, b) => a - b);
  const p90 = values[Math.min(values.length - 1, Math.floor(values.length * 0.9))];
  return Math.min(MAX_PAUSE_SPEED, Math.max(MIN_PAUSE_SPEED, p90 * PAUSE_SPEED_RATIO));
}

function runsOf(mask: Uint8Array, value: number): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start = -1;
  for (let t = 0; t <= mask.length; t++) {
    const on = t < mask.length && mask[t] === value;
    if (on && start < 0) start = t;
    if (!on && start >= 0) {
      runs.push([start, t]);
      start = -1;
    }
  }
  return runs;
}

function slidingWindows(start: number, end: number, window: number, stride: number) {
  const windows: Array<readonly [number, number]> = [];
  let from = start;
  while (from + window < end) {
    windows.push([from, from + window]);
    from += stride;
  }
  windows.push([Math.max(start, end - window), end]);
  return windows;
}

function countOnes(mask: Uint8Array, start: number, end: number) {
  let count = 0;
  for (let t = start; t < end; t++) count += mask[t];
  return count;
}

/** Drop leading/trailing untracked frames only when that still leaves a full sign. */
function trimUntrackedEdges(start: number, end: number, anyHand: Uint8Array) {
  let from = start;
  let to = end;
  while (from < to && !anyHand[from]) from += 1;
  while (to > from && !anyHand[to - 1]) to -= 1;
  return { start: from, end: to };
}

function mergeCloseSegments(
  segments: SignSegment[],
  anyHand: Uint8Array,
  mergeGap: number,
  minSign: number,
) {
  const merged: SignSegment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    const canMerge =
      last &&
      last.method === "pause" &&
      segment.method === "pause" &&
      segment.start - last.end <= mergeGap &&
      segment.end - last.start <= MAX_SEGMENT_FRAMES;
    if (canMerge && last) {
      last.end = segment.end;
      last.handFrames = countOnes(anyHand, last.start, last.end);
      continue;
    }
    merged.push({ ...segment });
  }
  return merged.filter((segment) => segment.end - segment.start >= minSign);
}
