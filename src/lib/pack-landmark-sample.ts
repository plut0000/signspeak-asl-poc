import {
  COORDS,
  HAND_LANDMARKS,
  LEFT_HAND_OFFSET,
  POSE_LANDMARKS,
  POS_DIM,
  RIGHT_HAND_OFFSET,
} from "@/lib/asl-citizen";
export type LandmarkSample = {
  frame: Float32Array;
  hasPose: boolean;
  hasHand: boolean;
  leftHand: boolean;
  rightHand: boolean;
};

type Point = { x: number; y: number; z?: number };

export function packLandmarkSample(
  pose: Point[] | undefined,
  hands: Point[][],
  handedness: Array<Array<{ categoryName?: string }> | undefined>,
  dest?: Float32Array,
): LandmarkSample | null {
  if (!pose || pose.length < POSE_LANDMARKS) return null;
  const frame = dest && dest.length >= POS_DIM ? dest : new Float32Array(POS_DIM);
  if (dest) frame.fill(0);
  writeLandmarks(frame, 0, pose, POSE_LANDMARKS);

  let hasHand = false;
  let leftHand = false;
  let rightHand = false;
  for (let i = 0; i < hands.length; i++) {
    const label = handedness[i]?.[0]?.categoryName ?? "";
    const isLeft = label.toLowerCase() === "left";
    const offset = isLeft ? LEFT_HAND_OFFSET : RIGHT_HAND_OFFSET;
    if (writeLandmarks(frame, offset, hands[i], HAND_LANDMARKS)) {
      hasHand = true;
      if (isLeft) leftHand = true;
      else rightHand = true;
    }
  }

  return { frame, hasPose: true, hasHand, leftHand, rightHand };
}

function writeLandmarks(
  dest: Float32Array,
  jointOffset: number,
  points: Point[] | undefined,
  count: number,
) {
  if (!points) return false;
  let wrote = false;
  for (let i = 0; i < count; i++) {
    const point = points[i];
    if (!point) continue;
    const off = (jointOffset + i) * COORDS;
    dest[off] = finiteOrZero(point.x);
    dest[off + 1] = finiteOrZero(point.y);
    dest[off + 2] = finiteOrZero(point.z);
    if (dest[off] !== 0 || dest[off + 1] !== 0 || dest[off + 2] !== 0) {
      wrote = true;
    }
  }
  return wrote;
}

function finiteOrZero(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
