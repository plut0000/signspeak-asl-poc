import {
  ASL_CITIZEN_GLOSSES,
  getDedicatedThreshold,
  isDedicatedEnabled,
} from "@/lib/asl-citizen";
import { getGeminiModel, isMockMode } from "@/lib/gemini";
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    mode: isMockMode() ? "mock" : "live",
    model: getGeminiModel(),
    dedicated: {
      enabled: isDedicatedEnabled(),
      threshold: getDedicatedThreshold(),
      classes: ASL_CITIZEN_GLOSSES.length,
      architecture: "BiLSTM+attn",
    },
  });
}
