"""Choreography that animates the approved MewLink artwork.

The pup and its props come straight from art/aseprite/frames (see cutout.py).
Motion is layered on top: breathing and swaying warps, nods that stay anchored
behind laptops and TVs, pose swaps between the authored frames with a squash on
every change, hops, props that pop in and out with a springy overshoot, and a
dust "poof" that hides the costume change whenever the pup swaps scenes.

A frame is a dict of 384x256 RGBA layers: back (cushion), pet, front (props),
fx. Transition endpoints are rendered by the same functions as the loops, so
they match the neighbouring loop frames pixel for pixel.
"""

from __future__ import annotations

import math

import numpy as np

import fx as fxlib
from cutout import H, W, bbox, load, over, scale_about, split, warp
from pixel import Canvas

N_LOOP, N_TRANSITION, N_INTERACTION = 24, 32, 24
STATES = ["work", "meeting", "leisure", "idle", "rest"]
WORK_VISUALS = ["code", "document", "web", "ai", "mewlink"]
LAYERS = ["back", "pet", "front", "fx"]

# Peak frames were authored a few pixels off their base frames; these offsets
# keep the props still when the pose changes.
ALIGN = {"peak_meeting": (-11, 0), "peak_video": (7, 1), "peak_rest": (1, 0)}
# Rows below this stay pinned when the pup nods (top edge of the laptop / TV).
NOD_BELOW = {"meeting": 150, "leisure": 172, "rest": 256, "idle": 256}
BACK_PROPS = {"rest"}


def shifted(layer, name):
    dx, dy = ALIGN.get(name, (0, 0))
    return warp(layer, dx=dx, dy=dy) if (dx or dy) else layer


def dog_of(name):
    return shifted(split(name)[0], name)


def props_of(name):
    return shifted(split(name)[1], name)


def head_cx(layer):
    x0, y0, x1, y1 = bbox(layer)
    band = layer[y0:y0 + 60, :, 3] > 0
    xs = np.nonzero(band.any(0))[0]
    return (xs.min() + xs.max()) / 2


def frame(pet=None, back=None, front=None, fx=None):
    empty = np.zeros((H, W, 4), np.uint8)
    return {"back": empty if back is None else back, "pet": empty if pet is None else pet,
            "front": empty if front is None else front, "fx": empty if fx is None else fx}


def composite(f):
    return over(*(f[name] for name in LAYERS))


# --------------------------------------------------------------------------- effects

def fx_layer(items):
    """Draw effect stamps on the native 128x86 grid and upscale 3x (matches the art's pixel size)."""
    if not items:
        return np.zeros((H, W, 4), np.uint8)
    cv = Canvas()
    native = [dict(item, x=item["x"] / 3, y=(item["y"] + 2) / 3) for item in items]
    fxlib.draw_fx(cv, native)
    big = cv.layers["fx"].repeat(3, 0).repeat(3, 1)
    return big[2:2 + H, :W].copy()


def poof(cx, cy, stage):
    """Cartoon dust cloud; stage 0..4 grows then fades."""
    size = (0.45, 0.8, 1.0, 0.7, 0.35)[stage]
    items = []
    for ox, oy, r in ((-60, 40, 11), (60, 40, 11), (-30, 58, 12), (30, 58, 12), (0, 30, 13), (-72, 0, 9),
                      (72, 0, 9), (-40, 8, 11), (40, 8, 11), (0, -20, 11), (-50, -38, 8), (50, -38, 8), (0, 70, 10)):
        items.append({"k": "puff", "x": cx + ox * (0.6 + 0.4 * size), "y": cy + oy * (0.6 + 0.4 * size), "r": r * size})
    if stage in (1, 2, 3):
        items += [{"k": "sparkle", "x": cx - 84, "y": cy - 58}, {"k": "sparkle_s", "x": cx + 88, "y": cy - 40}]
    return items


def dust(x, y, size=1.0):
    return [{"k": "puff", "x": x - 26, "y": y, "r": 3.2 * size}, {"k": "puff", "x": x + 26, "y": y, "r": 3.2 * size}]


# --------------------------------------------------------------------------- loops

def _pose_warp(layer, sy=1.0, lean=0.0, hop=0.0, nod=0.0, nod_below=None):
    return warp(layer, sy=sy, sx=1 / math.sqrt(sy), lean=lean, dy=-hop, nod=nod, nod_below=nod_below)


IDLE_TABLE = [  # pose, sy, lean, hop
    ("base_idle", 1.0, 0, 0), ("base_idle", 1.006, 2, 0), ("base_idle", 1.01, 4, 0), ("base_idle", 1.006, 5, 0),
    ("base_idle", 1.0, 4, 0), ("base_idle", 0.996, 2, 0), ("base_idle", 1.0, 0, 0), ("base_idle", 1.006, -2, 0),
    ("base_idle", 1.01, -4, 0), ("base_idle", 1.006, -5, 0), ("base_idle", 1.0, -4, 0), ("base_idle", 0.996, -2, 0),
    ("base_idle", 1.0, 0, 0), ("base_idle", 0.94, 0, 0), ("peak_idle", 0.98, 0, 5), ("peak_idle", 1.0, 0, 8),
    ("peak_idle", 1.0, 0, 7), ("peak_idle", 1.0, 0, 3), ("peak_idle", 0.92, 0, 0), ("peak_idle", 1.02, 0, 0),
    ("peak_idle", 1.0, 0, 0), ("base_idle", 0.96, 0, 0), ("base_idle", 1.01, 0, 0), ("base_idle", 1.0, 0, 0),
]


def loop_frame(state, i, n=N_LOOP):
    i %= n
    t = i / n
    if state == "idle":
        pose, sy, lean, hop = IDLE_TABLE[i]
        fx = []
        if i in (14, 15, 16):
            fx += [{"k": "sparkle", "x": 92, "y": 40 - (i - 14) * 6}, {"k": "sparkle_s", "x": 300, "y": 30 - (i - 14) * 4}]
        if i == 18:
            fx += dust(192, 248)
        return frame(pet=_pose_warp(dog_of(pose), sy=sy, lean=lean, hop=hop), fx=fx_layer(fx))
    if state == "meeting":
        pose = "peak_meeting" if i in (8, 9, 10, 18, 19) else "base_meeting"
        nod = (0, -2, -3, -2, 0, 1)[i % 6]
        sy = 0.97 if i in (8, 18) else 1.0
        dog = _pose_warp(dog_of(pose), sy=sy, lean=2 * math.sin(2 * math.pi * t), nod=nod, nod_below=NOD_BELOW["meeting"])
        fx = [{"k": "wave", "x": 238, "y": 108}] if i % 3 != 2 else []
        return frame(pet=dog, front=props_of(pose), fx=fx_layer(fx))
    if state == "leisure":
        laughing = 12 <= i <= 17
        pose = "peak_video" if laughing else "base_video"
        nod = (-4 if i % 2 == 0 else 0) if laughing else (2 if i % 2 else 0) if i < 8 else 0
        dog = _pose_warp(dog_of(pose), sy=0.97 if i == 12 else 1.0, lean=3 * math.sin(2 * math.pi * t),
                         nod=nod, nod_below=NOD_BELOW["leisure"])
        fx = []
        if laughing:
            fx.append({"k": "note", "x": 60 + (i - 12) * 2, "y": 70 - (i - 12) * 5})
            fx.append({"k": "heart_s", "x": 318, "y": 60 - (i - 12) * 4})
        return frame(pet=dog, front=props_of(pose), fx=fx_layer(fx))
    if state == "rest":
        pose = "peak_rest" if i in (14, 15) else "base_rest"
        dog = _pose_warp(dog_of(pose), sy=1 + 0.03 * math.sin(2 * math.pi * t))
        fx = []
        for k in range(3):
            phase = (t + k / 3) % 1
            if phase < 0.92:
                fx.append({"k": "z" if phase < 0.5 else "Z", "x": 272 + phase * 30, "y": 70 - phase * 48})
        return frame(pet=dog, back=props_of(pose), fx=fx_layer(fx))
    raise ValueError(state)


def work_frame(inputs="none", visual="code", stress=False):
    name = f"{visual}_input_{inputs}{'_stress' if stress else ''}"
    dog, props = split(name)
    return frame(pet=dog, front=props)


def loop_end(state, visual="code"):
    return work_frame("none", visual) if state == "work" else loop_frame(state, N_LOOP - 1)


def loop_start(state, visual="code"):
    return work_frame("none", visual) if state == "work" else loop_frame(state, 0)


# --------------------------------------------------------------------------- transitions

def scene_parts(state, visual):
    """Dog layer, props layer and props anchor for a state's resting frame."""
    if state == "work":
        dog, props = split(f"{visual}_input_none")
    elif state == "idle":
        dog, props = dog_of("base_idle"), np.zeros((H, W, 4), np.uint8)
    else:
        name = {"meeting": "base_meeting", "leisure": "base_video", "rest": "base_rest"}[state]
        dog, props = dog_of(name), props_of(name)
    x0, y0, x1, y1 = bbox(props)
    return dog, props, ((x0 + x1) / 2, y1)


def _neutral(x, pose="base_idle", sy=1.0, lean=0.0, hop=0.0):
    dog = dog_of(pose)
    return warp(dog, dx=x - head_cx(dog), dy=-hop, sy=sy, sx=1 / math.sqrt(sy), lean=lean)


def transition(a, b, visual_a="code", visual_b="code"):
    frames = []
    dog_a, props_a, anchor_a = scene_parts(a, visual_a)
    dog_b, props_b, anchor_b = scene_parts(b, visual_b)
    xa = head_cx(dog_a) if a != "rest" else 192
    xb = head_cx(dog_b) if b != "rest" else 192
    d = 1 if xb >= xa else -1
    ya, yb = (bbox(dog_a)[1] + bbox(dog_a)[3]) / 2, (bbox(dog_b)[1] + bbox(dog_b)[3]) / 2
    side_a = "back" if a in BACK_PROPS else "front"
    side_b = "back" if b in BACK_PROPS else "front"
    has_a, has_b = a != "idle", b != "idle"

    # ---- exit: anticipate, props pop away under a poof, the pup emerges in its idle sit
    frames.append(loop_end(a, visual_a))
    for k, (sy, lean) in enumerate(((0.975, 0), (0.955, 3 * d), (1.0, 6 * d)), start=1):
        if a == "idle":
            pet = _pose_warp(dog_of("base_idle"), sy=sy, lean=lean)
        else:
            pet = _pose_warp(dog_a, sy=sy, lean=lean, nod_below=NOD_BELOW.get(a))
        frames.append(frame(pet=pet, **{side_a: props_a}) if has_a else frame(pet=pet))
    prop_scales = (1.08, 0.72, 0.34, 0.0, 0.0, 0.0, 0.0, 0.0)
    for k in range(8):  # frames 4..11
        fx = []
        props_layer = scale_about(props_a, prop_scales[k], *anchor_a) if has_a else None
        if has_a:
            if k in (1, 2, 3, 4, 5):
                fx += poof(xa, ya, k - 1)
            if k in (3, 4, 5):
                fx += [{"k": "puff", "x": anchor_a[0] + dx, "y": anchor_a[1] - 16 + dy, "r": r * (1.2 - 0.3 * (k - 3))}
                       for dx, dy, r in ((-40, 0, 4), (40, -6, 4), (0, -24, 3.5))]
            if k < 2:
                pet = _pose_warp(dog_a, sy=1.0 - 0.02 * k, lean=6 * d, nod_below=NOD_BELOW.get(a))
            else:
                sy = (0.94, 0.94, 0.97, 1.02, 1.0, 0.98)[k - 2]
                pet = _neutral(xa, sy=sy)
        else:
            pose = "peak_idle" if k in (0, 1) else "base_idle"
            sy = (0.95, 1.0, 1.0, 0.98, 1.0, 1.0, 0.97, 1.0)[k]
            pet = _neutral(xa, pose=pose, sy=sy, lean=(3 * d if k in (2, 3) else 0))
            if k in (0, 1):
                fx += [{"k": "bang", "x": xa + 110 * d, "y": 40}]
        f = frame(pet=pet, fx=fx_layer(fx))
        if props_layer is not None:
            f[side_a] = props_layer
        frames.append(f)

    # ---- travel: crouch, cheer at the top of the hop, land squashed
    plan = [("base_idle", 0.9, 0, 0.0, 0), ("bridge_idle_to_active", 1.0, 4, 0.25, 2 * d),
            ("bridge_idle_to_active", 1.0, 7, 0.55, 2 * d), ("bridge_idle_to_active", 1.0, 4, 0.85, d),
            ("peak_idle", 0.9, 0, 1.0, 0), ("base_idle", 1.02, 0, 1.0, 0)]
    for index, (pose, sy, hop, u, lean) in enumerate(plan):
        x = xa + (xb - xa) * u
        fx = []
        if index == 1:
            fx += dust(xa, 248)
        if index in (4, 5):
            fx += dust(xb, 248, 1.2 if index == 4 else 0.6)
        frames.append(frame(pet=_neutral(x, pose=pose, sy=sy, hop=hop, lean=lean), fx=fx_layer(fx)))

    # ---- enter: props pop in, a poof swaps in the destination pose, settle
    pop_in = (0.0, 0.0, 0.45, 1.12, 0.96, 1.0)
    for k in range(6):  # frames 18..23
        fx = []
        pet = _neutral(xb, sy=(1.0, 0.99, 1.0, 1.01, 1.0, 1.0)[k], lean=(0, 0, -2 * d, 0, 2 * d, 0)[k])
        f = frame(pet=pet)
        if has_b:
            f[side_b] = scale_about(props_b, pop_in[k], *anchor_b)
            if k in (3, 4):
                fx += [{"k": "sparkle", "x": anchor_b[0] + 70, "y": anchor_b[1] - 80},
                       {"k": "sparkle_s", "x": anchor_b[0] - 76, "y": anchor_b[1] - 50}]
        else:
            if k in (2, 3):
                f["pet"] = _neutral(xb, pose="peak_idle", sy=0.97)
        f["fx"] = fx_layer(fx)
        frames.append(f)
    for k in range(7):  # frames 24..30
        fx = []
        if has_b:
            if k <= 4:
                fx += poof(xb, yb, k)
            pet = _neutral(xb) if k < 2 else _pose_warp(dog_b, sy=(0.94, 0.95, 1.02, 0.99, 1.0)[k - 2],
                                                         nod_below=NOD_BELOW.get(b))
            f = frame(pet=pet, fx=fx_layer(fx))
            f[side_b] = props_b
        else:
            sy = (0.96, 1.0, 1.01, 1.0, 0.98, 1.0, 1.0)[k]
            f = frame(pet=_neutral(xb, sy=sy), fx=fx_layer([{"k": "heart_s", "x": xb + 96, "y": 40 - 4 * k}] if k < 4 else []))
        frames.append(f)
    frames.append(loop_start(b, visual_b))
    assert len(frames) == N_TRANSITION, len(frames)
    return frames


# --------------------------------------------------------------------------- interactions

def _authored_sequence(prefix, counts, nod_below=200, fx_fn=None):
    """Hold each authored pose for `counts` frames with a squash on arrival and a gentle bob."""
    frames = []
    index = 0
    for pose_index, count in enumerate(counts):
        image = load(f"{prefix}_{pose_index + 1}")
        for k in range(count):
            settle = (0.965, 1.015, 1.0)[k] if k < 3 and pose_index > 0 else 1.0
            nod = (0, -1, -2, -1)[k % 4] if pose_index >= 2 else 0
            layer = warp(image, sy=settle, sx=1 / math.sqrt(settle), nod=nod, nod_below=nod_below)
            fx = fx_fn(index, pose_index, k) if fx_fn else []
            frames.append(frame(pet=layer, fx=fx_layer(fx)))
            index += 1
    assert len(frames) == N_INTERACTION, (prefix, len(frames))
    return frames


def hug(prefix, counts=(4, 4, 10, 6)):
    def fx(index, pose, k):
        items = []
        if pose >= 2:
            phase = (index - 8) / 16
            items += [{"k": "heart", "x": 230 + 14 * math.sin(phase * 7), "y": 60 - phase * 44},
                      {"k": "heart_s", "x": 150 - 10 * math.sin(phase * 5), "y": 44 - phase * 30}]
        if pose == 1 and k < 2:
            items.append({"k": "sparkle", "x": 280, "y": 30})
        return items
    return _authored_sequence(prefix, counts, nod_below=190, fx_fn=fx)


def water(prefix, counts=(5, 6, 7, 6)):
    def fx(index, pose, k):
        if pose == 2 and k < 3:
            return [{"k": "sparkle_s", "x": 360, "y": 190}]
        if pose == 3:
            return [{"k": "heart_s", "x": 300, "y": 50 - 3 * k}]
        return []
    return _authored_sequence(prefix, counts, nod_below=180, fx_fn=fx)


def water_drink(prefix, counts=(5, 5, 8, 6)):
    def fx(index, pose, k):
        if pose == 2:
            return [{"k": "tick_l" if k % 2 else "tick_r", "x": 100, "y": 150}]
        if pose == 3:
            return [{"k": "heart", "x": 300, "y": 50 - 3 * k}, {"k": "sparkle_s", "x": 84, "y": 60}]
        return []
    return _authored_sequence(prefix, counts, nod_below=256, fx_fn=fx)


def website_replay():
    frames = []
    for i in range(8):
        frames.append(work_frame(("keyboard", "none", "both", "pointer")[i % 4], "code"))
    frames += transition("work", "meeting")[::4]
    frames += [loop_frame("meeting", i) for i in range(0, 24, 3)]
    frames += transition("meeting", "leisure")[::4]
    frames += [loop_frame("leisure", i) for i in range(0, 24, 3)]
    frames += transition("leisure", "rest")[::4]
    return frames
