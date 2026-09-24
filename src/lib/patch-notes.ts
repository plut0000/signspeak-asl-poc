export const DEMO_VERSION = "3.0.1";

export const PATCH_NOTES = {
  version: DEMO_VERSION,
  title: "What's new in v3.0.1",
  summary:
    "Extra RL fine-tuning lifts the same 200-sign isolated model from ~89.7% to ~90.3% test top-1. Top-5 stays around 98.1%. Gemini visual-only song translation, mute soft-fail, and skip-reason errors stay. A slow one-word clip can use the custom model for up to ~8 seconds.",
  highlights: [
    "Still 200 isolated signs. Friendly labels are unchanged (LUNCH1 → Lunch, COCACOLA → Coca-Cola, TAKEOFF1 → Take off).",
    "Held-out test: the shipped v3.0 RL checkpoint was ~89.7% top-1. Extra RL reaches ~90.3% (90.29%). Supervised training started at ~87.3%. Top-5 is ~98.1%.",
    "Isolated-sign gates: clips longer than ~8 seconds or 120 landmark frames skip BiLSTM and use Gemini video. A slightly slow one-word demo still uses the custom model. Dedicated path still needs confidence ≥ 55%, margin ≥ 0.15, and entropy ≤ 0.75.",
    "Gemini visual-only from v2.1.3.1 stays: mic off, audio stripped, lyric-first silent-clip prompts, no gang-sign or screen-recording lectures, flash-lite long-clip path. Mute failures still soft-fail, and skipped dedicated predictions still explain why.",
  ],
} as const;
