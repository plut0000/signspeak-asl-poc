// Synthetic MediaPipe landmark clips (frames × 225 floats) for verify scripts.
// Shoulders sit at x 0.4 / 0.6, so one shoulder width is 0.2 image units.

const POS_DIM = 225;
const LEFT_HAND = 33;
const RIGHT_HAND = 54;

function pattern(freq, ampX, ampY, leftX, leftY) {
  return { freq, ampX, ampY, leftX, leftY, rightX: leftX + 0.3, rightY: leftY + 0.1, hands: "both" };
}

/**
 * Two-hand motions with a stable v3.0.1 BiLSTM read over 24–36 frames, with
 * or without a short hold on either side. The first three clear the dedicated
 * gates as distinct glosses; the `unclear*` ones stay under 30% top-1.
 */
export const SIGN_PATTERNS = {
  kangaroo: pattern(1.5, 0.05, 0.1, 0.25, 0.6),
  eggbeater: pattern(1, 0.05, 0.05, 0.45, 0.6),
  measure: pattern(2, 0.05, 0.02, 0.25, 0.15),
  unclearSweep: pattern(1, 0.1, 0.02, 0.35, 0.15),
  unclearShake: pattern(2, 0.1, 0.02, 0.35, 0.15),
};

export const SIGN_GLOSSES = {
  kangaroo: "KANGAROO3",
  eggbeater: "EGGBEATER",
  measure: "MEASURE1",
};

function writePose(frame) {
  frame[11 * 3] = 0.4;
  frame[12 * 3] = 0.6;
  frame[11 * 3 + 1] = 0.3;
  frame[12 * 3 + 1] = 0.3;
}

/** One frame of `pattern` at step `t` of a `length`-frame sign. */
export function signFrame(pattern, t, length) {
  const frame = new Float32Array(POS_DIM);
  writePose(frame);
  const phase = (t / Math.max(length, 1)) * Math.PI * 2 * pattern.freq;
  for (let j = 0; j < 21; j++) {
    if (pattern.hands !== "right") {
      frame[(LEFT_HAND + j) * 3] = pattern.leftX + 0.02 * j + pattern.ampX * Math.sin(phase);
      frame[(LEFT_HAND + j) * 3 + 1] =
        pattern.leftY + pattern.ampY * Math.sin(phase + j * 0.2);
    }
    if (pattern.hands !== "left") {
      frame[(RIGHT_HAND + j) * 3] = pattern.rightX - 0.02 * j + pattern.ampX * Math.cos(phase);
      frame[(RIGHT_HAND + j) * 3 + 1] =
        pattern.rightY + pattern.ampY * Math.cos(phase + j * 0.3);
    }
  }
  return frame;
}

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32 - 0.5;
  };
}

/**
 * Builds a clip from parts, in order:
 * - `{ sign, frames, dropout }` plays a pattern from SIGN_PATTERNS (or an
 *   inline pattern); `dropout: [from, count]` loses hand tracking mid-sign
 * - `{ hold, jitter }` keeps the last pose still, with optional landmark jitter
 * - `{ handsDown }` drops both hands out of frame
 * - `{ move, to }` glides the hands to the first frame of the next sign
 */
export function buildClip(parts, { seed = 7 } = {}) {
  const random = seeded(seed);
  const frames = [];
  let last = null;
  parts.forEach((part, index) => {
    if (part.sign) {
      const pattern =
        typeof part.sign === "string" ? SIGN_PATTERNS[part.sign] : part.sign;
      const [dropFrom, dropCount] = part.dropout ?? [-1, 0];
      for (let t = 0; t < part.frames; t++) {
        last = signFrame(pattern, t, part.frames);
        if (t >= dropFrom && t < dropFrom + dropCount) {
          const frame = new Float32Array(POS_DIM);
          writePose(frame);
          frames.push(frame);
        } else {
          frames.push(last);
        }
      }
    } else if (part.hold) {
      const base = last ?? signFrame(SIGN_PATTERNS.kangaroo, 0, 30);
      for (let t = 0; t < part.hold; t++) {
        const frame = Float32Array.from(base);
        if (part.jitter) {
          for (let i = LEFT_HAND * 3; i < POS_DIM; i++) {
            if (frame[i] !== 0) frame[i] += random() * 2 * part.jitter;
          }
        }
        frames.push(frame);
      }
    } else if (part.handsDown) {
      for (let t = 0; t < part.handsDown; t++) {
        const frame = new Float32Array(POS_DIM);
        writePose(frame);
        frames.push(frame);
      }
      last = null;
    } else if (part.move) {
      const next = parts.slice(index + 1).find((item) => item.sign);
      const pattern =
        typeof next?.sign === "string" ? SIGN_PATTERNS[next.sign] : next?.sign;
      const from = last ?? signFrame(pattern, 0, next.frames);
      const to = signFrame(pattern, 0, next.frames);
      for (let t = 1; t <= part.move; t++) {
        const a = t / (part.move + 1);
        const frame = new Float32Array(POS_DIM);
        for (let i = 0; i < POS_DIM; i++) {
          const fromValue = from[i];
          const toValue = to[i];
          frame[i] =
            fromValue === 0 ? toValue : toValue === 0 ? fromValue : fromValue * (1 - a) + toValue * a;
        }
        last = frame;
        frames.push(frame);
      }
    }
  });
  const packed = new Float32Array(frames.length * POS_DIM);
  frames.forEach((frame, index) => packed.set(frame, index * POS_DIM));
  return { packed, frames: frames.length };
}

/** Frames where at least one hand landmark is non-zero. */
export function countHandFrames(packed, frames) {
  let count = 0;
  for (let t = 0; t < frames; t++) {
    for (let i = t * POS_DIM + LEFT_HAND * 3; i < (t + 1) * POS_DIM; i++) {
      if (packed[i] !== 0) {
        count += 1;
        break;
      }
    }
  }
  return count;
}
