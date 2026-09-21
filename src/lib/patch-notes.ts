export const DEMO_VERSION = "3.0";

export const PATCH_NOTES = {
  version: DEMO_VERSION,
  title: "What's new in v3.0",
  summary:
    "The dedicated isolated-sign model now covers the full 200-sign ASL Citizen vocabulary. Supervised test top-1 was ~87.3%; RL fine-tuning reaches 89.7% (~+2.5 pts). Top-5 stays around 98%. Gemini visual-only song translation, mute-audio capture, and long-clip routing from v2.1.3.1 are unchanged.",
  highlights: [
    "Full ASL Citizen vocab: 200 isolated signs (the previous 100 plus 100 more), shown with friendly labels (LUNCH1 → Lunch, COCACOLA → Coca-Cola, TAKEOFF1 → Take off).",
    "Held-out test: supervised ~87.3% top-1 → 89.7% after RL (~+2.5 points). Top-5 ~98.2%. A 150-class fallback was not needed.",
    "Same isolated-sign gates: clips longer than ~5 seconds or 80 landmark frames skip BiLSTM and use Gemini video. Dedicated path still needs confidence ≥ 55%, margin ≥ 0.15, and entropy ≤ 0.75.",
    "Gemini visual-only from v2.1.3.1 stays: mic off, audio stripped, lyric-first silent-clip prompts, no gang-sign or screen-recording lectures, flash-lite long-clip path.",
  ],
} as const;
