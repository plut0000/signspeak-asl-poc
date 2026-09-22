/** Gloss order matches `models/asl-citizen-bilstm200/label_map200.json` (ONNX class ids). */
export const ASL_CITIZEN_GLOSSES = [
  "DOG1",
  "BASKETBALL1",
  "WHATFOR1",
  "BELT1",
  "BEE1",
  "CHRISTMAS1",
  "DARK1",
  "BITE1",
  "DEMAND1",
  "DEAF1",
  "EAT1",
  "MECHANIC1",
  "SHAVE1",
  "PARTY1",
  "ROCKINGCHAIR1",
  "PATIENT2",
  "HOSPITAL1",
  "NIGHT1",
  "MOVIE1",
  "BREAKFAST1",
  "FINE1",
  "FOREIGNER1",
  "ELEVATOR1",
  "DRAG1",
  "EDIT1",
  "HURDLE-TRIP1",
  "LETTUCE1",
  "MICROSCOPE1",
  "DOWNSIZE1",
  "BELIEVE1",
  "AXE1",
  "DECIDE1",
  "LUNCH1",
  "RESEARCH1",
  "TYPE1",
  "NOON1",
  "RECENT1",
  "RIVER1",
  "CANCEL1",
  "CANCER1",
  "THIRD1",
  "TWINS1",
  "CALENDAR1",
  "BACKPACK1",
  "HALLOWEEN1",
  "LOCK1",
  "GUESS1",
  "SPECIAL1",
  "DINNER1",
  "CONFUSED1",
  "CLOUD1",
  "TAKEOFF1",
  "THEY1",
  "DEVELOP1",
  "CHAIN",
  "CATEGORY",
  "AUTISM1",
  "APPLE",
  "APPEAR",
  "AND",
  "ALPHABET",
  "ALARM",
  "AFTER",
  "ACTION",
  "BOWL",
  "BOTTLE",
  "BORROW",
  "BASEBALLCAP",
  "BECAUSE",
  "BASKET1",
  "BASEMENT",
  "BACKOUT",
  "EACH",
  "DROWN5",
  "DODO",
  "DISAPPEAR",
  "DANCE",
  "DEPENDON",
  "CHASE",
  "CHARACTER",
  "CLEAR",
  "CITY1",
  "COCACOLA",
  "CLOSE",
  "CONCEPT",
  "COOKIE",
  "CORN2",
  "COVERUP",
  "CHANNEL",
  "CHEEK",
  "CHOCOLATE",
  "BEHAVIOR",
  "BRAVE",
  "BROTHER",
  "BRAIDS",
  "BOXING",
  "CABINET",
  "BUTTERFLY",
  "CALLTTY",
  "CANCELLATION",
  "CANDY2",
  "CASTLE4",
  "FILTER",
  "FEW",
  "HEALTH",
  "HAMMER",
  "GULLIBLE",
  "GRENADE",
  "GREECE",
  "GREEN",
  "FUTURE",
  "GIFT",
  "FOUR",
  "FLUTE",
  "IMPORTANT",
  "HUSBAND",
  "HOPE",
  "HELMET1",
  "HEARING",
  "HELLO",
  "LIPSTICK",
  "LIGHTER",
  "FAULT",
  "FINISH",
  "FRACTION",
  "FRIENDLY",
  "EMBARRASS",
  "EGGBEATER",
  "EUROPE",
  "EXPERIENCE",
  "FALLINGASLEEP",
  "EXPLANATION",
  "FARM",
  "ENTER",
  "ERASE4",
  "EGYPT",
  "PAIN",
  "NORTH",
  "MOTORCYCLE",
  "NAME",
  "MORNING",
  "MAIL1",
  "MEASURE1",
  "MEDITATE3",
  "LOOKAPPEARANCE",
  "MAYBE",
  "KANGAROO3",
  "KING",
  "LAUGH",
  "LATER",
  "RECORDING",
  "RAIN",
  "SERVE1",
  "SCARED",
  "SHINY",
  "SEW",
  "SINK",
  "SKATE",
  "SLOW",
  "SHOP2",
  "SPEAKERS",
  "SSHH",
  "PSYCHOLOGY",
  "RED",
  "RIGHT2",
  "SAME2",
  "PERSON",
  "PEEKABOO",
  "SUSPECT",
  "SURPRISE",
  "STRANGE",
  "STOMACH",
  "STICKY",
  "STEAL",
  "TEAM",
  "TEMPTATION",
  "THAT",
  "TEXT",
  "THINGS",
  "THIEF1",
  "TRAIN",
  "TRAVEL",
  "TAKECARE",
  "SWITZERLAND",
  "TWO",
  "TROUBLE",
  "UNIVERSITY",
  "UNDERSTAND",
  "VIEW",
  "WANT1",
  "WEAR",
  "VIDEOPHONE",
  "WHAT1",
  "WHY",
  "WINK",
  "WORK",
  "WORKOUT",
  "WORM",
  "WRISTWATCH3",
  "ZOOMOFF",
] as const;

export type AslCitizenGloss = (typeof ASL_CITIZEN_GLOSSES)[number];

export const DEDICATED_MODEL_DIRNAME = "asl-citizen-bilstm200";
export const DEDICATED_MODEL_VERSION = "3.0.1";
export const DEDICATED_MODEL_VARIANT = "RL";
export const DEDICATED_MODEL_LABEL = "Model v3.0.1 (RL) 200-class";
export const DEDICATED_ONNX_FILENAME = "asl_citizen_bilstm200_rl.onnx";
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
  TAKEOFF: "Take off",
  COVERUP: "Cover up",
  HURDLETRIP: "Hurdle trip",
  COCACOLA: "Coca-Cola",
  BASEBALLCAP: "Baseball cap",
  BACKOUT: "Back out",
  DEPENDON: "Depend on",
  CALLTTY: "Call TTY",
  FALLINGASLEEP: "Falling asleep",
  LOOKAPPEARANCE: "Look appearance",
  TAKECARE: "Take care",
  VIDEOPHONE: "Video phone",
  WORKOUT: "Work out",
  ZOOMOFF: "Zoom off",
  EGGBEATER: "Egg beater",
  SSHH: "Shh",
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
  FINISH: "Finished.",
  WHATFOR1: "What for?",
  COCACOLA: "Coca-Cola.",
  TAKEOFF1: "Take off.",
  LUNCH1: "Lunch.",
  SSHH: "Shh.",
  AND: "And.",
  CALLTTY: "Call TTY.",
  ZOOMOFF: "Zoom off.",
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

/** True once enough frames exist to judge coverage and hands are below the dedicated gate. */
export function liveHandCoverageIsLow(frames: number, handFrames: number) {
  if (!Number.isFinite(frames) || frames < MIN_LANDMARK_FRAMES) return false;
  if (!Number.isFinite(handFrames) || handFrames < 0) return true;
  return (
    handFrames < MIN_HAND_FRAMES ||
    handFrames / frames < MIN_HAND_FRAME_RATIO
  );
}
