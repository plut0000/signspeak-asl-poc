# SignSpeak patch notes

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
