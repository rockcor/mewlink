"""Shared 255-colour palette (plus transparency) for every exported strip.

The approved artwork carries thousands of near-identical noise colours. Every
layer is snapped to one fixed palette so the exports stay small indexed PNGs
and identical source pixels always map to identical output pixels.

    python art/aseprite/rig/palette.py   # regenerate palette.json
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

PATH = Path(__file__).with_name("palette.json")


def generate():
    import cv2
    from PIL import Image

    import fx
    frames = Path(__file__).resolve().parents[1] / "frames"
    pixels = []
    for path in sorted(frames.glob("*.png")):
        rgba = np.asarray(Image.open(path).convert("RGBA"))
        pixels.append(rgba[rgba[:, :, 3] > 0][:, :3])
    pixels = np.concatenate(pixels).astype(np.float32)
    rng = np.random.default_rng(7)
    sample = pixels[rng.choice(len(pixels), 400_000, replace=False)]
    effect_colours = {tuple(int(v) for v in c[:3]) for c in fx.C.values()}
    effect_colours |= {tuple(int(v) for v in fx.PUFF[k][:3]) for k in ("ol", "line", "shade", "base", "hi")}
    cv2.setRNGSeed(7)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 60, 0.2)
    _, _, centres = cv2.kmeans(sample, 255 - len(effect_colours), None, criteria, 4, cv2.KMEANS_PP_CENTERS)
    colours = sorted({tuple(int(round(v)) for v in c) for c in centres} | effect_colours)
    PATH.write_text(json.dumps(colours))
    print(f"Wrote {len(colours)} colours to {PATH}")


_PALETTE = None


def palette():
    global _PALETTE
    if _PALETTE is None:
        _PALETTE = np.array(json.loads(PATH.read_text()), np.int32)
    return _PALETTE


def snap(rgba):
    """Map every opaque pixel to its nearest palette colour (alpha stays 0/255)."""
    pal = palette()
    out = rgba.copy()
    opaque = out[:, :, 3] > 0
    colours, inverse = np.unique(out[opaque][:, :3].astype(np.int32), axis=0, return_inverse=True)
    nearest = np.empty(len(colours), np.int64)
    for start in range(0, len(colours), 4096):
        chunk = colours[start:start + 4096]
        d = ((chunk[:, None, :] - pal[None, :, :]) ** 2).sum(axis=2)
        nearest[start:start + 4096] = d.argmin(axis=1)
    out[opaque, :3] = pal[nearest[inverse.ravel()]].astype(np.uint8)
    out[~opaque] = 0
    return out


if __name__ == "__main__":
    generate()
