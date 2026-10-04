#!/usr/bin/env node
import { buildClip, countHandFrames, SIGN_GLOSSES } from "./sign-fixtures.mjs";

const BASE = process.env.SIGN_SPEAK_URL ?? "http://127.0.0.1:43127";

function makeLandmarks({ frames, withHands }) {
  const packed = new Float32Array(frames * 75 * 3);
  for (let t = 0; t < frames; t++) {
    packed[t * 225 + 11 * 3] = 0.4;
    packed[t * 225 + 12 * 3] = 0.6;
    packed[t * 225 + 11 * 3 + 1] = 0.3;
    packed[t * 225 + 12 * 3 + 1] = 0.3;
    if (withHands) {
      // Populate both hands with a small periodic motion. Weak linear drift
      // is too flat for the 200-class softmax to clear the 55% threshold.
      const phase = (t / Math.max(frames, 1)) * Math.PI * 2;
      for (let j = 0; j < 21; j++) {
        packed[t * 225 + (33 + j) * 3] = 0.35 + 0.02 * j + 0.05 * Math.sin(phase);
        packed[t * 225 + (33 + j) * 3 + 1] = 0.45 + 0.02 * Math.sin(phase + j * 0.2);
        packed[t * 225 + (54 + j) * 3] = 0.65 - 0.02 * j + 0.05 * Math.cos(phase);
        packed[t * 225 + (54 + j) * 3 + 1] = 0.55 + 0.02 * Math.cos(phase + j * 0.3);
      }
    }
  }
  return packed;
}

const pause = [{ hold: 10, jitter: 0.001 }, { move: 4 }];
const sign = (name, frames = 30) => ({ sign: name, frames });
const threeSigns = (names, pauseParts = pause) => [
  { hold: 12 },
  sign(names[0]),
  ...pauseParts,
  sign(names[1]),
  ...pauseParts,
  sign(names[2]),
  { hold: 12 },
];

async function postInterpret({ name, landmarks, durationMs }) {
  const form = new FormData();
  form.append("video", new Blob([Buffer.alloc(12_000, 1)], { type: "video/webm" }), "signing.webm");
  if (landmarks) {
    form.append(
      "landmarks",
      new Blob([Buffer.from(landmarks.packed.buffer)], { type: "application/octet-stream" }),
      "landmarks.bin",
    );
    form.append("landmarkFrames", String(landmarks.frames));
    form.append("poseFrames", String(landmarks.frames));
    form.append("handFrames", String(countHandFrames(landmarks.packed, landmarks.frames)));
  }
  if (durationMs != null) {
    form.append("durationMs", String(durationMs));
  }

  const response = await fetch(`${BASE}/api/interpret`, {
    method: "POST",
    body: form,
    headers: { "x-forwarded-for": `198.51.100.${(hash(name) % 250) + 1}` },
  });
  return { status: response.status, payload: await response.json() };
}

function hash(text) {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}

function clip(parts, frameMs = 66) {
  const built = buildClip(parts);
  return { landmarks: built, durationMs: Math.round(built.frames * frameMs) };
}

const SEQUENCE = [SIGN_GLOSSES.kangaroo, SIGN_GLOSSES.eggbeater, SIGN_GLOSSES.measure];

const cases = [
  {
    name: "dedicated-confident",
    landmarks: { packed: makeLandmarks({ frames: 30, withHands: true }), frames: 30 },
    durationMs: 2_500,
    expectSource: "dedicated",
    expectNoGlosses: true,
  },
  {
    name: "fallback-no-hands",
    landmarks: { packed: makeLandmarks({ frames: 30, withHands: false }), frames: 30 },
    expectSource: "gemini",
  },
  {
    name: "fallback-no-landmarks",
    expectSource: "gemini",
  },
  {
    // One slow sweep over 13 s never moves fast enough to count as a sign.
    name: "fallback-long-clip",
    landmarks: { packed: makeLandmarks({ frames: 200, withHands: true }), frames: 200 },
    expectSource: "gemini",
    expectFallback: /No separate signs were found/,
    expectNoDedicatedTop: true,
  },
  {
    name: "fallback-long-duration",
    landmarks: { packed: makeLandmarks({ frames: 30, withHands: true }), frames: 30 },
    durationMs: 12_000,
    expectSource: "gemini",
    expectFallback: /too sparse to split this 12s clip/,
    expectNoDedicatedTop: true,
  },
  {
    name: "single-sign-path-keeps-short-clips",
    ...clip([
      { hold: 6 },
      sign("kangaroo"),
      { hold: 8 },
      sign("eggbeater"),
      { hold: 8 },
      sign("measure"),
      { hold: 6 },
    ]),
    expectNoGlosses: true,
  },
  {
    name: "sequence-three-signs",
    ...clip(threeSigns(["kangaroo", "eggbeater", "measure"])),
    expectSource: "dedicated",
    expectGlosses: SEQUENCE,
    expectSegments: { total: 3, confident: 3 },
  },
  {
    name: "sequence-lowered-hands",
    ...clip(threeSigns(["kangaroo", "eggbeater", "measure"], [{ handsDown: 10 }])),
    expectSource: "dedicated",
    expectGlosses: SEQUENCE,
  },
  {
    name: "sequence-repeat-merged",
    ...clip(threeSigns(["kangaroo", "kangaroo", "eggbeater"])),
    expectSource: "dedicated",
    expectGlosses: [SIGN_GLOSSES.kangaroo, SIGN_GLOSSES.eggbeater],
    expectSegments: { total: 3, confident: 3 },
  },
  {
    name: "sequence-one-unclear",
    ...clip(threeSigns(["kangaroo", "eggbeater", "unclearSweep"])),
    expectSource: "dedicated",
    expectGlosses: [SIGN_GLOSSES.kangaroo, SIGN_GLOSSES.eggbeater],
    expectSegments: { total: 3, confident: 2 },
  },
  {
    name: "sequence-mostly-unclear",
    ...clip(threeSigns(["kangaroo", "unclearSweep", "unclearShake"])),
    expectSource: "gemini",
    expectFallback: /^Only 1 of 3 signs was clear enough for the dedicated model/,
    expectNoDedicatedTop: true,
    expectNoGlosses: true,
  },
  {
    name: "sequence-one-sign-in-long-clip",
    ...clip([{ hold: 70, jitter: 0.001 }, sign("kangaroo"), { hold: 90, jitter: 0.001 }]),
    expectSource: "dedicated",
    expectGloss: SIGN_GLOSSES.kangaroo,
    expectGlosses: [SIGN_GLOSSES.kangaroo],
  },
  {
    name: "sequence-over-30s",
    landmarks: buildClip(threeSigns(["kangaroo", "eggbeater", "measure"])),
    durationMs: 40_000,
    expectSource: "gemini",
    expectFallback: /longer than the ~30s limit for several signs/,
    expectNoDedicatedTop: true,
  },
];

const results = [];
for (const testCase of cases) {
  const result = await postInterpret(testCase);
  const { payload } = result;
  const glosses = payload.glosses?.map((item) => item.gloss);
  const checks = {
    status: result.status === 200,
    source: !testCase.expectSource || payload.source === testCase.expectSource,
    fallback: !testCase.expectFallback || testCase.expectFallback.test(payload.fallbackReason ?? ""),
    dedicatedTop: !testCase.expectNoDedicatedTop || !payload.dedicatedTop,
    gloss: !testCase.expectGloss || payload.gloss === testCase.expectGloss,
    glosses: !testCase.expectGlosses || glosses?.join(" ") === testCase.expectGlosses.join(" "),
    noGlosses: !testCase.expectNoGlosses || (!payload.glosses && !payload.segments),
    segments:
      !testCase.expectSegments ||
      JSON.stringify(payload.segments) === JSON.stringify(testCase.expectSegments),
  };
  const ok = Object.values(checks).every(Boolean);
  results.push({
    name: testCase.name,
    ok,
    status: result.status,
    source: payload.source,
    gloss: payload.gloss,
    glosses,
    segments: payload.segments,
    confidence: payload.confidence,
    fallbackReason: payload.fallbackReason ?? "",
    dedicatedTop: payload.dedicatedTop,
    english: payload.english,
    mock: payload.mock,
  });
  if (!ok) {
    console.error(testCase.name, checks, result);
    process.exitCode = 1;
  }
}

console.log(JSON.stringify(results, null, 2));
