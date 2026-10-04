"use client";

import {
  createLandmarkRuntime,
  detectLandmarkSample,
  nextLandmarkTimestamp,
  type LandmarkDetectSource,
  type LandmarkRuntime,
} from "@/lib/landmark-runtime";

export type { LandmarkSample } from "@/lib/pack-landmark-sample";
export type { LandmarkDelegates, LandmarkRuntime } from "@/lib/landmark-runtime";

export type LandmarkCapture = {
  packed: Float32Array;
  frames: number;
  poseFrames: number;
  handFrames: number;
};

export type LandmarkSource = HTMLVideoElement | HTMLCanvasElement;

let loadPromise: Promise<LandmarkRuntime> | null = null;
let lastTimestamp = -1;

export async function prepareLandmarkTrackers() {
  if (!loadPromise) {
    loadPromise = createLandmarkRuntime().catch((error) => {
      loadPromise = null;
      throw error;
    });
  }
  return loadPromise;
}

export function sampleLandmarkFrame(
  runtime: LandmarkRuntime,
  source: LandmarkDetectSource,
  timestamp?: number,
) {
  const now = timestamp ?? performance.now();
  const next = nextLandmarkTimestamp(now, lastTimestamp);
  lastTimestamp = next;
  return detectLandmarkSample(runtime, source, next);
}

export function resetLandmarkClock() {
  lastTimestamp = -1;
}
