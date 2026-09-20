# Dedicated ASL model + Gemini fallback (SignSpeak)

**License:** Research / non-commercial. The live dedicated model is an ASL
Citizen 20-class BiLSTM (CC BY-NC-SA 4.0). The earlier WLASL TCN scaffold
remains parked and is C-UDA 1.0 if used later.

## Routing

```
function translateClip(video, landmarks, quality):
  if dedicated disabled or landmarks missing/poor:
    return gemini.interpretAslVideo(video)   # source = "gemini"

  features = preprocess(landmarks)           # (200, 450)
  pred = onnxBiLSTM(features)                # softmax over 20 glosses

  if pred.confidence >= threshold (~0.45):
    english = gemini.glossToEnglish(pred) or dictionaryEnglish(pred)
    return { source: "dedicated", gloss, confidence, english }

  gemini = gemini.interpretAslVideo(video)
  gemini.source = "gemini"
  gemini.dedicatedTop = pred
  gemini.fallbackReason = "confidence below threshold"
  return gemini
```

## Wiring

1. Train offline → `models/asl-citizen-bilstm20/` (`*.pt`, `label_map.json`, exported `*.onnx`).
2. Browser: `@mediapipe/tasks-vision` Pose + Hands while recording.
3. `POST /api/interpret` with `video` plus optional `landmarks` binary + frame counts.
4. Server: `onnxruntime-node` CPU inference. No GPU box. Only `GEMINI_API_KEY` is required for Gemini.
5. UI (`sign-studio.tsx`): **Dedicated model** vs **Gemini video** badge, gloss + confidence, Replay voice on `english`.

Optional env: `DEDICATED_ASL_ENABLED=true`, `DEDICATED_ASL_THRESHOLD=0.45`.

The dedicated model is isolated-sign only. Songs, names, and anything outside
the 20-gloss list should use Gemini video.
