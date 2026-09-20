import {
  friendlyGeminiError,
  interpretAslVideo,
} from "@/lib/gemini";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    const buffer = Buffer.from(await video.arrayBuffer());
    const result = await interpretAslVideo({
      mimeType,
      base64: buffer.toString("base64"),
    });

    return NextResponse.json(result);
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
