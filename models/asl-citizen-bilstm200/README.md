# ASL Citizen 200-class BiLSTM

Research / non-commercial DECA POC weights. Derived from
[ASL Citizen](https://www.microsoft.com/en-us/research/project/asl-citizen/)
processed keypoints (`SharoonArshad/asl-citizen-processed-200`).

**License: CC BY-NC-SA 4.0** — do not use this model or the derived keypoints
commercially.

**Production default is v3.0.1 (RL, 200-class).** `/api/interpret` loads
`asl_citizen_bilstm200_rl.onnx` plus the sidecar `.onnx.data` file. A 150-class
fallback was **not** needed. The class list is the same 200 signs as v3.0.

| Version | Split | Top-1 | Top-5 |
| --- | --- | --- | --- |
| v3.0 CE (best ckpt, epoch 36) | Val | 63.00% | 87.31% |
| v3.0 CE | Test | 87.25% | 98.14% |
| v3.0 RL (REINFORCE + 0.2 CE, epoch 13) | Val | 65.29% | 87.00% |
| v3.0 RL | Test | 89.70% | 98.20% |
| **v3.0.1 RL** (continued REINFORCE + 0.25 CE, best epoch 1) | Val | 64.68% | 86.54% |
| **v3.0.1 RL** | Test | **90.29%** (90.287%) | 98.14% |

The continued run started from a later RL checkpoint at ~90.06% test top-1
(`before` in `rl_report_v3_more3.json`) and finished at **90.287%**. Versus
the v3.0 weights that shipped in the app, that is ~89.7% → ~90.3%. Top-5 is
~98.1%. Vocabulary is still the full 200-sign ASL Citizen set. See
`rl_report_v3_more3.json`, `v3_more3_rl_summary.json`, `rl_report_v3.json`,
`v3_summary.json`, and `../../PATCH_NOTES.md`.

## Files

| File | Role |
| --- | --- |
| `asl_citizen_bilstm200_rl.onnx` + `.onnx.data` | **Production** CPU graph for Vercel / `onnxruntime-node` (v3.0.1) |
| `asl_citizen_bilstm200_rl.pt` | RL-fine-tuned PyTorch checkpoint (reference, v3.0.1) |
| `rl_report_v3_more3.json` | v3.0.1 metrics (before/after, per-class) |
| `v3_more3_rl_summary.json` | Compact v3.0.1 numbers (test top-1 0.902872) |
| `rl_report_v3.json` | Earlier v3.0 RL metrics (89.70% test top-1) |
| `v3_summary.json` | Compact v3.0 ship checklist |
| `label_map200.json` | id ↔ gloss (200 classes; ONNX logit order) |
| `vocab200.json` | Vocab metadata |
| `preprocessing_config.json` | Landmark contract used at train time |
| `train_report200.json` | Supervised CE metrics before RL |

Architecture: Linear 450→128 → 2-layer bidirectional LSTM (h=128) → attention
pool → Linear→200. Input `(1, 200, 450)` float32. Same backbone as the 20-, 50-,
and 100-class models; only the classification head is wider.

Live webcam MediaPipe must match the preprocessing contract or accuracy
collapses. See the repo README for the known landmark-parity risks.
