import type { LandmarkDelegates } from "@/lib/landmark-runtime";

export type LandmarkWorkerRequest =
  | { type: "init" }
  | { type: "detect"; bitmap: ImageBitmap; timestamp: number }
  | { type: "resetClock" };

export type LandmarkWorkerResponse =
  | { type: "ready"; delegates: LandmarkDelegates }
  | {
      type: "result";
      ok: true;
      buffer: ArrayBuffer;
      hasPose: boolean;
      hasHand: boolean;
      leftHand: boolean;
      rightHand: boolean;
      timestamp: number;
      detectMs: number;
    }
  | { type: "result"; ok: false; timestamp: number; detectMs: number }
  | { type: "error"; message: string };
