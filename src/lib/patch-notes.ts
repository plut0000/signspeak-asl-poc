export const DEMO_VERSION = "2.1.1";

export const PATCH_NOTES = {
  version: DEMO_VERSION,
  title: "What's new in v2.1.1",
  summary:
    "Long and continuous clips now skip the isolated-sign BiLSTM and use Gemini video. The dedicated model is only for short, high-confidence one-sign clips.",
  highlights: [
    "Recordings longer than ~5 seconds, or landmark sequences longer than a typical isolated sign, go to Gemini video instead of forcing one of 20 glosses.",
    "Uncertain BiLSTM predictions (confidence below 55%, small top-1 vs top-2 margin, or high entropy) also fall back to Gemini video.",
    "This stops sticky wrong words such as EAT on songs and conversation clips.",
    "v2.1 RL weights are unchanged (20 isolated signs, 82.8% test top-1).",
  ],
} as const;
