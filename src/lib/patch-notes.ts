export const DEMO_VERSION = "3.1.0";

export const PATCH_NOTES = {
  version: DEMO_VERSION,
  title: "What's new in v3.1",
  summary:
    "The same 200-sign v3.0.1 BiLSTM can now read several signs in a row. Pause about half a second between words; the glosses show as HELLO · NAME · WHAT above the English sentence. One-word clips are unchanged. Songs and unclear phrases still use Gemini video.",
  highlights: [
    "Clips up to ~8 seconds / 120 frames stay on the single-sign path. Longer clips (up to ~30 seconds / 900 frames) are split at still wrists or lowered hands. Each piece uses the same 55% / 0.15 / 0.75 gates. Consecutive duplicate glosses merge.",
    "When more than half the pieces are confident, Gemini only cleans the gloss list into English (dictionary English if there is no key). Otherwise the clip uses Gemini video, as before.",
    "Model weights and the 200-word list are unchanged (v3.0.1 RL, ~90.3% test top-1). The studio shows a Several signs badge and the gloss sequence.",
    "Interpret uploads are capped at Vercel’s ~4.5 MB body limit, rate-limited per IP, and checked by file magic instead of the client MIME type. Gemini fallbacks stop before the 120-second function limit.",
  ],
} as const;
