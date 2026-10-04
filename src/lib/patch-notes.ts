export const DEMO_VERSION = "3.1.1";

export const PATCH_NOTES = {
  version: DEMO_VERSION,
  title: "What's new in v3.1.1",
  summary:
    "Longer webcam clips now stay small enough to reach Gemini video, and a few signs in a row are less likely to be thrown away for one soft piece. One-word clips are unchanged.",
  highlights: [
    "The camera records at 640×480 / 15 fps / 480 kbps so a 30-second clip stays under Vercel’s upload limit. If a recording is still too large, the app says so instead of failing later.",
    "Gemini video retries once with the other container type (webm ↔ mp4) when the first mime guess is wrong. Unknown magic bytes no longer block the fallback.",
    "Several-signs reading pads more generously, drops wrist twitches, and uses slightly looser gates (or soft top-1 guesses) so a real webcam phrase can still become English. Isolated-sign gates stay 55% / 0.15 / 0.75.",
    "If translation still fails, the error names one tip — pause between signs, or sign one short word — and does not blame Google.",
  ],
} as const;
