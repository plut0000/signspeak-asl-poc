#!/usr/bin/env node
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.SIGN_SPEAK_URL ?? "http://127.0.0.1:43127";

function makeLandmarks({ frames, withHands }) {
  const packed = new Float32Array(frames * 75 * 3);
  for (let t = 0; t < frames; t++) {
    packed[t * 225 + 11 * 3] = 0.4;
    packed[t * 225 + 12 * 3] = 0.6;
    packed[t * 225 + 11 * 3 + 1] = 0.3;
    packed[t * 225 + 12 * 3 + 1] = 0.3;
    if (withHands) {
      // Populate both hands. A single moving joint is too weak for the
      // 100-class softmax to clear the 55% dedicated-path threshold.
      for (let j = 0; j < 21; j++) {
        packed[t * 225 + (33 + j) * 3] = 0.45 + 0.01 * j;
        packed[t * 225 + (33 + j) * 3 + 1] = 0.5;
        packed[t * 225 + (54 + j) * 3] = 0.55 + 0.01 * j + t * 0.0005;
        packed[t * 225 + (54 + j) * 3 + 1] = 0.52;
      }
    }
  }
  return packed;
}

async function postInterpret({
  name,
  frames,
  withHands,
  includeLandmarks,
  durationMs,
}) {
  const videoPath = path.join(ROOT, `.tmp-${name}.webm`);
  const landPath = path.join(ROOT, `.tmp-${name}.bin`);
  await writeFile(videoPath, Buffer.alloc(12_000, 1));
  const form = new FormData();
  form.append(
    "video",
    new Blob([await (await import("node:fs/promises")).readFile(videoPath)], {
      type: "video/webm",
    }),
    "signing.webm",
  );
  if (includeLandmarks) {
    const packed = makeLandmarks({ frames, withHands });
    await writeFile(landPath, Buffer.from(packed.buffer));
    form.append(
      "landmarks",
      new Blob([await (await import("node:fs/promises")).readFile(landPath)], {
        type: "application/octet-stream",
      }),
      "landmarks.bin",
    );
    form.append("landmarkFrames", String(frames));
    form.append("poseFrames", String(frames));
    form.append("handFrames", String(withHands ? frames : 0));
  }
  if (durationMs != null) {
    form.append("durationMs", String(durationMs));
  }

  const response = await fetch(`${BASE}/api/interpret`, {
    method: "POST",
    body: form,
  });
  const payload = await response.json();
  await unlink(videoPath).catch(() => {});
  await unlink(landPath).catch(() => {});
  return { status: response.status, payload };
}

const cases = [
  {
    name: "dedicated-confident",
    includeLandmarks: true,
    frames: 30,
    withHands: true,
    durationMs: 2_500,
    expectSource: "dedicated",
  },
  {
    name: "fallback-no-hands",
    includeLandmarks: true,
    frames: 30,
    withHands: false,
    expectSource: "gemini",
  },
  {
    name: "fallback-no-landmarks",
    includeLandmarks: false,
    frames: 0,
    withHands: false,
    expectSource: "gemini",
  },
  {
    name: "fallback-long-clip",
    includeLandmarks: true,
    frames: 200,
    withHands: true,
    expectSource: "gemini",
    expectFallback: /longer than a typical isolated sign/,
    expectNoDedicatedTop: true,
  },
  {
    name: "fallback-long-duration",
    includeLandmarks: true,
    frames: 30,
    withHands: true,
    durationMs: 12_000,
    expectSource: "gemini",
    expectFallback: /longer than a single isolated sign/,
    expectNoDedicatedTop: true,
  },
];

const results = [];
for (const testCase of cases) {
  const result = await postInterpret(testCase);
  const source = result.payload.source;
  const fallbackReason = result.payload.fallbackReason ?? "";
  const fallbackOk = testCase.expectFallback
    ? testCase.expectFallback.test(fallbackReason)
    : true;
  const dedicatedTopOk = testCase.expectNoDedicatedTop
    ? !result.payload.dedicatedTop
    : true;
  const ok =
    result.status === 200 &&
    source === testCase.expectSource &&
    fallbackOk &&
    dedicatedTopOk;
  results.push({
    name: testCase.name,
    ok,
    status: result.status,
    source,
    gloss: result.payload.gloss,
    confidence: result.payload.confidence,
    fallbackReason,
    dedicatedTop: result.payload.dedicatedTop,
    english: result.payload.english,
    mock: result.payload.mock,
  });
  if (!ok) {
    console.error(testCase.name, result);
    process.exitCode = 1;
  }
}

console.log(JSON.stringify(results, null, 2));
