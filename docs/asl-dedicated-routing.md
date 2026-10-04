# Dedicated ASL model + Gemini fallback (SignSpeak)

**License:** Research / non-commercial. The live dedicated model is an ASL
Citizen 200-class BiLSTM (CC BY-NC-SA 4.0). The earlier 100-class weights remain
in `models/asl-citizen-bilstm100/`. The earlier 50-class weights remain
in `models/asl-citizen-bilstm50/`. The earlier 20-class weights remain in
`models/asl-citizen-bilstm20/`. The earlier WLASL TCN scaffold remains parked
and is C-UDA 1.0 if used later.

## Routing

```
function translateClip(video, landmarks, durationMs, quality):
  if dedicated disabled or landmarks missing:
    return gemini.interpretAslVideo(video)   # source = "gemini"

  if durationMs <= ~8s and landmarkFrames <= isolated-sign budget (~120):
    # one isolated sign — unchanged
    if landmarks poor: return gemini.interpretAslVideo(video)
    pred = onnxBiLSTM(preprocess(landmarks))  # (200, 450) → softmax over 200
    if passesGates(pred):                     # conf ≥ 0.55, margin ≥ 0.15, entropy ≤ 0.75
      english = gemini.glossToEnglish(pred) or dictionaryEnglish(pred)
      return { source: "dedicated", gloss, confidence, english }
    return gemini.interpretAslVideo(video) + { dedicatedTop: pred, fallbackReason }

  # several signs in a row (DEDICATED_ASL_SEQUENCE_ENABLED, default on)
  if durationMs > ~30s or landmarkFrames > 900 or tracking < 5 fps:
    return gemini.interpretAslVideo(video) + { fallbackReason }

  segments = segmentSigns(landmarks)
    # pause = both wrists slower than an adaptive threshold (0.3–0.6
    #   shoulder widths/s), or no hand tracked, for ≥ 400 ms
    # motion shorter than ~600 ms is a twitch and is dropped
    # surviving runs are padded ~280 ms; hand-less edges trimmed only if
    #   a full sign remains; nearby pause-segments merge across ~180 ms gaps
    # runs over ~4 s → 2 s sliding windows, 1 s stride
    # every segment is 8–120 frames
  preds = [onnxBiLSTM(preprocess(segment)) for segment in segments]
  confident = [p for p in preds if passesSequenceGates(p)]
    # sequence gates: conf ≥ 0.40, margin ≥ 0.08, entropy ≤ 0.88
    # isolated-sign path still uses 0.55 / 0.15 / 0.75
  if hitsCoverPhrase(confident, segments):    # majority, or ≥2 covering half
    glosses = mergeConsecutiveDuplicates(confident)
  else if hitsCoverPhrase(softTop1, segments) and len(softTop1) >= 2:
    glosses = mergeConsecutiveDuplicates(softTop1)  # conf ≥ 0.28
  else:
    return gemini.interpretAslVideo(video) + { fallbackReason }

  english = gemini.glossesToEnglish(glosses) or dictionaryEnglish(glosses)
  return { source: "dedicated", glosses, segments: { total, confident }, english }
```

The several-signs path replaces the Gemini video call with one Gemini text
call (the same gloss cleanup the single-sign path uses), so it adds no paid
API calls.

## Wiring

1. Train offline → `models/asl-citizen-bilstm200/` (`*.pt`, `label_map200.json`, exported `*.onnx`). Demo **v3.0.1** loads `asl_citizen_bilstm200_rl.onnx`. Gemini video is silent (audio stripped) and lyric-first (v2.1.3.1).
2. Browser: `@mediapipe/tasks-vision` Pose + Hands while recording.
3. `POST /api/interpret` with `video` plus optional `landmarks` binary + frame counts.
4. Server: `onnxruntime-node` CPU inference. No GPU box. Only `GEMINI_API_KEY` is required for Gemini. Segmentation lives in `src/lib/sign-segmentation.ts`; the several-signs decision in `src/lib/asl-sequence.ts`.
5. UI (`sign-studio.tsx`): **Dedicated model** vs **Gemini video** badge, plus **Model v3.0.1 (RL) 200-class** on the dedicated path, gloss + confidence or the gloss sequence (KANGAROO · EGG BEATER · MEASURE), Replay voice on `english`.

Optional env: `DEDICATED_ASL_ENABLED=true`, `DEDICATED_ASL_THRESHOLD=0.55`,
`DEDICATED_ASL_MARGIN=0.15`, `DEDICATED_ASL_MAX_MS=8000`,
`DEDICATED_ASL_MAX_FRAMES=120`, `DEDICATED_ASL_SEQUENCE_ENABLED=true`. If
Gemini video fails after a length skip, the error asks for one word under ~8
seconds; after an unreadable several-signs clip it asks for short pauses
between signs, instead of brighter lighting.

The dedicated model still classifies one isolated sign at a time. Fluent
signing without pauses, songs, names, and anything outside the 200-gloss list
use Gemini video. Long clips fail closed to that path instead of latching onto
a frequent gloss such as EAT.
