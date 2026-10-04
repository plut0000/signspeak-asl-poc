import {
  ASL_CITIZEN_GLOSSES,
  DEDICATED_MODEL_LABEL,
  DEDICATED_MODEL_VARIANT,
  DEDICATED_MODEL_VERSION,
  isDedicatedEnabled,
} from "@/lib/asl-citizen";
import { isMockMode } from "@/lib/gemini";
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    mode: isMockMode() ? "mock" : "live",
    dedicated: {
      enabled: isDedicatedEnabled(),
      classes: ASL_CITIZEN_GLOSSES.length,
      version: DEDICATED_MODEL_VERSION,
      variant: DEDICATED_MODEL_VARIANT,
      label: DEDICATED_MODEL_LABEL,
    },
  });
}
