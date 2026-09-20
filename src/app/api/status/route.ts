import { getGeminiModel, isMockMode } from "@/lib/gemini";
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    mode: isMockMode() ? "mock" : "live",
    model: getGeminiModel(),
  });
}
