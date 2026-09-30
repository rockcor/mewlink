"""Tiny analytic pixel-art renderer for the MewLink animation effects.

Effects (dust clouds, sparkles, hearts, z's) are drawn on a 128x86 grid and
upscaled 3x so their pixels match the approved artwork. Shapes are evaluated
at pixel centres, then filled
with a three-tone cel ramp and an inner selective outline: dark plum where a
part meets empty space, a softer tone of the part where it overlaps another
part. Everything is deterministic, so the same scene always yields the same
bitmap (transition endpoints rely on this).
"""

from __future__ import annotations

import math

import numpy as np

W, H = 128, 86
LAYERS = ["back", "partner", "pet", "mid", "paws", "front", "fx"]

_YY, _XX = np.mgrid[0:H, 0:W].astype(np.float64) + 0.5
_offset = [0.0, 0.0]


def set_offset(dx: float = 0.0, dy: float = 0.0) -> None:
    _offset[0], _offset[1] = dx, dy


def rgba(value: str) -> np.ndarray:
    value = value.lstrip("#")
    return np.array([int(value[i:i + 2], 16) for i in (0, 2, 4)] + [255], np.uint8)


def ramp(ol: str, line: str, shade: str, base: str, hi: str | None = None) -> dict:
    result = {"ol": rgba(ol), "line": rgba(line), "shade": rgba(shade), "base": rgba(base)}
    result["hi"] = rgba(hi) if hi else result["base"]
    return result


# ---------------------------------------------------------------------------
# Affine helpers. A transform maps local shape space to canvas space.

def affine(tx=0.0, ty=0.0, sx=1.0, sy=None, rot=0.0, ax=0.0, ay=0.0):
    """Scale/rotate about anchor (ax, ay) then translate by (tx, ty)."""
    sy = sx if sy is None else sy
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    m = np.array([[c * sx, -s * sy, 0.0], [s * sx, c * sy, 0.0], [0.0, 0.0, 1.0]])
    pre = np.array([[1, 0, -ax], [0, 1, -ay], [0, 0, 1.0]])
    post = np.array([[1, 0, ax + tx], [0, 1, ay + ty], [0, 0, 1.0]])
    return post @ m @ pre


def _coords(T):
    x = _XX - _offset[0]
    y = _YY - _offset[1]
    if T is None:
        return x, y
    inv = np.linalg.inv(T)
    return inv[0, 0] * x + inv[0, 1] * y + inv[0, 2], inv[1, 0] * x + inv[1, 1] * y + inv[1, 2]


def ellipse(cx, cy, rx, ry, rot=0.0, T=None):
    x, y = _coords(T)
    x, y = x - cx, y - cy
    if rot:
        c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        x, y = x * c + y * s, -x * s + y * c
    return (x / max(rx, 1e-3)) ** 2 + (y / max(ry, 1e-3)) ** 2 <= 1.0


def rrect(x0, y0, x1, y1, r=0.0, T=None):
    x, y = _coords(T)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    hx, hy = max((x1 - x0) / 2 - r, 0), max((y1 - y0) / 2 - r, 0)
    qx, qy = np.abs(x - cx) - hx, np.abs(y - cy) - hy
    d = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r
    return d <= 0


def capsule(x1, y1, x2, y2, r, T=None):
    x, y = _coords(T)
    dx, dy = x2 - x1, y2 - y1
    length = dx * dx + dy * dy
    t = np.clip(((x - x1) * dx + (y - y1) * dy) / length, 0, 1) if length > 1e-9 else 0
    return (x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2 <= r * r


def poly(points, T=None):
    x, y = _coords(T)
    inside = np.zeros(x.shape, bool)
    n = len(points)
    for i in range(n):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % n]
        crosses = ((y1 > y) != (y2 > y))
        with np.errstate(divide="ignore", invalid="ignore"):
            xi = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
        inside ^= crosses & (x < xi)
    return inside


def shift(mask, dx, dy):
    """result[y, x] = mask[y + dy, x + dx] (False outside the canvas)."""
    out = np.zeros_like(mask)
    ys = slice(max(0, -dy), H - max(0, dy))
    xs = slice(max(0, -dx), W - max(0, dx))
    yd = slice(max(0, dy), H - max(0, -dy))
    xd = slice(max(0, dx), W - max(0, -dx))
    out[ys, xs] = mask[yd, xd]
    return out


# ---------------------------------------------------------------------------

class Canvas:
    def __init__(self):
        self.layers = {name: np.zeros((H, W, 4), np.uint8) for name in LAYERS}
        self.comp = np.zeros((H, W, 4), np.uint8)
        self.base = np.zeros((H, W, 4), np.uint8)
        self.shade = np.zeros((H, W, 4), np.uint8)
        self.owner = np.full((H, W), -1, np.int8)
        self._last_layer = 0

    def _write(self, layer, mask, color):
        index = LAYERS.index(layer)
        if index < self._last_layer:
            raise ValueError(f"draw order: {layer} after {LAYERS[self._last_layer]}")
        self._last_layer = index
        self.layers[layer][mask] = color
        self.comp[mask] = color
        self.owner[mask] = index

    def part(self, layer, mask, pal, shade=(2, 2), cast=0, hi=None, outline=True, line=True):
        if not mask.any():
            return
        occupied = self.comp[:, :, 3] > 0
        if cast:
            below = np.zeros_like(mask)
            for k in range(1, cast + 1):
                below |= shift(mask, 0, -k)
            region = below & ~mask & occupied & np.all(self.comp == self.base, axis=2) & (self.base[:, :, 3] > 0)
            if region.any():
                owners = self.owner[region]
                colors = self.shade[region]
                ys, xs = np.nonzero(region)
                for y, x, owner, color in zip(ys, xs, owners, colors):
                    self.layers[LAYERS[owner]][y, x] = color
                    self.comp[y, x] = color
        self._write(layer, mask, pal["base"])
        self.base[mask] = pal["base"]
        self.shade[mask] = pal["shade"]
        if shade:
            region = mask & ~shift(mask, shade[0], shade[1])
            self._write(layer, region, pal["shade"])
        if hi is not None:
            self._write(layer, hi & mask, pal["hi"])
        if outline:
            inner = shift(mask, 1, 0) & shift(mask, -1, 0) & shift(mask, 0, 1) & shift(mask, 0, -1)
            edge = mask & ~inner
            empty = ~mask & ~occupied
            touches_empty = (shift(empty, 1, 0) | shift(empty, -1, 0) | shift(empty, 0, 1) | shift(empty, 0, -1))
            if line:
                self._write(layer, edge & ~touches_empty, pal["line"])
            self._write(layer, edge & touches_empty, pal["ol"])

    def fill(self, layer, mask, color):
        if mask.any():
            self._write(layer, mask, color)

    def stamp(self, layer, rows, x, y, colors, flip=False):
        x, y = int(round(x + _offset[0])), int(round(y + _offset[1]))
        mask_by_color = {}
        for dy, row in enumerate(rows):
            if flip:
                row = row[::-1]
            for dx, ch in enumerate(row):
                if ch in (".", " "):
                    continue
                px, py = x + dx, y + dy
                if 0 <= px < W and 0 <= py < H:
                    mask_by_color.setdefault(ch, []).append((py, px))
        for ch, points in mask_by_color.items():
            mask = np.zeros((H, W), bool)
            ys, xs = zip(*points)
            mask[list(ys), list(xs)] = True
            self._write(layer, mask, colors[ch])

    def composite(self):
        out = np.zeros((H, W, 4), np.uint8)
        for name in LAYERS:
            layer = self.layers[name]
            opaque = layer[:, :, 3] > 0
            out[opaque] = layer[opaque]
        return out
