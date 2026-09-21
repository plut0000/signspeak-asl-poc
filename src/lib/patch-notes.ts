export const DEMO_VERSION = "2.1.2";

export const PATCH_NOTES = {
  version: DEMO_VERSION,
  title: "What's new in v2.1.2",
  summary:
    "The dedicated isolated-sign model now covers 50 ASL Citizen glosses with an RL fine-tune. Long and continuous clips still skip BiLSTM and use Gemini video.",
  highlights: [
    "Vocabulary expanded from 20 to 50 isolated signs: the original 20 plus 30 high-frequency ASL Citizen classes (basketball, dog, movie, what for, …).",
    "Supervised test top-1 87.4% → after RL 89.7% (+~2.4 pts). Top-5 stays around 99%.",
    "New glosses still strip dataset digits in the UI (BASKETBALL1 → Basketball, WHATFOR1 → What for).",
    "v2.1.1 routing is unchanged: clips longer than ~5 seconds, or landmark sequences longer than a typical isolated sign, skip BiLSTM. Uncertain predictions (confidence below 55%, small top-1 vs top-2 margin, or high entropy) still fall back to Gemini video.",
  ],
} as const;
