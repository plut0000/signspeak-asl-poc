import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PROBE_TIMEOUT_MS = 8_000;
const REMUX_TIMEOUT_MS = 12_000;

export type SilentVideo = {
  buffer: Buffer;
  mimeType: string;
  hadAudio: boolean;
  stripped: boolean;
};

export function looksLikeMediaContainer(buffer: Buffer) {
  if (buffer.length < 12) return false;
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return true;
  }
  if (buffer.toString("ascii", 4, 8) === "ftyp") return true;
  if (buffer.toString("ascii", 0, 4) === "RIFF") return true;
  return false;
}

export function bufferHasAudioSignature(buffer: Buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 512_000));
  const latin1 = sample.toString("latin1");
  return (
    latin1.includes("A_OPUS") ||
    latin1.includes("A_VORBIS") ||
    latin1.includes("A_AAC") ||
    latin1.includes("OpusHead") ||
    latin1.includes("mp4a")
  );
}

function commandName(kind: "ffmpeg" | "ffprobe") {
  const envKey = kind === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH";
  return process.env[envKey]?.trim() || kind;
}

function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr });
    });
  });
}

export async function stripAudioTrack(input: {
  buffer: Buffer;
  mimeType: string;
}): Promise<SilentVideo> {
  if (!looksLikeMediaContainer(input.buffer)) {
    return {
      buffer: input.buffer,
      mimeType: input.mimeType,
      hadAudio: false,
      stripped: false,
    };
  }

  const ext = input.mimeType.includes("mp4") ? "mp4" : "webm";
  const dir = await mkdtemp(path.join(tmpdir(), "signspeak-mute-"));
  const inPath = path.join(dir, `in.${ext}`);
  const outPath = path.join(dir, `out.${ext}`);

  try {
    await writeFile(inPath, input.buffer);

    const probe = await runCommand(
      commandName("ffprobe"),
      [
        "-v",
        "error",
        "-select_streams",
        "a",
        "-show_entries",
        "stream=codec_type",
        "-of",
        "csv=p=0",
        inPath,
      ],
      PROBE_TIMEOUT_MS,
    );

    const probedAudio = probe.ok && /audio/i.test(probe.stdout);
    const signedAudio = bufferHasAudioSignature(input.buffer);
    const hadAudio = probedAudio || signedAudio;

    if (probe.ok && !probedAudio && !signedAudio) {
      return {
        buffer: input.buffer,
        mimeType: input.mimeType,
        hadAudio: false,
        stripped: false,
      };
    }

    if (!hadAudio) {
      return {
        buffer: input.buffer,
        mimeType: input.mimeType,
        hadAudio: false,
        stripped: false,
      };
    }

    const copy = await runCommand(
      commandName("ffmpeg"),
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        inPath,
        "-map",
        "0:v:0",
        "-an",
        "-c:v",
        "copy",
        outPath,
      ],
      REMUX_TIMEOUT_MS,
    );

    if (copy.ok) {
      const buffer = await readFile(outPath);
      if (buffer.length > 32) {
        return {
          buffer,
          mimeType: ext === "mp4" ? "video/mp4" : "video/webm",
          hadAudio: true,
          stripped: true,
        };
      }
    }

    throw new Error("Could not mute the clip before translation.");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
