"use client";

import {
  COORDS,
  HAND_LANDMARKS,
  LEFT_HAND_OFFSET,
  POSE_LANDMARKS,
  POS_DIM,
  RIGHT_HAND_OFFSET,
} from "@/lib/asl-citizen";

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

export function sampleLandmarkFrame(
  landmarkers: Landmarkers,
  video: HTMLVideoElement,
): { frame: Float32Array; hasPose: boolean; hasHand: boolean } | null {
  if (video.readyState < 2 || video.videoWidth < 8 || video.videoHeight < 8) {
    return null;
  }

  let timestamp = performance.now();
  if (timestamp <= lastTimestamp) timestamp = lastTimestamp + 1;
  lastTimestamp = timestamp;

  const poseResult = landmarkers.pose.detectForVideo(video, timestamp);
  const handResult = landmarkers.hands.detectForVideo(video, timestamp);
  const pose = poseResult.landmarks[0];
  if (!pose || pose.length < POSE_LANDMARKS) {
    return null;
  }

  const frame = new Float32Array(POS_DIM);
  writeLandmarks(frame, 0, pose, POSE_LANDMARKS);

  let hasHand = false;
  const hands = handResult.landmarks ?? [];
  const handedness = handResult.handedness ?? handResult.handednesses ?? [];
  for (let i = 0; i < hands.length; i++) {
    const label = handedness[i]?.[0]?.categoryName ?? "";
    const offset =
      label.toLowerCase() === "left" ? LEFT_HAND_OFFSET : RIGHT_HAND_OFFSET;
    if (writeLandmarks(frame, offset, hands[i], HAND_LANDMARKS)) {
      hasHand = true;
    }
  }

  return { frame, hasPose: true, hasHand };
}

export function resetLandmarkClock() {
  lastTimestamp = -1;
}

function writeLandmarks(
  dest: Float32Array,
  jointOffset: number,
  points: Array<{ x: number; y: number; z?: number }>,
  count: number,
) {
  let wrote = false;
  for (let i = 0; i < count; i++) {
    const point = points[i];
    if (!point) continue;
    const off = (jointOffset + i) * COORDS;
    dest[off] = finiteOrZero(point.x);
    dest[off + 1] = finiteOrZero(point.y);
    dest[off + 2] = finiteOrZero(point.z);
    if (dest[off] !== 0 || dest[off + 1] !== 0 || dest[off + 2] !== 0) {
      wrote = true;
    }
  }
  return wrote;
}

function finiteOrZero(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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
