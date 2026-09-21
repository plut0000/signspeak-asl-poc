export const DEMO_VERSION = "2.1";

export const PATCH_NOTES = {
  version: DEMO_VERSION,
  title: "What's new in v2.1",
  summary:
    "The dedicated 20-word ASL Citizen BiLSTM is now RL-fine-tuned. Test top-1 rose from 77.3% to 82.8%. Vocabulary is still 20 isolated signs.",
  highlights: [
    "RL fine-tune on the existing 20-word BiLSTM (REINFORCE + light CE mix).",
    "Held-out test top-1: 77.3% → 82.8% (+~5.5 pts). Top-5 stays ~99%.",
    "Same 20 isolated signs. No 50-word expansion (that is later).",
    "Same pipeline: landmarks → ONNX BiLSTM → Gemini English cleanup; low confidence still falls back to Gemini video.",
  ],
} as const;
