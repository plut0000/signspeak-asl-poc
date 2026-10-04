"use client";

import {
  describeOverlayStatus,
  drawLandmarkOverlay,
  frameAtPlaybackTime,
  overlayStatusFromFrame,
  resizeOverlayCanvas,
  type PackedPlayback,
} from "@/lib/landmark-overlay";
import { cn } from "@/lib/utils";
import { useEffect, useRef, type RefObject } from "react";

function noLiveFrame() {
  return null;
}

type LandmarkOverlayProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  getLiveFrame?: () => Float32Array | null;
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
  playback = null,
  mirrored = true,
  active,
  draw,
}: LandmarkOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chipRef = useRef<HTMLSpanElement>(null);
  const getLiveFrameRef = useRef(getLiveFrame);
  const playbackRef = useRef(playback);
  const drawRef = useRef(draw);

  getLiveFrameRef.current = getLiveFrame;
  playbackRef.current = playback;
  drawRef.current = draw;

  useEffect(() => {
    if (!active) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    let raf = 0;
    let lastChip = "";

    const tick = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const ctx = canvas?.getContext("2d", { alpha: true });
      if (canvas && video && ctx) {
        const { width, height, dpr } = resizeOverlayCanvas(canvas);
        const clip = playbackRef.current;
        const frame =
          clip && clip.frames > 0
            ? frameAtPlaybackTime(clip, video.currentTime, video.duration)
            : getLiveFrameRef.current();
        if (drawRef.current && (clip == null || clip.frames > 0)) {
          drawLandmarkOverlay(ctx, frame, video, width, height, dpr);
        } else {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, width, height);
        }
        const text = describeOverlayStatus(overlayStatusFromFrame(frame));
        if (chipRef.current && text !== lastChip) {
          lastChip = text;
          chipRef.current.textContent = text;
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
    </>
  );
}
