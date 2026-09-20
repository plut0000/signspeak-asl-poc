# ASL Citizen 20-class BiLSTM

Research / non-commercial DECA POC weights. Derived from
[ASL Citizen](https://www.microsoft.com/en-us/research/project/asl-citizen/)
processed keypoints (`SharoonArshad/asl-citizen-processed-200`).

**License: CC BY-NC-SA 4.0** — do not use this model or the derived keypoints
commercially.

| Split | Top-1 | Top-5 |
| --- | --- | --- |
| Val (best ckpt, epoch 32) | 68.75% | 93.75% |
| Test | 77.29% | 99.17% |

## Files

| File | Role |
| --- | --- |
| `asl_citizen_bilstm20.pt` | PyTorch best-val checkpoint (`model_state_dict` + `hparams`) |
| `asl_citizen_bilstm20.onnx` | Exported CPU graph for Vercel / `onnxruntime-node` |
| `label_map.json` | id ↔ gloss (20 classes) |
| `vocab20.json` | Vocab metadata and substitutions |
| `preprocessing_config.json` | Landmark contract used at train time |
| `train_bilstm.py` | Authoritative `BiLSTMClassifier` |
| `train_report.json` | Full metrics |

Architecture: Linear 450→128 → 2-layer bidirectional LSTM (h=128) → attention
pool → Linear→20. Input `(1, 200, 450)` float32.

Export / parity check:

```bash
python3 scripts/export_bilstm_onnx.py
```

Live webcam MediaPipe must match the preprocessing contract or accuracy
collapses. See the repo README for the known landmark-parity risks.
