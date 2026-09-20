"use client";

import { POS_DIM } from "@/lib/asl-citizen";
import {
  prepareLandmarkTrackers,
  resetLandmarkClock,
  sampleLandmarkFrame,
  type LandmarkCapture,
} from "@/lib/mediapipe-landmarks";
import { useCallback, useRef, useState } from "react";

type TrackerStatus = "idle" | "loading" | "ready" | "error" | "sampling";

const SAMPLE_MS = 66;

export function useLandmarkTracker() {
  const landmarkersRef = useRef<Awaited<
    ReturnType<typeof prepareLandmarkTrackers>
  > | null>(null);
  const framesRef = useRef<Float32Array[]>([]);
  const poseFramesRef = useRef(0);
  const handFramesRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastSampleRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [status, setStatus] = useState<TrackerStatus>("idle");
  const [error, setError] = useState("");

  const prepare = useCallback(async () => {
    if (landmarkersRef.current) {
      setStatus((current) => (current === "sampling" ? current : "ready"));
      return true;
    }
    setStatus("loading");
    setError("");
    try {
      landmarkersRef.current = await prepareLandmarkTrackers();
      setStatus("ready");
      return true;
    } catch (caught) {
      setStatus("error");
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not start MediaPipe landmark tracking.",
      );
      return false;
    }
  }, []);

  const stop = useCallback((): LandmarkCapture => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    videoRef.current = null;
    const frames = framesRef.current;
    const packed = new Float32Array(frames.length * POS_DIM);
    frames.forEach((frame, index) => packed.set(frame, index * POS_DIM));
    const capture: LandmarkCapture = {
      packed,
      frames: frames.length,
      poseFrames: poseFramesRef.current,
      handFrames: handFramesRef.current,
    };
    framesRef.current = [];
    poseFramesRef.current = 0;
    handFramesRef.current = 0;
    setStatus(landmarkersRef.current ? "ready" : "idle");
    return capture;
  }, []);

  const start = useCallback(
    (video: HTMLVideoElement | null) => {
      if (!video || !landmarkersRef.current) return false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      framesRef.current = [];
      poseFramesRef.current = 0;
      handFramesRef.current = 0;
      lastSampleRef.current = 0;
      videoRef.current = video;
      resetLandmarkClock();
      setStatus("sampling");

      const tick = () => {
        const landmarkers = landmarkersRef.current;
        const currentVideo = videoRef.current;
        if (!landmarkers || !currentVideo) return;
        const now = performance.now();
        if (now - lastSampleRef.current >= SAMPLE_MS) {
          lastSampleRef.current = now;
          const sample = sampleLandmarkFrame(landmarkers, currentVideo);
          if (sample) {
            framesRef.current.push(sample.frame);
            if (sample.hasPose) poseFramesRef.current += 1;
            if (sample.hasHand) handFramesRef.current += 1;
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return true;
    },
    [],
  );

  return { status, error, prepare, start, stop };
}
