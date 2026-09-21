# SignSpeak patch notes

## Version 2.1.2.1 — Visual-only song translation (faster, quieter)

Long clips still go to **Gemini video**. This patch changes *how* that path
talks and how fast it is — not *when* it is used. Dedicated BiLSTM routing is
unchanged.

**Tone and lyrics**

- Assume the user wants ASL → English. Signed songs should return the **lyric
  lines** (or the closest English of the signed song), not a caption about the
  video.
- Never label gestures as gang signs, slang crews, or crime. Never lecture
  that the user is screen-recording or watching someone else.
- If signing truly cannot be read, show a short polite unclear line. The UI
  badge is **Signing unclear**, and inflammatory Gemini text is stripped so it
  cannot pair with that badge.

**Visual-only (no soundtrack leak)**

- Camera and MediaRecorder stay **mic off** (video tracks only).
- The interpret API remuxes with ffmpeg (`-an`) when an audio track is present,
  so Gemini never receives song audio.
- Prompts tell the model to ignore audio entirely and translate from visible
  signing / signed on-screen words only.

**What got faster**

- Video interpret uses **flash-lite** models only (default
  `gemini-3.1-flash-lite`); slower full-flash fallbacks are skipped.
- One attempt per model (no 5× SDK retry). No second “lyric focus” call when
  the first answer already looks like lyrics or a signed message.
- Sample video at **8 fps** and disable thinking (`thinkingBudget: 0`).
- Long-clip UI says “Translating the signed song or phrase…” as soon as
  processing starts — it does not fake a shorter wait.

v2.1.1 routing and v2.1 RL weights are unchanged.

## Version 2.1.1 — Long clips use Gemini video

The dedicated 20-class BiLSTM is an **isolated-sign** classifier. Long or
continuous videos (songs, conversation, multi-sign phrases) used to be
resampled to length 200 and still emitted one of 20 glosses — often a sticky
wrong word such as **EAT**. Gemini cleanup then turned that gloss into an
English sentence about eating.

**v2.1.1 routing:**

- Clips longer than ~5 seconds, or landmark sequences longer than a typical
  isolated sign, **skip dedicated inference** and use Gemini full-video.
- Short one-sign-like clips can still use BiLSTM → Gemini English cleanup when
  confidence is high (default ≥ 55%), the top-1 vs top-2 margin is clear
  (≥ 0.15), and softmax entropy is not too high.
- The UI still labels **Dedicated model** vs **Gemini video**. A long clip is
  not shown as a single vocab word.

v2.1 RL weights are unchanged.

## Version 2.1 — RL fine-tune (20-word ASL Citizen BiLSTM)

The dedicated isolated-sign classifier now ships the RL-fine-tuned v2.1 weights
(REINFORCE + a light cross-entropy mix). Vocabulary is unchanged: still the
same **20 isolated signs**.

### Accuracy (held-out test)

| | Top-1 | Top-5 |
| --- | --- | --- |
| v2.0 (supervised CE) | 77.3% | ~99% |
| **v2.1 (RL)** | **82.8%** | ~99% |

About **+5.5 points** top-1. Top-5 stays around 99%.

### What did not change

- Still 20 isolated signs (not 50 — that is v2.2 later)
- Same pipeline: landmarks → ONNX BiLSTM → Gemini English cleanup
- Low-confidence or missing landmarks still fall back to Gemini video

### Production weights

`/api/interpret` loads `models/asl-citizen-bilstm20/asl_citizen_bilstm20_rl.onnx`
plus the sidecar `asl_citizen_bilstm20_rl.onnx.data`. The `.pt` checkpoint is
kept alongside for reference. Metrics: `rl_report_v21.json`.
