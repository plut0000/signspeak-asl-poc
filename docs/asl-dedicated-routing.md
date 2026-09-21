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
  if dedicated disabled or landmarks missing/poor:
    return gemini.interpretAslVideo(video)   # source = "gemini"

  if durationMs > ~5s or landmarkFrames > isolated-sign budget (~80):
    return gemini.interpretAslVideo(video)   # skip BiLSTM entirely

  features = preprocess(landmarks)           # (200, 450)
  pred = onnxBiLSTM(features)                # softmax over 200 glosses

  if pred.confidence >= threshold (~0.55)
     and (top1 - top2) >= margin (~0.15)
     and normalizedEntropy <= ~0.75:
    english = gemini.glossToEnglish(pred) or dictionaryEnglish(pred)
    return { source: "dedicated", gloss, confidence, english }

  gemini = gemini.interpretAslVideo(video)
  gemini.source = "gemini"
  gemini.dedicatedTop = pred
  gemini.fallbackReason = "confidence / margin / entropy"
  return gemini
```

## Wiring

1. Train offline → `models/asl-citizen-bilstm200/` (`*.pt`, `label_map200.json`, exported `*.onnx`). Demo **v3.0** loads `asl_citizen_bilstm200_rl.onnx`; v2.1.1 routing still skips BiLSTM for long clips. Gemini video is silent (audio stripped) and lyric-first (v2.1.3.1).
2. Browser: `@mediapipe/tasks-vision` Pose + Hands while recording.
3. `POST /api/interpret` with `video` plus optional `landmarks` binary + frame counts.
4. Server: `onnxruntime-node` CPU inference. No GPU box. Only `GEMINI_API_KEY` is required for Gemini.
5. UI (`sign-studio.tsx`): **Dedicated model** vs **Gemini video** badge, plus **Model v3.0 (RL) 200-class** on the dedicated path, gloss + confidence, Replay voice on `english`.

Optional env: `DEDICATED_ASL_ENABLED=true`, `DEDICATED_ASL_THRESHOLD=0.55`,
`DEDICATED_ASL_MARGIN=0.15`, `DEDICATED_ASL_MAX_MS=5000`,
`DEDICATED_ASL_MAX_FRAMES=80`.

The dedicated model is isolated-sign only. Songs, conversation, names, and
anything outside the 200-gloss list use Gemini video. Long clips fail closed
to that path instead of latching onto a frequent gloss such as EAT.
