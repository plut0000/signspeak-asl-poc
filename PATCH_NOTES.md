# SignSpeak patch notes

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
