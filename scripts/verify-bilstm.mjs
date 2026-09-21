#!/usr/bin/env node
import { InferenceSession, Tensor } from "onnxruntime-node";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = path.join(
  ROOT,
  "models/asl-citizen-bilstm20/asl_citizen_bilstm20_rl.onnx",
);
const LABELS = path.join(ROOT, "models/asl-citizen-bilstm20/label_map.json");

function resampleNormalizeVelocity(packed, frames) {
  const joints = 75;
  const coords = 3;
  const posDim = joints * coords;
  const target = 200;
  const featDim = posDim * 2;
  const resampled = new Float32Array(target * posDim);

  if (frames === 1) {
    const src = packed.subarray(0, posDim);
    for (let t = 0; t < target; t++) resampled.set(src, t * posDim);
  } else {
    const last = frames - 1;
    for (let t = 0; t < target; t++) {
      const src = frames === target ? t : (t * last) / (target - 1);
      const lo = Math.floor(src);
      const hi = Math.min(lo + 1, last);
      const a = src - lo;
      for (let i = 0; i < posDim; i++) {
        resampled[t * posDim + i] =
          packed[lo * posDim + i] * (1 - a) + packed[hi * posDim + i] * a;
      }
    }
  }

  for (let t = 0; t < target; t++) {
    const off = t * posDim;
    const ls = off + 11 * 3;
    const rs = off + 12 * 3;
    const cx = (resampled[ls] + resampled[rs]) * 0.5;
    const cy = (resampled[ls + 1] + resampled[rs + 1]) * 0.5;
    const cz = (resampled[ls + 2] + resampled[rs + 2]) * 0.5;
    const scale = Math.max(
      Math.hypot(
        resampled[ls] - resampled[rs],
        resampled[ls + 1] - resampled[rs + 1],
        resampled[ls + 2] - resampled[rs + 2],
      ),
      1e-6,
    );
    for (let i = 0; i < posDim; i += 3) {
      resampled[off + i] = (resampled[off + i] - cx) / scale;
      resampled[off + i + 1] = (resampled[off + i + 1] - cy) / scale;
      resampled[off + i + 2] = (resampled[off + i + 2] - cz) / scale;
    }
  }

  const features = new Float32Array(target * featDim);
  for (let t = 0; t < target; t++) {
    const posOff = t * posDim;
    const featOff = t * featDim;
    features.set(resampled.subarray(posOff, posOff + posDim), featOff);
    if (t === 0) continue;
    for (let i = 0; i < posDim; i++) {
      features[featOff + posDim + i] =
        resampled[posOff + i] - resampled[(t - 1) * posDim + i];
    }
  }
  return { features, resampled };
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const labelMap = JSON.parse(await readFile(LABELS, "utf8"));
assert(Object.keys(labelMap.id_to_gloss).length === 20, "expected 20 glosses");

const packed = new Float32Array(30 * 75 * 3);
for (let t = 0; t < 30; t++) {
  packed[t * 225 + 11 * 3] = 0.4;
  packed[t * 225 + 12 * 3] = 0.6;
  packed[t * 225 + 11 * 3 + 1] = 0.3;
  packed[t * 225 + 12 * 3 + 1] = 0.3;
  packed[t * 225 + 54 * 3] = 0.55 + t * 0.002;
  packed[t * 225 + 54 * 3 + 1] = 0.5;
}
const { features, resampled } = resampleNormalizeVelocity(packed, 30);
assert(features.length === 200 * 450, "feature length");
assert(Math.abs(resampled[11 * 3] + resampled[12 * 3]) < 1e-5, "shoulders centered");
assert(features[225] === 0 && features[226] === 0, "first-frame velocity is 0");

const session = await InferenceSession.create(MODEL, {
  executionProviders: ["cpu"],
});
const input = new Tensor("float32", features, [1, 200, 450]);
const outputs = await session.run({ features: input });
const logits = Array.from(Object.values(outputs)[0].data);
assert(logits.length === 20, "20 logits");
const max = Math.max(...logits);
const probs = logits.map((value) => Math.exp(value - max));
const sum = probs.reduce((a, b) => a + b, 0);
const norm = probs.map((value) => value / sum);
assert(Math.abs(norm.reduce((a, b) => a + b, 0) - 1) < 1e-5, "softmax");

const top = norm
  .map((confidence, id) => ({ gloss: labelMap.id_to_gloss[String(id)], confidence }))
  .sort((a, b) => b.confidence - a.confidence)[0];

console.log(
  JSON.stringify(
    {
      version: "2.1",
      variant: "RL",
      onnx: MODEL,
      input: [1, 200, 450],
      topGloss: top.gloss,
      topConfidence: Number(top.confidence.toFixed(4)),
      softmaxSum: Number(norm.reduce((a, b) => a + b, 0).toFixed(6)),
    },
    null,
    2,
  ),
);
