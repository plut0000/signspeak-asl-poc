export const ASL_CITIZEN_GLOSSES = [
  "HELLO",
  "NAME",
  "WHAT1",
  "WHY",
  "WORK",
  "EAT1",
  "FINE1",
  "UNDERSTAND",
  "WANT1",
  "MORNING",
  "NIGHT1",
  "BROTHER",
  "FRIENDLY",
  "FINISH",
  "MAYBE",
  "IMPORTANT",
  "HEALTH",
  "DINNER1",
  "AFTER",
  "BECAUSE",
  "BASKETBALL1",
  "DOG1",
  "WHATFOR1",
  "BELT1",
  "HOSPITAL1",
  "MOVIE1",
  "FOREIGNER1",
  "BELIEVE1",
  "BEE1",
  "CHRISTMAS1",
  "SHAVE1",
  "PATIENT2",
  "ELEVATOR1",
  "LETTUCE1",
  "RESEARCH1",
  "TYPE1",
  "RECENT1",
  "CANCEL1",
  "CLOUD1",
  "DEAF1",
  "MECHANIC1",
  "PARTY1",
  "ROCKINGCHAIR1",
  "DRAG1",
  "MICROSCOPE1",
  "DOWNSIZE1",
  "DARK1",
  "BITE1",
  "DEMAND1",
  "BREAKFAST1",
] as const;

export type AslCitizenGloss = (typeof ASL_CITIZEN_GLOSSES)[number];

export const DEDICATED_MODEL_DIRNAME = "asl-citizen-bilstm50";
export const DEDICATED_MODEL_VERSION = "2.1.2";
export const DEDICATED_MODEL_VARIANT = "RL";
export const DEDICATED_MODEL_LABEL = "Model v2.1.2 (RL) 50-class";
export const DEDICATED_ONNX_FILENAME = "asl_citizen_bilstm50_rl.onnx";
export const DEFAULT_DEDICATED_THRESHOLD = 0.55;
export const MIN_LANDMARK_FRAMES = 8;
export const MIN_HAND_FRAMES = 4;
export const MIN_HAND_FRAME_RATIO = 0.2;
export const MAX_LANDMARK_FRAMES = 900;

export const TARGET_LEN = 200;
export const POSE_LANDMARKS = 33;
export const HAND_LANDMARKS = 21;
export const JOINTS = 75;
export const COORDS = 3;
export const POS_DIM = JOINTS * COORDS;
export const FEAT_DIM = POS_DIM * 2;
export const LEFT_SHOULDER = 11;
export const RIGHT_SHOULDER = 12;
export const LEFT_HAND_OFFSET = POSE_LANDMARKS;
export const RIGHT_HAND_OFFSET = POSE_LANDMARKS + HAND_LANDMARKS;

/** Concatenated ASL Citizen glosses that read better as multiple English words. */
const MULTIWORD_GLOSSES: Record<string, string> = {
  WHATFOR: "What for",
  ROCKINGCHAIR: "Rocking chair",
};

export function getDedicatedThreshold() {
  const raw = process.env.DEDICATED_ASL_THRESHOLD?.trim();
  if (!raw) return DEFAULT_DEDICATED_THRESHOLD;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : DEFAULT_DEDICATED_THRESHOLD;
}

export function isDedicatedEnabled() {
  const raw = process.env.DEDICATED_ASL_ENABLED?.trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

export function glossFromId(id: number) {
  return ASL_CITIZEN_GLOSSES[id] ?? "";
}

/** Strip trailing dataset digits: WHAT1 → What, BASKETBALL1 → Basketball. */
export function friendlyGloss(gloss: string) {
  const trimmed = gloss.replace(/\d+$/, "").replace(/[_-]+/g, " ").trim();
  if (!trimmed) return gloss;
  const compact = trimmed.replace(/\s+/g, "").toUpperCase();
  const multiword = MULTIWORD_GLOSSES[compact];
  if (multiword) return multiword;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

export function friendlyVocabList() {
  return ASL_CITIZEN_GLOSSES.map((gloss) => friendlyGloss(gloss));
}

const FALLBACK_ENGLISH: Record<string, string> = {
  HELLO: "Hello.",
  NAME: "Name.",
  WHAT1: "What?",
  WHY: "Why?",
  WORK: "Work.",
  EAT1: "Eat.",
  FINE1: "I'm fine.",
  UNDERSTAND: "I understand.",
  WANT1: "Want.",
  MORNING: "Good morning.",
  NIGHT1: "Good night.",
  BROTHER: "Brother.",
  FRIENDLY: "Friendly.",
  FINISH: "Finished.",
  MAYBE: "Maybe.",
  IMPORTANT: "Important.",
  HEALTH: "Health.",
  DINNER1: "Dinner.",
  AFTER: "After.",
  BECAUSE: "Because.",
  BASKETBALL1: "Basketball.",
  DOG1: "Dog.",
  WHATFOR1: "What for?",
  BELT1: "Belt.",
  HOSPITAL1: "Hospital.",
  MOVIE1: "Movie.",
  FOREIGNER1: "Foreigner.",
  BELIEVE1: "Believe.",
  BEE1: "Bee.",
  CHRISTMAS1: "Christmas.",
  SHAVE1: "Shave.",
  PATIENT2: "Patient.",
  ELEVATOR1: "Elevator.",
  LETTUCE1: "Lettuce.",
  RESEARCH1: "Research.",
  TYPE1: "Type.",
  RECENT1: "Recent.",
  CANCEL1: "Cancel.",
  CLOUD1: "Cloud.",
  DEAF1: "Deaf.",
  MECHANIC1: "Mechanic.",
  PARTY1: "Party.",
  ROCKINGCHAIR1: "Rocking chair.",
  DRAG1: "Drag.",
  MICROSCOPE1: "Microscope.",
  DOWNSIZE1: "Downsize.",
  DARK1: "Dark.",
  BITE1: "Bite.",
  DEMAND1: "Demand.",
  BREAKFAST1: "Breakfast.",
};

export function englishFromGloss(gloss: string) {
  return FALLBACK_ENGLISH[gloss] ?? `${friendlyGloss(gloss)}.`;
}

export type LandmarkQuality = {
  frames: number;
  poseFrames: number;
  handFrames: number;
  reason: string;
};

export function assessLandmarkQuality(input: {
  frames: number;
  poseFrames: number;
  handFrames: number;
}): LandmarkQuality {
  const { frames, poseFrames, handFrames } = input;
  if (frames < MIN_LANDMARK_FRAMES || poseFrames < MIN_LANDMARK_FRAMES) {
    return {
      frames,
      poseFrames,
      handFrames,
      reason: "Too few landmark frames to trust the dedicated model.",
    };
  }
  if (
    handFrames < MIN_HAND_FRAMES ||
    handFrames / Math.max(frames, 1) < MIN_HAND_FRAME_RATIO
  ) {
    return {
      frames,
      poseFrames,
      handFrames,
      reason: "Hands were missing or poorly tracked in too many frames.",
    };
  }
  return { frames, poseFrames, handFrames, reason: "" };
}
