"""Cut the approved MewLink artwork into animatable layers.

Every authored frame in art/aseprite/frames is a flat 384x256 bitmap. For the
scenes that need independent motion, the props (desk, laptop, TV, snacks,
cushion) are separated from the pup by colour inside hand-placed prop zones:
cream fur always stays with the pup, pinks and screens inside a zone go to the
props, and outline pixels follow whichever side they hug. The pup can then be
warped (squash, stretch, lean, nod, hop) with nearest-neighbour sampling so the
original pixels stay crisp, while props pop in and out on their own.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

FRAMES = Path(__file__).resolve().parents[1] / "frames"
W, H = 384, 256

CREAM = np.array([252, 238, 212], np.float32)


def load(name: str) -> np.ndarray:
    return np.asarray(Image.open(FRAMES / f"{name}.png").convert("RGBA"), dtype=np.uint8).copy()


def _cream_mask(rgba):
    rgb = rgba[:, :, :3].astype(np.float32)
    opaque = rgba[:, :, 3] > 0
    # Fur plus its peach shading; white screen paper is excluded by the blue channel.
    d = np.linalg.norm(rgb - CREAM, axis=2)
    shade = (rgb[:, :, 0] > 235) & (rgb[:, :, 1] > 180) & (rgb[:, :, 2] > 130) & (rgb[:, :, 2] < 222) \
        & (rgb[:, :, 0] - rgb[:, :, 2] > 25) & (rgb[:, :, 1] - rgb[:, :, 2] > 8)
    return opaque & ((d < 20) | shade)


def _dark_mask(rgba):
    rgb = rgba[:, :, :3].astype(np.int32)
    return (rgba[:, :, 3] > 0) & (rgb.max(axis=2) < 140) & (rgb[:, :, 0] < 150)


def _zone_mask(zones):
    mask = np.zeros((H, W), np.uint8)
    for zone in zones:
        kind = zone[0]
        if kind == "rect":
            _, x0, y0, x1, y1 = zone
            mask[y0:y1, x0:x1] = 1
        elif kind == "ellipse":
            _, cx, cy, rx, ry = zone
            cv2.ellipse(mask, (cx, cy), (rx, ry), 0, 0, 360, 1, -1)
        elif kind == "poly":
            cv2.fillPoly(mask, [np.array(zone[1], np.int32)], 1)
    return mask.astype(bool)


# Prop zones per authored frame (384x256 source pixels). Anything worn or held
# (headset, the chip in a paw) is deliberately left outside the zones.
WORK_ZONES = [("rect", 36, 104, 170, 248), ("rect", 128, 192, 294, 250), ("rect", 288, 198, 350, 250)]
ZONES = {
    **{f"{v}_input_{i}": WORK_ZONES for v in ("code", "document", "web", "ai", "mewlink")
       for i in ("none", "keyboard", "pointer", "both")},
    "base_meeting": [("rect", 60, 141, 250, 252), ("rect", 272, 200, 336, 250), ("rect", 244, 222, 276, 252)],
    "peak_meeting": [("rect", 72, 140, 262, 252), ("rect", 284, 198, 346, 250), ("rect", 256, 222, 290, 252)],
    "base_video": [("rect", 62, 166, 246, 252), ("poly", [(262, 150), (356, 150), (360, 240), (262, 240)]),
                   ("rect", 240, 216, 292, 252)],
    "peak_video": [("rect", 56, 165, 240, 256), ("poly", [(252, 134), (360, 134), (362, 242), (252, 242)]),
                   ("rect", 236, 214, 284, 250), ("rect", 280, 104, 324, 142)],
    "base_rest": [("ellipse", 193, 216, 122, 36), ("rect", 72, 205, 314, 256), ("rect", 68, 172, 112, 256),
                  ("rect", 276, 172, 320, 256)],
    "peak_rest": [("ellipse", 193, 216, 122, 36), ("rect", 72, 205, 314, 256), ("rect", 68, 172, 112, 256),
                  ("rect", 276, 172, 320, 256)],
}


@lru_cache(maxsize=None)
def split(name: str):
    """Return (dog, props) RGBA layers whose union is exactly the source frame."""
    rgba = load(name)
    opaque = rgba[:, :, 3] > 0
    zones = ZONES.get(name)
    if not zones:
        return rgba, np.zeros_like(rgba)
    zone = _zone_mask(zones) & opaque
    cream = _cream_mask(rgba)
    dark = _dark_mask(rgba)
    dog = opaque & ~zone
    # Fur inside a zone must connect to the body (paws on keyboards), which
    # keeps cream-coloured screen paper and play icons with the props.
    count, labels = cv2.connectedComponents(cream.astype(np.uint8), connectivity=8)
    attached = np.unique(labels[cream & ~zone])
    dog |= zone & cream & np.isin(labels, attached[attached > 0])
    # Outline inside a zone belongs to the pup when it wraps fur (paw edges).
    fur = (dog & cream).astype(np.uint8)
    near_fur = cv2.dilate(fur, np.ones((5, 5), np.uint8)) > 0
    dog |= zone & dark & near_fur
    props = opaque & ~dog
    dog_layer = np.where(dog[:, :, None], rgba, 0).astype(np.uint8)
    prop_layer = np.where(props[:, :, None], rgba, 0).astype(np.uint8)
    return dog_layer, prop_layer


def bbox(layer):
    ys, xs = np.nonzero(layer[:, :, 3])
    if len(xs) == 0:
        return 0, 0, 0, 0
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


# --------------------------------------------------------------------------- warps

def warp(layer, *, dx=0.0, dy=0.0, sx=1.0, sy=1.0, anchor=None, lean=0.0, nod=0.0, nod_below=None, pivot_y=None):
    """Nearest-neighbour warp of a layer.

    sx/sy scale about `anchor` (default: bottom centre of the layer); `lean`
    shears the top of the layer sideways by that many pixels; `nod` shifts the
    rows above `nod_below` vertically with a soft 24px falloff so a pup behind a
    laptop can nod without lifting off it.
    """
    x0, y0, x1, y1 = bbox(layer)
    if x1 == 0:
        return layer
    ax, ay = anchor if anchor else ((x0 + x1) / 2, y1)
    top = pivot_y if pivot_y is not None else y0
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # inverse map: destination -> source
    sy_ = yy - dy
    sx_ = xx - dx
    sy_ = ay + (sy_ - ay) / sy
    sx_ = ax + (sx_ - ax) / sx
    height = max(ay - top, 1)
    if lean:
        t = np.clip((ay - sy_) / height, 0, 1)
        sx_ = sx_ - lean * t
    if nod:
        limit = nod_below if nod_below is not None else ay
        t = np.clip((limit - sy_) / 24.0, 0, 1)
        sy_ = sy_ - nod * t
    return cv2.remap(layer, sx_.astype(np.float32), sy_.astype(np.float32), cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))


def scale_about(layer, s, ax, ay):
    if s <= 0.02:
        return np.zeros_like(layer)
    return warp(layer, sx=s, sy=s, anchor=(ax, ay))


def over(*layers):
    out = np.zeros((H, W, 4), np.uint8)
    for layer in layers:
        mask = layer[:, :, 3] > 0
        out[mask] = layer[mask]
    return out
