# SignSpeak patch notes

## Version 3.0.1 — Extra RL on the 200-class BiLSTM

The dedicated isolated-sign classifier keeps the same **200** ASL Citizen
signs. Extra RL fine-tuning replaces the v3.0 weights. The word list is
unchanged.

### Accuracy (held-out test)

| | Top-1 | Top-5 |
| --- | --- | --- |
| Supervised CE | 87.25% | 98.14% |
| v3.0 (first RL) | 89.70% | 98.20% |
| **v3.0.1 (extra RL)** | **90.29%** | 98.14% |

Exact test top-1 is **90.287%** (~**90.3%**, up from ~**89.7%**). Top-5 stays
around **98.1%**. Metrics: `rl_report_v3_more3.json` and
`v3_more3_rl_summary.json`. The v3.0 report remains in `rl_report_v3.json`.

### What did not change

- Isolated-sign only — not continuous signing
- Same 200 classes; no vocabulary dump in the empty state
- Same pipeline: landmarks → ONNX BiLSTM → Gemini English cleanup
- **v2.1.1 long-clip routing stays:** clips longer than ~5 seconds, or
  landmark sequences longer than a typical isolated sign (~80 frames),
  **skip dedicated inference** and use Gemini full-video
- Uncertain BiLSTM predictions (confidence below 55%, top-1 vs top-2
  margin below 0.15, or normalized entropy above 0.75) also fall back to
  Gemini video, and the UI still shows why the custom model was skipped
- **v2.1.3.1 Gemini visual-only stays:** mic off, audio stripped, lyric-first
  silent-clip prompts, no gang-sign or screen-recording lectures, flash-lite
  long-clip path. Mute / audio-strip failures still soft-fail

### Production weights

`/api/interpret` still loads
`models/asl-citizen-bilstm200/asl_citizen_bilstm200_rl.onnx` plus the sidecar
`asl_citizen_bilstm200_rl.onnx.data`. Those files, and the `.pt` checkpoint,
are the v3.0.1 RL weights. `/api/status` reports `version: "3.0.1"` and
`Model v3.0.1 (RL) 200-class`.

## Version 3.0 — 200-class RL ASL Citizen BiLSTM

The dedicated isolated-sign classifier now ships the **full 200-class** ASL
Citizen vocabulary with RL-fine-tuned BiLSTM weights. A 150-class fallback
was **not** needed.

### Accuracy (held-out test)

| | Top-1 | Top-5 |
| --- | --- | --- |
| Supervised CE | 87.25% | 98.14% |
| **v3.0 (RL)** | **89.70%** | 98.20% |

About **+2.5 points** top-1 after REINFORCE + a light cross-entropy mix.
Top-5 stays around **98%**.

### What did not change

- Isolated-sign only — not continuous signing
- Same pipeline: landmarks → ONNX BiLSTM → Gemini English cleanup
- **v2.1.1 long-clip routing stays:** clips longer than ~5 seconds, or
  landmark sequences longer than a typical isolated sign (~80 frames),
  **skip dedicated inference** and use Gemini full-video
- Uncertain BiLSTM predictions (confidence below 55%, top-1 vs top-2
  margin below 0.15, or normalized entropy above 0.75) also fall back to
  Gemini video
- **v2.1.3.1 Gemini visual-only stays:** mic off, audio stripped, lyric-first
  silent-clip prompts, no gang-sign or screen-recording lectures, flash-lite
  long-clip path

### Production weights

v3.0 loaded `models/asl-citizen-bilstm200/asl_citizen_bilstm200_rl.onnx` plus
the sidecar `asl_citizen_bilstm200_rl.onnx.data`. v3.0.1 replaces those files
in place. Metrics for this release stay in `rl_report_v3.json` and
`v3_summary.json`.

## Version 2.1.3.1 — Visual-only song translation (faster, quieter)

Long clips still go to **Gemini video**. This patch changes *how* that path
talks and how fast it is — not *when* it is used. The v2.1.3 100-class dedicated
path and long-clip routing stay as they are on main.

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

The v2.1.3 **100-class** RL weights and v2.1.1 long-clip routing are unchanged.

## Version 2.1.3 — 100-class RL ASL Citizen BiLSTM

The dedicated isolated-sign classifier now ships a **100-class** RL-fine-tuned
BiLSTM. The original 50 demo glosses are kept, plus 50 more high-frequency ASL
Citizen classes.

### Accuracy (held-out test)

| | Top-1 | Top-5 |
| --- | --- | --- |
| Supervised CE | 88.2% | ~98% |
| **v2.1.3 (RL)** | **88.9%** | ~98% |

About **+0.7 points** top-1 after REINFORCE + a light cross-entropy mix.

### What did not change

- Isolated-sign only — not continuous signing
- Same pipeline: landmarks → ONNX BiLSTM → Gemini English cleanup
- **v2.1.1 long-clip routing stays:** clips longer than ~5 seconds, or
  landmark sequences longer than a typical isolated sign, **skip dedicated
  inference** and use Gemini full-video
- Uncertain BiLSTM predictions (confidence below 55%, small top-1 vs top-2
  margin, or high entropy) also fall back to Gemini video

### Production weights

`/api/interpret` loads `models/asl-citizen-bilstm100/asl_citizen_bilstm100_rl.onnx`
plus the sidecar `asl_citizen_bilstm100_rl.onnx.data`. The `.pt` checkpoint is
kept alongside for reference. Metrics: `rl_report_v213.json`.

## Version 2.1.2 — 50-class RL ASL Citizen BiLSTM

The dedicated isolated-sign classifier now ships a **50-class** RL-fine-tuned
BiLSTM. The original 20 demo glosses are kept, plus 30 high-frequency ASL
Citizen classes.

### Accuracy (held-out test)

| | Top-1 | Top-5 |
| --- | --- | --- |
| Supervised CE | 87.4% | ~99% |
| **v2.1.2 (RL)** | **89.7%** | ~99% |

About **+2.4 points** top-1 after REINFORCE + a light cross-entropy mix.

### What did not change

- Isolated-sign only — not continuous signing
- Same pipeline: landmarks → ONNX BiLSTM → Gemini English cleanup
- **v2.1.1 long-clip routing stays:** clips longer than ~5 seconds, or
  landmark sequences longer than a typical isolated sign, **skip dedicated
  inference** and use Gemini full-video
- Uncertain BiLSTM predictions (confidence below 55%, small top-1 vs top-2
  margin, or high entropy) also fall back to Gemini video

### Production weights

`/api/interpret` loads `models/asl-citizen-bilstm50/asl_citizen_bilstm50_rl.onnx`
plus the sidecar `asl_citizen_bilstm50_rl.onnx.data`. The `.pt` checkpoint is
kept alongside for reference. Metrics: `rl_report_v212.json`.

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
