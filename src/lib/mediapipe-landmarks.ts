"use client";

import {
  packLandmarkSample,
  type LandmarkSample,
} from "@/lib/pack-landmark-sample";

export type { LandmarkSample } from "@/lib/pack-landmark-sample";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export type LandmarkCapture = {
  packed: Float32Array;
  frames: number;
  poseFrames: number;
  handFrames: number;
};

type VisionModule = typeof import("@mediapipe/tasks-vision");
type PoseLandmarker = Awaited<
  ReturnType<VisionModule["PoseLandmarker"]["createFromOptions"]>
>;
type HandLandmarker = Awaited<
  ReturnType<VisionModule["HandLandmarker"]["createFromOptions"]>
>;

type Landmarkers = {
  pose: PoseLandmarker;
  hands: HandLandmarker;
};

let loadPromise: Promise<Landmarkers> | null = null;
let lastTimestamp = -1;

export async function prepareLandmarkTrackers() {
  if (!loadPromise) {
    loadPromise = createLandmarkers().catch((error) => {
      loadPromise = null;
      throw error;
    });
  }
  return loadPromise;
}

export type LandmarkSource = HTMLVideoElement | HTMLCanvasElement;

function sourceSize(source: LandmarkSource) {
  if (source instanceof HTMLVideoElement) {
    return {
      ready: source.readyState >= 2,
      width: source.videoWidth,
      height: source.videoHeight,
    };
  }
  return { ready: true, width: source.width, height: source.height };
}

export function sampleLandmarkFrame(
  landmarkers: Landmarkers,
  source: LandmarkSource,
): LandmarkSample | null {
  const size = sourceSize(source);
  if (!size.ready || size.width < 8 || size.height < 8) {
    return null;
  }

  let timestamp = performance.now();
  if (timestamp <= lastTimestamp) timestamp = lastTimestamp + 1;
  lastTimestamp = timestamp;

  const poseResult = landmarkers.pose.detectForVideo(source, timestamp);
  const handResult = landmarkers.hands.detectForVideo(source, timestamp);
  const handedness = handResult.handedness ?? handResult.handednesses ?? [];
  return packLandmarkSample(
    poseResult.landmarks[0],
    handResult.landmarks ?? [],
    handedness,
  );
}

export function resetLandmarkClock() {
  lastTimestamp = -1;
}

async function createLandmarkers(): Promise<Landmarkers> {
  const vision = await import("@mediapipe/tasks-vision");
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);

  const pose = await createWithDelegate(async (delegate) =>
    vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.4,
      minPosePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    }),
  );

  const hands = await createWithDelegate(async (delegate) =>
    vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    }),
  );

  const warmup = document.createElement("canvas");
  warmup.width = 64;
  warmup.height = 64;
  try {
    sampleLandmarkFrame({ pose, hands }, warmup);
  } catch {
    resetLandmarkClock();
  }

  return { pose, hands };
}

async function createWithDelegate<T>(
  factory: (delegate: "GPU" | "CPU") => Promise<T>,
) {
  try {
    return await factory("GPU");
  } catch {
    return factory("CPU");
  }
}
