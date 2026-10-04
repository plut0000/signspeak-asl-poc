"use client";

import { POS_DIM } from "@/lib/asl-citizen";
import {
  approachPackedFrame,
  CHIP_UPDATE_MS,
  describeDetectReadout,
  describeOverlayStatus,
  drawLandmarkOverlay,
  frameAtPlaybackTime,
  landmarkSmoothAlpha,
  overlayStatusFromFrame,
  resizeOverlayCanvas,
  type DetectReadout,
  type PackedPlayback,
} from "@/lib/landmark-overlay";
import { cn } from "@/lib/utils";
import { useEffect, useRef, type RefObject } from "react";

function noLiveFrame() {
  return null;
}

const SHOW_DEV_FPS = process.env.NODE_ENV !== "production";

type LandmarkOverlayProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  getLiveFrame?: () => Float32Array | null;
  getPerfStats?: () => DetectReadout;
  playback?: PackedPlayback | null;
  mirrored?: boolean;
  /** Camera or clip is on screen. */
  active: boolean;
  /** User toggle: draw the skeleton. Status chip still updates. */
  draw: boolean;
};

export function LandmarkOverlay({
  videoRef,
  getLiveFrame = noLiveFrame,
  getPerfStats,
  playback = null,
  mirrored = true,
  active,
  draw,
}: LandmarkOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const chipRef = useRef<HTMLSpanElement>(null);
  const fpsRef = useRef<HTMLSpanElement>(null);
  const getLiveFrameRef = useRef(getLiveFrame);
  const getPerfStatsRef = useRef(getPerfStats);
  const playbackRef = useRef(playback);
  const drawRef = useRef(draw);

  useEffect(() => {
    getLiveFrameRef.current = getLiveFrame;
    getPerfStatsRef.current = getPerfStats;
    playbackRef.current = playback;
    drawRef.current = draw;
  }, [draw, getLiveFrame, getPerfStats, playback]);

  useEffect(() => {
    if (!active) {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current ?? canvas?.getContext("2d");
      if (canvas && ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      ctxRef.current = null;
      return;
    }

    let raf = 0;
    let lastChip = "";
    let lastChipAt = 0;
    let lastFpsAt = 0;
    let lastDrawAt = 0;
    let draws = 0;
    let drawWindowStart = 0;
    const drawn = new Float32Array(POS_DIM);
    const target = new Float32Array(POS_DIM);

    const tick = (now: number) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas && video) {
        let ctx = ctxRef.current;
        if (!ctx || ctx.canvas !== canvas) {
          ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
          ctxRef.current = ctx;
        }
        if (ctx) {
          const { width, height, dpr } = resizeOverlayCanvas(canvas);
          const clip = playbackRef.current;
          const latest =
            clip && clip.frames > 0
              ? frameAtPlaybackTime(clip, video.currentTime, video.duration)
              : getLiveFrameRef.current();
          const live = !clip || clip.frames <= 0;
          let frame = latest;
          if (live && latest) {
            target.set(latest);
            const alpha = landmarkSmoothAlpha(now - lastDrawAt);
            approachPackedFrame(drawn, target, alpha);
            frame = drawn;
          } else if (live) {
            drawn.fill(0);
          }
          lastDrawAt = now;
          if (drawRef.current && (clip == null || clip.frames > 0)) {
            drawLandmarkOverlay(ctx, frame, video, width, height, dpr);
          } else {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, width, height);
          }
          if (now - lastChipAt >= CHIP_UPDATE_MS) {
            lastChipAt = now;
            const text = describeOverlayStatus(overlayStatusFromFrame(latest));
            if (chipRef.current && text !== lastChip) {
              lastChip = text;
              chipRef.current.textContent = text;
            }
          }
          if (SHOW_DEV_FPS) {
            draws += 1;
            if (!drawWindowStart) drawWindowStart = now;
            if (now - lastFpsAt >= CHIP_UPDATE_MS) {
              lastFpsAt = now;
              const elapsed = Math.max(now - drawWindowStart, 1);
              const drawFps = (draws * 1000) / elapsed;
              if (elapsed >= 1000) {
                draws = 0;
                drawWindowStart = now;
              }
              const detect = getPerfStatsRef.current?.() ?? {
                detectFps: 0,
                detectMs: 0,
              };
              if (fpsRef.current) {
                fpsRef.current.textContent = `${Math.round(drawFps)} draw · ${describeDetectReadout(detect)}`;
              }
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, videoRef]);

  if (!active) return null;

  return (
    <>
      <canvas
        ref={canvasRef}
        className={cn(
          "pointer-events-none absolute inset-0 z-10 size-full",
          mirrored && "-scale-x-100",
        )}
        aria-hidden="true"
      />
      <span
        ref={chipRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none absolute top-2 left-2 z-20 rounded-full bg-background/85 px-2.5 py-1 text-[0.7rem] font-medium text-foreground shadow-sm ring-1 ring-foreground/10"
      >
        Hands: 0 · Body: not tracked
      </span>
      {SHOW_DEV_FPS ? (
        <span
          ref={fpsRef}
          className="pointer-events-none absolute top-2 right-2 z-20 rounded-full bg-background/85 px-2.5 py-1 font-mono text-[0.65rem] text-muted-foreground shadow-sm ring-1 ring-foreground/10"
        >
          — draw · — det
        </span>
      ) : null}
    </>
  );
}
