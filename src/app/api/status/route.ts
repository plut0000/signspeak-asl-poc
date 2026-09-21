import {
  ASL_CITIZEN_GLOSSES,
  DEDICATED_MODEL_LABEL,
  DEDICATED_MODEL_VARIANT,
  DEDICATED_MODEL_VERSION,
  isDedicatedEnabled,
} from "@/lib/asl-citizen";
import { dedicatedRoutingSettings } from "@/lib/asl-routing";
import { getGeminiModel, isMockMode } from "@/lib/gemini";
import { NextResponse } from "next/server";

export function GET() {
  const routing = dedicatedRoutingSettings();
  return NextResponse.json({
    mode: isMockMode() ? "mock" : "live",
    model: getGeminiModel(),
    dedicated: {
      enabled: isDedicatedEnabled(),
      threshold: routing.threshold,
      margin: routing.margin,
      maxIsolatedMs: routing.maxIsolatedMs,
      maxIsolatedFrames: routing.maxIsolatedFrames,
      classes: ASL_CITIZEN_GLOSSES.length,
      architecture: "BiLSTM+attn",
      version: DEDICATED_MODEL_VERSION,
      variant: DEDICATED_MODEL_VARIANT,
      label: DEDICATED_MODEL_LABEL,
    },
  });
}
