#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveHandCoverageIsLow } from "../src/lib/asl-citizen.ts";
import { explainDedicatedSkip } from "../src/lib/dedicated-skip-copy.ts";

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

assert(!liveHandCoverageIsLow(4, 0), "too few frames should not nag yet");
assert(liveHandCoverageIsLow(20, 0), "no hands should hint");
assert(liveHandCoverageIsLow(20, 2), "hand ratio under the gate should hint");
assert(!liveHandCoverageIsLow(20, 8), "healthy hand coverage should stay quiet");

const route = await readFile(path.join(ROOT, "src/app/api/interpret/route.ts"), "utf8");
const catchStart = route.indexOf("} catch (error) {");
assert(catchStart > 0, "interpret route should keep a catch");
const catchBody = route.slice(catchStart, catchStart + 700);
assert(
  catchBody.includes("friendlyGeminiError(message)"),
  "502 should keep the friendly Gemini error",
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
assert(studio.includes("explainDedicatedSkip"), "error UI should explain a dedicated skip");
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
