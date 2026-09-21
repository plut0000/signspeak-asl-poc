import type { InterpretSuccess } from "./types";

export const POLITE_UNCLEAR_ENGLISH =
  "The signing was too unclear to translate into English.";

const FORBIDDEN_NARRATION_PATTERNS = [
  /\bgang signs?\b/,
  /\bgang[- ]related\b/,
  /\bcriminal\b/,
  /\billegal (gesture|sign|hand)\b/,
  /\bscreen[- ]record(?:ing|ed)?\b/,
  /\brecording (their|your|the) screen\b/,
  /\bwatching a video\b/,
  /\bwatching (someone|another video|a music video)\b/,
  /\bnot performing asl\b/,
  /\bnot using asl\b/,
  /\bnot (actually )?signing\b/,
  /\bmimicking (gang|signs|gestures)\b/,
  /\bthese are not (standard )?asl\b/,
  /\bnot standard asl\b/,
  /\bhand gestures?\/signs that are not standard asl\b/,
  /\bin sync with music\b/,
  /\bthe user is recording\b/,
  /\btranscri(be|bing) (the )?(audio|soundtrack|music|song)\b/,
  /\bfrom the (audio|soundtrack)\b/,
  /\bsoundtrack\b/,
  /\bmusic lyrics shown on the screen\b/,
];

const META_SONG_PATTERNS = [
  /\b(a |the )?person is signing\b/,
  /\bsomeone is signing\b/,
  /\bthey are signing\b/,
  /\bthe signer is (signing|performing|singing)\b/,
  /\bsigning (a |this |the )?(song|hymn|rap|chant|poem|lyrics|music)\b/,
  /\bperforming (a |the )?(song|hymn|rap|chant|poem|lyrics|music)\b/,
  /\bsigning this song\b/,
  /\bsigning music\b/,
  /\bperforming lyrics\b/,
  /\bthey are performing\b/,
  /\b(a |the )?person is performing\b/,
  /\bsomeone is performing\b/,
  /\bthis (clip|video) shows (someone|a person).{0,40}sign/,
  /\basl (performance|interpretation) of (a |the )?(song|hymn|lyrics)\b/,
  /\ba person is signing a song\b/,
  /\bthey are performing lyrics\b/,
  /\bsomeone is signing music\b/,
];

function haystack(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchesAny(text: string, patterns: RegExp[]) {
  const lower = haystack(text);
  if (!lower) return false;
  return patterns.some((pattern) => pattern.test(lower));
}

/** Camera lectures, crime labels, audio transcription — never show as the translation. */
export function looksLikeForbiddenNarration(text: string) {
  return matchesAny(text, FORBIDDEN_NARRATION_PATTERNS);
}

/** Meta “this is a video of someone signing a song” captions instead of lyric text. */
export function looksLikeMetaSongDescription(english: string) {
  return matchesAny(english, META_SONG_PATTERNS);
}

export function looksLikeSignedLyricOrMessage(english: string) {
  const trimmed = english.trim();
  if (trimmed.length < 8) return false;
  if (trimmed === POLITE_UNCLEAR_ENGLISH) return false;
  if (looksLikeForbiddenNarration(trimmed)) return false;
  if (looksLikeMetaSongDescription(trimmed)) return false;

  const lower = haystack(trimmed);
  if (
    /^(the (person|user|individual|signer|clip|video)|this (clip|video)|someone in the video)\b/.test(
      lower,
    )
  ) {
    return false;
  }

  return true;
}

/**
 * Extra Gemini round-trip only when the first answer was a caption / lecture,
 * not when it already reads as lyrics or a signed message.
 */
export function shouldRetryLyricFocus(result: InterpretSuccess) {
  const english = result.english ?? "";
  if (looksLikeSignedLyricOrMessage(english)) return false;
  return (
    looksLikeForbiddenNarration(english) ||
    looksLikeForbiddenNarration(result.reason ?? "") ||
    looksLikeMetaSongDescription(english)
  );
}

export function sanitizeInterpretResult(
  result: InterpretSuccess,
): InterpretSuccess {
  const english = (result.english ?? "").trim();
  const reason = (result.reason ?? "").trim();
  const badEnglish =
    looksLikeForbiddenNarration(english) || looksLikeMetaSongDescription(english);
  const badReason = looksLikeForbiddenNarration(reason);

  if (badEnglish) {
    return {
      ...result,
      english: POLITE_UNCLEAR_ENGLISH,
      unclear: true,
      reason: "",
    };
  }

  if (badReason) {
    return {
      ...result,
      reason: "",
    };
  }

  return {
    ...result,
    english: english || POLITE_UNCLEAR_ENGLISH,
    reason,
  };
}
