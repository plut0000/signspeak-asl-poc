# SignSpeak — ASL to spoken English

A DECA EIP proof of concept. Someone signs a short phrase in American Sign Language on camera, Google Gemini interprets that signing as English text, and the browser speaks the text aloud.

This is a **feasibility demo**, not production-grade ASL recognition and not a substitute for a human interpreter.

## What you can demo

1. Landing page explains the flow: ASL → English text → spoken voice.
2. Camera preview after permission is granted.
3. Record / Stop (auto-stops after 15 seconds).
4. English translation on screen.
5. Automatic speech plus a **Replay voice** button.
6. Sign again / Clear.

Without a Gemini key, the app still runs in labeled **mock translation** mode so judges can click through the UX.

## Run it

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:43127](http://localhost:43127).

## Add a free Gemini API key

Live interpretation needs a Google AI Studio key. The key is read **only on the server** (`src/app/api/interpret/route.ts`). It is never sent to the browser.

1. Create a key at [Google AI Studio](https://aistudio.google.com/apikey).
2. Put it in `.env.local`:

```bash
GEMINI_API_KEY=your_key_here
```

`GOOGLE_GENERATIVE_AI_API_KEY` is accepted as an alias. Restart `npm run dev` after changing env vars.

Optional:

```bash
GEMINI_MODEL=gemini-3.1-flash-lite
```

The server prefers `GEMINI_MODEL` (or `gemini-3.1-flash-lite` if unset), then falls back through other Gemini 3 models when a model returns 503 / high demand. `/api/status` reports the configured primary model.

## How video is sent to Gemini

The demo records a short webcam clip with `MediaRecorder` (WebM on Chromium, MP4 on some Safari builds). That clip is posted to `/api/interpret` as form data, encoded as base64, and passed to Gemini as **inline video** (`@google/genai` `generateContent`).

A 15-second 720p-or-smaller clip stays well under Gemini’s inline size limit, so this POC does **not** extract still frames or use the Files API.

## How to present for DECA

1. Start the app (`npm run dev`).
2. On the landing page, explain the product in one sentence: sign language in, spoken English out.
3. Open **Camera demo**. Allow the webcam. Unmute speakers.
4. Sign a short, common phrase (hello, your name, nice to meet you). Keep hands in frame and lighting even.
5. Point to the English text, then let the voice play. Use **Replay voice** if autoplay speech is blocked.
6. Be explicit about limits: Gemini is a general vision model, accuracy varies, this proves the product loop is possible.

**Backup if the room has no key or weak Wi-Fi:** leave `GEMINI_API_KEY` empty. The yellow mock banner appears and a sample sentence (“Hello, my name is Alex…”) is returned after a short delay. Say out loud that this is mock mode.

## Project layout

- `src/app/page.tsx` — landing
- `src/app/demo/page.tsx` — camera studio
- `src/app/api/interpret/route.ts` — Gemini (or mock) translation
- `src/app/api/status/route.ts` — tells the UI whether mock mode is on
- `src/lib/gemini.ts` — prompt, JSON parsing, mock payload
- `src/lib/tts.ts` — `window.speechSynthesis`

No auth, no database, no paid text-to-speech. Browser Web Speech API handles voice.
