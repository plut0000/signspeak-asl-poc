export const DEMO_VERSION = "2.1.3.1";

export const PATCH_NOTES = {
  version: DEMO_VERSION,
  title: "What's new in v2.1.3.1",
  summary:
    "Gemini video now translates signed songs from vision only: silent clips, lyric-first prompts, no gang-sign or screen-recording lectures, and a faster lite-model path. The dedicated model remains the v2.1.3 100-class RL BiLSTM.",
  highlights: [
    "Prompts assume ASL → English. Signed music outputs lyric lines, not “a person is signing a song.” Unclear is a last resort, phrased politely.",
    "The model is forbidden to call gestures “gang signs,” criminal, or slang, and must not narrate screen-recording / camera meta as the answer. Those replies are replaced with a short unclear line so they never sit next to a warning badge.",
    "Webcam capture stays mic-off. The server strips any audio track before Gemini so a song soundtrack cannot leak lyrics. Prompts also say to ignore audio and read only visible signing.",
    "Long clips are faster: flash-lite only, no SDK retry storm, no second lyric round-trip when the first answer already looks like lyrics, 8 fps video sampling, thinking disabled. The v2.1.3 100-class BiLSTM and long-clip routing are unchanged.",
  ],
} as const;
