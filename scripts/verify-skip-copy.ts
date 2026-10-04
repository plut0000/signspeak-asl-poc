#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveHandCoverageIsLow, POS_DIM } from "../src/lib/asl-citizen.ts";
import {
  approachPackedFrame,
  CHIP_UPDATE_MS,
  coverMappedPoint,
  describeDelegateReadout,
  describeDetectReadout,
  describeOverlayStatus,
  DETECT_YIELD_MS,
  frameAtPlaybackTime,
  LANDMARK_SMOOTH,
  landmarkSmoothAlpha,
  nextDetectDelay,
  OVERLAY_MAX_DPR,
  overlayDevicePixelRatio,
  overlayStatusFromFrame,
  PREVIEW_DETECT_MAX_WIDTH,
  RECORD_SAMPLE_MS,
  readShowTrackingPref,
} from "../src/lib/landmark-overlay.ts";
import {
  NO_SIGNS_REASON,
  readSignSequence,
  TOO_MANY_SEGMENTS_REASON,
} from "../src/lib/asl-sequence.ts";
import {
  explainDedicatedSkip,
  LONG_CLIP_GEMINI_ERROR,
  SEQUENCE_GEMINI_ERROR,
  userFacingInterpretError,
} from "../src/lib/dedicated-skip-copy.ts";
import {
  canSpendGeminiCall,
  createGeminiBudget,
  friendlyGeminiError,
  GEMINI_REQUEST_DEADLINE_MS,
  GLOSS_CLEANUP_TIMEOUT_MS,
  isGeminiVideoFormatError,
  MAX_GEMINI_CALLS_PER_REQUEST,
  VIDEO_REQUEST_TIMEOUT_MS,
} from "../src/lib/gemini.ts";
import {
  INTERPRET_RATE_LIMIT,
  INTERPRET_RATE_WINDOW_MS,
  resetInterpretRateLimit,
  takeInterpretSlot,
} from "../src/lib/rate-limit.ts";
import {
  alternateVideoMime,
  resolveVideoMime,
  sniffVideoMime,
} from "../src/lib/strip-video-audio.ts";
import { CLIP_TOO_LARGE_ERROR } from "../src/lib/upload-limits.ts";
import { buildClip } from "./sign-fixtures.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const hands = explainDedicatedSkip({
  fallbackReason: "Hands were missing or poorly tracked in too many frames.",
});
assert(
  hands === "Custom model skipped: Hands were missing from too many frames.",
  `hands copy mismatch: ${hands}`,
);

const hello = explainDedicatedSkip({
  fallbackReason: "Dedicated model confidence 40% was below 55%.",
  dedicatedTop: { gloss: "HELLO", glossLabel: "Hello", confidence: 0.4 },
});
assert(
  hello === "Custom model skipped: Confidence was too low (best guess HELLO at 40%).",
  `confidence copy mismatch: ${hello}`,
);
assert(hello?.includes("HELLO"), "confidence skip should name the top gloss");
assert(hello?.includes("40%"), "confidence skip should show the top confidence");

const split = explainDedicatedSkip({
  fallbackReason: "Dedicated model was split between HELLO (48%) and NAME 40%.",
  dedicatedTop: { gloss: "HELLO", glossLabel: "Hello", confidence: 0.48 },
});
assert(
  split?.startsWith("Custom model skipped:") && split.includes("HELLO"),
  `split copy mismatch: ${split}`,
);
assert(!/softmax|entropy|margin|MediaPipe|BiLSTM/i.test(split ?? ""), "split copy should stay plain");

const entropy = explainDedicatedSkip({
  fallbackReason: "Dedicated model was uncertain across too many glosses.",
  dedicatedTop: { gloss: "EAT1", glossLabel: "Eat", confidence: 0.22 },
});
assert(
  entropy ===
    "Custom model skipped: It was unsure across too many signs (best guess Eat (EAT1) at 22%).",
  `entropy copy mismatch: ${entropy}`,
);

const longClip = explainDedicatedSkip({
  fallbackReason:
    "Clip is 12s — longer than a single isolated sign, so Gemini video is used instead of the dedicated model.",
});
assert(
  longClip === "Custom model skipped: This clip is longer than one sign.",
  `long clip copy mismatch: ${longClip}`,
);

assert(explainDedicatedSkip({}) === null, "empty skip should stay quiet");

const LIGHTING =
  "Gemini could not interpret this clip. Try again with brighter lighting and clearer signs.";
const longDurationReason =
  "Clip is 9.2s — longer than a single isolated sign, so Gemini video is used instead of the dedicated model.";
const longFramesReason =
  "Landmark sequence (140 frames) is longer than a typical isolated sign, so Gemini video is used instead of the dedicated model.";

const lengthLead = userFacingInterpretError({
  error: LIGHTING,
  fallbackReason: longDurationReason,
});
assert(
  lengthLead === LONG_CLIP_GEMINI_ERROR,
  `length skip should not lead with lighting: ${lengthLead}`,
);
assert(!/lighting/i.test(lengthLead), "length-skip primary line should not mention lighting");
assert(
  /under ~8 seconds/i.test(lengthLead),
  "length-skip primary line should mention the ~8 second custom-model budget",
);

const frameLead = userFacingInterpretError({
  error: LIGHTING,
  fallbackReason: longFramesReason,
});
assert(
  frameLead === LONG_CLIP_GEMINI_ERROR,
  `frame-length skip should not lead with lighting: ${frameLead}`,
);

assert(
  userFacingInterpretError({
    error: LIGHTING,
    fallbackReason: "Hands were missing or poorly tracked in too many frames.",
  }) === LIGHTING,
  "hand-quality skip should keep the lighting wording",
);
assert(
  userFacingInterpretError({
    error: LIGHTING,
    fallbackReason: "Too few landmark frames to trust the dedicated model.",
  }) === LIGHTING,
  "landmark-quality skip should keep the lighting wording",
);
assert(
  userFacingInterpretError({
    error: LIGHTING,
    fallbackReason: "Dedicated model confidence 40% was below 55%.",
  }) === LIGHTING,
  "confidence skip should keep the lighting wording",
);
assert(
  userFacingInterpretError({ error: LIGHTING }) === LIGHTING,
  "missing skip reason should keep the lighting wording",
);
const busy = "Gemini is busy right now. Wait a few seconds and try again.";
assert(
  userFacingInterpretError({
    error: busy,
    fallbackReason: longDurationReason,
  }) === busy,
  "a specific Gemini error should stay ahead of the length-skip sentence",
);
assert(
  userFacingInterpretError({
    error: LONG_CLIP_GEMINI_ERROR,
    fallbackReason: longDurationReason,
  }) === LONG_CLIP_GEMINI_ERROR,
  "length-skip wording should stay stable if applied twice",
);

const signs = buildClip([
  { hold: 12 },
  { sign: "kangaroo", frames: 30 },
  { hold: 10 },
  { move: 4 },
  { sign: "eggbeater", frames: 30 },
  { hold: 10 },
  { move: 4 },
  { sign: "measure", frames: 30 },
  { hold: 12 },
]);
async function sequenceReason(input: {
  confidences?: number[];
  frames?: number;
  durationMs?: number;
}) {
  const confidences = [...(input.confidences ?? [])];
  const reading = await readSignSequence({
    packed: signs.packed,
    frames: input.frames ?? signs.frames,
    durationMs: input.durationMs,
    predict: async () => {
      const confidence = confidences.shift() ?? 0.2;
      return {
        gloss: "HELLO",
        glossLabel: "Hello",
        confidence,
        margin: confidence - 0.05,
        normalizedEntropy: 0.2,
        top: [],
      };
    },
  });
  assert(!reading.ok, "sequence fixture should fall back for the copy checks");
  return reading.reason;
}

const oneOfThree = await sequenceReason({ confidences: [0.9, 0.2, 0.2] });
const noneOfThree = await sequenceReason({ confidences: [0.2, 0.2, 0.2] });
const sparseReason = await sequenceReason({ frames: 30, durationMs: 12_000 });
const over30Reason = await sequenceReason({ durationMs: 40_000 });

assert(
  explainDedicatedSkip({ fallbackReason: oneOfThree }) ===
    "Custom model skipped: Only 1 of 3 signs was clear enough.",
  `sequence minority copy mismatch: ${explainDedicatedSkip({ fallbackReason: oneOfThree })}`,
);
assert(
  explainDedicatedSkip({ fallbackReason: noneOfThree }) ===
    "Custom model skipped: None of the 3 signs were clear enough.",
  "sequence none-clear copy mismatch",
);
assert(
  explainDedicatedSkip({ fallbackReason: NO_SIGNS_REASON }) ===
    "Custom model skipped: It could not find separate signs in this clip.",
  "no-signs copy mismatch",
);
assert(
  explainDedicatedSkip({ fallbackReason: TOO_MANY_SEGMENTS_REASON }) ===
    "Custom model skipped: It could not find separate signs in this clip.",
  "too-many-segments copy mismatch",
);
assert(
  explainDedicatedSkip({ fallbackReason: sparseReason }) ===
    "Custom model skipped: Not enough of the clip was tracked to split it into signs.",
  `sparse copy mismatch: ${sparseReason}`,
);
assert(
  explainDedicatedSkip({ fallbackReason: over30Reason }) ===
    "Custom model skipped: This clip is longer than about 30 seconds.",
  `over-30s copy mismatch: ${over30Reason}`,
);
for (const reason of [oneOfThree, noneOfThree, NO_SIGNS_REASON, TOO_MANY_SEGMENTS_REASON]) {
  assert(
    userFacingInterpretError({ error: LIGHTING, fallbackReason: reason }) ===
      SEQUENCE_GEMINI_ERROR,
    `a sequence skip should ask for pauses instead of lighting: ${reason}`,
  );
}
assert(/pause briefly between signs/i.test(SEQUENCE_GEMINI_ERROR), "sequence error asks for pauses");
assert(
  !/Google/i.test(LONG_CLIP_GEMINI_ERROR) && !/Google/i.test(SEQUENCE_GEMINI_ERROR),
  "user-facing errors should not blame Google",
);
assert(
  userFacingInterpretError({ error: LIGHTING, fallbackReason: over30Reason }) ===
    LONG_CLIP_GEMINI_ERROR,
  "an over-30s skip is a length skip",
);
assert(
  userFacingInterpretError({ error: LIGHTING, fallbackReason: sparseReason }) === LIGHTING,
  "sparse tracking keeps the lighting wording",
);
assert(
  userFacingInterpretError({ error: busy, fallbackReason: oneOfThree }) === busy,
  "a specific Gemini error should stay ahead of the sequence sentence",
);
for (const reason of [oneOfThree, noneOfThree, sparseReason, over30Reason, NO_SIGNS_REASON]) {
  assert(
    !/softmax|entropy|margin|MediaPipe|BiLSTM/i.test(explainDedicatedSkip({ fallbackReason: reason }) ?? ""),
    `sequence skip copy should stay plain: ${reason}`,
  );
}

assert(
  !/GEMINI_API_KEY|\.env\.local|GEMINI_MODEL/.test(
    friendlyGeminiError("API key invalid: 401 permission denied"),
  ),
  "key errors should not name env files",
);
assert(
  !/GEMINI_MODEL|\.env/.test(friendlyGeminiError("model not found 404")),
  "missing-model errors should not name config",
);

resetInterpretRateLimit();
const t0 = 1_000_000;
for (let i = 0; i < INTERPRET_RATE_LIMIT; i++) {
  assert(takeInterpretSlot("198.51.100.9", t0 + i), `rate-limit slot ${i}`);
}
assert(!takeInterpretSlot("198.51.100.9", t0 + INTERPRET_RATE_LIMIT), "11th request is limited");
assert(takeInterpretSlot("198.51.100.10", t0), "a second IP keeps its own window");
assert(
  takeInterpretSlot("198.51.100.9", t0 + INTERPRET_RATE_WINDOW_MS + 1),
  "the window should roll over",
);

const budget = createGeminiBudget(0);
assert(canSpendGeminiCall(budget, VIDEO_REQUEST_TIMEOUT_MS, 0), "fresh budget can call Gemini");
budget.calls = MAX_GEMINI_CALLS_PER_REQUEST;
assert(!canSpendGeminiCall(budget, GLOSS_CLEANUP_TIMEOUT_MS, 0), "call cap is per request");
budget.calls = 0;
assert(
  !canSpendGeminiCall(budget, VIDEO_REQUEST_TIMEOUT_MS, GEMINI_REQUEST_DEADLINE_MS - 1_000),
  "a late video call should not start under the 120 s function limit",
);

const webm = Buffer.alloc(32, 1);
webm[0] = 0x1a;
webm[1] = 0x45;
webm[2] = 0xdf;
webm[3] = 0xa3;
assert(sniffVideoMime(webm) === "video/webm", "EBML is webm");
const mp4 = Buffer.alloc(32, 0);
mp4.write("ftyp", 4);
assert(sniffVideoMime(mp4) === "video/mp4", "ftyp is mp4");
const safariMp4 = Buffer.alloc(32, 0);
safariMp4.write("wide", 4);
safariMp4.write("ftyp", 12);
assert(sniffVideoMime(safariMp4) === "video/mp4", "ftyp after a wide box is still mp4");
assert(sniffVideoMime(Buffer.alloc(32, 1)) === null, "random bytes are not a video");
assert(sniffVideoMime(Buffer.from("RIFF....WAVE")) === null, "WAV is not trusted as video");
assert(
  resolveVideoMime(Buffer.alloc(32, 1), "video/mp4;codecs=avc1") === "video/mp4",
  "claimed mp4 is used when magic is unknown",
);
assert(
  resolveVideoMime(Buffer.alloc(32, 1), "video/webm;codecs=vp9") === "video/webm",
  "claimed webm is used when magic is unknown",
);
assert(
  resolveVideoMime(webm, "video/mp4") === "video/webm",
  "magic bytes win over a mismatched claimed type",
);
assert(alternateVideoMime("video/webm") === "video/mp4", "webm retries as mp4");
assert(alternateVideoMime("video/mp4") === "video/webm", "mp4 retries as webm");
assert(
  isGeminiVideoFormatError("INVALID_ARGUMENT: Unsupported mime type video/webm"),
  "Gemini mime errors are format errors",
);
assert(
  isGeminiVideoFormatError("Could not process the video inline data"),
  "Gemini process errors are format errors",
);
assert(!isGeminiVideoFormatError("503 unavailable"), "busy is not a format error");
assert(
  /too large to send/i.test(CLIP_TOO_LARGE_ERROR),
  "oversize clips should say the recording is too large",
);

assert(!liveHandCoverageIsLow(4, 0), "too few frames should not nag yet");
assert(liveHandCoverageIsLow(20, 0), "no hands should hint");
assert(liveHandCoverageIsLow(20, 2), "hand ratio under the gate should hint");
assert(!liveHandCoverageIsLow(20, 8), "healthy hand coverage should stay quiet");

const route = await readFile(path.join(ROOT, "src/app/api/interpret/route.ts"), "utf8");
const catchStart = route.indexOf("} catch (error) {");
assert(catchStart > 0, "interpret route should keep a catch");
const catchBody = route.slice(catchStart, catchStart + 700);
assert(
  catchBody.includes("friendlyGeminiError(message, skip.fallbackReason)"),
  "502 should keep the friendly Gemini error and pass the skip reason",
);
assert(
  catchBody.includes("dedicatedSkipFields(dedicatedAttempt)"),
  "502 should include dedicated skip fields",
);
assert(
  route.includes("fallbackReason: attempt.reason"),
  "skip fields should pass through dedicatedAttempt.reason",
);
assert(
  route.includes("dedicatedTop"),
  "skip fields should pass through dedicatedTop",
);

const mute = await readFile(path.join(ROOT, "src/lib/strip-video-audio.ts"), "utf8");
assert(
  !mute.includes('throw new Error("Could not mute the clip before translation.")'),
  "mute should stay a soft-fail instead of throwing",
);
assert(
  mute.includes("sending original video"),
  "mute soft-fail should still return the original video",
);

const studio = await readFile(path.join(ROOT, "src/components/sign-studio.tsx"), "utf8");
const gemini = await readFile(path.join(ROOT, "src/lib/gemini.ts"), "utf8");
assert(studio.includes("explainDedicatedSkip"), "error UI should explain a dedicated skip");
assert(
  studio.includes("userFacingInterpretError"),
  "error UI should use the skip-aware primary line",
);
assert(
  gemini.includes("userFacingInterpretError"),
  "friendly Gemini errors should defer length-skip wording",
);
assert(
  gemini.includes("brighter lighting and clearer signs"),
  "lighting wording should remain for quality skips",
);
assert(
  route.includes("friendlyGeminiError(message, skip.fallbackReason)"),
  "502 should pass the skip reason into the Gemini error",
);
assert(studio.includes("Keep both hands in frame"), "recording UI should hint when hands are out of frame");
assert(studio.includes("lowHandCoverage"), "hint should follow tracker hand coverage");
assert(
  studio.includes("RECORD_BITS_PER_SECOND") && studio.includes("MAX_VIDEO_BYTES"),
  "recorder should cap bitrate and reject oversized blobs before upload",
);
assert(
  gemini.includes("alternateVideoMime") && gemini.includes("isGeminiVideoFormatError"),
  "Gemini video should retry once with the other container type",
);
assert(studio.includes("Show tracking"), "studio should expose a Show tracking toggle");
assert(studio.includes("LandmarkOverlay"), "studio should mount the landmark overlay");
assert(
  studio.includes("getLatestFrame"),
  "overlay should reuse the live MediaPipe frames",
);
assert(
  studio.includes("replayLandmarks"),
  "last-clip playback should keep captured landmarks",
);

assert(
  describeOverlayStatus({ hands: 2, body: true }) === "Hands: 2 · Body: tracked",
  "status chip copy should match the live tracking chip",
);
assert(
  describeOverlayStatus({ hands: 0, body: false }) ===
    "Hands: 0 · Body: not tracked",
  "empty status chip copy should stay plain",
);

const emptyStatus = overlayStatusFromFrame(null);
assert(emptyStatus.hands === 0 && !emptyStatus.body, "null frame is untracked");

const poseOnly = new Float32Array(POS_DIM);
poseOnly[11 * 3] = 0.4;
poseOnly[11 * 3 + 1] = 0.3;
const poseStatus = overlayStatusFromFrame(poseOnly);
assert(poseStatus.body && poseStatus.hands === 0, "shoulders count as a body");

const bothHands = new Float32Array(POS_DIM);
bothHands[0] = 0.5;
bothHands[1] = 0.2;
bothHands[33 * 3] = 0.3;
bothHands[33 * 3 + 1] = 0.4;
bothHands[54 * 3] = 0.7;
bothHands[54 * 3 + 1] = 0.4;
const handStatus = overlayStatusFromFrame(bothHands);
assert(handStatus.hands === 2 && handStatus.body, "both hands and a face point");

assert(
  frameAtPlaybackTime(null, 0, 1) === null,
  "playback without landmarks should skip",
);
assert(
  frameAtPlaybackTime({ packed: new Float32Array(0), frames: 0 }, 0, 1) === null,
  "zero-frame playback should skip",
);

const packed = new Float32Array(POS_DIM * 3);
packed[POS_DIM] = 1;
const mid = frameAtPlaybackTime({ packed, frames: 3 }, 0.5, 1);
assert(mid != null && mid[0] === 1, "playback should pick the frame at currentTime");

const mapped = coverMappedPoint(0.5, 0.5, 960, 720, 640, 480);
assert(
  Math.abs(mapped.x - 320) < 0.01 && Math.abs(mapped.y - 240) < 0.01,
  "cover mapping should keep a centered point centered on a matching aspect",
);
const captureMapped = coverMappedPoint(0.25, 0.75, 640, 480, 640, 480);
assert(
  Math.abs(captureMapped.x - 160) < 0.01 && Math.abs(captureMapped.y - 360) < 0.01,
  "overlay mapping should stay exact at the 640×480 capture size",
);

const store = new Map<string, string>();
const memory = {
  getItem: (key: string) => store.get(key) ?? null,
};
assert(readShowTrackingPref(memory) === true, "tracking pref defaults on");
store.set("signspeak.showTracking", "0");
assert(readShowTrackingPref(memory) === false, "tracking pref remembers off");

assert(RECORD_SAMPLE_MS === 66, "recording still samples every 66ms for the BiLSTM");
assert(CHIP_UPDATE_MS === 250, "status chip should throttle to ~4 Hz");
assert(PREVIEW_DETECT_MAX_WIDTH === 320, "preview detect should use a ~320px frame");
assert(LANDMARK_SMOOTH > 0 && LANDMARK_SMOOTH < 1, "live overlay should ease toward new detects");
assert(nextDetectDelay(20, 66) === 66, "a fast detect should wait the sample budget");
assert(
  nextDetectDelay(80, 66) === 80 + DETECT_YIELD_MS,
  "a slow detect should skip ahead instead of stacking",
);
assert(overlayDevicePixelRatio(3) === OVERLAY_MAX_DPR, "overlay DPR should cap");
assert(overlayDevicePixelRatio(1) === 1, "1x displays should stay 1x");

const snap = new Float32Array(POS_DIM);
const appear = new Float32Array(POS_DIM);
appear[0] = 0.8;
appear[1] = 0.4;
approachPackedFrame(snap, appear, 0.5);
assert(
  Math.abs(snap[0] - 0.8) < 1e-6 && Math.abs(snap[1] - 0.4) < 1e-6,
  "hidden joints should snap onto a new detect",
);
const eased = new Float32Array(POS_DIM);
eased[0] = 0.2;
eased[1] = 0.2;
approachPackedFrame(eased, appear, 0.5);
assert(
  Math.abs(eased[0] - 0.5) < 1e-6 && Math.abs(eased[1] - 0.3) < 1e-6,
  "visible joints should lerp toward the newest detect",
);
assert(
  Math.abs(landmarkSmoothAlpha(16.667) - LANDMARK_SMOOTH) < 1e-6,
  "one display frame uses the base ease",
);
assert(
  describeDelegateReadout("GPU", "GPU") === "GPU",
  "matching delegates should collapse to one label",
);
assert(
  describeDelegateReadout("GPU", "CPU") === "GPU/CPU",
  "mixed delegates should stay visible",
);
assert(
  describeDetectReadout({
    detectFps: 12.2,
    detectMs: 41.6,
    poseDelegate: "GPU",
    handDelegate: "GPU",
    detectThread: "worker",
  }) === "12 det · 42ms · GPU worker",
  "dev readout should name the active delegate and thread",
);

const tracker = await readFile(
  path.join(ROOT, "src/hooks/use-landmark-tracker.ts"),
  "utf8",
);
const overlay = await readFile(
  path.join(ROOT, "src/components/landmark-overlay.tsx"),
  "utf8",
);
const runtime = await readFile(
  path.join(ROOT, "src/lib/landmark-runtime.ts"),
  "utf8",
);
const worker = await readFile(
  path.join(ROOT, "src/lib/landmark-detect.worker.ts"),
  "utf8",
);
const workerClient = await readFile(
  path.join(ROOT, "src/lib/landmark-worker-client.ts"),
  "utf8",
);
assert(tracker.includes("nextDetectDelay"), "tracker should skip detects when busy");
assert(tracker.includes("setTimeout"), "detect should not live on the draw rAF");
assert(
  !tracker.includes("requestAnimationFrame"),
  "tracker should not share the overlay animation frame",
);
assert(
  tracker.includes("capturingRef.current) return video"),
  "recording should keep detecting on the full camera frame",
);
assert(
  tracker.includes("LandmarkWorkerClient") && tracker.includes("workerDetectSupported"),
  "tracker should prefer a detect worker",
);
assert(
  tracker.includes("prepareLandmarkTrackers"),
  "tracker should keep the main-thread MediaPipe fallback",
);
assert(overlay.includes("CHIP_UPDATE_MS"), "overlay chip should be throttled");
assert(overlay.includes("approachPackedFrame"), "overlay should lerp live landmarks");
assert(
  overlay.includes('process.env.NODE_ENV !== "production"'),
  "fps readout should stay off in production",
);
assert(studio.includes("getPerfStats"), "studio should pass detect timings to the overlay");
assert(
  runtime.includes('factory("GPU")') && runtime.includes('factory("CPU")'),
  "both landmarkers should try GPU then fall back to CPU",
);
assert(
  runtime.includes('runningMode: "VIDEO"'),
  "pose and hands should stay in VIDEO running mode",
);
assert(
  worker.includes("if (runtime) return runtime"),
  "worker should reuse landmarkers instead of recreating them",
);
assert(
  worker.includes("detectLandmarkSample") && workerClient.includes("createImageBitmap"),
  "the worker should receive transferred ImageBitmap frames",
);
assert(
  workerClient.includes("[bitmap]") && workerClient.includes("OffscreenCanvas"),
  "worker frames should transfer ownership and require OffscreenCanvas",
);

console.log(
  JSON.stringify(
    {
      hands,
      hello,
      split,
      entropy,
      longClip,
      ok: true,
    },
    null,
    2,
  ),
);
