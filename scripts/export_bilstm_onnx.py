#!/usr/bin/env python3
"""Export asl_citizen_bilstm20.pt to ONNX. Architecture must match train_bilstm.py."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch
import torch.nn as nn

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models" / "asl-citizen-bilstm20"
CKPT_PATH = MODEL_DIR / "asl_citizen_bilstm20.pt"
ONNX_PATH = MODEL_DIR / "asl_citizen_bilstm20.onnx"


class BiLSTMClassifier(nn.Module):
    def __init__(
        self,
        feat_dim=450,
        proj_dim=128,
        hidden=128,
        n_layers=2,
        n_classes=20,
        dropout=0.3,
        use_attention=True,
    ):
        super().__init__()
        self.use_attention = use_attention
        self.proj = nn.Sequential(
            nn.Linear(feat_dim, proj_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        self.lstm = nn.LSTM(
            input_size=proj_dim,
            hidden_size=hidden,
            num_layers=n_layers,
            batch_first=True,
            bidirectional=True,
            dropout=dropout if n_layers > 1 else 0.0,
        )
        self.attn = nn.Linear(hidden * 2, 1) if use_attention else None
        self.head = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(hidden * 2, n_classes),
        )

    def forward(self, x):
        h = self.proj(x)
        out, _ = self.lstm(h)
        if self.use_attention:
            w = torch.softmax(self.attn(out).squeeze(-1), dim=1)
            pooled = torch.sum(out * w.unsqueeze(-1), dim=1)
        else:
            pooled = out.mean(dim=1)
        return self.head(pooled)


def main() -> int:
    ckpt = torch.load(CKPT_PATH, map_location="cpu", weights_only=False)
    hparams = dict(ckpt["hparams"])
    hparams.pop("arch", None)
    model = BiLSTMClassifier(**hparams)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()

    dummy = torch.zeros(1, 200, int(hparams["feat_dim"]), dtype=torch.float32)
    export_kwargs = dict(
        input_names=["features"],
        output_names=["logits"],
        opset_version=17,
        dynamo=False,
    )
    try:
        torch.onnx.export(model, dummy, ONNX_PATH, **export_kwargs)
    except TypeError:
        export_kwargs.pop("dynamo", None)
        torch.onnx.export(model, dummy, ONNX_PATH, **export_kwargs)

    with torch.no_grad():
        pt_logits = model(dummy)

    try:
        import onnxruntime as ort
    except ImportError:
        print(f"Wrote {ONNX_PATH} (onnxruntime not installed; skip parity check)")
        return 0

    session = ort.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])
    ort_logits = session.run(None, {"features": dummy.numpy()})[0]
    max_delta = float((pt_logits.numpy() - ort_logits).max())
    print(
        json.dumps(
            {
                "onnx": str(ONNX_PATH),
                "bytes": ONNX_PATH.stat().st_size,
                "pt_shape": list(pt_logits.shape),
                "ort_shape": list(ort_logits.shape),
                "max_abs_delta": abs(max_delta),
            },
            indent=2,
        )
    )
    if abs(max_delta) > 1e-4:
        print("WARNING: ONNX logits diverge from PyTorch", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
