# ASL Citizen 20-class BiLSTM

Research / non-commercial DECA POC weights. Derived from
[ASL Citizen](https://www.microsoft.com/en-us/research/project/asl-citizen/)
processed keypoints (`SharoonArshad/asl-citizen-processed-200`).

**License: CC BY-NC-SA 4.0** — do not use this model or the derived keypoints
commercially.

**No longer the production default.** Demo v2.1.3 loads the 100-class RL graph
in `../asl-citizen-bilstm100/`. These 20-class v2.1 weights are kept for
reference.

Previous production default was v2.1 (RL). `/api/interpret` no longer loads
`asl_citizen_bilstm20_rl.onnx`.

| Version | Split | Top-1 | Top-5 |
| --- | --- | --- | --- |
| v2.0 CE (best ckpt, epoch 32) | Val | 68.75% | 93.75% |
| v2.0 CE | Test | 77.29% | 99.17% |
| **v2.1 RL** (REINFORCE + 0.2 CE, epoch 4) | Val | 68.75% | 92.19% |
| **v2.1 RL** | Test | **82.83%** | 98.89% |

Vocabulary is unchanged: 20 isolated signs. See `rl_report_v21.json` and
`../../PATCH_NOTES.md`.

## Files

| File | Role |
| --- | --- |
| `asl_citizen_bilstm20_rl.onnx` + `.onnx.data` | Previous production CPU graph (v2.1, 20-class) |
| `asl_citizen_bilstm20_rl.pt` | RL-fine-tuned PyTorch checkpoint (reference) |
| `rl_report_v21.json` | v2.1 metrics (before/after, per-class) |
| `asl_citizen_bilstm20.pt` | v2.0 supervised CE checkpoint (baseline) |
| `asl_citizen_bilstm20.onnx` | v2.0 CE export (not used by `/api/interpret`) |
| `label_map.json` | id ↔ gloss (20 classes, unchanged) |
| `vocab20.json` | Vocab metadata and substitutions |
| `preprocessing_config.json` | Landmark contract used at train time |
| `train_bilstm.py` | Authoritative `BiLSTMClassifier` |
| `train_report.json` | v2.0 CE metrics |

Architecture: Linear 450→128 → 2-layer bidirectional LSTM (h=128) → attention
pool → Linear→20. Input `(1, 200, 450)` float32.

Export / parity check:

```bash
python3 scripts/export_bilstm_onnx.py
npm run verify:model
```

Live webcam MediaPipe must match the preprocessing contract or accuracy
collapses. See the repo README for the known landmark-parity risks.
