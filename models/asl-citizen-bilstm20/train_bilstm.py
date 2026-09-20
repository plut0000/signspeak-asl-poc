#!/usr/bin/env python3
"""Train small-vocab BiLSTM on ASL Citizen preprocessed keypoints (CPU)."""
import json, time, os, sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader

ROOT = Path("/workspace/asl-citizen-bilstm")
DATA = ROOT / "data" / "filtered"
ART = ROOT / "artifacts"

class KeypointDS(Dataset):
    def __init__(self, X, y):
        self.X = torch.from_numpy(X)  # float32
        self.y = torch.from_numpy(y.astype(np.int64))
    def __len__(self):
        return len(self.y)
    def __getitem__(self, i):
        return self.X[i], self.y[i]

class BiLSTMClassifier(nn.Module):
    def __init__(self, feat_dim=450, proj_dim=128, hidden=128, n_layers=2,
                 n_classes=20, dropout=0.3, use_attention=True):
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
        self.hparams = dict(
            feat_dim=feat_dim, proj_dim=proj_dim, hidden=hidden,
            n_layers=n_layers, n_classes=n_classes, dropout=dropout,
            use_attention=use_attention, arch="BiLSTM+attn" if use_attention else "BiLSTM+mean",
        )

    def forward(self, x):
        # x: (B, T, F)
        h = self.proj(x)
        out, _ = self.lstm(h)  # (B, T, 2H)
        if self.use_attention:
            w = torch.softmax(self.attn(out).squeeze(-1), dim=1)  # (B, T)
            pooled = torch.sum(out * w.unsqueeze(-1), dim=1)
        else:
            pooled = out.mean(dim=1)
        return self.head(pooled)

def accuracy(logits, y, topk=(1,)):
    maxk = max(topk)
    _, pred = logits.topk(maxk, dim=1, largest=True, sorted=True)
    correct = pred.eq(y.view(-1, 1).expand_as(pred))
    res = {}
    for k in topk:
        res[k] = correct[:, :k].any(dim=1).float().mean().item()
    return res

@torch.no_grad()
def evaluate(model, loader, device, criterion):
    model.eval()
    total_loss, n = 0.0, 0
    top1_sum, top5_sum = 0.0, 0.0
    for X, y in loader:
        X, y = X.to(device), y.to(device)
        logits = model(X)
        loss = criterion(logits, y)
        bs = y.size(0)
        total_loss += loss.item() * bs
        acc = accuracy(logits, y, topk=(1, 5))
        top1_sum += acc[1] * bs
        top5_sum += acc[5] * bs
        n += bs
    return total_loss / n, top1_sum / n, top5_sum / n

def update_progress(phase, percent, msg, **extra):
    d = {
        "phase": phase,
        "percent": percent,
        "last_message": msg,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S-04:00"),
        **extra,
    }
    (ROOT / "progress.json").write_text(json.dumps(d, indent=2))

def main():
    device = torch.device("cpu")
    torch.manual_seed(42)
    np.random.seed(42)

    Xtr = np.load(DATA / "train_features.npy")
    ytr = np.load(DATA / "train_labels.npy")
    Xva = np.load(DATA / "val_features.npy")
    yva = np.load(DATA / "val_labels.npy")
    Xte = np.load(DATA / "test_features.npy")
    yte = np.load(DATA / "test_labels.npy")

    # sanitize NaN/Inf
    for name, arr in [("train", Xtr), ("val", Xva), ("test", Xte)]:
        bad = ~np.isfinite(arr)
        if bad.any():
            print(f"WARNING: {name} has {bad.sum()} non-finite values; zeroing")
            arr[~np.isfinite(arr)] = 0.0

    feat_dim = Xtr.shape[-1]
    T = Xtr.shape[1]
    n_classes = int(ytr.max()) + 1
    print(f"shapes train={Xtr.shape} val={Xva.shape} test={Xte.shape} feat={feat_dim} T={T} C={n_classes}")

    batch_size = 32
    train_loader = DataLoader(KeypointDS(Xtr, ytr), batch_size=batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(KeypointDS(Xva, yva), batch_size=batch_size, shuffle=False, num_workers=0)
    test_loader = DataLoader(KeypointDS(Xte, yte), batch_size=batch_size, shuffle=False, num_workers=0)

    model = BiLSTMClassifier(
        feat_dim=feat_dim, proj_dim=128, hidden=128, n_layers=2,
        n_classes=n_classes, dropout=0.35, use_attention=True,
    ).to(device)
    print(model)
    n_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"trainable params: {n_params:,}")

    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", factor=0.5, patience=4)

    max_epochs = 40
    patience = 10
    best_val = -1.0
    best_epoch = -1
    best_path = ART / "asl_citizen_bilstm20.pt"
    history = []
    stale = 0

    update_progress("training", 65, f"Starting BiLSTM train on CPU, {n_params} params")

    for epoch in range(1, max_epochs + 1):
        model.train()
        tr_loss_sum, tr_acc_sum, n = 0.0, 0.0, 0
        t0 = time.time()
        for X, y in train_loader:
            X, y = X.to(device), y.to(device)
            optimizer.zero_grad()
            logits = model(X)
            loss = criterion(logits, y)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            optimizer.step()
            bs = y.size(0)
            tr_loss_sum += loss.item() * bs
            tr_acc_sum += accuracy(logits.detach(), y, topk=(1,))[1] * bs
            n += bs
        tr_loss = tr_loss_sum / n
        tr_acc = tr_acc_sum / n
        va_loss, va_acc, va_top5 = evaluate(model, val_loader, device, criterion)
        scheduler.step(va_acc)
        dt = time.time() - t0
        row = {
            "epoch": epoch,
            "train_loss": round(tr_loss, 4),
            "train_acc": round(tr_acc, 4),
            "val_loss": round(va_loss, 4),
            "val_acc": round(va_acc, 4),
            "val_top5": round(va_top5, 4),
            "lr": optimizer.param_groups[0]["lr"],
            "sec": round(dt, 1),
        }
        history.append(row)
        print(f"epoch {epoch:02d}/{max_epochs}  "
              f"tr_loss={tr_loss:.4f} tr_acc={tr_acc:.3f}  "
              f"va_loss={va_loss:.4f} va_acc={va_acc:.3f} top5={va_top5:.3f}  "
              f"lr={row['lr']:.1e}  {dt:.1f}s")
        sys.stdout.flush()

        pct = 65 + int(30 * epoch / max_epochs)
        update_progress("training", pct,
                        f"epoch {epoch}: val_acc={va_acc:.3f} best={best_val:.3f}",
                        best_val_acc=best_val, epoch=epoch)

        if va_acc > best_val + 1e-4:
            best_val = va_acc
            best_epoch = epoch
            stale = 0
            ckpt = {
                "model_state_dict": model.state_dict(),
                "hparams": model.hparams,
                "best_val_acc": best_val,
                "best_epoch": best_epoch,
                "n_params": n_params,
                "label_map_path": "artifacts/label_map.json",
                "feature_shape": [T, feat_dim],
            }
            torch.save(ckpt, best_path)
            print(f"  ** saved best checkpoint val_acc={best_val:.4f}")
        else:
            stale += 1
            if stale >= patience:
                print(f"Early stopping at epoch {epoch} (patience={patience})")
                break

    # load best and evaluate test
    ckpt = torch.load(best_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt["model_state_dict"])
    te_loss, te_acc, te_top5 = evaluate(model, test_loader, device, criterion)
    # also re-eval val
    va_loss, va_acc, va_top5 = evaluate(model, val_loader, device, criterion)
    print(f"\nBEST epoch={best_epoch} val_acc={va_acc:.4f} val_top5={va_top5:.4f}")
    print(f"TEST acc={te_acc:.4f} top5={te_top5:.4f} loss={te_loss:.4f}")

    # per-class test accuracy
    model.eval()
    all_pred, all_y = [], []
    with torch.no_grad():
        for X, y in test_loader:
            logits = model(X.to(device))
            all_pred.append(logits.argmax(1).cpu().numpy())
            all_y.append(y.numpy())
    all_pred = np.concatenate(all_pred)
    all_y = np.concatenate(all_y)
    label_map = json.loads((ART / "label_map.json").read_text())
    per_class = {}
    for i in range(n_classes):
        mask = all_y == i
        if mask.sum() == 0:
            continue
        per_class[label_map["id_to_gloss"][str(i)]] = {
            "n": int(mask.sum()),
            "acc": float((all_pred[mask] == i).mean()),
        }

    # disk size of download
    dl_bytes = 0
    for r, _, files in os.walk(ROOT / "data" / "hf"):
        for f in files:
            dl_bytes += os.path.getsize(os.path.join(r, f))

    vocab = json.loads((ART / "vocab20.json").read_text())
    report = {
        "dataset": "SharoonArshad/asl-citizen-processed-200",
        "license": "CC BY-NC-SA 4.0 — research/non-commercial OK for DECA POC",
        "downloaded_bytes": dl_bytes,
        "downloaded_gb": round(dl_bytes / 1e9, 3),
        "full_dataset_classes": 200,
        "vocab_classes": 20,
        "vocab_glosses": vocab["glosses"],
        "feature_shape": [int(T), int(feat_dim)],
        "train_size": int(len(ytr)),
        "val_size": int(len(yva)),
        "test_size": int(len(yte)),
        "device": "cpu",
        "architecture": model.hparams,
        "n_params": n_params,
        "batch_size": batch_size,
        "max_epochs": max_epochs,
        "epochs_ran": len(history),
        "best_epoch": best_epoch,
        "best_val_acc": round(float(va_acc), 4),
        "best_val_top5": round(float(va_top5), 4),
        "best_test_acc": round(float(te_acc), 4),
        "best_test_top5": round(float(te_top5), 4),
        "per_class_test_acc": per_class,
        "history": history,
        "checkpoint": str(best_path),
        "blockers": [
            "Val set small (64 samples / ~3 per class) — val accuracy noisy",
            "200-class HF subset lacks YES/NO/THANKS/HELP/PLEASE/SORRY/WATER/MOTHER/FATHER/SCHOOL — substituted closest demo glosses",
            "CPU-only training",
        ],
        "notes": "Do NOT wire into SignSpeak until val/test useful. Live webcam MediaPipe must match preprocessing (75 landmarks xyz + velocity, len 200, shoulder-norm).",
    }
    (ART / "train_report.json").write_text(json.dumps(report, indent=2))
    update_progress("done", 100,
                    f"best_val={va_acc:.3f} test={te_acc:.3f}",
                    best_val_acc=round(float(va_acc), 4),
                    best_test_acc=round(float(te_acc), 4))
    print("Wrote artifacts/train_report.json")

if __name__ == "__main__":
    main()
