/** Vercel serverless request body limit, including multipart overhead. */
export const MAX_UPLOAD_BYTES = Math.floor(4.5 * 1024 * 1024);
/**
 * Leave room for landmarks (~0.8 MB at 900 frames) and form boundaries so a
 * 30 s clip still fits under MAX_UPLOAD_BYTES.
 */
export const MAX_VIDEO_BYTES = Math.floor(3.6 * 1024 * 1024);
export const RECORD_BITS_PER_SECOND = 480_000;
export const CLIP_TOO_LARGE_ERROR =
  "That recording is too large to send. Sign a shorter phrase and try again.";
