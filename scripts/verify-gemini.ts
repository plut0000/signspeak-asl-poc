#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  looksLikeForbiddenNarration,
  looksLikeMetaSongDescription,
  looksLikeSignedLyricOrMessage,
  POLITE_UNCLEAR_ENGLISH,
  sanitizeInterpretResult,
  shouldRetryLyricFocus,
} from "../src/lib/interpret-text.ts";
import {
  bufferHasAudioSignature,
  looksLikeMediaContainer,
  stripAudioTrack,
} from "../src/lib/strip-video-audio.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const geminiSource = await readFile(path.join(ROOT, "src/lib/gemini.ts"), "utf8");
const studioSource = await readFile(
  path.join(ROOT, "src/components/sign-studio.tsx"),
  "utf8",
);

assert(
  geminiSource.includes("Ignore audio completely") ||
    geminiSource.includes("Ignore audio entirely"),
  "ASL prompts must tell Gemini to ignore audio",
);
assert(
  /gang signs/i.test(geminiSource),
  "ASL prompts must forbid gang-sign labels",
);
assert(
  /screen-recording/i.test(geminiSource),
  "ASL prompts must forbid screen-recording narration",
);
assert(
  geminiSource.includes("Assume American Sign Language by default"),
  "ASL prompt must assume ASL → English by default",
);
assert(
  geminiSource.includes("GEMINI_VIDEO_FAST_FALLBACKS"),
  "Video path must use the lite-model fallback list",
);
assert(
  geminiSource.includes("thinkingBudget: 0"),
  "Video path should disable thinking for latency",
);
assert(
  geminiSource.includes("VIDEO_INTERPRET_FPS"),
  "Video path should sample at a fixed fps",
);
assert(
  geminiSource.includes("retryOptions: { attempts: 1 }"),
  "Video path should not use the SDK’s default 5 retries",
);
assert(
  !geminiSource.includes("for (let pass = 1; pass <= 2; pass++)"),
  "Video path should not do a second busy-retry pass",
);
assert(
  studioSource.includes("Signing unclear"),
  "UI badge should be the softer Signing unclear label",
);
assert(
  !studioSource.includes("Unclear signing"),
  "Old Unclear signing badge should be gone",
);
assert(
  studioSource.includes("videoOnlyStream"),
  "Recorder should use a video-only MediaStream",
);

const gangLecture =
  "The person in the video is not performing ASL; they are mimicking gang signs. The user is recording their screen while watching a video of someone else making various hand gestures in sync with music lyrics shown on the screen.";
const metaSong = "A person is signing a song.";
const lyrics = "I'm coming home, I'm coming home\nTell the world I'm coming home";
const hello = "Hello, my name is Alex. It is nice to meet you.";

assert(looksLikeForbiddenNarration(gangLecture), "gang-sign lecture is forbidden");
assert(
  looksLikeForbiddenNarration("The user is recording their screen while watching a video."),
  "screen-recording meta is forbidden",
);
assert(looksLikeMetaSongDescription(metaSong), "meta song caption is detected");
assert(!looksLikeMetaSongDescription(lyrics), "real lyrics are not a meta caption");
assert(looksLikeSignedLyricOrMessage(lyrics), "lyric lines count as a translation");
assert(looksLikeSignedLyricOrMessage(hello), "ordinary English counts as a translation");
assert(!looksLikeSignedLyricOrMessage(gangLecture), "lecture is not a translation");
assert(
  shouldRetryLyricFocus({
    english: metaSong,
    unclear: false,
    reason: "",
    mock: false,
  }),
  "meta caption should retry lyric focus",
);
assert(
  !shouldRetryLyricFocus({
    english: lyrics,
    unclear: false,
    reason: "",
    mock: false,
  }),
  "lyrics should skip the second Gemini round-trip",
);

const sanitized = sanitizeInterpretResult({
  english: gangLecture,
  unclear: true,
  reason:
    "The individual is not using ASL; they are performing hand gestures/signs that are not standard ASL, while the video on their screen displays song lyrics.",
  mock: false,
  source: "gemini",
});
assert(sanitized.english === POLITE_UNCLEAR_ENGLISH, "hostile english is replaced");
assert(sanitized.unclear === true, "sanitized lecture stays unclear");
assert(sanitized.reason === "", "hostile reason is dropped so it cannot pair with the badge");

const dummy = Buffer.alloc(12_000, 1);
assert(!looksLikeMediaContainer(dummy), "random bytes are not a media container");
const dummySilent = await stripAudioTrack({
  buffer: dummy,
  mimeType: "video/webm",
});
assert(!dummySilent.stripped && !dummySilent.hadAudio, "dummy buffers skip ffmpeg");

await verifyMissingFfmpegSoftFail();
await verifyFfmpegMute();

console.log(
  JSON.stringify(
    {
      prompts: "ok",
      sanitizer: "ok",
      lyricSkip: "ok",
      audioStrip: "ok",
      ok: true,
    },
    null,
    2,
  ),
);

function run(command: string, args: string[]) {
  return new Promise<{ ok: boolean; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => resolve({ ok: false, stdout, stderr: error.message }));
    child.on("close", (code) => resolve({ ok: code === 0, stdout, stderr }));
  });
}

async function verifyMissingFfmpegSoftFail() {
  const header = Buffer.alloc(64);
  header[0] = 0x1a;
  header[1] = 0x45;
  header[2] = 0xdf;
  header[3] = 0xa3;
  const buffer = Buffer.concat([
    header,
    Buffer.from("A_OPUS"),
    Buffer.alloc(12_000, 2),
  ]);
  assert(looksLikeMediaContainer(buffer), "synthetic webm header is a container");
  assert(bufferHasAudioSignature(buffer), "synthetic clip carries an audio signature");

  const prevFfmpeg = process.env.FFMPEG_PATH;
  const prevFfprobe = process.env.FFPROBE_PATH;
  const cases = [
    ["/nonexistent/signspeak-ffmpeg", "/nonexistent/signspeak-ffprobe"],
    ["/bin/false", "/bin/false"],
  ] as const;

  try {
    for (const [ffmpegPath, ffprobePath] of cases) {
      process.env.FFMPEG_PATH = ffmpegPath;
      process.env.FFPROBE_PATH = ffprobePath;
      const result = await stripAudioTrack({ buffer, mimeType: "video/webm" });
      assert(result.hadAudio, `hadAudio stays true when mute cannot run (${ffmpegPath})`);
      assert(!result.stripped, `missing or failed ffmpeg must not throw (${ffmpegPath})`);
      assert(result.buffer.equals(buffer), `original bytes are returned (${ffmpegPath})`);
      assert(result.mimeType === "video/webm", `original mime type is kept (${ffmpegPath})`);
    }
  } finally {
    if (prevFfmpeg === undefined) delete process.env.FFMPEG_PATH;
    else process.env.FFMPEG_PATH = prevFfmpeg;
    if (prevFfprobe === undefined) delete process.env.FFPROBE_PATH;
    else process.env.FFPROBE_PATH = prevFfprobe;
  }
}

async function verifyFfmpegMute() {
  const probe = await run("ffmpeg", ["-version"]);
  if (!probe.ok) {
    console.warn("ffmpeg missing; skipped live remux check");
    return;
  }

  const dir = await mkdtemp(path.join(tmpdir(), "signspeak-verify-audio-"));
  const withAudio = path.join(dir, "with-audio.webm");
  try {
    const encoded = await run("ffmpeg", [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=160x120:d=0.4",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=0.4",
      "-shortest",
      "-c:v",
      "libvpx",
      "-c:a",
      "libvorbis",
      withAudio,
    ]);
    if (!encoded.ok) {
      console.warn("could not encode fixture webm; skipped live remux check", encoded.stderr);
      return;
    }

    const buffer = await readFile(withAudio);
    assert(looksLikeMediaContainer(buffer), "fixture is a media container");
    assert(bufferHasAudioSignature(buffer), "fixture should carry an audio signature");

    const silent = await stripAudioTrack({ buffer, mimeType: "video/webm" });
    assert(silent.hadAudio, "strip should report that audio was present");
    assert(silent.stripped, "audio track must be remuxed out");
    assert(!bufferHasAudioSignature(silent.buffer), "muted buffer must not still look like audio");

    const outPath = path.join(dir, "silent.webm");
    await writeFile(outPath, silent.buffer);
    const audioProbe = await run("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "csv=p=0",
      outPath,
    ]);
    assert(
      audioProbe.ok && !/audio/i.test(audioProbe.stdout),
      "ffprobe must find no audio stream after strip",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
