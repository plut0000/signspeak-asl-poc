#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveHandCoverageIsLow } from "../src/lib/asl-citizen.ts";
import {
  explainDedicatedSkip,
  LONG_CLIP_GEMINI_ERROR,
  userFacingInterpretError,
} from "../src/lib/dedicated-skip-copy.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const hands = explainDedicatedSkip({
  fallbackReason: "Hands were missing or poorly tracked in too many frames.",
});
assert(
  hands === "Custom model skipped: Hands were missing from too many frames.",
  `hands copy mismatch: ${hands}`,
);

const hello = explainDedicatedSkip({
  fallbackReason: "Dedicated model confidence 40% was below 55%.",
  dedicatedTop: { gloss: "HELLO", glossLabel: "Hello", confidence: 0.4 },
});
assert(
  hello === "Custom model skipped: Confidence was too low (best guess HELLO at 40%).",
  `confidence copy mismatch: ${hello}`,
);
assert(hello?.includes("HELLO"), "confidence skip should name the top gloss");
assert(hello?.includes("40%"), "confidence skip should show the top confidence");

const split = explainDedicatedSkip({
  fallbackReason: "Dedicated model was split between HELLO (48%) and NAME 40%.",
  dedicatedTop: { gloss: "HELLO", glossLabel: "Hello", confidence: 0.48 },
});
assert(
  split?.startsWith("Custom model skipped:") && split.includes("HELLO"),
  `split copy mismatch: ${split}`,
);
assert(!/softmax|entropy|margin|MediaPipe|BiLSTM/i.test(split ?? ""), "split copy should stay plain");

const entropy = explainDedicatedSkip({
  fallbackReason: "Dedicated model was uncertain across too many glosses.",
  dedicatedTop: { gloss: "EAT1", glossLabel: "Eat", confidence: 0.22 },
});
assert(
  entropy ===
    "Custom model skipped: It was unsure across too many signs (best guess Eat (EAT1) at 22%).",
  `entropy copy mismatch: ${entropy}`,
);

const longClip = explainDedicatedSkip({
  fallbackReason:
    "Clip is 12s — longer than a single isolated sign, so Gemini video is used instead of the dedicated model.",
});
assert(
  longClip === "Custom model skipped: This clip is longer than one sign.",
  `long clip copy mismatch: ${longClip}`,
);

assert(explainDedicatedSkip({}) === null, "empty skip should stay quiet");

const LIGHTING =
  "Gemini could not interpret this clip. Try again with brighter lighting and clearer signs.";
const longDurationReason =
  "Clip is 9.2s — longer than a single isolated sign, so Gemini video is used instead of the dedicated model.";
const longFramesReason =
  "Landmark sequence (140 frames) is longer than a typical isolated sign, so Gemini video is used instead of the dedicated model.";

const lengthLead = userFacingInterpretError({
  error: LIGHTING,
  fallbackReason: longDurationReason,
});
assert(
  lengthLead === LONG_CLIP_GEMINI_ERROR,
  `length skip should not lead with lighting: ${lengthLead}`,
);
assert(!/lighting/i.test(lengthLead), "length-skip primary line should not mention lighting");
assert(
  /under ~8 seconds/i.test(lengthLead),
  "length-skip primary line should mention the ~8 second custom-model budget",
);

const frameLead = userFacingInterpretError({
  error: LIGHTING,
  fallbackReason: longFramesReason,
});
assert(
  frameLead === LONG_CLIP_GEMINI_ERROR,
  `frame-length skip should not lead with lighting: ${frameLead}`,
);

assert(
  userFacingInterpretError({
    error: LIGHTING,
    fallbackReason: "Hands were missing or poorly tracked in too many frames.",
  }) === LIGHTING,
  "hand-quality skip should keep the lighting wording",
);
assert(
  userFacingInterpretError({
    error: LIGHTING,
    fallbackReason: "Too few landmark frames to trust the dedicated model.",
  }) === LIGHTING,
  "landmark-quality skip should keep the lighting wording",
);
assert(
  userFacingInterpretError({
    error: LIGHTING,
    fallbackReason: "Dedicated model confidence 40% was below 55%.",
  }) === LIGHTING,
  "confidence skip should keep the lighting wording",
);
assert(
  userFacingInterpretError({ error: LIGHTING }) === LIGHTING,
  "missing skip reason should keep the lighting wording",
);
const busy = "Gemini is busy right now. Wait a few seconds and try again.";
assert(
  userFacingInterpretError({
    error: busy,
    fallbackReason: longDurationReason,
  }) === busy,
  "a specific Gemini error should stay ahead of the length-skip sentence",
);
assert(
  userFacingInterpretError({
    error: LONG_CLIP_GEMINI_ERROR,
    fallbackReason: longDurationReason,
  }) === LONG_CLIP_GEMINI_ERROR,
  "length-skip wording should stay stable if applied twice",
);

assert(!liveHandCoverageIsLow(4, 0), "too few frames should not nag yet");
assert(liveHandCoverageIsLow(20, 0), "no hands should hint");
assert(liveHandCoverageIsLow(20, 2), "hand ratio under the gate should hint");
assert(!liveHandCoverageIsLow(20, 8), "healthy hand coverage should stay quiet");

const route = await readFile(path.join(ROOT, "src/app/api/interpret/route.ts"), "utf8");
const catchStart = route.indexOf("} catch (error) {");
assert(catchStart > 0, "interpret route should keep a catch");
const catchBody = route.slice(catchStart, catchStart + 700);
assert(
  catchBody.includes("friendlyGeminiError(message, skip.fallbackReason)"),
  "502 should keep the friendly Gemini error and pass the skip reason",
);
assert(
  catchBody.includes("dedicatedSkipFields(dedicatedAttempt)"),
  "502 should include dedicated skip fields",
);
assert(
  route.includes("fallbackReason: attempt.reason"),
  "skip fields should pass through dedicatedAttempt.reason",
);
assert(
  route.includes("dedicatedTop"),
  "skip fields should pass through dedicatedTop",
);

const mute = await readFile(path.join(ROOT, "src/lib/strip-video-audio.ts"), "utf8");
assert(
  !mute.includes('throw new Error("Could not mute the clip before translation.")'),
  "mute should stay a soft-fail instead of throwing",
);
assert(
  mute.includes("sending original video"),
  "mute soft-fail should still return the original video",
);

const studio = await readFile(path.join(ROOT, "src/components/sign-studio.tsx"), "utf8");
const gemini = await readFile(path.join(ROOT, "src/lib/gemini.ts"), "utf8");
assert(studio.includes("explainDedicatedSkip"), "error UI should explain a dedicated skip");
assert(
  studio.includes("userFacingInterpretError"),
  "error UI should use the skip-aware primary line",
);
assert(
  gemini.includes("userFacingInterpretError"),
  "friendly Gemini errors should defer length-skip wording",
);
assert(
  gemini.includes("brighter lighting and clearer signs"),
  "lighting wording should remain for quality skips",
);
assert(
  route.includes("friendlyGeminiError(message, skip.fallbackReason)"),
  "502 should pass the skip reason into the Gemini error",
);
assert(studio.includes("Keep both hands in frame"), "recording UI should hint when hands are out of frame");
assert(studio.includes("lowHandCoverage"), "hint should follow tracker hand coverage");

console.log(
  JSON.stringify(
    {
      hands,
      hello,
      split,
      entropy,
      longClip,
      ok: true,
    },
    null,
    2,
  ),
);
