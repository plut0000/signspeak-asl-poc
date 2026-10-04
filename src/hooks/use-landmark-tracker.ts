"use client";

import { liveHandCoverageIsLow, POS_DIM } from "@/lib/asl-citizen";
import {
  DETECT_YIELD_MS,
  nextDetectDelay,
  PREVIEW_DETECT_MAX_WIDTH,
  PREVIEW_SAMPLE_MS,
  RECORD_SAMPLE_MS,
  type OverlayStatus,
} from "@/lib/landmark-overlay";
import {
  prepareLandmarkTrackers,
  resetLandmarkClock,
  sampleLandmarkFrame,
  type LandmarkCapture,
  type LandmarkSource,
} from "@/lib/mediapipe-landmarks";
import { useCallback, useRef, useState } from "react";

type TrackerStatus = "idle" | "loading" | "ready" | "error" | "sampling";

const COVERAGE_PUBLISH_MS = 300;
const PERF_WINDOW_MS = 1000;

export type LandmarkPerf = {
  detectFps: number;
  detectMs: number;
};

export function useLandmarkTracker() {
  const landmarkersRef = useRef<Awaited<
    ReturnType<typeof prepareLandmarkTrackers>
  > | null>(null);
  const framesRef = useRef<Float32Array[]>([]);
  const poseFramesRef = useRef(0);
  const handFramesRef = useRef(0);
  const attemptsRef = useRef(0);
  const detectTimerRef = useRef<number | null>(null);
  const detectingRef = useRef(false);
  const lastCoveragePublishRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const capturingRef = useRef(false);
  const latestFrameRef = useRef<Float32Array | null>(null);
  const overlayFrameRef = useRef(new Float32Array(POS_DIM));
  const latestStatusRef = useRef<OverlayStatus>({ hands: 0, body: false });
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const perfRef = useRef({
    detectFps: 0,
    detectMs: 0,
    count: 0,
    sumMs: 0,
    windowStart: 0,
  });

  const [status, setStatus] = useState<TrackerStatus>("idle");
  const [error, setError] = useState("");
  const [lowHandCoverage, setLowHandCoverage] = useState(false);

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

  const getLatestFrame = useCallback(() => latestFrameRef.current, []);

  const getLatestStatus = useCallback(
    (): OverlayStatus => latestStatusRef.current,
    [],
  );

  const getPerfStats = useCallback((): LandmarkPerf => {
    const perf = perfRef.current;
    return { detectFps: perf.detectFps, detectMs: perf.detectMs };
  }, []);

  const publishCoverage = useCallback((now: number) => {
    if (now - lastCoveragePublishRef.current < COVERAGE_PUBLISH_MS) return;
    lastCoveragePublishRef.current = now;
    const observedFrames = Math.max(
      framesRef.current.length,
      attemptsRef.current,
    );
    const low = liveHandCoverageIsLow(observedFrames, handFramesRef.current);
    setLowHandCoverage((current) => (current === low ? current : low));
  }, []);

  const noteDetect = (elapsedMs: number) => {
    const perf = perfRef.current;
    const now = performance.now();
    if (!perf.windowStart) perf.windowStart = now;
    perf.count += 1;
    perf.sumMs += elapsedMs;
    if (now - perf.windowStart >= PERF_WINDOW_MS) {
      perf.detectFps = perf.count / ((now - perf.windowStart) / 1000);
      perf.detectMs = perf.count ? perf.sumMs / perf.count : 0;
      perf.count = 0;
      perf.sumMs = 0;
      perf.windowStart = now;
    }
  };

  const previewSource = (video: HTMLVideoElement): LandmarkSource => {
    if (capturingRef.current) return video;
    if (video.videoWidth < 8 || video.videoHeight < 8) return video;
    let canvas = previewCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      previewCanvasRef.current = canvas;
      previewCtxRef.current = canvas.getContext("2d", {
        alpha: false,
        desynchronized: true,
      });
    }
    const ctx = previewCtxRef.current;
    if (!ctx) return video;
    const scale = Math.min(1, PREVIEW_DETECT_MAX_WIDTH / video.videoWidth);
    const width = Math.max(8, Math.round(video.videoWidth * scale));
    const height = Math.max(8, Math.round(video.videoHeight * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    ctx.drawImage(video, 0, 0, width, height);
    return canvas;
  };

  const applySample = (sample: ReturnType<typeof sampleLandmarkFrame>) => {
    if (!sample) {
      latestFrameRef.current = null;
      latestStatusRef.current = { hands: 0, body: false };
      return;
    }
    const dest = overlayFrameRef.current;
    dest.set(sample.frame);
    latestFrameRef.current = dest;
    latestStatusRef.current = {
      hands: Number(sample.leftHand) + Number(sample.rightHand),
      body: sample.hasPose,
    };
    if (capturingRef.current) {
      framesRef.current.push(sample.frame);
      if (sample.hasPose) poseFramesRef.current += 1;
      if (sample.hasHand) handFramesRef.current += 1;
    }
  };

  const watch = useCallback(
    (video: HTMLVideoElement | null) => {
      if (!video || !landmarkersRef.current) return false;
      videoRef.current = video;
      if (detectTimerRef.current != null) return true;

      const tick = () => {
        const landmarkers = landmarkersRef.current;
        const currentVideo = videoRef.current;
        if (!landmarkers || !currentVideo) {
          detectTimerRef.current = null;
          return;
        }
        if (detectingRef.current) {
          detectTimerRef.current = window.setTimeout(tick, DETECT_YIELD_MS);
          return;
        }

        detectingRef.current = true;
        const started = performance.now();
        try {
          if (capturingRef.current) attemptsRef.current += 1;
          const sample = sampleLandmarkFrame(
            landmarkers,
            previewSource(currentVideo),
          );
          applySample(sample);
        } catch {
          // One bad frame should not stop the live overlay or coverage hint.
        } finally {
          detectingRef.current = false;
        }
        const elapsed = performance.now() - started;
        noteDetect(elapsed);
        if (capturingRef.current) publishCoverage(performance.now());
        const budget = capturingRef.current
          ? RECORD_SAMPLE_MS
          : PREVIEW_SAMPLE_MS;
        detectTimerRef.current = window.setTimeout(
          tick,
          nextDetectDelay(elapsed, budget),
        );
      };

      detectTimerRef.current = window.setTimeout(tick, 0);
      return true;
    },
    [publishCoverage],
  );

  const stop = useCallback((options?: { disconnect?: boolean }): LandmarkCapture => {
    capturingRef.current = false;
    if (options?.disconnect) {
      if (detectTimerRef.current != null) {
        window.clearTimeout(detectTimerRef.current);
        detectTimerRef.current = null;
      }
      detectingRef.current = false;
      videoRef.current = null;
      latestFrameRef.current = null;
      latestStatusRef.current = { hands: 0, body: false };
    }
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
    attemptsRef.current = 0;
    lastCoveragePublishRef.current = 0;
    setLowHandCoverage(false);
    setStatus(landmarkersRef.current ? "ready" : "idle");
    return capture;
  }, []);

  const start = useCallback(
    (video: HTMLVideoElement | null) => {
      if (!video || !landmarkersRef.current) return false;
      framesRef.current = [];
      poseFramesRef.current = 0;
      handFramesRef.current = 0;
      attemptsRef.current = 0;
      lastCoveragePublishRef.current = 0;
      capturingRef.current = true;
      setLowHandCoverage(false);
      setStatus("sampling");
      if (detectTimerRef.current == null) resetLandmarkClock();
      return watch(video);
    },
    [watch],
  );

  return {
    status,
    error,
    lowHandCoverage,
    prepare,
    watch,
    start,
    stop,
    getLatestFrame,
    getLatestStatus,
    getPerfStats,
  };
}
