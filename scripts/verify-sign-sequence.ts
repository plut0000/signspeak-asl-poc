#!/usr/bin/env node
import {
  englishFromGlosses,
  HANDS_MISSING_REASON,
  MIN_LANDMARK_FRAMES,
} from "../src/lib/asl-citizen.ts";
import { predictGloss } from "../src/lib/asl-infer.ts";
import { assessIsolatedSignBudget } from "../src/lib/asl-routing.ts";
import {
  MAX_SIGN_SEQUENCE_SEGMENTS,
  mergeConsecutiveGlosses,
  NO_SIGNS_REASON,
  readSignSequence,
  TOO_MANY_SEGMENTS_REASON,
} from "../src/lib/asl-sequence.ts";
import {
  MAX_SEGMENT_FRAMES,
  segmentSigns,
  type SignSegment,
} from "../src/lib/sign-segmentation.ts";
import { buildClip, SIGN_GLOSSES } from "./sign-fixtures.mjs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const spans = (segments: SignSegment[]) =>
  segments.map((segment) => `${segment.start}-${segment.end}`).join(" ");

function assertSegmentBounds(segments: SignSegment[], label: string) {
  for (const segment of segments) {
    const length = segment.end - segment.start;
    assert(
      length >= MIN_LANDMARK_FRAMES && length <= MAX_SEGMENT_FRAMES,
      `${label}: segment ${segment.start}-${segment.end} must be ${MIN_LANDMARK_FRAMES}–${MAX_SEGMENT_FRAMES} frames`,
    );
  }
}

/** True when `segment` holds at least 90% of the sign that occupies frames [from, to). */
function covers(segment: SignSegment, from: number, to: number) {
  const overlap = Math.min(segment.end, to) - Math.max(segment.start, from);
  return overlap >= 0.9 * (to - from);
}

const pause = [{ hold: 10, jitter: 0.001 }, { move: 4 }];
const sign = (name: string, frames = 30, extra = {}) => ({ sign: name, frames, ...extra });
const threeSigns = (pauseParts: object[], names = ["kangaroo", "eggbeater", "measure"]) => [
  { hold: 12 },
  sign(names[0]),
  ...pauseParts,
  sign(names[1]),
  ...pauseParts,
  sign(names[2]),
  { hold: 12 },
];

// --- Segmentation -----------------------------------------------------------

const held = buildClip(threeSigns(pause));
const heldSegments = segmentSigns(held.packed, held.frames).segments;
assert(heldSegments.length === 3, `held pauses: expected 3 segments, got ${spans(heldSegments)}`);
assert(heldSegments.every((segment) => segment.method === "pause"), "held pauses: split at pauses");
assertSegmentBounds(heldSegments, "held pauses");
assert(
  covers(heldSegments[0], 12, 42) && covers(heldSegments[1], 56, 86) && covers(heldSegments[2], 100, 130),
  `held pauses: each segment should hold one sign, got ${spans(heldSegments)}`,
);

const lowered = buildClip([
  { handsDown: 12 },
  sign("kangaroo"),
  { handsDown: 10 },
  sign("eggbeater"),
  { handsDown: 10 },
  sign("measure"),
  { handsDown: 12 },
]);
const loweredSegments = segmentSigns(lowered.packed, lowered.frames).segments;
assert(
  spans(loweredSegments) === "12-42 52-82 92-122",
  `lowered hands: segments should match the signs exactly, got ${spans(loweredSegments)}`,
);

const dropout = buildClip([
  { hold: 12 },
  sign("kangaroo"),
  ...pause,
  sign("eggbeater", 30, { dropout: [14, 2] }),
  ...pause,
  sign("measure"),
  { hold: 12 },
]);
const dropoutSegments = segmentSigns(dropout.packed, dropout.frames).segments;
assert(
  dropoutSegments.length === 3,
  `a 2-frame tracking dropout must not split a sign, got ${spans(dropoutSegments)}`,
);

const jittery = buildClip(
  [
    { hold: 60, jitter: 0.004 },
    sign("kangaroo"),
    { hold: 10, jitter: 0.004 },
    { move: 4 },
    sign("eggbeater"),
    { hold: 10, jitter: 0.004 },
    { move: 4 },
    sign("measure"),
    { hold: 300, jitter: 0.004 },
  ],
  { seed: 3 },
);
const jitterySegments = segmentSigns(jittery.packed, jittery.frames).segments;
assert(
  jitterySegments.length === 3,
  `~3 px landmark jitter in long holds must not add segments, got ${spans(jitterySegments)}`,
);

const slowFps = buildClip([
  { hold: 8 },
  sign("kangaroo", 20),
  { hold: 7, jitter: 0.001 },
  { move: 3 },
  sign("eggbeater", 20),
  { hold: 7, jitter: 0.001 },
  { move: 3 },
  sign("measure", 20),
  { hold: 8 },
]);
const slowFpsSegments = segmentSigns(slowFps.packed, slowFps.frames, { fps: 10 }).segments;
assert(
  slowFpsSegments.length === 3,
  `pauses are timed in ms, so a 10 fps clip still splits into 3, got ${spans(slowFpsSegments)}`,
);

const shortPause = buildClip([
  { hold: 12 },
  sign("kangaroo"),
  { hold: 3 },
  { move: 4 },
  sign("eggbeater"),
  { hold: 12 },
]);
const shortPauseSegments = segmentSigns(shortPause.packed, shortPause.frames).segments;
assert(
  shortPauseSegments.length > 1 &&
    shortPauseSegments.every((segment) => segment.method === "window"),
  `a 200 ms pause is too short to split on, so the 4.8 s run falls back to sliding windows, got ${spans(shortPauseSegments)}`,
);

const continuous = buildClip(Array.from({ length: 6 }, () => sign("kangaroo")));
const windows = segmentSigns(continuous.packed, continuous.frames).segments;
assert(windows.every((segment) => segment.method === "window"), "no pauses → sliding windows");
assert(
  windows.every((segment) => segment.end - segment.start === 30),
  `sliding windows are 2 s (30 frames at 15 fps), got ${spans(windows)}`,
);
assert(
  windows.slice(1).every((segment, index) => segment.start - windows[index].start <= 15),
  `sliding windows step by at most 1 s, got ${spans(windows)}`,
);
assert(
  windows[0].start === 0 && windows[windows.length - 1].end === continuous.frames,
  "sliding windows cover the whole motion run",
);

const longFast = buildClip(Array.from({ length: 30 }, () => sign("kangaroo")));
const fastSegments = segmentSigns(longFast.packed, longFast.frames, { fps: 60 }).segments;
assertSegmentBounds(fastSegments, "900 frames at 60 fps");
assert(
  Math.max(...fastSegments.map((segment) => segment.end - segment.start)) === MAX_SEGMENT_FRAMES,
  "segments are capped at 120 frames even when 2 s is more than 120 frames",
);

const still = buildClip([{ hold: 200, jitter: 0.001 }]);
assert(segmentSigns(still.packed, still.frames).segments.length === 0, "a still clip has no signs");
const handless = buildClip([{ handsDown: 200 }]);
const handlessSegmentation = segmentSigns(handless.packed, handless.frames);
assert(
  handlessSegmentation.segments.length === 0 && handlessSegmentation.handFrames === 0,
  "a clip without hands has no signs",
);

// --- Multi-sign routing with a scripted classifier --------------------------

type Scripted = { gloss: string; confidence?: number; margin?: number; normalizedEntropy?: number };

function scripted(items: Scripted[]) {
  let calls = 0;
  const predict = async () => {
    const item = items[calls];
    calls += 1;
    assert(item, `classifier called more often (${calls}) than scripted (${items.length})`);
    const confidence = item.confidence ?? 0.9;
    const glossLabel = item.gloss.charAt(0) + item.gloss.slice(1).toLowerCase();
    return {
      gloss: item.gloss,
      glossLabel,
      confidence,
      margin: item.margin ?? confidence - 0.05,
      normalizedEntropy: item.normalizedEntropy ?? 0.2,
      top: [{ gloss: item.gloss, glossLabel, confidence }],
    };
  };
  return { predict, calls: () => calls };
}

const clearRun = scripted([{ gloss: "HELLO" }, { gloss: "NAME" }, { gloss: "WHAT1" }]);
const clear = await readSignSequence({ packed: held.packed, frames: held.frames, predict: clearRun.predict });
assert(clear.ok, "three confident segments read as a sequence");
assert(
  clear.glosses.map((item) => item.gloss).join(" ") === "HELLO NAME WHAT1",
  "glosses keep signed order",
);
assert(clear.total === 3 && clear.confident === 3 && clear.method === "pause", "sequence counts");

const minority = await readSignSequence({
  packed: held.packed,
  frames: held.frames,
  predict: scripted([
    { gloss: "HELLO" },
    { gloss: "NAME", confidence: 0.4 },
    { gloss: "WHAT1", confidence: 0.7, margin: 0.05 },
  ]).predict,
});
assert(!minority.ok, "1 of 3 confident falls back to Gemini video");
assert(
  minority.reason === "Only 1 of 3 signs was clear enough for the dedicated model, so Gemini video is used instead.",
  `minority reason: ${minority.reason}`,
);

const splitClip = buildClip([
  { hold: 12 },
  sign("kangaroo"),
  ...pause,
  sign("eggbeater"),
  ...pause,
  sign("measure"),
  ...pause,
  sign("kangaroo"),
  { hold: 12 },
]);
const half = await readSignSequence({
  packed: splitClip.packed,
  frames: splitClip.frames,
  predict: scripted([
    { gloss: "HELLO" },
    { gloss: "NAME", normalizedEntropy: 0.9 },
    { gloss: "WHAT1" },
    { gloss: "WHY", confidence: 0.3 },
  ]).predict,
});
assert(!half.ok && half.total === 4 && half.confident === 2, "exactly half confident is not most");

const merged = await readSignSequence({
  packed: splitClip.packed,
  frames: splitClip.frames,
  predict: scripted([
    { gloss: "HELLO", confidence: 0.7 },
    { gloss: "HELLO", confidence: 0.95 },
    { gloss: "BAD", confidence: 0.2 },
    { gloss: "HELLO", confidence: 0.8 },
  ]).predict,
});
assert(merged.ok, "3 of 4 confident reads as a sequence");
assert(
  merged.glosses.length === 1 && merged.glosses[0].gloss === "HELLO",
  "consecutive duplicate glosses merge, even across a rejected segment",
);
assert(merged.glosses[0].confidence === 0.95, "a merged gloss keeps its best confidence");
assert(
  mergeConsecutiveGlosses(
    ["NAME", "NAME", "WHAT1", "NAME"].map((gloss) => ({
      gloss,
      glossLabel: gloss,
      confidence: 0.8,
      top: [],
    })),
  )
    .map((item) => item.gloss)
    .join(" ") === "NAME WHAT1 NAME",
  "only consecutive duplicates merge",
);

const none = await readSignSequence({
  packed: held.packed,
  frames: held.frames,
  predict: scripted([
    { gloss: "HELLO", confidence: 0.3 },
    { gloss: "NAME", confidence: 0.3 },
    { gloss: "WHAT1", confidence: 0.3 },
  ]).predict,
});
assert(
  !none.ok && none.reason.startsWith("None of the 3 signs were clear enough"),
  `no confident segment: ${!none.ok && none.reason}`,
);

const windowed = await readSignSequence({
  packed: continuous.packed,
  frames: continuous.frames,
  predict: scripted(windows.map(() => ({ gloss: "HELLO", confidence: 0.3 }))).predict,
});
assert(
  !windowed.ok && /parts of the clip/.test(windowed.reason),
  "sliding-window segments are not called signs in the skip reason",
);

const neverCalled = scripted([]);
const tooLong = await readSignSequence({
  packed: held.packed,
  frames: held.frames,
  durationMs: 40_000,
  predict: neverCalled.predict,
});
assert(
  !tooLong.ok && /longer than the ~30s limit for several signs/.test(tooLong.reason),
  "clips over ~30 s stay on Gemini video",
);
const tooManyFrames = buildClip([{ hold: 901 }]);
const overFrames = await readSignSequence({
  packed: tooManyFrames.packed,
  frames: tooManyFrames.frames,
  predict: neverCalled.predict,
});
assert(!overFrames.ok && /900-frame limit/.test(overFrames.reason), "over 900 frames stays on Gemini video");
const sparse = await readSignSequence({
  packed: held.packed.subarray(0, 30 * 225),
  frames: 30,
  durationMs: 12_000,
  predict: neverCalled.predict,
});
assert(!sparse.ok && /too sparse to split this 12s clip/.test(sparse.reason), "sparse tracking stays on Gemini video");
const noHands = await readSignSequence({
  packed: handless.packed,
  frames: handless.frames,
  predict: neverCalled.predict,
});
assert(!noHands.ok && noHands.reason === HANDS_MISSING_REASON, "no hands keeps the hands-missing reason");
const noSigns = await readSignSequence({
  packed: still.packed,
  frames: still.frames,
  predict: neverCalled.predict,
});
assert(!noSigns.ok && noSigns.reason === NO_SIGNS_REASON, "no motion → no separate signs");
const crowded = buildClip(
  Array.from({ length: MAX_SIGN_SEQUENCE_SEGMENTS + 1 }, () => [sign("measure", 10), { hold: 7 }]).flat(),
);
const tooMany = await readSignSequence({
  packed: crowded.packed,
  frames: crowded.frames,
  predict: neverCalled.predict,
});
assert(
  !tooMany.ok && tooMany.reason === TOO_MANY_SEGMENTS_REASON,
  `more than ${MAX_SIGN_SEQUENCE_SEGMENTS} segments stays on Gemini video`,
);
assert(neverCalled.calls() === 0, "skipped clips never run the classifier");

// --- Real v3.0.1 BiLSTM on synthetic signs ----------------------------------

const expected = [SIGN_GLOSSES.kangaroo, SIGN_GLOSSES.eggbeater, SIGN_GLOSSES.measure].join(" ");
const realHeld = await readSignSequence({ packed: held.packed, frames: held.frames, predict: predictGloss });
assert(
  realHeld.ok && realHeld.glosses.map((item) => item.gloss).join(" ") === expected,
  `real model, held pauses: expected ${expected}, got ${realHeld.ok ? realHeld.glosses.map((item) => item.gloss).join(" ") : realHeld.reason}`,
);
const realLowered = await readSignSequence({
  packed: lowered.packed,
  frames: lowered.frames,
  durationMs: Math.round(lowered.frames * 66),
  predict: predictGloss,
});
assert(
  realLowered.ok && realLowered.glosses.map((item) => item.gloss).join(" ") === expected,
  "real model, lowered hands between signs",
);
const repeated = buildClip(threeSigns(pause, ["kangaroo", "kangaroo", "eggbeater"]));
const realRepeated = await readSignSequence({ packed: repeated.packed, frames: repeated.frames, predict: predictGloss });
assert(
  realRepeated.ok &&
    realRepeated.glosses.map((item) => item.gloss).join(" ") ===
      `${SIGN_GLOSSES.kangaroo} ${SIGN_GLOSSES.eggbeater}`,
  "real model, a repeated sign merges",
);
const mostlyUnclear = buildClip(threeSigns(pause, ["kangaroo", "unclearSweep", "unclearShake"]));
const realUnclear = await readSignSequence({
  packed: mostlyUnclear.packed,
  frames: mostlyUnclear.frames,
  predict: predictGloss,
});
assert(!realUnclear.ok && realUnclear.confident === 1 && realUnclear.total === 3, "real model, 1 of 3 clear");
const oneUnclear = buildClip(threeSigns(pause, ["kangaroo", "eggbeater", "unclearSweep"]));
const realOneUnclear = await readSignSequence({
  packed: oneUnclear.packed,
  frames: oneUnclear.frames,
  predict: predictGloss,
});
assert(
  realOneUnclear.ok &&
    realOneUnclear.glosses.map((item) => item.gloss).join(" ") ===
      `${SIGN_GLOSSES.kangaroo} ${SIGN_GLOSSES.eggbeater}` &&
    realOneUnclear.confident === 2,
  "real model, 2 of 3 clear reads the two clear signs",
);

// --- Single-sign routing is unchanged ---------------------------------------

assert(assessIsolatedSignBudget({ frames: 120, durationMs: 8_000 }).ok, "120 frames / 8 s stays single-sign");
assert(!assessIsolatedSignBudget({ frames: 121 }).ok, "121 frames leaves the single-sign path");
assert(!assessIsolatedSignBudget({ frames: 30, durationMs: 8_001 }).ok, "over 8 s leaves the single-sign path");

assert(englishFromGlosses(["HELLO"]) === "Hello.", "one gloss keeps dictionary English");
assert(
  englishFromGlosses(["HELLO", "NAME", "WHAT1"]) === "Hello name what?",
  "dictionary English joins glosses and keeps a closing question",
);
assert(
  englishFromGlosses(["EAT1", "COCACOLA"]) === "Eat Coca-Cola.",
  "dictionary English keeps proper nouns",
);

console.log(
  JSON.stringify(
    {
      heldPauses: spans(heldSegments),
      loweredHands: spans(loweredSegments),
      slidingWindows: windows.length,
      realModel: realHeld.ok ? realHeld.glosses.map((item) => `${item.gloss} ${(item.confidence * 100).toFixed(0)}%`) : [],
      ok: true,
    },
    null,
    2,
  ),
);
