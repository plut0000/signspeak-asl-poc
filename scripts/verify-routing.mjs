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

assert(MAX_MS === 5_000, "isolated-sign budget should be 5s");
assert(MAX_FRAMES === 80, "isolated-sign frame budget should be 80");
assert(THRESHOLD === 0.55, "default dedicated threshold should be 0.55");
assert(MARGIN === 0.15, "default dedicated margin should be 0.15");
assert(MAX_ENTROPY === 0.75, "default max normalized entropy should be 0.75");
assert(glossCount === 50, `expected 50 dedicated glosses, got ${glossCount}`);
assert(
  citizen.includes('DEDICATED_MODEL_DIRNAME = "asl-citizen-bilstm50"'),
  "dedicated model dir should be the 50-class folder",
);
assert(
  citizen.includes("asl_citizen_bilstm50_rl.onnx"),
  "dedicated ONNX should be the 50-class RL graph",
);
assert(
  infer.includes("DEDICATED_MODEL_DIRNAME"),
  "inference should load from the versioned dedicated model dir",
);
assert(patchNotes.includes('DEMO_VERSION = "2.1.2"'), "demo version should be 2.1.2");

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
  { frames: 80, durationMs: 5_000, expect: true, name: "budget boundary" },
  { frames: 81, expect: false, name: "one frame over budget" },
  { frames: 200, expect: false, name: "resample-length continuous clip" },
  { frames: 30, durationMs: 5_001, expect: false, name: "short frames, long duration" },
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
