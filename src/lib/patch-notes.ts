export const DEMO_VERSION = "2.1.3";

export const PATCH_NOTES = {
  version: DEMO_VERSION,
  title: "What's new in v2.1.3",
  summary:
    "The dedicated isolated-sign model now covers 100 ASL Citizen glosses with an RL fine-tune. Long and continuous clips still skip BiLSTM and use Gemini video.",
  highlights: [
    "Vocabulary expanded from 50 to 100 isolated signs: the original 50 plus 50 more high-frequency ASL Citizen classes (lunch, chocolate, backpack, Coca-Cola, …).",
    "Supervised test top-1 ~88.2% → after RL ~88.9% (+~0.7 pts). Top-5 stays around 98%.",
    "New glosses still strip dataset digits in the UI (LUNCH1 → Lunch, TAKEOFF1 → Take off, HURDLE-TRIP1 → Hurdle trip).",
    "v2.1.1 routing is unchanged: clips longer than ~5 seconds, or landmark sequences longer than a typical isolated sign, skip BiLSTM. Uncertain predictions (confidence below 55%, small top-1 vs top-2 margin, or high entropy) still fall back to Gemini video.",
  ],
} as const;
