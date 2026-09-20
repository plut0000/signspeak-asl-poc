# Dedicated ASL model + Gemini fallback (SignSpeak)

**License:** Research / non-commercial dataset use. WLASL is under Microsoft C-UDA 1.0 (computational use only). Do not use WLASL videos commercially. This SignSpeak POC wiring is for DECA research demos.

## Routing pseudocode

```
function translateClip(videoBytes, mimeType, vocab, dedicatedModel, geminiClient):
  landmarks = mediapipeHolisticExtract(videoBytes)   # (T, J, 3)
  if landmarks is missing_or_too_short:
    return geminiClient.interpretAslVideo(videoBytes, mimeType)

  probs = dedicatedModel.predict(landmarks)          # softmax over gloss classes
  topGloss, topProb = argmax(probs), max(probs)

  entry = vocab.findByGloss(topGloss)
  threshold = entry.confidenceThreshold
            ?? vocab.defaultConfidenceThreshold

  if topProb >= threshold and entry exists:
    return {
      english: entry.english,          # natural English from dictionary
      gloss: topGloss,
      confidence: topProb,
      source: "dedicated",
      unclear: false,
      reason: "",
      mock: false
    }

  # Low confidence or OOV → open-vocabulary Gemini vision (existing pipeline)
  gemini = geminiClient.interpretAslVideo(videoBytes, mimeType)
  gemini.source = "gemini"
  gemini.dedicatedTop = { gloss: topGloss, confidence: topProb }
  return gemini
```

## Wiring into SignSpeak `/demo`

1. Train in Colab → download `wlasl100_tcn.pt` + `label_map.json`.
2. Add to the Next.js app (research POC):
   - `public/vocab/asl-key-vocabulary.json` (from the example schema)
   - `src/lib/dedicated-asl.ts` — load vocab + call a small inference API
   - Prefer running landmark extraction + TCN in a Python microservice OR ONNX in Node; for the POC, a `/api/dedicated-interpret` route that shells to a Python worker is fine.
3. Change `/api/interpret` (or the client) to:
   - call dedicated first
   - if `source === "dedicated"` show a "Key vocab" badge
   - else keep current Gemini path and "Gemini" badge
4. UI: in `sign-studio.tsx`, surface `gloss` + confidence when present; keep Replay voice on `english`.
5. Env: `DEDICATED_ASL_ENABLED=true`, `DEDICATED_ASL_THRESHOLD=0.55`.
6. Keep Gemini as the always-on open-vocabulary fallback for songs, names, and anything outside the key list.

## Reality check for DECA

- Dedicated model: fast, consistent on the taught key vocabulary.
- Gemini: open vocabulary, lyrics, messy webcam — already live at https://signspeak-asl-poc.vercel.app/demo
- Hybrid routing gives a clean EIP story: specialized model first, foundation model fallback.
