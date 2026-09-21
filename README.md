# SignSpeak — ASL to spoken English

A DECA EIP proof of concept. Someone signs a short phrase in American Sign
Language on camera. A dedicated 20-class BiLSTM reads isolated signs from
MediaPipe landmarks. Gemini only turns that gloss into a clean English sentence
(and the browser speaks it). If the classifier is unsure or landmarks fail, the
existing full-video Gemini interpret path still runs.

This is a **feasibility demo**, not production-grade ASL recognition and not a
substitute for a human interpreter.

**Demo v2.1.2.1:** Gemini video translates signed songs from **vision only**
(mic off, audio stripped, prompts ignore soundtrack). Long / continuous clips
still skip the isolated-sign BiLSTM. The dedicated model is only for a short,
high-confidence one-sign clip. v2.1 RL weights are unchanged (20 isolated
signs, **82.8%** test top-1). See `PATCH_NOTES.md`.

**License:** ASL Citizen derived keypoints and the bundled BiLSTM are
**CC BY-NC-SA 4.0** (research / non-commercial DECA POC). See
`models/asl-citizen-bilstm20/README.md`.

## What you can demo

1. Landing page explains the hybrid loop: webcam → landmarks → BiLSTM gloss → Gemini English → voice.
2. Camera preview after permission is granted.
3. Record / Stop (auto-stops after 30 seconds).
4. English translation on screen, plus predicted gloss + confidence and whether the path was **Dedicated model** or **Gemini video**.
5. Automatic speech plus a **Replay voice** button.
6. Sign again / Clear.

Without a Gemini key, the dedicated path still returns dictionary English for a
confident gloss. The Gemini video path stays in labeled **mock translation**
mode so judges can click through the UX.

## Isolated-sign note for judges

Recording can stay ~15–30 seconds, but the BiLSTM was trained on **isolated**
ASL Citizen clips. Sign **one** vocab sign (hello, name, what, …), keep both
hands in frame, then stop. Clips longer than ~5 seconds, or landmark
sequences longer than a typical isolated sign, **skip the dedicated model**
and use Gemini video. Fingerspelling, songs, and conversation take that path
too. The UI badge shows **Dedicated model** vs **Gemini video** so a long
clip is never presented as a single vocab word.

### 20-class vocab

HELLO, NAME, WHAT, WHY, WORK, EAT, FINE, UNDERSTAND, WANT, MORNING, NIGHT,
BROTHER, FRIENDLY, FINISH, MAYBE, IMPORTANT, HEALTH, DINNER, AFTER, BECAUSE.

Dataset labels with trailing digits (`WHAT1`, `EAT1`, …) are shown in the UI
without those digits.

## Run it

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:43127](http://localhost:43127).

Optional model / routing checks (no webcam):

```bash
npm run verify:model
npm run verify:routing
# with the app running:
npm run verify:api
```

## Add a free Gemini API key

Live Gemini cleanup / video fallback needs a Google AI Studio key. The key is
read **only on the server**. It is never sent to the browser.

1. Create a key at [Google AI Studio](https://aistudio.google.com/apikey).
2. Put it in `.env.local`:

```bash
GEMINI_API_KEY=your_key_here
```

`GOOGLE_GENERATIVE_AI_API_KEY` is accepted as an alias. Restart `npm run dev`
after changing env vars.

Optional:

```bash
GEMINI_MODEL=gemini-3.1-flash-lite
DEDICATED_ASL_ENABLED=true
DEDICATED_ASL_THRESHOLD=0.55
# DEDICATED_ASL_MARGIN=0.15
# DEDICATED_ASL_MAX_MS=5000
# DEDICATED_ASL_MAX_FRAMES=80
```

`/api/status` reports the Gemini model and dedicated-model settings.

## Hybrid pipeline

```
webcam clip
  ├─ MediaPipe Pose + Hands (browser, Tasks JS)
  │    75 landmarks × xyz → shoulder-center / shoulder-width norm
  │    resample to 200 → flatten 225 + velocities 225 = 450
  │    if clip > ~5s or landmark sequence longer than an isolated sign
  │         → skip BiLSTM (Gemini full-video)
  │    else ONNX BiLSTM on the server (onnxruntime-node, CPU)
  │    if max softmax ≥ 0.55 and top-1 − top-2 ≥ 0.15 and entropy is low
  │         → Gemini gloss→English (or dictionary if no key)
  └─ else / missing hands / too few frames / tracker failed / unsure softmax
       existing Gemini full-video interpret (or mock)
```

Weights and the export script live in `models/asl-citizen-bilstm20/`. Production
inference uses the v2.1 RL graph
(`asl_citizen_bilstm20_rl.onnx` + `asl_citizen_bilstm20_rl.onnx.data`). The
`.pt` checkpoint and the earlier supervised CE ONNX are kept alongside for
reference. Architecture is `train_bilstm.py`: Linear 450→128, 2-layer
bidirectional LSTM (h=128), attention pool, Linear→20. Reported test top-1 is
**82.8%** (v2.0 CE was 77.3%).

No extra secrets and no GPU box. Inference is small enough for Vercel Node
functions (`onnxruntime-node` + traced ONNX file).

## Landmark-parity risks

Training used processed ASL Citizen keypoints `(T, 75, 3)` after dropping the
4th (visibility) channel, then shoulder-center subtraction, shoulder-width
scale, length-200 resample, and first-order velocities. Live capture uses
**MediaPipe Tasks** Pose + Hands, not the older Holistic graph that likely
produced the Kaggle PKLs.

Remaining risks (accuracy can drop silently if these differ):

- Tasks vs Holistic `z` scale and handedness labels.
- Missing hands stored as zeros, then normalized with the body (same as “apply
  the transform to the whole skeleton,” but not independently verified against
  a training `.npy` shard).
- Linear time resample vs whatever pad/truncate the HF preprocessor used.
- Webcam framing, fps, and motion blur vs the isolated-sign studio videos.

If landmarks look poor, the app **falls back** to Gemini video instead of
forcing a bad gloss.

## How to present for DECA

1. Start the app (`npm run dev`).
2. On the landing page, explain: isolated-sign model first, Gemini for English
   cleanup and for anything the classifier is not sure about.
3. Open **Camera demo**. Allow the webcam. Unmute speakers.
4. Sign a single vocab sign (hello is the easiest). Keep hands in frame.
5. Point to the **Dedicated model** badge, gloss + confidence, then the spoken
   English. Sign something outside the list, hide your hands, or record a longer
   clip to show **Gemini video** fallback.
6. Be explicit about limits: 20 glosses, isolated signs, not a certified
   interpreter.

**Backup if the room has no key or weak Wi-Fi:** leave `GEMINI_API_KEY` empty.
A confident dedicated prediction still shows dictionary English. Otherwise the
yellow mock banner appears and a sample sentence is returned.

## Project layout

- `src/app/page.tsx` — landing
- `src/app/demo/page.tsx` — camera studio
- `src/app/api/interpret/route.ts` — dedicated ONNX path + Gemini fallback
- `src/app/api/status/route.ts` — mock mode + dedicated settings
- `src/lib/asl-preprocess.ts` / `asl-infer.ts` — landmark contract + ONNX
- `src/lib/mediapipe-landmarks.ts` — browser Pose + Hands
- `src/lib/gemini.ts` — gloss cleanup, video interpret, mock payload
- `src/lib/tts.ts` — `window.speechSynthesis`
- `models/asl-citizen-bilstm20/` — v2.1 RL ONNX (default), v2.0 CE baseline, labels, train script
- `PATCH_NOTES.md` — judge-facing notes (also shown on the landing and demo pages)

No auth, no database, no paid text-to-speech. Browser Web Speech API handles
voice.
