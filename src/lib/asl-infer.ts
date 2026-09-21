import {
  DEDICATED_ONNX_FILENAME,
  FEAT_DIM,
  TARGET_LEN,
  friendlyGloss,
  glossFromId,
} from "@/lib/asl-citizen";
import { InferenceSession, Tensor } from "onnxruntime-node";
import path from "node:path";

export type DedicatedPrediction = {
  gloss: string;
  glossLabel: string;
  confidence: number;
  top: Array<{ gloss: string; glossLabel: string; confidence: number }>;
};

const MODEL_PATH = path.join(
  process.cwd(),
  "models/asl-citizen-bilstm20",
  DEDICATED_ONNX_FILENAME,
);

let sessionPromise: Promise<InferenceSession> | null = null;

function getSession() {
  if (!sessionPromise) {
    sessionPromise = InferenceSession.create(MODEL_PATH, {
      executionProviders: ["cpu"],
    });
  }
  return sessionPromise;
}

export async function predictGloss(features: Float32Array): Promise<DedicatedPrediction> {
  if (features.length !== TARGET_LEN * FEAT_DIM) {
    throw new Error(
      `Dedicated model expected ${TARGET_LEN * FEAT_DIM} features, got ${features.length}.`,
    );
  }

  const session = await getSession();
  const input = new Tensor("float32", features, [1, TARGET_LEN, FEAT_DIM]);
  const outputs = await session.run({ features: input });
  const first = Object.values(outputs)[0];
  const logits = Array.from(first.data as Float32Array);
  const probs = softmax(logits);
  const ranked = probs
    .map((confidence, id) => {
      const gloss = glossFromId(id);
      return {
        gloss,
        glossLabel: friendlyGloss(gloss),
        confidence,
      };
    })
    .sort((a, b) => b.confidence - a.confidence);

  const top = ranked.slice(0, 3);
  const best = top[0] ?? {
    gloss: "",
    glossLabel: "",
    confidence: 0,
  };

  return {
    gloss: best.gloss,
    glossLabel: best.glossLabel,
    confidence: best.confidence,
    top,
  };
}

function softmax(logits: number[]) {
  const max = Math.max(...logits);
  const exps = logits.map((value) => Math.exp(value - max));
  const sum = exps.reduce((total, value) => total + value, 0);
  return exps.map((value) => value / sum);
}
