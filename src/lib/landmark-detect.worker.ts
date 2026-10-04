import {
  createLandmarkRuntime,
  detectLandmarkSample,
  nextLandmarkTimestamp,
  type LandmarkRuntime,
} from "./landmark-runtime";
import type {
  LandmarkWorkerRequest,
  LandmarkWorkerResponse,
} from "./landmark-worker-protocol";

let runtime: LandmarkRuntime | null = null;
let lastTimestamp = -1;
let initPromise: Promise<LandmarkRuntime> | null = null;

function post(message: LandmarkWorkerResponse, transfer?: Transferable[]) {
  if (transfer?.length) {
    postMessage(message, { transfer });
  } else {
    postMessage(message);
  }
}

async function ensureRuntime() {
  if (runtime) return runtime;
  if (!initPromise) {
    initPromise = createLandmarkRuntime().catch((error) => {
      initPromise = null;
      throw error;
    });
  }
  runtime = await initPromise;
  return runtime;
}

async function onRequest(data: LandmarkWorkerRequest) {
  if (data.type === "init") {
    const prepared = await ensureRuntime();
    post({ type: "ready", delegates: prepared.delegates });
    return;
  }

  if (data.type === "resetClock") {
    lastTimestamp = -1;
    return;
  }

  if (data.type !== "detect") return;

  const started = performance.now();
  const bitmap = data.bitmap;
  try {
    const prepared = await ensureRuntime();
    const timestamp = nextLandmarkTimestamp(data.timestamp, lastTimestamp);
    lastTimestamp = timestamp;
    const sample = detectLandmarkSample(prepared, bitmap, timestamp);
    const detectMs = performance.now() - started;
    if (!sample) {
      post({ type: "result", ok: false, timestamp, detectMs });
      return;
    }
    const frame = new Float32Array(sample.frame);
    const buffer = frame.buffer;
    post(
      {
        type: "result",
        ok: true,
        buffer,
        hasPose: sample.hasPose,
        hasHand: sample.hasHand,
        leftHand: sample.leftHand,
        rightHand: sample.rightHand,
        timestamp,
        detectMs,
      },
      [buffer],
    );
  } catch (caught) {
    post({
      type: "error",
      message:
        caught instanceof Error
          ? caught.message
          : "Landmark worker detect failed.",
    });
  } finally {
    try {
      bitmap.close();
    } catch {
      // Bitmap may already be closed after a failed transfer.
    }
  }
}

addEventListener("message", (event: MessageEvent<LandmarkWorkerRequest>) => {
  void onRequest(event.data).catch((caught) => {
    post({
      type: "error",
      message:
        caught instanceof Error
          ? caught.message
          : "Landmark worker failed.",
    });
  });
});
