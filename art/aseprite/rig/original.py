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
# A hug: the visitor hops in, the four authored poses, then it hops away.
HUG_APPROACH, HUG_EXIT = 8, 8
N_HUG = HUG_APPROACH + N_INTERACTION + HUG_EXIT
STATES = ["work", "meeting", "leisure", "idle", "rest"]
WORK_VISUALS = ["code", "document", "web", "ai", "mewlink"]
LAYERS = ["back", "pet", "front", "fx"]

# Peak frames were authored a few pixels off their base frames; these offsets
# keep the props still when the pose changes.
ALIGN = {"peak_meeting": (-11, 0), "peak_video": (7, 1), "peak_rest": (1, 0)}
# Rows below this stay pinned when the pup nods (top edge of the laptop / TV).
NOD_BELOW = {"meeting": 150, "leisure": 172, "rest": 256, "idle": 256}
BACK_PROPS = {"rest", "idle"}
# Away from the computer the pup simply sleeps: idle shows the rest scene.
SLEEPS = {"idle": "rest"}


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


def loop_frame(state, i, n=N_LOOP):
    i %= n
    t = i / n
    state = SLEEPS.get(state, state)
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
            fx.append({"k": "sparkle_s", "x": 318, "y": 60 - (i - 12) * 4})
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
    state = SLEEPS.get(state, state)
    if state == "work":
        dog, props = split(f"{visual}_input_none")
    else:
        name = {"meeting": "base_meeting", "leisure": "base_video", "rest": "base_rest"}[state]
        dog, props = dog_of(name), props_of(name)
    x0, y0, x1, y1 = bbox(props)
    return dog, props, ((x0 + x1) / 2, y1)


def _neutral(x, pose="base_idle", sy=1.0, lean=0.0, hop=0.0):
    dog = dog_of(pose)
    return warp(dog, dx=x - head_cx(dog), dy=-hop, sy=sy, sx=1 / math.sqrt(sy), lean=lean)


def same_scene(a, b):
    """Idle and rest look the same (asleep): keep breathing through the change."""
    return [loop_frame("rest", round(N_LOOP - 1 + k * (N_LOOP + 1) / (N_TRANSITION - 1))) for k in range(N_TRANSITION)]


def transition(a, b, visual_a="code", visual_b="code"):
    if SLEEPS.get(a, a) == SLEEPS.get(b, b):
        return same_scene(a, b)
    a, b = SLEEPS.get(a, a), SLEEPS.get(b, b)
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
            f = frame(pet=_neutral(xb, sy=sy), fx=fx_layer([{"k": "sparkle_s", "x": xb + 96, "y": 40 - 4 * k}] if k < 4 else []))
        frames.append(f)
    frames.append(loop_start(b, visual_b))
    assert len(frames) == N_TRANSITION, len(frames)
    return frames


# --------------------------------------------------------------------------- interactions

def _settle(pose_index, k, index):
    """Squash on arriving in a pose, then keep breathing so a held pose never freezes."""
    settle = (0.965, 1.015, 1.0)[k] if k < 3 and pose_index > 0 else 1.0
    return settle * (1 + 0.008 * math.sin(2 * math.pi * index / 12))


def _authored_sequence(prefix, counts, nod_below=200, fx_fn=None, start=0):
    """Hold each authored pose for `counts` frames with a squash on arrival and a gentle bob."""
    frames = []
    index = start
    for pose_index, count in enumerate(counts):
        image = load(f"{prefix}_{pose_index + 1}")
        if prefix.startswith("hug"):
            image = without_hearts(image)
        for k in range(count):
            sy = _settle(pose_index, k, index)
            nod = (0, -1, -2, -1)[k % 4] if pose_index >= 2 else 0
            layer = warp(image, sy=sy, sx=1 / math.sqrt(sy), nod=nod, nod_below=nod_below)
            fx = fx_fn(index, pose_index, k) if fx_fn else []
            frames.append(frame(pet=layer, fx=fx_layer(fx)))
            index += 1
    return frames


def without_hearts(image):
    """No hearts anywhere (the app is for friends too): drop the small pink stamps drawn above the pups."""
    import cv2
    alpha = (image[:, :, 3] > 0).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(alpha, connectivity=8)
    out = image.copy()
    for label in range(1, count):
        x, y, w, h, area = stats[label]
        if area > 900 or y > 120:
            continue
        pixels = image[labels == label][:, :3].astype(np.float32)
        r, g, b = pixels.mean(0)
        if r > 180 and r - g > 50:
            out[labels == label] = 0
    return out


# Ownership contours of the visitor (right of the line) per authored pose, as in
# src/pet/hugOwnership.ts. Used to lift the visitor out and walk it in and out.
HUG_CONTOURS = {
    "work": [[(217, 0), (217, 65), (244, 78), (279, 112), (277, 137), (253, 148), (304, 145), (240, 158), (229, 166), (230, 179), (245, 189), (256, 205), (272, 232), (304, 256)],
             [(216, 0), (216, 64), (240, 75), (263, 108), (262, 131), (253, 145), (308, 141), (251, 158), (240, 165), (241, 179), (249, 189), (256, 205), (272, 232), (304, 256)],
             [(218, 0), (218, 63), (246, 76), (270, 106), (269, 133), (255, 148), (302, 144), (225, 158), (215, 165), (216, 180), (239, 189), (250, 206), (271, 234), (304, 256)],
             [(228, 0), (228, 67), (253, 80), (280, 113), (279, 140), (256, 153), (299, 145), (221, 160), (212, 170), (216, 183), (239, 194), (250, 208), (272, 234), (304, 256)]],
    "idle": [[(192, 0), (192, 60), (192, 100), (192, 140), (192, 153), (192, 166), (192, 182), (192, 256)],
             [(195, 0), (204, 61), (200, 105), (190, 141), (198, 153), (198, 168), (175, 184), (186, 256)],
             [(189, 0), (198, 81), (204, 115), (196, 146), (171, 151), (160, 170), (218, 178), (193, 256)],
             [(195, 0), (205, 62), (200, 108), (185, 145), (210, 163), (179, 178), (187, 190), (185, 256)]],
    "leisure": [[(384, 0), (384, 60), (384, 110), (384, 157), (384, 170), (384, 185), (384, 215), (384, 256)],
                [(218, 0), (221, 65), (211, 113), (201, 153), (220, 170), (218, 188), (211, 216), (242, 256)],
                [(203, 0), (207, 64), (201, 113), (200, 156), (253, 165), (250, 188), (245, 215), (268, 256)],
                [(186, 0), (196, 63), (200, 108), (190, 156), (251, 165), (249, 185), (243, 213), (269, 256)]],
    "rest": [[(384, 0), (384, 110), (384, 144), (384, 158), (384, 177), (384, 199), (384, 221), (384, 256)],
             [(200, 0), (199, 110), (208, 144), (265, 153), (261, 176), (294, 182), (276, 218), (298, 256)],
             [(180, 0), (183, 110), (208, 144), (205, 155), (200, 174), (247, 181), (311, 219), (330, 256)],
             [(186, 0), (192, 110), (208, 144), (239, 175), (230, 184), (235, 203), (281, 211), (311, 256)]],
}
# Visitor offsets while it hops in and out; mirrored in src/pet/hugOwnership.ts.
HUG_APPROACH_MOVES = [(round(230 * (1 - k / 7) ** 3), -round(12 * abs(math.sin(2 * math.pi * k / 7))))
                      for k in range(HUG_APPROACH)]
HUG_EXIT_MOVES = [(round(240 * ((k + 1) / HUG_EXIT) ** 2), -round(10 * abs(math.sin(2 * math.pi * (k + 1) / HUG_EXIT))))
                  for k in range(HUG_EXIT)]


def _contour_group(prefix):
    if prefix.startswith("hug_rest"):
        return "rest"
    return {"hug_idle": "idle", "hug_leisure": "leisure"}.get(prefix, "work")


def _visitor_mask(group, pose):
    import cv2
    pts = HUG_CONTOURS[group][pose]
    poly = [(pts[0][0], 0)] + list(pts) + [(W, H), (W, 0)]
    mask = np.zeros((H, W), np.uint8)
    cv2.fillPoly(mask, [np.array(poly, np.int32)], 1)
    return mask.astype(bool)


def _receiver_base(prefix):
    """The receiver's ordinary scene, before anyone arrives (composite, unaligned)."""
    if prefix.startswith("hug_rest"):
        return composite(loop_frame("rest", 0))
    name = {"hug_work": None, "hug_meeting": "base_meeting", "hug_leisure": "base_video", "hug_idle": "base_idle"}[prefix]
    if name is None:
        return composite(work_frame("none", "code"))
    dog, props = split(name)
    return over(dog, props)


def _search(have, want, region, scales, dxs, dys):
    best, best_cost = None, None
    for s_ in scales:
        layer = np.zeros((H, W, 4), np.uint8)
        layer[have] = 255
        scaled = have if s_ == 1 else warp(layer, sx=s_, sy=s_, anchor=(W / 2, H))[:, :, 3] > 0
        for dy in dys:
            for dx in dxs:
                moved = np.roll(np.roll(scaled, dy, 0), dx, 1)
                cost = np.count_nonzero((moved != want) & region)
                if best_cost is None or cost < best_cost:
                    best, best_cost = (s_, dx, dy), cost
    return best


def _align_params(base, target, region):
    """Scale and offset that make `base` cover the receiver part of the first hug pose."""
    want = (target[:, :, 3] > 0) & region
    have = base[:, :, 3] > 0
    s_, dx, dy = _search(have, want, region, [0.80 + 0.02 * i for i in range(14)], range(-48, 49, 4), range(-16, 17, 4))
    return _search(have, want, region, [s_ - 0.01, s_, s_ + 0.01], range(dx - 3, dx + 4), range(dy - 3, dy + 4))


def _place(base, params, t):
    """`base` moved t of the way (0..1) from where it normally sits to its hug placement."""
    s_, dx, dy = params
    k = 1 + (s_ - 1) * t
    return warp(base, sx=k, sy=k, anchor=(W / 2, H), dx=dx * t, dy=dy * t)


def _ease(t):
    return t * t * (3 - 2 * t)


def contact_puff(x, y, stage):
    size = (0.6, 1.0, 0.7, 0.35)[stage]
    items = [{"k": "puff", "x": x + ox * size, "y": y + oy * size, "r": r * size}
             for ox, oy, r in ((0, 0, 12), (-18, 14, 9), (18, 12, 9), (-8, -16, 8), (12, -14, 7))]
    if stage == 1:
        items += [{"k": "sparkle", "x": x + 34, "y": y - 30}, {"k": "sparkle_s", "x": x - 30, "y": y - 24}]
    return items


# Per frame of every hug strip, who owns which pixels (read by the app and the
# promo renderer): {"pose": n} uses that pose's contour; while the visitor walks
# in or out, {"edge": [[x, y], ...]} traces its left edge row by row and the
# visitor is everything right of it.
HUG_TIMELINES = {}


def left_edge(layer, step=8):
    """Polyline of the layer's leftmost opaque pixel every `step` rows (W where the row is empty)."""
    alpha = layer[:, :, 3] > 0
    points = []
    for y in list(range(0, H, step)) + [H]:
        rows = alpha[max(0, y - step // 2):min(H, y + step // 2 + 1)]
        xs = np.nonzero(rows.any(0))[0]
        points.append([int(max(0, xs.min() - 2)) if len(xs) else W, y])
    return points


def hug(prefix, counts=(4, 4, 10, 6)):
    group = _contour_group(prefix)
    # A sleeping pup's first authored pose is a close-up with nobody there yet;
    # the visitor hops straight into the second (tucking-in) pose instead.
    first_pose = 1 if prefix.startswith("hug_rest") else 0
    if first_pose:
        counts = (6, 10, 8)
    first = without_hearts(load(f"{prefix}_{first_pose + 1}"))
    region = ~_visitor_mask(group, first_pose)
    base = _receiver_base(prefix)
    params = _align_params(base, first, region)
    # TA's pup, whole, at the size it has in the hug.
    walker = dog_of("bridge_idle_to_active")
    vx0, vy0, vx1, vy1 = bbox(np.where(_visitor_mask(group, first_pose)[..., None], first, 0))
    wx0, wy0, wx1, wy1 = bbox(walker)
    k = (vy1 - vy0) / max(1, wy1 - wy0) * 0.85
    walker = warp(walker, sx=k, sy=k, anchor=((wx0 + wx1) / 2, wy1), dx=(vx0 + vx1) / 2 - (wx0 + wx1) / 2, dy=vy1 - wy1)
    contact = (vx0 + 14, (vy0 + vy1) / 2)
    timeline = []

    frames = []
    for k_, (dx, dy) in enumerate(HUG_APPROACH_MOVES):
        receiver = _place(base, params, _ease(k_ / (HUG_APPROACH - 1)))
        fx = dust(vx0 + 60 + dx, vy1, 0.8) if k_ in (3, 6) else []
        if k_ == HUG_APPROACH - 1:
            fx += contact_puff(*contact, 0)
        moved = warp(walker, dx=dx, dy=dy)
        frames.append(frame(back=receiver, pet=moved, fx=fx_layer(fx)))
        timeline.append({"edge": left_edge(moved)})

    def fx(index, pose, k):
        if pose == 0 and k < 3:
            return contact_puff(*contact, k + 1)
        return [{"k": "sparkle", "x": 280, "y": 30}] if pose == 1 and k < 2 else []
    if first_pose:
        frames += _authored_sequence_from(prefix, counts, first_pose=first_pose + 1, nod_below=190, start=HUG_APPROACH,
                                          fx_fn=lambda index, pose, k: fx(index, pose - first_pose, k), hearts=False)
    else:
        frames += _authored_sequence(prefix, counts, nod_below=190, fx_fn=fx, start=HUG_APPROACH)
    for pose, count in enumerate(counts):
        timeline += [{"pose": pose + first_pose}] * count

    for k_, (dx, dy) in enumerate(HUG_EXIT_MOVES):
        receiver = _place(base, params, 1 - _ease((k_ + 1) / HUG_EXIT))
        fx = contact_puff(*contact, min(3, k_ + 1)) if k_ < 3 else []
        if k_ in (2, 5):
            fx += dust(vx0 + 60 + dx, vy1, 0.8)
        moved = warp(walker, dx=dx, dy=dy)
        frames.append(frame(back=receiver, pet=moved, fx=fx_layer(fx)))
        timeline.append({"edge": left_edge(moved)})
    assert len(frames) == N_HUG == len(timeline), (prefix, len(frames))
    HUG_TIMELINES[prefix] = timeline
    return frames


def _cup_of(prefix):
    """The cup that appears in the second pose (pixels new on the right-hand side)."""
    before, after = load(f"{prefix}_1"), load(f"{prefix}_2")
    mask = (after[:, :, 3] > 0) & (before[:, :, 3] == 0)
    mask[:, :280] = False
    cup = np.zeros_like(after)
    cup[mask] = after[mask]
    return cup if np.count_nonzero(mask) > 40 else None


def water(prefix, counts=(5, 6, 7, 6)):
    """The cup slides in from the right and lands with a bounce, then the authored poses."""
    def fx(index, pose, k):
        if pose == 2 and k < 3:
            return [{"k": "sparkle_s", "x": 360, "y": 190}]
        if pose == 3:
            return [{"k": "sparkle_s", "x": 300, "y": 50 - 3 * k}]
        return []
    cup = _cup_of(prefix)
    if cup is None:
        frames = _authored_sequence(prefix, counts, nod_below=180, fx_fn=fx)
    else:
        first = load(f"{prefix}_1")
        frames = []
        for k in range(3):
            sy = _settle(0, k, k)
            frames.append(frame(pet=warp(first, sy=sy, sx=1 / math.sqrt(sy))))
        for k, (dx, dy) in enumerate(((90, -6), (58, -12), (30, -12), (10, -6), (0, 0))):
            f = frame(pet=first, front=warp(cup, dx=dx, dy=dy))
            if k == 4:
                f["fx"] = fx_layer([{"k": "sparkle_s", "x": 360, "y": 200}, {"k": "sparkle", "x": 330, "y": 170}])
            frames.append(f)
        frames += _authored_sequence_from(prefix, (5, 6, 5), first_pose=2, nod_below=180, start=8,
                                          fx_fn=fx)
    assert len(frames) == N_INTERACTION, (prefix, len(frames))
    return frames


def _authored_sequence_from(prefix, counts, first_pose, nod_below, start, fx_fn, hearts=True):
    frames, index = [], start
    for offset, count in enumerate(counts):
        pose_index = first_pose - 1 + offset
        image = load(f"{prefix}_{pose_index + 1}")
        if not hearts:
            image = without_hearts(image)
        for k in range(count):
            sy = _settle(pose_index, k, index)
            nod = (0, -1, -2, -1)[k % 4] if pose_index >= 2 else 0
            frames.append(frame(pet=warp(image, sy=sy, sx=1 / math.sqrt(sy), nod=nod, nod_below=nod_below),
                                fx=fx_layer(fx_fn(index, pose_index, k))))
            index += 1
    return frames


def water_drink(prefix, counts=(5, 5, 8, 6)):
    def fx(index, pose, k):
        if pose == 2:
            return [{"k": "tick_l" if k % 2 else "tick_r", "x": 100, "y": 150}]
        if pose == 3:
            return [{"k": "sparkle", "x": 300, "y": 50 - 3 * k}, {"k": "sparkle_s", "x": 84, "y": 60}]
        return []
    frames = _authored_sequence(prefix, counts, nod_below=256, fx_fn=fx)
    assert len(frames) == N_INTERACTION, (prefix, len(frames))
    return frames


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
