# ASL Citizen 100-class BiLSTM

Research / non-commercial DECA POC weights. Derived from
[ASL Citizen](https://www.microsoft.com/en-us/research/project/asl-citizen/)
processed keypoints (`SharoonArshad/asl-citizen-processed-200`).

**License: CC BY-NC-SA 4.0** — do not use this model or the derived keypoints
commercially.

**No longer the production default.** Demo v3.0 loads the 200-class RL graph
in `../asl-citizen-bilstm200/`. These 100-class v2.1.3 weights are kept for
reference.

Previous production default was v2.1.3 (RL, 100-class). `/api/interpret` no
longer loads `asl_citizen_bilstm100_rl.onnx`.

| Version | Split | Top-1 | Top-5 |
| --- | --- | --- | --- |
| v2.1.3 CE (best ckpt, epoch 38) | Val | 55.93% | 84.75% |
| v2.1.3 CE | Test | 88.24% | 97.99% |
| **v2.1.3 RL** (REINFORCE + 0.2 CE, epoch 5) | Val | 56.50% | 83.62% |
| **v2.1.3 RL** | Test | **88.93%** | 98.09% |

Vocabulary is the original 50 isolated signs plus 50 more high-frequency ASL
Citizen classes (100 total). See `rl_report_v213.json` and
`../../PATCH_NOTES.md`.

## Files

| File | Role |
| --- | --- |
| `asl_citizen_bilstm100_rl.onnx` + `.onnx.data` | Previous production CPU graph (v2.1.3, 100-class) |
| `asl_citizen_bilstm100_rl.pt` | RL-fine-tuned PyTorch checkpoint (reference) |
| `rl_report_v213.json` | v2.1.3 metrics (before/after, per-class) |
| `label_map100.json` | id ↔ gloss (100 classes) |
| `vocab100.json` | Vocab metadata (original 50 + newly added 50) |
| `preprocessing_config.json` | Landmark contract used at train time |
| `train_report100.json` | Supervised CE metrics before RL |

Architecture: Linear 450→128 → 2-layer bidirectional LSTM (h=128) → attention
pool → Linear→100. Input `(1, 200, 450)` float32. Same backbone as the 20- and
50-class models; only the classification head is wider.

Live webcam MediaPipe must match the preprocessing contract or accuracy
collapses. See the repo README for the known landmark-parity risks.
