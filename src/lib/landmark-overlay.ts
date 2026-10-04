import {
  COORDS,
  HAND_LANDMARKS,
  LEFT_HAND_OFFSET,
  LEFT_SHOULDER,
  POS_DIM,
  RIGHT_HAND_OFFSET,
  RIGHT_SHOULDER,
} from "@/lib/asl-citizen";
import type { LandmarkDelegates } from "@/lib/landmark-runtime";

export const SHOW_TRACKING_STORAGE_KEY = "signspeak.showTracking";

export const LEFT_HAND_COLOR = "#22d3ee";
export const RIGHT_HAND_COLOR = "#f59e0b";
export const POSE_COLOR = "rgba(226, 232, 240, 0.9)";
export const FACE_COLOR = "rgba(248, 250, 252, 0.4)";

/** MediaPipe hand connections (wrist → fingers + palm). */
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [5, 9],
  [9, 13],
  [13, 17],
];

const FACE_POINTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const FACE_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 7],
  [0, 4],
  [4, 5],
  [5, 6],
  [6, 8],
  [0, 9],
  [0, 10],
  [9, 10],
];

const POSE_POINTS = [11, 12, 13, 14, 15, 16] as const;
const POSE_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
];

const SAMPLE_INTERVAL_S = 66 / 1000;

/** BiLSTM capture cadence — keep this interval during recording. */
export const RECORD_SAMPLE_MS = 66;
/** Preview can wait a bit longer so inference does not starve painting. */
export const PREVIEW_SAMPLE_MS = 80;
/** Always leave at least one display frame after a detect. */
export const DETECT_YIELD_MS = 16;
export const CHIP_UPDATE_MS = 250;
export const OVERLAY_MAX_DPR = 1.25;
export const PREVIEW_DETECT_MAX_WIDTH = 320;
/** Approach the newest detect this much each 16.67ms display frame. */
export const LANDMARK_SMOOTH = 0.42;

const LEFT_HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> =
  HAND_CONNECTIONS.map(([a, b]) => [LEFT_HAND_OFFSET + a, LEFT_HAND_OFFSET + b]);
const RIGHT_HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> =
  HAND_CONNECTIONS.map(([a, b]) => [RIGHT_HAND_OFFSET + a, RIGHT_HAND_OFFSET + b]);
const LEFT_HAND_POINTS = Array.from(
  { length: HAND_LANDMARKS },
  (_, i) => LEFT_HAND_OFFSET + i,
);
const RIGHT_HAND_POINTS = Array.from(
  { length: HAND_LANDMARKS },
  (_, i) => RIGHT_HAND_OFFSET + i,
);

/** How long to wait before the next detect so a slow infer cannot pile up. */
export function nextDetectDelay(elapsedMs: number, budgetMs: number) {
  const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const budget = Number.isFinite(budgetMs) && budgetMs > 0 ? budgetMs : RECORD_SAMPLE_MS;
  return Math.max(budget, Math.ceil(elapsed) + DETECT_YIELD_MS);
}

export function overlayDevicePixelRatio(rawDpr: number) {
  const dpr = Number.isFinite(rawDpr) && rawDpr > 0 ? rawDpr : 1;
  return Math.min(OVERLAY_MAX_DPR, Math.max(1, dpr));
}

export type OverlayStatus = {
  hands: number;
  body: boolean;
};

export type PackedPlayback = {
  packed: Float32Array;
  frames: number;
};

export function readShowTrackingPref(storage: Pick<Storage, "getItem"> | null) {
  if (!storage) return true;
  try {
    const raw = storage.getItem(SHOW_TRACKING_STORAGE_KEY);
    if (raw === "0" || raw === "false") return false;
    if (raw === "1" || raw === "true") return true;
  } catch {
    return true;
  }
  return true;
}

export function writeShowTrackingPref(
  storage: Pick<Storage, "setItem"> | null,
  on: boolean,
) {
  if (!storage) return;
  try {
    storage.setItem(SHOW_TRACKING_STORAGE_KEY, on ? "1" : "0");
  } catch {
    // Private mode / blocked storage should not break the toggle.
  }
}

export function describeOverlayStatus(status: OverlayStatus) {
  return `Hands: ${status.hands} · Body: ${status.body ? "tracked" : "not tracked"}`;
}

export type DetectReadout = {
  detectFps: number;
  detectMs: number;
  poseDelegate?: LandmarkDelegates["pose"] | "";
  handDelegate?: LandmarkDelegates["hands"] | "";
  detectThread?: "worker" | "main" | "";
};

export function describeDelegateReadout(
  poseDelegate?: string,
  handDelegate?: string,
) {
  const pose = poseDelegate || "";
  const hands = handDelegate || "";
  if (pose && hands) return pose === hands ? pose : `${pose}/${hands}`;
  return pose || hands;
}

export function describeDetectReadout(detect: DetectReadout) {
  const delegate = describeDelegateReadout(
    detect.poseDelegate,
    detect.handDelegate,
  );
  const extras = [delegate, detect.detectThread || ""].filter(Boolean).join(" ");
  return `${Math.round(detect.detectFps)} det · ${Math.round(detect.detectMs)}ms${extras ? ` · ${extras}` : ""}`;
}

/** Ease packed xyz toward the newest detect. Hidden joints snap; visible ones lerp. */
export function approachPackedFrame(
  dest: Float32Array,
  target: Float32Array,
  t: number,
) {
  const alpha = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 1;
  const count = Math.min(dest.length, target.length, POS_DIM);
  for (let i = 0; i < count; i += COORDS) {
    const tx = target[i];
    const ty = target[i + 1];
    const tz = target[i + 2];
    const targetVis = jointVisible(tx, ty);
    const destVis = jointVisible(dest[i], dest[i + 1]);
    if (targetVis && destVis) {
      dest[i] += (tx - dest[i]) * alpha;
      dest[i + 1] += (ty - dest[i + 1]) * alpha;
      dest[i + 2] += (tz - dest[i + 2]) * alpha;
    } else if (targetVis) {
      dest[i] = tx;
      dest[i + 1] = ty;
      dest[i + 2] = tz;
    } else {
      dest[i] = 0;
      dest[i + 1] = 0;
      dest[i + 2] = 0;
    }
  }
  return dest;
}

export function landmarkSmoothAlpha(deltaMs: number) {
  const frames = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) / 16.667 : 1;
  return 1 - Math.pow(1 - LANDMARK_SMOOTH, frames);
}

export function overlayStatusFromFrame(
  frame: Float32Array | null | undefined,
): OverlayStatus {
  if (!frame || frame.length < POS_DIM) return { hands: 0, body: false };
  const body =
    jointVisibleAt(frame, 0) ||
    jointVisibleAt(frame, LEFT_SHOULDER) ||
    jointVisibleAt(frame, RIGHT_SHOULDER);
  const left = handVisible(frame, LEFT_HAND_OFFSET);
  const right = handVisible(frame, RIGHT_HAND_OFFSET);
  return { hands: Number(left) + Number(right), body };
}

/** Map a packed clip onto playback time. Returns null when no landmarks exist. */
export function frameAtPlaybackTime(
  playback: PackedPlayback | null | undefined,
  currentTime: number,
  duration: number,
): Float32Array | null {
  if (!playback || playback.frames <= 0) return null;
  const needed = playback.frames * POS_DIM;
  if (playback.packed.length < needed) return null;

  const span =
    Number.isFinite(duration) && duration > 0
      ? duration
      : playback.frames * SAMPLE_INTERVAL_S;
  if (!(span > 0)) return playback.packed.subarray(0, POS_DIM);

  const time = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
  const t = Math.min(1, time / span);
  const index = Math.min(
    playback.frames - 1,
    Math.max(0, Math.round(t * (playback.frames - 1))),
  );
  const start = index * POS_DIM;
  return playback.packed.subarray(start, start + POS_DIM);
}

export function coverMappedPoint(
  nx: number,
  ny: number,
  videoWidth: number,
  videoHeight: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  const videoAspect = videoWidth / Math.max(videoHeight, 1);
  const canvasAspect = canvasWidth / Math.max(canvasHeight, 1);
  let drawW: number;
  let drawH: number;
  let offsetX: number;
  let offsetY: number;
  if (videoAspect > canvasAspect) {
    drawH = canvasHeight;
    drawW = canvasHeight * videoAspect;
    offsetX = (canvasWidth - drawW) / 2;
    offsetY = 0;
  } else {
    drawW = canvasWidth;
    drawH = canvasWidth / videoAspect;
    offsetX = 0;
    offsetY = (canvasHeight - drawH) / 2;
  }
  return { x: offsetX + nx * drawW, y: offsetY + ny * drawH };
}

export function resizeOverlayCanvas(canvas: HTMLCanvasElement) {
  const dpr = overlayDevicePixelRatio(
    typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
  );
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const pixelW = Math.max(1, Math.round(width * dpr));
  const pixelH = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== pixelW) canvas.width = pixelW;
  if (canvas.height !== pixelH) canvas.height = pixelH;
  return { width, height, dpr };
}

export function drawLandmarkOverlay(
  ctx: CanvasRenderingContext2D,
  frame: Float32Array | null,
  video: Pick<HTMLVideoElement, "videoWidth" | "videoHeight">,
  cssWidth: number,
  cssHeight: number,
  dpr: number,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  if (!frame || frame.length < POS_DIM) return;
  if (video.videoWidth < 8 || video.videoHeight < 8) return;

  const map = (index: number) => pointFromFrame(frame, index, video, cssWidth, cssHeight);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.lineWidth = 1.15;
  ctx.strokeStyle = FACE_COLOR;
  ctx.fillStyle = FACE_COLOR;
  drawConnections(ctx, map, FACE_CONNECTIONS);
  drawDots(ctx, map, FACE_POINTS, 1.8);

  ctx.lineWidth = 2.15;
  ctx.strokeStyle = POSE_COLOR;
  ctx.fillStyle = POSE_COLOR;
  drawConnections(ctx, map, POSE_CONNECTIONS);
  drawDots(ctx, map, POSE_POINTS, 3.1);

  drawHand(ctx, map, LEFT_HAND_CONNECTIONS, LEFT_HAND_POINTS, LEFT_HAND_COLOR);
  drawHand(ctx, map, RIGHT_HAND_CONNECTIONS, RIGHT_HAND_POINTS, RIGHT_HAND_COLOR);
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  map: (index: number) => { x: number; y: number } | null,
  connections: ReadonlyArray<readonly [number, number]>,
  points: readonly number[],
  color: string,
) {
  ctx.lineWidth = 1.85;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  drawConnections(ctx, map, connections);
  drawDots(ctx, map, points, 2.6);
}

function drawConnections(
  ctx: CanvasRenderingContext2D,
  map: (index: number) => { x: number; y: number } | null,
  connections: ReadonlyArray<readonly [number, number]>,
) {
  ctx.beginPath();
  for (const [a, b] of connections) {
    const from = map(a);
    const to = map(b);
    if (!from || !to) continue;
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
  }
  ctx.stroke();
}

function drawDots(
  ctx: CanvasRenderingContext2D,
  map: (index: number) => { x: number; y: number } | null,
  points: readonly number[],
  radius: number,
) {
  for (const index of points) {
    const point = map(index);
    if (!point) continue;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function pointFromFrame(
  frame: Float32Array,
  index: number,
  video: Pick<HTMLVideoElement, "videoWidth" | "videoHeight">,
  cssWidth: number,
  cssHeight: number,
) {
  const off = index * COORDS;
  const x = frame[off];
  const y = frame[off + 1];
  if (!jointVisible(x, y)) return null;
  return coverMappedPoint(
    x,
    y,
    video.videoWidth,
    video.videoHeight,
    cssWidth,
    cssHeight,
  );
}

function handVisible(frame: Float32Array, offset: number) {
  for (let i = 0; i < HAND_LANDMARKS; i++) {
    if (jointVisibleAt(frame, offset + i)) return true;
  }
  return false;
}

function jointVisibleAt(frame: Float32Array, index: number) {
  const off = index * COORDS;
  return jointVisible(frame[off], frame[off + 1]);
}

function jointVisible(x: number | undefined, y: number | undefined) {
  return (
    typeof x === "number" &&
    typeof y === "number" &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    (x !== 0 || y !== 0)
  );
}
