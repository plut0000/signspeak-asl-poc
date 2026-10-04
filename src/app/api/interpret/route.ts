import {
  assessLandmarkQuality,
  isDedicatedEnabled,
  MAX_LANDMARK_FRAMES,
  POS_DIM,
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
  createGeminiBudget,
  englishFromDedicatedGloss,
  englishFromDedicatedGlosses,
  friendlyGeminiError,
  interpretAslVideo,
  type GeminiBudget,
} from "@/lib/gemini";
import { clientIp, takeInterpretSlot } from "@/lib/rate-limit";
import { sniffVideoMime, stripAudioTrack } from "@/lib/strip-video-audio";
import type { DedicatedTop, InterpretSuccess } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const MIN_BYTES = 8_000;
/** Vercel serverless request body limit. Reject oversized Content-Length first. */
export const MAX_BYTES = Math.floor(4.5 * 1024 * 1024);
const MAX_LANDMARK_BYTES = MAX_LANDMARK_FRAMES * POS_DIM * 4;

type DedicatedAttempt =
  | { ok: true; result: InterpretSuccess }
  | { ok: false; reason: string; prediction?: DedicatedPrediction };

export async function POST(request: Request) {
  if (!takeInterpretSlot(clientIp(request))) {
    return NextResponse.json(
      { error: "Too many translation requests. Wait a few seconds and try again." },
      { status: 429 },
    );
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
    return NextResponse.json(
      { error: "The clip is too large. Record a shorter phrase." },
      { status: 413 },
    );
  }

  let dedicatedAttempt: DedicatedAttempt | undefined;
  const budget = createGeminiBudget();
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

    const landmarks = form.get("landmarks");
    if (landmarks instanceof File && landmarks.size > MAX_LANDMARK_BYTES) {
      return NextResponse.json(
        { error: "The clip is too large. Record a shorter phrase." },
        { status: 413 },
      );
    }

    dedicatedAttempt = await tryDedicatedPath(form, budget);
    if (dedicatedAttempt.ok) {
      return NextResponse.json(dedicatedAttempt.result);
    }

    const buffer = Buffer.from(await video.arrayBuffer());
    const mimeType = sniffVideoMime(buffer);
    if (!mimeType) {
      return NextResponse.json(
        {
          error: "Please upload a webcam video clip.",
          ...dedicatedSkipFields(dedicatedAttempt),
        },
        { status: 400 },
      );
    }

    const silent = await stripAudioTrack({ buffer, mimeType });
    if (silent.stripped) {
      console.info("Removed audio track before Gemini video interpret.");
    }
    const result = await interpretAslVideo(
      {
        mimeType: silent.mimeType,
        base64: silent.buffer.toString("base64"),
      },
      budget,
    );

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

async function tryDedicatedPath(
  form: FormData,
  budget: GeminiBudget,
): Promise<DedicatedAttempt> {
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

  const budgetCheck = assessIsolatedSignBudget({ frames, durationMs });
  if (!budgetCheck.ok) {
    return isSignSequenceEnabled()
      ? trySignSequence({ landmarks, frames, durationMs, budget })
      : { ok: false, reason: budgetCheck.reason };
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

    const result = await englishFromDedicatedGloss(
      {
        gloss: prediction.gloss,
        confidence: prediction.confidence,
        top: prediction.top,
      },
      budget,
    );
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
  budget: GeminiBudget;
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
        ? await englishFromDedicatedGloss(
            {
              gloss: only.gloss,
              confidence: only.confidence,
              top: only.top,
            },
            input.budget,
          )
        : await englishFromDedicatedGlosses({ glosses }, input.budget);
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
