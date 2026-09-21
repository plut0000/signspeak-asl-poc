# ASL Citizen 200-class BiLSTM

Research / non-commercial DECA POC weights. Derived from
[ASL Citizen](https://www.microsoft.com/en-us/research/project/asl-citizen/)
processed keypoints (`SharoonArshad/asl-citizen-processed-200`).

**License: CC BY-NC-SA 4.0** — do not use this model or the derived keypoints
commercially.

**Production default is v3.0 (RL, 200-class).** `/api/interpret` loads
`asl_citizen_bilstm200_rl.onnx` plus the sidecar `.onnx.data` file. A 150-class
fallback was **not** needed.

| Version | Split | Top-1 | Top-5 |
| --- | --- | --- | --- |
| v3.0 CE (best ckpt, epoch 36) | Val | 63.00% | 87.31% |
| v3.0 CE | Test | 87.25% | 98.14% |
| **v3.0 RL** (REINFORCE + 0.2 CE, epoch 13) | Val | 65.29% | 87.00% |
| **v3.0 RL** | Test | **89.70%** | 98.20% |

Vocabulary is the full 200-sign ASL Citizen set (the previous 100 demo glosses
plus 100 more). See `rl_report_v3.json`, `v3_summary.json`, and
`../../PATCH_NOTES.md`.

## Files

| File | Role |
| --- | --- |
| `asl_citizen_bilstm200_rl.onnx` + `.onnx.data` | **Production** CPU graph for Vercel / `onnxruntime-node` |
| `asl_citizen_bilstm200_rl.pt` | RL-fine-tuned PyTorch checkpoint (reference) |
| `rl_report_v3.json` | v3.0 metrics (before/after, per-class) |
| `v3_summary.json` | Compact ship checklist (no 150-class fallback) |
| `label_map200.json` | id ↔ gloss (200 classes; ONNX logit order) |
| `vocab200.json` | Vocab metadata |
| `preprocessing_config.json` | Landmark contract used at train time |
| `train_report200.json` | Supervised CE metrics before RL |

Architecture: Linear 450→128 → 2-layer bidirectional LSTM (h=128) → attention
pool → Linear→200. Input `(1, 200, 450)` float32. Same backbone as the 20-, 50-,
and 100-class models; only the classification head is wider.

Live webcam MediaPipe must match the preprocessing contract or accuracy
collapses. See the repo README for the known landmark-parity risks.
