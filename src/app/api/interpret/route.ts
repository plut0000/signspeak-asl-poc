import {
  assessLandmarkQuality,
  isDedicatedEnabled,
  MAX_LANDMARK_FRAMES,
} from "@/lib/asl-citizen";
import { predictGloss, type DedicatedPrediction } from "@/lib/asl-infer";
import {
  assessDedicatedPrediction,
  assessIsolatedSignBudget,
  parseDurationMs,
} from "@/lib/asl-routing";
import { decodeLandmarkBuffer, landmarksToFeatures } from "@/lib/asl-preprocess";
import { isSignSequenceEnabled, readSignSequence } from "@/lib/asl-sequence";
import {
  englishFromDedicatedGloss,
  englishFromDedicatedGlosses,
  friendlyGeminiError,
  interpretAslVideo,
} from "@/lib/gemini";
import { stripAudioTrack } from "@/lib/strip-video-audio";
import type { DedicatedTop, InterpretSuccess } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const MIN_BYTES = 8_000;
const MAX_BYTES = 18 * 1024 * 1024;

type DedicatedAttempt =
  | { ok: true; result: InterpretSuccess }
  | { ok: false; reason: string; prediction?: DedicatedPrediction };

export async function POST(request: Request) {
  let dedicatedAttempt: DedicatedAttempt | undefined;
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "No video clip was uploaded." },
        { status: 400 },
      );
    }
    const video = form.get("video");

    if (!(video instanceof File)) {
      return NextResponse.json(
        { error: "No video clip was uploaded." },
        { status: 400 },
      );
    }

    if (video.size < MIN_BYTES) {
      return NextResponse.json(
        {
          error:
            "The recording is too short. Sign for a few seconds, then stop.",
        },
        { status: 400 },
      );
    }

    if (video.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "The clip is too large. Record a shorter phrase." },
        { status: 413 },
      );
    }

    const mimeType = video.type || "video/webm";
    if (!mimeType.startsWith("video/")) {
      return NextResponse.json(
        { error: "Please upload a webcam video clip." },
        { status: 400 },
      );
    }

    dedicatedAttempt = await tryDedicatedPath(form);
    if (dedicatedAttempt.ok) {
      return NextResponse.json(dedicatedAttempt.result);
    }

    const buffer = Buffer.from(await video.arrayBuffer());
    const silent = await stripAudioTrack({ buffer, mimeType });
    if (silent.stripped) {
      console.info("Removed audio track before Gemini video interpret.");
    }
    const result = await interpretAslVideo({
      mimeType: silent.mimeType,
      base64: silent.buffer.toString("base64"),
    });

    return NextResponse.json({
      ...result,
      source: "gemini" as const,
      ...dedicatedSkipFields(dedicatedAttempt),
    } satisfies InterpretSuccess);
  } catch (error) {
    console.error("ASL interpret failed:", error);
    const message =
      error instanceof Error ? error.message : "Translation failed.";
    const skip = dedicatedSkipFields(dedicatedAttempt);
    return NextResponse.json(
      {
        error: friendlyGeminiError(message, skip.fallbackReason),
        ...skip,
      },
      { status: 502 },
    );
  }
}

function dedicatedSkipFields(attempt: DedicatedAttempt | undefined): {
  fallbackReason?: string;
  dedicatedTop?: DedicatedTop;
} {
  if (!attempt || attempt.ok) return {};
  const dedicatedTop = attempt.prediction
    ? {
        gloss: attempt.prediction.gloss,
        glossLabel: attempt.prediction.glossLabel,
        confidence: attempt.prediction.confidence,
      }
    : undefined;
  return {
    fallbackReason: attempt.reason,
    ...(dedicatedTop ? { dedicatedTop } : {}),
  };
}

async function tryDedicatedPath(form: FormData): Promise<DedicatedAttempt> {
  if (!isDedicatedEnabled()) {
    return { ok: false, reason: "Dedicated ASL model is disabled." };
  }

  const landmarks = form.get("landmarks");
  if (!(landmarks instanceof File) || landmarks.size < 4) {
    return {
      ok: false,
      reason: "No MediaPipe landmarks were captured for this clip.",
    };
  }

  const frames = Number(form.get("landmarkFrames") ?? 0);
  const poseFrames = Number(form.get("poseFrames") ?? frames);
  const handFrames = Number(form.get("handFrames") ?? 0);
  const durationMs = parseDurationMs(form.get("durationMs"));
  if (!Number.isFinite(frames) || frames < 1 || frames > MAX_LANDMARK_FRAMES) {
    return { ok: false, reason: "Landmark frame count is invalid." };
  }

  const budget = assessIsolatedSignBudget({ frames, durationMs });
  if (!budget.ok) {
    return isSignSequenceEnabled()
      ? trySignSequence({ landmarks, frames, durationMs })
      : { ok: false, reason: budget.reason };
  }

  const quality = assessLandmarkQuality({ frames, poseFrames, handFrames });
  if (quality.reason) {
    return { ok: false, reason: quality.reason };
  }

  try {
    const packed = decodeLandmarkBuffer(await landmarks.arrayBuffer(), frames);
    const features = landmarksToFeatures(packed, frames);
    const prediction = await predictGloss(features);
    const decision = assessDedicatedPrediction(prediction);
    if (!decision.ok) {
      return {
        ok: false,
        reason: decision.reason,
        prediction,
      };
    }

    const result = await englishFromDedicatedGloss({
      gloss: prediction.gloss,
      confidence: prediction.confidence,
      top: prediction.top,
    });
    return { ok: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Dedicated ASL path failed; using Gemini video.", message);
    return {
      ok: false,
      reason: "Dedicated model inference failed; using Gemini video.",
    };
  }
}

/** Clips longer than one isolated sign: read several signs in a row, or fall back to Gemini video. */
async function trySignSequence(input: {
  landmarks: File;
  frames: number;
  durationMs?: number;
}): Promise<DedicatedAttempt> {
  try {
    const packed = decodeLandmarkBuffer(
      await input.landmarks.arrayBuffer(),
      input.frames,
    );
    const reading = await readSignSequence({
      packed,
      frames: input.frames,
      durationMs: input.durationMs,
      predict: predictGloss,
    });
    if (!reading.ok) {
      return { ok: false, reason: reading.reason };
    }

    console.info(
      `Sign sequence: ${reading.confident}/${reading.total} ${reading.method} segments → ${reading.glosses.map((item) => item.gloss).join(" ")}`,
    );
    const glosses = reading.glosses.map(({ gloss, glossLabel, confidence }) => ({
      gloss,
      glossLabel,
      confidence,
    }));
    const [only] = reading.glosses;
    const result =
      reading.glosses.length === 1
        ? await englishFromDedicatedGloss({
            gloss: only.gloss,
            confidence: only.confidence,
            top: only.top,
          })
        : await englishFromDedicatedGlosses({ glosses });
    return {
      ok: true,
      result: {
        ...result,
        glosses,
        segments: { total: reading.total, confident: reading.confident },
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Sign sequence path failed; using Gemini video.", message);
    return {
      ok: false,
      reason: "Dedicated model inference failed; using Gemini video.",
    };
  }
}
