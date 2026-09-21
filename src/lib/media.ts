export const RECORD_SECONDS = 30;
export const MIN_RECORD_MS = 1200;
/** Matches isolated-sign routing; used for the long-clip processing message only. */
export const LONG_CLIP_HINT_MS = 5_000;

const RECORDER_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4",
];

export function pickRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return RECORDER_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

/** Drop any microphone / tab-audio tracks so Gemini never receives a soundtrack. */
export function videoOnlyStream(stream: MediaStream) {
  for (const track of stream.getAudioTracks()) {
    track.stop();
    stream.removeTrack(track);
  }
  return new MediaStream(stream.getVideoTracks());
}

export function extensionForMime(mimeType: string) {
  return mimeType.includes("mp4") ? "mp4" : "webm";
}

export function cameraErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      return "Camera permission was denied. Allow the camera in your browser settings, then try again.";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No camera was found on this device.";
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "The camera is already in use by another app. Close it and try again.";
    }
  }
  if (!window.isSecureContext) {
    return "Cameras require HTTPS or localhost. Open this demo from a secure origin.";
  }
  return "Could not start the camera. Check permissions and try again.";
}
