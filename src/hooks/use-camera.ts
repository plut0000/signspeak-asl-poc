"use client";

import { cameraErrorMessage } from "@/lib/media";
import { useCallback, useEffect, useRef, useState } from "react";

type CameraStatus = "idle" | "requesting" | "ready" | "denied" | "unsupported";

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState("");

  const attachStream = useCallback(async (stream: MediaStream) => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play().catch(() => {
      /* Autoplay can fail until a tap; preview still attaches. */
    });
  }, []);

  const start = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setError("This browser cannot access the camera.");
      return;
    }

    setStatus("requesting");
    setError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 960 },
          height: { ideal: 720 },
          frameRate: { ideal: 24, max: 30 },
        },
      });

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      await attachStream(stream);
      setStatus("ready");
    } catch (caught) {
      setStatus("denied");
      setError(cameraErrorMessage(caught));
    }
  }, [attachStream]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    // Browser cameras must be requested after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- getUserMedia is a mount-time subscription
    void start();
    return () => stop();
  }, [start, stop]);

  return {
    videoRef,
    streamRef,
    status,
    error,
    start,
  };
}
