import {
  COORDS,
  FEAT_DIM,
  JOINTS,
  LEFT_SHOULDER,
  POS_DIM,
  RIGHT_SHOULDER,
  TARGET_LEN,
} from "@/lib/asl-citizen";

const EPS = 1e-6;

/** Packed landmark frames: length === frames * 75 * 3. */
export function landmarksToFeatures(packed: Float32Array, frames: number) {
  if (frames <= 0) {
    throw new Error("No landmark frames to preprocess.");
  }
  const expected = frames * JOINTS * COORDS;
  if (packed.length < expected) {
    throw new Error("Landmark buffer is shorter than the reported frame count.");
  }

  const resampled = resampleSequence(packed, frames, TARGET_LEN);
  normalizeShoulders(resampled, TARGET_LEN);
  return appendVelocities(resampled, TARGET_LEN);
}

function resampleSequence(packed: Float32Array, frames: number, targetLen: number) {
  const out = new Float32Array(targetLen * POS_DIM);
  if (frames === 1) {
    const src = packed.subarray(0, POS_DIM);
    for (let t = 0; t < targetLen; t++) out.set(src, t * POS_DIM);
    return out;
  }
  if (frames === targetLen) {
    out.set(packed.subarray(0, targetLen * POS_DIM));
    return out;
  }

  const last = frames - 1;
  for (let t = 0; t < targetLen; t++) {
    const src = (t * last) / (targetLen - 1);
    const lo = Math.floor(src);
    const hi = Math.min(lo + 1, last);
    const a = src - lo;
    const dest = t * POS_DIM;
    const loOff = lo * POS_DIM;
    const hiOff = hi * POS_DIM;
    for (let i = 0; i < POS_DIM; i++) {
      out[dest + i] = packed[loOff + i] * (1 - a) + packed[hiOff + i] * a;
    }
  }
  return out;
}

function normalizeShoulders(seq: Float32Array, frames: number) {
  for (let t = 0; t < frames; t++) {
    const off = t * POS_DIM;
    const ls = off + LEFT_SHOULDER * COORDS;
    const rs = off + RIGHT_SHOULDER * COORDS;
    const cx = (seq[ls] + seq[rs]) * 0.5;
    const cy = (seq[ls + 1] + seq[rs + 1]) * 0.5;
    const cz = (seq[ls + 2] + seq[rs + 2]) * 0.5;
    const dx = seq[ls] - seq[rs];
    const dy = seq[ls + 1] - seq[rs + 1];
    const dz = seq[ls + 2] - seq[rs + 2];
    const scale = Math.max(Math.hypot(dx, dy, dz), EPS);
    for (let i = 0; i < JOINTS; i++) {
      const j = off + i * COORDS;
      seq[j] = (seq[j] - cx) / scale;
      seq[j + 1] = (seq[j + 1] - cy) / scale;
      seq[j + 2] = (seq[j + 2] - cz) / scale;
    }
  }
}

function appendVelocities(positions: Float32Array, frames: number) {
  const features = new Float32Array(frames * FEAT_DIM);
  for (let t = 0; t < frames; t++) {
    const posOff = t * POS_DIM;
    const featOff = t * FEAT_DIM;
    features.set(positions.subarray(posOff, posOff + POS_DIM), featOff);
    if (t === 0) continue;
    const prevOff = (t - 1) * POS_DIM;
    const velOff = featOff + POS_DIM;
    for (let i = 0; i < POS_DIM; i++) {
      features[velOff + i] = positions[posOff + i] - positions[prevOff + i];
    }
  }
  return features;
}

export function decodeLandmarkBuffer(buffer: ArrayBuffer, frames: number) {
  const copy = buffer.slice(0);
  const packed = new Float32Array(copy);
  if (packed.length !== frames * POS_DIM) {
    throw new Error(
      `Expected ${frames * POS_DIM} landmark floats, got ${packed.length}.`,
    );
  }
  for (let i = 0; i < packed.length; i++) {
    if (!Number.isFinite(packed[i])) packed[i] = 0;
  }
  return packed;
}
