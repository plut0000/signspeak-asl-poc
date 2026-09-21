"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCamera } from "@/hooks/use-camera";
import { useLandmarkTracker } from "@/hooks/use-landmark-tracker";
import { useSpeech } from "@/hooks/use-speech";
import {
  extensionForMime,
  LONG_CLIP_HINT_MS,
  MIN_RECORD_MS,
  pickRecorderMimeType,
  RECORD_SECONDS,
  videoOnlyStream,
} from "@/lib/media";
import {
  DEDICATED_MODEL_LABEL,
  friendlyVocabList,
} from "@/lib/asl-citizen";
import type {
  AppMode,
  InterpretFailure,
  InterpretSuccess,
} from "@/lib/types";
import {
  AlertCircle,
  Camera,
  CircleStop,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type SessionStatus = "idle" | "recording" | "processing" | "done" | "error";

const VOCAB_HINT = friendlyVocabList().join(", ");

export function SignStudio({ mode }: { mode: AppMode }) {
  const { videoRef, streamRef, status: cameraStatus, error: cameraError, start } =
    useCamera();
  const {
    speaking,
    error: speechError,
    speak,
    stop: stopSpeech,
  } = useSpeech();
  const {
    status: trackerStatus,
    prepare: prepareLandmarks,
    start: startLandmarks,
    stop: stopLandmarks,
  } = useLandmarkTracker();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const autoStopRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const [secondsLeft, setSecondsLeft] = useState(RECORD_SECONDS);
  const [session, setSession] = useState<SessionStatus>("idle");
  const [result, setResult] = useState<InterpretSuccess | null>(null);
  const [error, setError] = useState("");
  const [processingLongClip, setProcessingLongClip] = useState(false);

  const clearTimers = useCallback(() => {
    if (autoStopRef.current) window.clearTimeout(autoStopRef.current);
    if (tickRef.current) window.clearInterval(tickRef.current);
    autoStopRef.current = null;
    tickRef.current = null;
  }, []);

  const resetOutput = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    stopSpeech();
    setResult(null);
    setError("");
    setSession("idle");
    setProcessingLongClip(false);
  }, [stopSpeech]);

  const interpretClip = useCallback(
    async (
      blob: Blob,
      capture: ReturnType<typeof stopLandmarks>,
      durationMs: number,
    ) => {
      setSession("processing");
      setProcessingLongClip(durationMs > LONG_CLIP_HINT_MS);
      setError("");
      const form = new FormData();
      const mimeType = blob.type || "video/webm";
      form.append("video", blob, `signing.${extensionForMime(mimeType)}`);
      form.append("durationMs", String(durationMs));
      if (capture.frames > 0) {
        const landmarkBytes = new ArrayBuffer(capture.packed.byteLength);
        new Uint8Array(landmarkBytes).set(
          new Uint8Array(
            capture.packed.buffer,
            capture.packed.byteOffset,
            capture.packed.byteLength,
          ),
        );
        form.append(
          "landmarks",
          new Blob([landmarkBytes], { type: "application/octet-stream" }),
          "landmarks.bin",
        );
        form.append("landmarkFrames", String(capture.frames));
        form.append("poseFrames", String(capture.poseFrames));
        form.append("handFrames", String(capture.handFrames));
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/interpret", {
          method: "POST",
          body: form,
          signal: controller.signal,
        });
        const payload = (await response.json()) as
          | InterpretSuccess
          | InterpretFailure;

        if (!response.ok || "error" in payload) {
          const message =
            "error" in payload
              ? payload.error
              : "Translation failed. Please try again.";
          setSession("error");
          setError(message);
          return;
        }

        setResult(payload);
        setSession("done");
        speak(payload.english);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        setSession("error");
        setError("Could not reach the translation service. Check that the app is running.");
      }
    },
    [speak],
  );

  const stopRecording = useCallback(() => {
    clearTimers();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, [clearTimers]);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || cameraStatus !== "ready") return;
    if (typeof MediaRecorder === "undefined") {
      setSession("error");
      setError("This browser cannot record video. Try Chrome or Edge on desktop.");
      return;
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.resume();
    }

    const mimeType = pickRecorderMimeType();
    resetOutput();
    chunksRef.current = [];
    startedAtRef.current = Date.now();
    setSecondsLeft(RECORD_SECONDS);
    setProcessingLongClip(false);

    const recordStream = videoOnlyStream(stream);

    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(recordStream, {
            mimeType,
            videoBitsPerSecond: 900_000,
          })
        : new MediaRecorder(recordStream, { videoBitsPerSecond: 900_000 });
    } catch {
      setSession("error");
      setError("Could not start the recorder in this browser.");
      return;
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onerror = () => {
      clearTimers();
      setSession("error");
      setError("Recording failed. Please try again.");
    };

    recorder.onstop = () => {
      clearTimers();
      recorderRef.current = null;
      const capture = stopLandmarks();
      const elapsed = Date.now() - startedAtRef.current;
      if (elapsed < MIN_RECORD_MS) {
        setSession("error");
        setError("That clip was too short. Sign for a couple of seconds, then stop.");
        return;
      }
      const type = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      void interpretClip(blob, capture, elapsed);
    };

    recorderRef.current = recorder;
    recorder.start();
    startLandmarks(videoRef.current);
    setSession("recording");

    tickRef.current = window.setInterval(() => {
      setSecondsLeft((value) => Math.max(0, value - 1));
    }, 1000);

    autoStopRef.current = window.setTimeout(() => {
      stopRecording();
    }, RECORD_SECONDS * 1000);
  }, [
    cameraStatus,
    clearTimers,
    interpretClip,
    resetOutput,
    startLandmarks,
    stopLandmarks,
    stopRecording,
    streamRef,
    videoRef,
  ]);

  useEffect(() => {
    if (cameraStatus === "ready") {
      void prepareLandmarks();
    }
  }, [cameraStatus, prepareLandmarks]);

  useEffect(() => {
    return () => {
      clearTimers();
      stopLandmarks();
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    };
  }, [clearTimers, stopLandmarks]);

  const busy = session === "recording" || session === "processing";
  const cameraReady = cameraStatus === "ready";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      {mode === "mock" ? (
        <Alert className="border-primary/30 bg-primary/8 lg:col-span-2">
          <Sparkles />
          <AlertTitle>Mock translation is on</AlertTitle>
          <AlertDescription>
            No Gemini API key is configured. A confident dedicated-model gloss
            still becomes dictionary English; the Gemini video path returns a
            sample sentence. Add{" "}
            <code className="rounded bg-background/60 px-1 py-0.5 font-mono text-xs">
              GEMINI_API_KEY
            </code>{" "}
            in <span className="font-medium text-foreground">.env.local</span>{" "}
            for live ASL interpretation.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="overflow-hidden bg-card/80">
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Camera</CardTitle>
              <CardDescription>
                Face the camera, sign a short phrase, then stop. Recording
                auto-stops after {RECORD_SECONDS} seconds.
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-1">
              {session === "recording" ? (
                <Badge variant="destructive" className="h-6 gap-1.5">
                  <span className="record-dot size-1.5 rounded-full bg-current" />
                  Recording {secondsLeft}s
                </Badge>
              ) : cameraReady ? (
                <Badge variant="secondary">Live preview</Badge>
              ) : null}
              {trackerStatus === "ready" || trackerStatus === "sampling" ? (
                <Badge variant="outline" className="h-6">
                  Landmarks ready
                </Badge>
              ) : trackerStatus === "loading" ? (
                <Badge variant="outline" className="h-6">
                  Loading landmarks…
                </Badge>
              ) : null}
              <Badge variant="outline" className="h-6 border-primary/30 text-primary">
                {DEDICATED_MODEL_LABEL}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative overflow-hidden rounded-xl bg-black ring-1 ring-foreground/10">
            <video
              ref={videoRef}
              className="aspect-4/3 h-auto w-full -scale-x-100 object-cover"
              playsInline
              muted
              autoPlay
              aria-label="Live webcam preview of your signing"
            />
            {!cameraReady ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 p-6 text-center">
                {cameraStatus === "requesting" ? (
                  <>
                    <LoaderCircle className="size-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">
                      Waiting for camera permission…
                    </p>
                  </>
                ) : (
                  <>
                    <Camera className="size-8 text-muted-foreground" />
                    <p className="max-w-sm text-sm text-muted-foreground">
                      {cameraError || "Enable the camera to start signing."}
                    </p>
                    <Button onClick={() => void start()} size="lg">
                      Enable camera
                    </Button>
                  </>
                )}
              </div>
            ) : null}
            {session === "processing" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70">
                <LoaderCircle className="size-7 animate-spin text-primary" />
                <p className="text-sm font-medium">
                  {processingLongClip
                    ? "Translating the signed song or phrase…"
                    : "Reading the signing…"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {processingLongClip
                    ? "Long clips use Gemini on silent video — this can take a few seconds"
                    : "Short isolated signs use the dedicated model; longer clips use Gemini video"}
                </p>
              </div>
            ) : null}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Preview is mirrored so it feels like a mirror. Landmarks and Gemini
            use the unmirrored camera stream. Sign one isolated vocab sign for
            the dedicated model. Songs, conversation, and other long clips skip
            that model and use Gemini video.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-2 sm:flex-row">
          {session === "recording" ? (
            <Button
              size="lg"
              variant="destructive"
              className="h-12 w-full flex-1 text-base"
              onClick={stopRecording}
            >
              <CircleStop data-icon="inline-start" />
              Stop signing
            </Button>
          ) : (
            <Button
              size="lg"
              className="h-12 w-full flex-1 text-base"
              onClick={startRecording}
              disabled={!cameraReady || busy}
            >
              <Camera data-icon="inline-start" />
              Start signing
            </Button>
          )}
          <Button
            size="lg"
            variant="outline"
            className="h-12 w-full sm:w-auto"
            onClick={resetOutput}
            disabled={busy}
          >
            <RotateCcw data-icon="inline-start" />
            Clear
          </Button>
        </CardFooter>
      </Card>

      <Card className="bg-card/80">
        <CardHeader className="border-b">
          <CardTitle>English translation</CardTitle>
          <CardDescription>
            After you stop, the English text appears here and is spoken aloud.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-56 flex-1 flex-col gap-4">
          <div
            className="flex flex-1 flex-col justify-center rounded-xl bg-muted/40 p-5 ring-1 ring-foreground/8"
            aria-live="assertive"
            aria-atomic="true"
          >
            {session === "processing" ? (
              <div className="space-y-3">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-4/5" />
              </div>
            ) : result ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {result.source === "dedicated" ? (
                    <>
                      <Badge>Dedicated model</Badge>
                      <Badge variant="outline">{DEDICATED_MODEL_LABEL}</Badge>
                    </>
                  ) : result.mock ? (
                    <Badge variant="outline">Mock sample</Badge>
                  ) : (
                    <Badge variant="secondary">Gemini video</Badge>
                  )}
                  {result.mock && result.source === "dedicated" ? (
                    <Badge variant="outline">Dictionary English</Badge>
                  ) : null}
                  {result.unclear ? (
                    <Badge variant="secondary">Signing unclear</Badge>
                  ) : null}
                </div>
                {result.glossLabel || result.gloss ? (
                  <p className="text-sm text-muted-foreground">
                    Gloss{" "}
                    <span className="font-medium text-foreground">
                      {result.glossLabel || result.gloss}
                    </span>
                    {typeof result.confidence === "number"
                      ? ` · ${(result.confidence * 100).toFixed(0)}% confidence`
                      : null}
                  </p>
                ) : result.dedicatedTop ? (
                  <p className="text-sm text-muted-foreground">
                    Dedicated model was unsure
                    {result.dedicatedTop.glossLabel
                      ? ` (${result.dedicatedTop.glossLabel} ${(result.dedicatedTop.confidence * 100).toFixed(0)}%)`
                      : null}
                    {result.fallbackReason ? ` — ${result.fallbackReason}` : ""}
                  </p>
                ) : result.fallbackReason ? (
                  <p className="text-sm text-muted-foreground">
                    {result.fallbackReason}
                  </p>
                ) : null}
                <p className="font-heading text-2xl leading-snug font-medium tracking-tight sm:text-3xl">
                  {result.english}
                </p>
                {result.unclear && result.reason ? (
                  <p className="text-sm text-muted-foreground">{result.reason}</p>
                ) : null}
              </div>
            ) : session === "error" ? (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>Could not translate</AlertTitle>
                <AlertDescription>
                  {error}
                  {/busy|rate-limited|try again/i.test(error)
                    ? null
                    : " You can tap Sign again."}
                </AlertDescription>
              </Alert>
            ) : (
              <p className="text-sm text-muted-foreground">
                Try an isolated vocab sign from the 100-word list: {VOCAB_HINT}.
              </p>
            )}
          </div>

          {speechError ? (
            <p className="text-sm text-destructive">{speechError}</p>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-col gap-2 sm:flex-row">
          <Button
            size="lg"
            className="h-12 w-full flex-1 text-base"
            onClick={() => result && speak(result.english)}
            disabled={!result || speaking}
          >
            <Volume2 data-icon="inline-start" />
            {speaking ? "Speaking…" : "Replay voice"}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 w-full sm:w-auto"
            onClick={startRecording}
            disabled={!cameraReady || busy}
          >
            Sign again
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
