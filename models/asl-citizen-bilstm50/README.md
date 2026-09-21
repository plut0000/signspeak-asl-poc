# ASL Citizen 50-class BiLSTM

Research / non-commercial DECA POC weights. Derived from
[ASL Citizen](https://www.microsoft.com/en-us/research/project/asl-citizen/)
processed keypoints (`SharoonArshad/asl-citizen-processed-200`).

**License: CC BY-NC-SA 4.0** — do not use this model or the derived keypoints
commercially.

**No longer the production default.** Demo v2.1.3 loads the 100-class RL graph
in `../asl-citizen-bilstm100/`. These 50-class v2.1.2 weights are kept for
reference.

Previous production default was v2.1.2 (RL, 50-class). `/api/interpret` no
longer loads `asl_citizen_bilstm50_rl.onnx`.

| Version | Split | Top-1 | Top-5 |
| --- | --- | --- | --- |
| v2.1.2 CE (best ckpt, epoch 32) | Val | 62.50% | 88.04% |
| v2.1.2 CE | Test | 87.35% | 98.56% |
| **v2.1.2 RL** (REINFORCE + 0.2 CE, epoch 10) | Val | 63.04% | 87.50% |
| **v2.1.2 RL** | Test | **89.71%** | 98.66% |

Vocabulary is the original 20 isolated signs plus 30 high-frequency ASL
Citizen classes (50 total). See `rl_report_v212.json` and
`../../PATCH_NOTES.md`.

## Files

| File | Role |
| --- | --- |
| `asl_citizen_bilstm50_rl.onnx` + `.onnx.data` | Previous production CPU graph (v2.1.2, 50-class) |
| `asl_citizen_bilstm50_rl.pt` | RL-fine-tuned PyTorch checkpoint (reference) |
| `rl_report_v212.json` | v2.1.2 metrics (before/after, per-class) |
| `label_map50.json` | id ↔ gloss (50 classes) |
| `vocab50.json` | Vocab metadata (original 20 + newly added 30) |
| `preprocessing_config.json` | Landmark contract used at train time |
| `train_report50.json` | Supervised CE metrics before RL |

Architecture: Linear 450→128 → 2-layer bidirectional LSTM (h=128) → attention
pool → Linear→50. Input `(1, 200, 450)` float32. Same backbone as the 20-class
model; only the classification head is wider.

Live webcam MediaPipe must match the preprocessing contract or accuracy
collapses. See the repo README for the known landmark-parity risks.
