"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LandmarkOverlay } from "@/components/landmark-overlay";
import { useCamera } from "@/hooks/use-camera";
import { useLandmarkTracker } from "@/hooks/use-landmark-tracker";
import { useShowTracking } from "@/hooks/use-show-tracking";
import { useSpeech } from "@/hooks/use-speech";
import type { PackedPlayback } from "@/lib/landmark-overlay";
import {
  CLIP_TOO_LARGE_ERROR,
  extensionForMime,
  LONG_CLIP_HINT_MS,
  MAX_VIDEO_BYTES,
  MIN_RECORD_MS,
  pickRecorderMimeType,
  RECORD_BITS_PER_SECOND,
  RECORD_SECONDS,
  videoOnlyStream,
} from "@/lib/media";
import { DEDICATED_MODEL_LABEL } from "@/lib/asl-citizen";
import {
  explainDedicatedSkip,
  userFacingInterpretError,
} from "@/lib/dedicated-skip-copy";
import type {
  AppMode,
  DedicatedTop,
  InterpretFailure,
  InterpretSuccess,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Camera,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type SessionStatus = "idle" | "recording" | "processing" | "done" | "error";

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
    lowHandCoverage,
    prepare: prepareLandmarks,
    watch: watchLandmarks,
    start: startLandmarks,
    stop: stopLandmarks,
    getLatestFrame,
    getPerfStats,
  } = useLandmarkTracker();
  const { showTracking, toggleShowTracking } = useShowTracking();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const autoStopRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const replayVideoRef = useRef<HTMLVideoElement | null>(null);
  const replayUrlRef = useRef("");

  const [secondsLeft, setSecondsLeft] = useState(RECORD_SECONDS);
  const [session, setSession] = useState<SessionStatus>("idle");
  const [result, setResult] = useState<InterpretSuccess | null>(null);
  const [error, setError] = useState("");
  const [skipNote, setSkipNote] = useState("");
  const [processingLongClip, setProcessingLongClip] = useState(false);
  /** Length of the last recorded clip, shown on the timeline after Stop. */
  const [clipMs, setClipMs] = useState(0);
  const [replayUrl, setReplayUrl] = useState("");
  const [replayLandmarks, setReplayLandmarks] = useState<PackedPlayback | null>(
    null,
  );

  const clearTimers = useCallback(() => {
    if (autoStopRef.current) window.clearTimeout(autoStopRef.current);
    if (tickRef.current) window.clearInterval(tickRef.current);
    autoStopRef.current = null;
    tickRef.current = null;
  }, []);

  const clearReplay = useCallback(() => {
    if (replayUrlRef.current) {
      URL.revokeObjectURL(replayUrlRef.current);
      replayUrlRef.current = "";
    }
    setReplayUrl("");
    setReplayLandmarks(null);
  }, []);

  const resetOutput = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    stopSpeech();
    setResult(null);
    setError("");
    setSkipNote("");
    setSession("idle");
    setProcessingLongClip(false);
    setClipMs(0);
    clearReplay();
  }, [clearReplay, stopSpeech]);

  const interpretClip = useCallback(
    async (
      blob: Blob,
      capture: ReturnType<typeof stopLandmarks>,
      durationMs: number,
    ) => {
      setSession("processing");
      setProcessingLongClip(durationMs > LONG_CLIP_HINT_MS);
      setError("");
      setSkipNote("");
      if (blob.size > MAX_VIDEO_BYTES) {
        setSession("error");
        setError(CLIP_TOO_LARGE_ERROR);
        return;
      }
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
          const failure = payload as InterpretFailure;
          const message =
            "error" in payload && failure.error
              ? failure.error
              : "Translation failed. Please try again.";
          setSession("error");
          setError(
            userFacingInterpretError({
              error: message,
              fallbackReason: failure.fallbackReason,
            }),
          );
          setSkipNote(
            explainDedicatedSkip({
              fallbackReason: failure.fallbackReason,
              dedicatedTop: failure.dedicatedTop,
            }) ?? "",
          );
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
        setSkipNote("");
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
            videoBitsPerSecond: RECORD_BITS_PER_SECOND,
          })
        : new MediaRecorder(recordStream, {
            videoBitsPerSecond: RECORD_BITS_PER_SECOND,
          });
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
      setClipMs(elapsed);
      if (elapsed < MIN_RECORD_MS) {
        setSession("error");
        setError("That clip was too short. Sign for a couple of seconds, then stop.");
        return;
      }
      const type = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      if (replayUrlRef.current) URL.revokeObjectURL(replayUrlRef.current);
      const url = URL.createObjectURL(blob);
      replayUrlRef.current = url;
      setReplayUrl(url);
      setReplayLandmarks(
        capture.frames > 0
          ? { packed: capture.packed, frames: capture.frames }
          : null,
      );
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
    if (cameraStatus !== "ready") return;
    let cancelled = false;
    void prepareLandmarks().then((ok) => {
      if (!cancelled && ok) watchLandmarks(videoRef.current);
    });
    return () => {
      cancelled = true;
    };
  }, [cameraStatus, prepareLandmarks, videoRef, watchLandmarks]);

  useEffect(() => {
    return () => {
      clearTimers();
      stopLandmarks({ disconnect: true });
      if (replayUrlRef.current) URL.revokeObjectURL(replayUrlRef.current);
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    };
  }, [clearTimers, stopLandmarks]);

  const busy = session === "recording" || session === "processing";
  const recording = session === "recording";
  const cameraReady = cameraStatus === "ready";
  const signSequence =
    result?.glosses && result.glosses.length > 1 ? result.glosses : null;
  const singleGloss: DedicatedTop | null =
    !signSequence && result && (result.glossLabel || result.gloss)
      ? {
          gloss: result.gloss ?? "",
          glossLabel: result.glossLabel || result.gloss || "",
          confidence: result.confidence ?? Number.NaN,
        }
      : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:gap-10">
        {/* On short laptop screens, shrink the camera so Start signing stays above the fold. */}
        <section
          aria-label="Camera"
          className="min-w-0 space-y-4 lg:max-w-[max(28rem,calc((100svh-23.5rem)*4/3))]"
        >
          <div
            className={cn(
              "relative overflow-hidden rounded-[1.25rem] bg-black ring-1 ring-rule transition-shadow motion-reduce:transition-none",
              recording && "ring-[3px] ring-record",
            )}
          >
            <video
              ref={videoRef}
              className="aspect-4/3 h-auto w-full -scale-x-100 object-cover"
              playsInline
              muted
              autoPlay
              aria-label="Live webcam preview of your signing"
            />
            <LandmarkOverlay
              videoRef={videoRef}
              getLiveFrame={getLatestFrame}
              getPerfStats={getPerfStats}
              mirrored
              active={cameraReady}
              draw={showTracking}
            />
            {!cameraReady ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-backdrop/90 p-6 text-center">
                {cameraStatus === "requesting" ? (
                  <>
                    <LoaderCircle className="size-6 animate-spin text-signal" aria-hidden="true" />
                    <p className="text-mist">Waiting for camera permission…</p>
                  </>
                ) : (
                  <>
                    <Camera className="size-8 text-mist" aria-hidden="true" />
                    <p className="max-w-sm text-mist">
                      {cameraError || "Turn on the camera to start signing."}
                    </p>
                    <Button
                      onClick={() => void start()}
                      size="lg"
                      className="h-11 rounded-full px-5 text-base font-bold"
                    >
                      Turn on camera
                    </Button>
                  </>
                )}
              </div>
            ) : null}
            {recording && lowHandCoverage ? (
              <p
                className="pointer-events-none absolute inset-x-3 bottom-3 z-20 mx-auto w-fit rounded-full bg-backdrop/90 px-4 py-2 text-center font-bold text-chalk ring-1 ring-signal/60"
                role="status"
              >
                Keep both hands in frame
              </p>
            ) : null}
            {session === "processing" ? (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-backdrop/80 p-6 text-center">
                <LoaderCircle className="size-7 animate-spin text-signal" aria-hidden="true" />
                <p className="font-bold text-chalk">
                  {processingLongClip
                    ? "Reading the signs in order…"
                    : "Reading the signing…"}
                </p>
                <p className="max-w-[44ch] text-sm text-mist">
                  {processingLongClip
                    ? "Long clips are split into single signs first; unclear ones use Gemini video, which can take a few seconds"
                    : "Short isolated signs use the dedicated model; longer clips are split into signs"}
                </p>
              </div>
            ) : null}
          </div>

          <ClipTimeline
            session={session}
            secondsLeft={secondsLeft}
            clipMs={clipMs}
          />

          <div className="flex flex-wrap items-center gap-x-3 gap-y-4">
            <Button
              size="lg"
              className={cn(
                "h-12 min-w-44 flex-1 rounded-full px-6 text-base font-bold sm:flex-none",
                recording &&
                  "bg-record text-backdrop hover:bg-record/85 focus-visible:ring-record/50",
              )}
              onClick={recording ? stopRecording : startRecording}
              disabled={!recording && (!cameraReady || busy)}
            >
              {recording ? (
                <span className="size-3 rounded-[3px] bg-backdrop" aria-hidden="true" />
              ) : (
                <span
                  className="size-3 rounded-full bg-record ring-2 ring-backdrop/80"
                  aria-hidden="true"
                />
              )}
              {recording ? "Stop signing" : "Start signing"}
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="h-12 rounded-full px-4 text-base text-chalk"
              onClick={resetOutput}
              disabled={busy}
            >
              <RotateCcw data-icon="inline-start" aria-hidden="true" />
              Clear
            </Button>
            <TrackingSwitch
              on={showTracking}
              onToggle={toggleShowTracking}
              className="ml-auto"
            />
          </div>

          <div className="space-y-2 border-t border-rule pt-4 text-sm leading-6 text-mist">
            <p className="flex flex-wrap gap-x-6 gap-y-1">
              <TrackerState status={trackerStatus} />
              <span>{DEDICATED_MODEL_LABEL}</span>
            </p>
            <p className="max-w-[64ch]">
              The preview is mirrored, like a mirror. The tracking overlay uses
              the same MediaPipe landmarks as the dedicated model and is not
              saved into the clip.
            </p>
          </div>
        </section>

        <section aria-labelledby="translation-heading" className="min-w-0 space-y-6">
          <div className="overflow-hidden rounded-[0.875rem] bg-panel ring-1 ring-rule">
            <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3">
              <h2 id="translation-heading" className="font-bold">
                Translation
              </h2>
              {result ? (
                <ul aria-label="How this clip was read" className="flex flex-wrap gap-1.5">
                  {result.source === "dedicated" ? (
                    <>
                      <SourceTag tone="trace">Dedicated model</SourceTag>
                      {signSequence ? <SourceTag>Several signs</SourceTag> : null}
                    </>
                  ) : result.mock ? (
                    <SourceTag tone="signal">Mock sample</SourceTag>
                  ) : (
                    <SourceTag tone="chalk">Gemini video</SourceTag>
                  )}
                  {result.mock && result.source === "dedicated" ? (
                    <SourceTag>Dictionary English</SourceTag>
                  ) : null}
                  {result.unclear ? <SourceTag>Signing unclear</SourceTag> : null}
                </ul>
              ) : null}
            </div>

            {mode === "mock" ? (
              <div
                role="note"
                className="flex gap-3 border-t border-signal/30 bg-signal/8 px-5 py-3.5"
              >
                <Sparkles className="mt-1 size-4 shrink-0 text-signal" aria-hidden="true" />
                <div className="space-y-0.5">
                  <p className="font-bold text-chalk">Mock translation is on</p>
                  <p className="text-sm leading-6 text-mist">
                    No Gemini API key is configured. A confident dedicated-model
                    gloss still becomes dictionary English; the Gemini video path
                    returns a sample sentence. Add{" "}
                    <code className="rounded bg-backdrop/70 px-1 py-0.5 font-mono text-xs text-chalk">
                      GEMINI_API_KEY
                    </code>{" "}
                    in <span className="font-bold text-chalk">.env.local</span>{" "}
                    for live ASL interpretation.
                  </p>
                </div>
              </div>
            ) : null}

            <div aria-live="assertive" aria-atomic="true">
              <Tier label="Gloss">
                {session === "processing" ? (
                  <div className="flex gap-4 pt-1" aria-label="Reading signs">
                    <Skeleton className="h-7 w-20 bg-panel-raised" />
                    <Skeleton className="h-7 w-16 bg-panel-raised" />
                    <Skeleton className="h-7 w-24 bg-panel-raised" />
                  </div>
                ) : signSequence ? (
                  <div className="space-y-3">
                    <GlossList items={signSequence} />
                    {result?.segments &&
                    result.segments.confident < result.segments.total ? (
                      <p className="text-sm text-mist">
                        Skipped{" "}
                        {result.segments.total - result.segments.confident}{" "}
                        unclear{" "}
                        {result.segments.total - result.segments.confident === 1
                          ? "part"
                          : "parts"}{" "}
                        of the clip
                      </p>
                    ) : null}
                  </div>
                ) : singleGloss ? (
                  <GlossList items={[singleGloss]} />
                ) : result ? (
                  <div className="space-y-1.5 text-mist">
                    <p className="text-chalk">
                      {result.mock
                        ? "No glosses. This is a sample sentence."
                        : "No glosses. Gemini read the full video."}
                    </p>
                    {result.dedicatedTop ? (
                      <p className="text-sm leading-6">
                        The dedicated model was unsure
                        {result.dedicatedTop.glossLabel ? (
                          <>
                            {": best guess "}
                            <span className="gloss text-chalk">
                              {result.dedicatedTop.glossLabel}
                            </span>{" "}
                            at{" "}
                            <span className="tabular">
                              {(result.dedicatedTop.confidence * 100).toFixed(0)}%
                            </span>
                          </>
                        ) : null}
                        .
                      </p>
                    ) : null}
                    {result.fallbackReason ? (
                      <p className="text-sm leading-6">{result.fallbackReason}</p>
                    ) : null}
                  </div>
                ) : session === "error" ? (
                  <p className="text-mist">No signs were read from this clip.</p>
                ) : (
                  <p className="text-mist">
                    Signs show up here as glosses, in the order you sign them.
                  </p>
                )}
              </Tier>

              <Tier label="English">
                {session === "processing" ? (
                  <div className="space-y-3 pt-1">
                    <Skeleton className="h-8 w-full bg-panel-raised" />
                    <Skeleton className="h-8 w-3/5 bg-panel-raised" />
                  </div>
                ) : result ? (
                  <div className="space-y-2">
                    <p className="text-[1.75rem] leading-[1.15] font-extrabold tracking-[-0.015em] text-balance text-chalk sm:text-4xl">
                      {result.english}
                    </p>
                    {result.unclear && result.reason ? (
                      <p className="text-sm leading-6 text-mist">{result.reason}</p>
                    ) : null}
                  </div>
                ) : session === "error" ? (
                  <Alert
                    variant="destructive"
                    className="border-record/40 bg-record/10 px-3.5 py-3"
                  >
                    <AlertCircle />
                    <AlertTitle className="font-bold text-record">Could not translate</AlertTitle>
                    <AlertDescription className="text-chalk/90!">
                      <p>
                        {error}
                        {/busy|rate-limited|try again/i.test(error)
                          ? null
                          : " You can tap Sign again."}
                      </p>
                      {skipNote ? <p>{skipNote}</p> : null}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <p className="text-mist">
                    Your English translation will show up here.
                  </p>
                )}
              </Tier>
            </div>

            <Tier label="Voice">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-11 rounded-full border-rule bg-transparent px-4 text-base dark:bg-transparent"
                    onClick={() => result && speak(result.english)}
                    disabled={!result || speaking}
                  >
                    <Volume2
                      data-icon="inline-start"
                      className="text-signal"
                      aria-hidden="true"
                    />
                    {speaking ? "Speaking…" : "Replay voice"}
                  </Button>
                  <Button
                    size="lg"
                    variant="ghost"
                    className="h-11 rounded-full px-4 text-base text-chalk"
                    onClick={startRecording}
                    disabled={!cameraReady || busy}
                  >
                    Sign again
                  </Button>
                </div>
                {speechError ? (
                  <p className="text-sm text-record">{speechError}</p>
                ) : (
                  <p className="text-sm text-mist">
                    The English is spoken aloud as soon as it appears.
                  </p>
                )}
              </div>
            </Tier>
          </div>

          {replayUrl ? (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-mist">Last clip</h3>
              <div className="relative overflow-hidden rounded-[0.875rem] bg-black ring-1 ring-rule">
                <video
                  ref={replayVideoRef}
                  className="aspect-4/3 h-auto w-full object-cover"
                  src={replayUrl}
                  controls
                  playsInline
                  muted
                  aria-label="Replay of the clip that was just uploaded"
                />
                {replayLandmarks ? (
                  <LandmarkOverlay
                    videoRef={replayVideoRef}
                    playback={replayLandmarks}
                    mirrored={false}
                    active
                    draw={showTracking}
                  />
                ) : null}
              </div>
            </div>
          ) : (
            <div className="space-y-2 px-1">
              <h3 className="text-sm font-bold text-mist">Before you start</h3>
              <ul className="space-y-1.5 text-chalk">
                {CHECKLIST.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span
                      className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-signal"
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
    </div>
  );
}

const CHECKLIST = [
  "Unmute your speakers so the English can be spoken.",
  "Keep both hands in the frame.",
  "Between signs, hold still or lower your hands for half a second.",
];

/** One annotation tier: a name in the gutter, its content beside it. */
function Tier({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-5 gap-y-2 border-t border-rule px-5 py-5 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
      <p className="text-sm font-bold text-mist sm:pt-1">{label}</p>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Glosses in signed order, each with the model's confidence as a bar. */
function GlossList({ items }: { items: DedicatedTop[] }) {
  return (
    <ol aria-label="Signs read, in order" className="flex flex-wrap gap-x-6 gap-y-4">
      {items.map((item, index) => {
        const label = item.glossLabel || item.gloss;
        const hasConfidence = Number.isFinite(item.confidence);
        const pct = hasConfidence
          ? Math.round(Math.min(1, Math.max(0, item.confidence)) * 100)
          : null;
        return (
          <li key={`${label}-${index}`} className="min-w-16 space-y-1.5">
            <span className="gloss block text-[1.75rem] leading-none text-chalk">
              {label}
            </span>
            {pct !== null ? (
              <span className="flex items-center gap-2">
                <span
                  className="relative h-1 min-w-10 flex-1 overflow-hidden rounded-full bg-rule"
                  aria-hidden="true"
                >
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-trace"
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="text-sm text-mist tabular">
                  {pct}%<span className="sr-only"> confidence</span>
                </span>
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function SourceTag({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "trace" | "signal" | "chalk";
}) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-rule px-2.5 py-0.5 text-xs font-bold text-chalk">
      {tone ? (
        <span
          className={cn(
            "size-1.5 rounded-full",
            tone === "trace" && "bg-trace",
            tone === "signal" && "bg-signal",
            tone === "chalk" && "bg-chalk",
          )}
          aria-hidden="true"
        />
      ) : null}
      {children}
    </li>
  );
}

function TrackerState({
  status,
}: {
  status: ReturnType<typeof useLandmarkTracker>["status"];
}) {
  if (status === "ready" || status === "sampling") {
    return (
      <span className="inline-flex items-center gap-2 text-chalk">
        <span className="size-2 rounded-full bg-trace" aria-hidden="true" />
        Hand tracking ready
      </span>
    );
  }
  if (status === "loading") {
    return (
      <span className="inline-flex items-center gap-2">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        Loading hand tracking…
      </span>
    );
  }
  if (status === "error") {
    return <span>Hand tracking is off; clips go to Gemini video</span>;
  }
  return <span>Hand tracking starts with the camera</span>;
}

function TrackingSwitch({
  on,
  onToggle,
  className,
}: {
  on: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-2.5 rounded-full py-1.5 pr-1 text-sm font-bold text-mist hover:text-chalk",
        className,
      )}
    >
      Show tracking
      <span
        className={cn(
          "relative h-6 w-10 rounded-full transition-colors motion-reduce:transition-none",
          on ? "bg-trace" : "bg-rule",
        )}
        aria-hidden="true"
      >
        <span
          className={cn(
            "absolute top-1 left-1 size-4 rounded-full bg-backdrop transition-transform motion-reduce:transition-none",
            on ? "translate-x-4" : "translate-x-0 bg-mist",
          )}
        />
      </span>
    </button>
  );
}

/**
 * Clip length against the routing budget: up to ~8 s is read as one sign,
 * longer clips (to 30 s) are split into signs at pauses.
 */
function ClipTimeline({
  session,
  secondsLeft,
  clipMs,
}: {
  session: string;
  secondsLeft: number;
  clipMs: number;
}) {
  const recording = session === "recording";
  const elapsedS = recording
    ? RECORD_SECONDS - secondsLeft
    : clipMs > 0
      ? clipMs / 1000
      : 0;
  const pct = Math.min(100, (elapsedS / RECORD_SECONDS) * 100);
  const splitPct = (LONG_CLIP_HINT_MS / 1000 / RECORD_SECONDS) * 100;
  const splitSeconds = Math.round(LONG_CLIP_HINT_MS / 1000);

  let leftLabel: React.ReactNode = "Clip length";
  let rightLabel: React.ReactNode = `up to ${RECORD_SECONDS} s`;
  if (recording) {
    leftLabel = (
      <span className="inline-flex items-center gap-2 font-bold text-chalk">
        <span className="record-dot size-2 rounded-full bg-record" aria-hidden="true" />
        Recording
      </span>
    );
    rightLabel = <span className="text-chalk">{secondsLeft} s left</span>;
  } else if (clipMs > 0) {
    leftLabel = session === "processing" ? "Reading this clip" : "Last clip";
    rightLabel = <span className="text-chalk">{(clipMs / 1000).toFixed(1)} s</span>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm text-mist tabular">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
      <div className="relative">
        <div
          role="progressbar"
          aria-label="Clip length"
          aria-valuemin={0}
          aria-valuemax={RECORD_SECONDS}
          aria-valuenow={Math.round(elapsedS)}
          aria-valuetext={`${Math.round(elapsedS)} of ${RECORD_SECONDS} seconds`}
          className="relative h-2 overflow-hidden rounded-full bg-panel-raised"
        >
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              recording
                ? "bg-record transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
                : "bg-mist/70",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span
          className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-chalk/70"
          style={{ left: `${splitPct}%` }}
          aria-hidden="true"
        />
      </div>
      <div
        className="grid text-xs leading-5 text-mist"
        style={{ gridTemplateColumns: `${splitPct}% minmax(0, 1fr)` }}
      >
        <span className="pr-2">
          One sign<span className="hidden sm:inline">, up to {splitSeconds} s</span>
        </span>
        <span className="pl-2">Several signs, with a pause after each</span>
      </div>
    </div>
  );
}
