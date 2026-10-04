#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readExportNumber(source, name) {
  const match = source.match(new RegExp(`export const ${name} = ([\\d._]+)`));
  if (!match) throw new Error(`Missing export ${name}`);
  return Number(match[1].replace(/_/g, ""));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const routing = await readFile(path.join(ROOT, "src/lib/asl-routing.ts"), "utf8");
const citizen = await readFile(path.join(ROOT, "src/lib/asl-citizen.ts"), "utf8");
const infer = await readFile(path.join(ROOT, "src/lib/asl-infer.ts"), "utf8");
const patchNotes = await readFile(path.join(ROOT, "src/lib/patch-notes.ts"), "utf8");
const statusRoute = await readFile(
  path.join(ROOT, "src/app/api/status/route.ts"),
  "utf8",
);
const media = await readFile(path.join(ROOT, "src/lib/media.ts"), "utf8");
const sequence = await readFile(path.join(ROOT, "src/lib/asl-sequence.ts"), "utf8");
const segmentation = await readFile(
  path.join(ROOT, "src/lib/sign-segmentation.ts"),
  "utf8",
);
const interpretRoute = await readFile(
  path.join(ROOT, "src/app/api/interpret/route.ts"),
  "utf8",
);

const MAX_MS = readExportNumber(routing, "MAX_ISOLATED_SIGN_MS");
const MAX_FRAMES = readExportNumber(routing, "MAX_ISOLATED_SIGN_FRAMES");
const MARGIN = readExportNumber(routing, "DEFAULT_DEDICATED_MARGIN");
const MAX_ENTROPY = readExportNumber(routing, "DEFAULT_MAX_NORMALIZED_ENTROPY");
const THRESHOLD = readExportNumber(citizen, "DEFAULT_DEDICATED_THRESHOLD");
const glossBlock = citizen.match(
  /export const ASL_CITIZEN_GLOSSES = \[([\s\S]*?)\] as const/,
);
assert(glossBlock, "ASL_CITIZEN_GLOSSES array is missing");
const glossCount = [...glossBlock[1].matchAll(/"([^"]+)"/g)].length;

assert(MAX_MS === 8_000, "isolated-sign budget should be 8s");
assert(MAX_FRAMES === 120, "isolated-sign frame budget should be 120");
assert(THRESHOLD === 0.55, "default dedicated threshold should be 0.55");
assert(MARGIN === 0.15, "default dedicated margin should be 0.15");
assert(MAX_ENTROPY === 0.75, "default max normalized entropy should be 0.75");
assert(glossCount === 200, `expected 200 dedicated glosses, got ${glossCount}`);
assert(
  citizen.includes('DEDICATED_MODEL_DIRNAME = "asl-citizen-bilstm200"'),
  "dedicated model dir should be the 200-class folder",
);
assert(
  citizen.includes("asl_citizen_bilstm200_rl.onnx"),
  "dedicated ONNX should be the 200-class RL graph",
);
assert(
  infer.includes("DEDICATED_MODEL_DIRNAME"),
  "inference should load from the versioned dedicated model dir",
);
assert(
  patchNotes.includes('DEMO_VERSION = "3.1.1"'),
  "demo version should be 3.1.1",
);
assert(
  citizen.includes('DEDICATED_MODEL_VERSION = "3.0.1"'),
  "dedicated model version should be 3.0.1",
);
assert(
  citizen.includes("Model v3.0.1 (RL) 200-class"),
  "dedicated model label should name v3.0.1 RL 200-class",
);
assert(
  citizen.includes('LUNCH1') && citizen.includes('COCACOLA') && citizen.includes('TAKEOFF1'),
  "200-class vocab should include LUNCH1, COCACOLA, TAKEOFF1",
);
assert(
  citizen.includes('Coca-Cola') && citizen.includes("Take off"),
  "friendly gloss map should include Coca-Cola and Take off",
);
assert(
  !statusRoute.includes("maxIsolatedMs") &&
    !statusRoute.includes("maxIsolatedFrames") &&
    !statusRoute.includes("threshold") &&
    !statusRoute.includes("getGeminiModel"),
  "/api/status should not expose routing gates or the Gemini model name",
);
assert(
  statusRoute.includes("DEDICATED_MODEL_VERSION") &&
    statusRoute.includes("isDedicatedEnabled"),
  "/api/status should still report whether the dedicated model is on",
);
assert(
  media.includes("LONG_CLIP_HINT_MS = MAX_ISOLATED_SIGN_MS"),
  "long-clip processing hint should follow the isolated-sign budget",
);
assert(
  readExportNumber(sequence, "MAX_SIGN_SEQUENCE_MS") === 32_000,
  "several-signs path should allow ~30 s recordings (plus auto-stop slack)",
);
assert(
  sequence.includes("MAX_SIGN_SEQUENCE_FRAMES = MAX_LANDMARK_FRAMES") &&
    readExportNumber(citizen, "MAX_LANDMARK_FRAMES") === 900,
  "several-signs path should allow up to 900 landmark frames",
);
assert(
  readExportNumber(segmentation, "MAX_SEGMENT_FRAMES") === 120,
  "single-sign segments should be capped at 120 frames",
);
assert(
  interpretRoute.includes("isSignSequenceEnabled()") &&
    interpretRoute.includes("readSignSequence({"),
  "clips over the isolated-sign budget should try the several-signs path",
);
assert(
  interpretRoute.includes("const prediction = await predictGloss(features);") &&
    interpretRoute.includes("const decision = assessDedicatedPrediction(prediction);"),
  "clips inside the isolated-sign budget should keep the single-sign path",
);

const nextConfig = await readFile(path.join(ROOT, "next.config.ts"), "utf8");
const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
const gemini = await readFile(path.join(ROOT, "src/lib/gemini.ts"), "utf8");
assert(pkg.dependencies.next === "16.3.6", "next should be 16.3.6");
assert(nextConfig.includes("poweredByHeader: false"), "hide x-powered-by");
assert(
  nextConfig.includes("X-Content-Type-Options") &&
    nextConfig.includes("X-Frame-Options") &&
    nextConfig.includes("Referrer-Policy"),
  "next.config should set basic security headers",
);
const uploadLimits = await readFile(
  path.join(ROOT, "src/lib/upload-limits.ts"),
  "utf8",
);
const camera = await readFile(path.join(ROOT, "src/hooks/use-camera.ts"), "utf8");
assert(
  interpretRoute.includes("content-length") &&
    interpretRoute.includes("formData()") &&
    interpretRoute.indexOf("content-length") < interpretRoute.indexOf("formData()"),
  "interpret should check Content-Length before reading formData",
);
assert(
  uploadLimits.includes("4.5 * 1024 * 1024") &&
    interpretRoute.includes("MAX_UPLOAD_BYTES") &&
    interpretRoute.includes("MAX_VIDEO_BYTES"),
  "upload cap should match Vercel’s ~4.5 MB body limit, with room for landmarks",
);
assert(
  interpretRoute.includes("resolveVideoMime") &&
    !interpretRoute.includes("Please upload a webcam video clip"),
  "interpret should resolve video mime without rejecting unknown magic bytes",
);
assert(
  readExportNumber(sequence, "SEQUENCE_THRESHOLD") === 0.4 &&
    readExportNumber(sequence, "SEQUENCE_MARGIN") === 0.08,
  "several-signs path should use looser gates than the isolated-sign path",
);
assert(
  camera.includes("width: { ideal: 640 }") &&
    camera.includes("height: { ideal: 480 }") &&
    camera.includes("frameRate: { ideal: 15, max: 24 }"),
  "webcam capture should stay small enough for a 30 s Gemini upload",
);
assert(
  readExportNumber(uploadLimits, "RECORD_BITS_PER_SECOND") === 480_000,
  "MediaRecorder bitrate should keep a 30 s clip under the video cap",
);
assert(
  interpretRoute.includes("takeInterpretSlot(clientIp(request))"),
  "interpret should rate-limit per IP",
);
assert(
  readExportNumber(gemini, "MAX_GEMINI_CALLS_PER_REQUEST") === 3,
  "each request should cap Gemini calls",
);
assert(
  readExportNumber(gemini, "GEMINI_REQUEST_DEADLINE_MS") === 95_000,
  "Gemini fallbacks should stop before the 120 s function limit",
);
assert(
  !gemini.includes("GEMINI_API_KEY in .env") && !gemini.includes("GEMINI_MODEL in .env"),
  "Gemini errors should not name env files or config keys",
);

function assessBudget({ frames, durationMs }) {
  if (typeof durationMs === "number" && durationMs > MAX_MS) return false;
  if (frames > MAX_FRAMES) return false;
  return true;
}

function assessPrediction({ confidence, margin, normalizedEntropy }) {
  return (
    confidence >= THRESHOLD &&
    margin >= MARGIN &&
    normalizedEntropy <= MAX_ENTROPY
  );
}

const budgetCases = [
  { frames: 30, durationMs: 2_500, expect: true, name: "short isolated sign" },
  { frames: 90, durationMs: 6_500, expect: true, name: "slow one-word demo" },
  { frames: 120, durationMs: 8_000, expect: true, name: "budget boundary" },
  { frames: 121, expect: false, name: "one frame over budget" },
  { frames: 200, expect: false, name: "resample-length continuous clip" },
  { frames: 30, durationMs: 8_001, expect: false, name: "short frames, long duration" },
  { frames: 40, durationMs: 9_000, expect: false, name: "over eight seconds" },
  { frames: 12, durationMs: 16_000, expect: false, name: "song-length recording" },
];

const predictionCases = [
  {
    name: "high-confidence isolated sign",
    confidence: 0.87,
    margin: 0.7,
    normalizedEntropy: 0.25,
    expect: true,
  },
  {
    name: "medium EAT-like latch",
    confidence: 0.48,
    margin: 0.18,
    normalizedEntropy: 0.55,
    expect: false,
  },
  {
    name: "above threshold but split top-2",
    confidence: 0.62,
    margin: 0.04,
    normalizedEntropy: 0.6,
    expect: false,
  },
  {
    name: "high entropy soup",
    confidence: 0.58,
    margin: 0.2,
    normalizedEntropy: 0.88,
    expect: false,
  },
];

for (const testCase of budgetCases) {
  const ok = assessBudget(testCase) === testCase.expect;
  assert(ok, `budget: ${testCase.name}`);
}

for (const testCase of predictionCases) {
  const ok = assessPrediction(testCase) === testCase.expect;
  assert(ok, `prediction: ${testCase.name}`);
}

console.log(
  JSON.stringify(
    {
      maxIsolatedMs: MAX_MS,
      maxIsolatedFrames: MAX_FRAMES,
      threshold: THRESHOLD,
      margin: MARGIN,
      maxNormalizedEntropy: MAX_ENTROPY,
      classes: glossCount,
      budgetCases: budgetCases.length,
      predictionCases: predictionCases.length,
      ok: true,
    },
    null,
    2,
  ),
);
