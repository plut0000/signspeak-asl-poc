import {
  packLandmarkSample,
  type LandmarkSample,
} from "@/lib/pack-landmark-sample";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export type DelegateKind = "GPU" | "CPU";

export type LandmarkDelegates = {
  pose: DelegateKind;
  hands: DelegateKind;
};

export type LandmarkDetectSource =
  | HTMLVideoElement
  | HTMLCanvasElement
  | OffscreenCanvas
  | ImageBitmap;

type VisionModule = typeof import("@mediapipe/tasks-vision");
type PoseLandmarker = Awaited<
  ReturnType<VisionModule["PoseLandmarker"]["createFromOptions"]>
>;
type HandLandmarker = Awaited<
  ReturnType<VisionModule["HandLandmarker"]["createFromOptions"]>
>;

export type LandmarkRuntime = {
  pose: PoseLandmarker;
  hands: HandLandmarker;
  delegates: LandmarkDelegates;
};

export function nextLandmarkTimestamp(nowMs: number, lastTimestamp: number) {
  const now = Number.isFinite(nowMs) ? nowMs : lastTimestamp + 1;
  return now <= lastTimestamp ? lastTimestamp + 1 : now;
}

export function detectLandmarkSample(
  runtime: LandmarkRuntime,
  source: LandmarkDetectSource,
  timestamp: number,
): LandmarkSample | null {
  if (!sourceReady(source)) return null;

  const poseResult = runtime.pose.detectForVideo(source, timestamp);
  const handResult = runtime.hands.detectForVideo(source, timestamp);
  const handedness = handResult.handedness ?? handResult.handednesses ?? [];
  return packLandmarkSample(
    poseResult.landmarks[0],
    handResult.landmarks ?? [],
    handedness,
  );
}

export async function createLandmarkRuntime(): Promise<LandmarkRuntime> {
  const vision = await import("@mediapipe/tasks-vision");
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);

  const pose = await createWithDelegate((delegate) =>
    vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate },
      canvas: createGlCanvas(),
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.4,
      minPosePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    }),
  );

  const hands = await createWithDelegate((delegate) =>
    vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate },
      canvas: createGlCanvas(),
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    }),
  );

  const runtime: LandmarkRuntime = {
    pose: pose.instance,
    hands: hands.instance,
    delegates: { pose: pose.delegate, hands: hands.delegate },
  };

  try {
    detectLandmarkSample(runtime, createWarmupSource(), 1);
  } catch {
    // First-frame compile can throw; VIDEO timestamps stay usable after a reset.
  }

  return runtime;
}

async function createWithDelegate<T>(
  factory: (delegate: DelegateKind) => Promise<T>,
): Promise<{ instance: T; delegate: DelegateKind }> {
  try {
    return { instance: await factory("GPU"), delegate: "GPU" };
  } catch {
    return { instance: await factory("CPU"), delegate: "CPU" };
  }
}

function createGlCanvas(): HTMLCanvasElement | OffscreenCanvas | undefined {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(256, 256);
  }
  if (typeof document !== "undefined") {
    return document.createElement("canvas");
  }
  return undefined;
}

function createWarmupSource(): LandmarkDetectSource {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(64, 64);
  }
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  return canvas;
}

function sourceReady(source: LandmarkDetectSource) {
  if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
    return source.readyState >= 2 && source.videoWidth >= 8 && source.videoHeight >= 8;
  }
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    return source.width >= 8 && source.height >= 8;
  }
  return "width" in source && source.width >= 8 && source.height >= 8;
}
