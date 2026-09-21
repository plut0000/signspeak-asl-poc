import {
  assessLandmarkQuality,
  isDedicatedEnabled,
  MAX_LANDMARK_FRAMES,
} from "@/lib/asl-citizen";
import { predictGloss } from "@/lib/asl-infer";
import {
  assessDedicatedPrediction,
  assessIsolatedSignBudget,
  parseDurationMs,
} from "@/lib/asl-routing";
import { decodeLandmarkBuffer, landmarksToFeatures } from "@/lib/asl-preprocess";
import {
  englishFromDedicatedGloss,
  friendlyGeminiError,
  interpretAslVideo,
} from "@/lib/gemini";
import { stripAudioTrack } from "@/lib/strip-video-audio";
import type { InterpretSuccess } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const MIN_BYTES = 8_000;
const MAX_BYTES = 18 * 1024 * 1024;

export async function POST(request: Request) {
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

    const dedicatedAttempt = await tryDedicatedPath(form);
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
      fallbackReason: dedicatedAttempt.reason,
      dedicatedTop: dedicatedAttempt.prediction
        ? {
            gloss: dedicatedAttempt.prediction.gloss,
            glossLabel: dedicatedAttempt.prediction.glossLabel,
            confidence: dedicatedAttempt.prediction.confidence,
          }
        : undefined,
    } satisfies InterpretSuccess);
  } catch (error) {
    console.error("ASL interpret failed:", error);
    const message =
      error instanceof Error ? error.message : "Translation failed.";
    return NextResponse.json(
      { error: friendlyGeminiError(message) },
      { status: 502 },
    );
  }
}

async function tryDedicatedPath(form: FormData): Promise<
  | { ok: true; result: InterpretSuccess }
  | {
      ok: false;
      reason: string;
      prediction?: Awaited<ReturnType<typeof predictGloss>>;
    }
> {
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
    return { ok: false, reason: budget.reason };
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
