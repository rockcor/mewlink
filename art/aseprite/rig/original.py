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
from functools import lru_cache

import numpy as np

import fx as fxlib
from cutout import H, W, bbox, load, over, scale_about, split, warp
from pixel import Canvas, capsule, ellipse, ramp, rrect

N_LOOP, N_TRANSITION, N_INTERACTION = 24, 32, 24
# Watching videos is drawn at the desk (the app's sceneFor), so there is no leisure scene.
STATES = ["work", "meeting", "idle", "rest"]
WORK_VISUALS = ["code", "document", "web", "ai", "mewlink"]
LAYERS = ["back", "pet", "front", "fx"]

# Peak frames were authored a few pixels off their base frames; these offsets
# keep the props still when the pose changes.
ALIGN = {"peak_meeting": (-11, 0), "peak_rest": (1, 0)}
# Rows below this stay pinned when the pup nods (top edge of the laptop / TV).
NOD_BELOW = {"meeting": 190, "rest": 256, "idle": 256}
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
        return meeting_frame(i)
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
    elif state == "meeting":
        dog, props = meeting_pup(), meeting_props()
    else:
        name = {"meeting": "base_meeting", "rest": "base_rest"}[state]
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
    if {a, b} == {"work", "meeting"}:
        return headset_on(visual_a) if a == "work" else headset_off(visual_b)
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


# --------------------------------------------------------------------------- the meeting, at the desk

# A meeting is the working pup at its own desk with a headset on and a call
# on its screen: nothing moves to get there. The headset comes down onto its
# head and the screen connects; afterwards it lifts off again.
HEADSET = ramp("#0d0812", "#a83f55", "#d45e6c", "#fc9a98", "#fdd9d7")
CUP = ramp("#0d0812", "#30092e", "#2a0828", "#470d45", "#6a2763")
TILE = ramp("#1b1534", "#4a3a78", "#5a4890", "#6b56a8", "#7f6bbd")
FACE = ramp("#2b0f17", "#d9b99b", "#f3d7b4", "#fdf0dc", "#fffaf0")
EAR = ramp("#2b0f17", "#c2465a", "#e9717e", "#fc9a98", "#fdd9d7")
# The monitor's content (the same for every screen), and the window in it.
SCREEN = (55, 116, 149, 193)
SCREEN_WINDOW = (63, 126, 141, 190)
# Rows of the 3x art grid: frame y = 3 * native y - 2 (as fx_layer).
_NY, _NX = np.mgrid[0:86, 0:128].astype(np.float64) + 0.5


def _native(layer):
    big = layer.repeat(3, 0).repeat(3, 1)
    return big[2:2 + H, :W].copy()


@lru_cache(maxsize=None)
def headset():
    """The meeting headset, drawn on the art's grid for the working pup's head
    (every desk frame has the same head): a band over its head, a cup over
    each ear, and the mic on the right."""
    cv = Canvas()
    cx, cy, rx, ry, t = 78.7, 27.3, 26.0, 19.5, 1.7
    band = ellipse(cx, cy, rx + t, ry + t) & ~ellipse(cx, cy, rx - t, ry - t) & (_NY < cy)
    cv.part("pet", band, HEADSET, shade=(0, 1), hi=ellipse(cx, cy, rx + t, ry + t) & ~ellipse(cx, cy, rx + t - 0.9, ry + t - 0.9) & (_NY < cy - 8))
    cups = ((-1, 52.7), (1, 104.7))
    for side, x in cups:
        cv.part("mid", ellipse(x, 28.6, 4.6, 6.6), HEADSET, shade=(side, 1), hi=ellipse(x + side * 1.6, 25.6, 1.4, 2.0))
    for side, x in cups:
        cv.part("paws", ellipse(x - side * 1.6, 28.8, 2.0, 5.0), CUP, shade=(0, 1), outline=False)
    boom = capsule(103.6, 34.6, 96.4, 39.2, 0.75) | capsule(96.4, 39.2, 91.0, 40.9, 0.75)
    cv.part("front", boom, HEADSET, shade=None)
    cv.part("fx", capsule(87.8, 41.2, 90.6, 41.2, 1.5), HEADSET, shade=(0, 1), hi=ellipse(88.0, 40.4, 0.8, 0.5))
    return _native(cv.composite())


@lru_cache(maxsize=None)
def call_screen():
    """A call on the monitor: four friends' pups in little windows."""
    cv = Canvas()
    tiles = [(22.5, 43.5, 33.5, 52.5), (35.0, 43.5, 46.0, 52.5), (22.5, 54.0, 33.5, 63.0), (35.0, 54.0, 46.0, 63.0)]
    faces = [((x0 + x1) / 2, y1 - 3.6, y1) for x0, y0, x1, y1 in tiles]
    for x0, y0, x1, y1 in tiles:
        cv.part("back", rrect(x0, y0, x1, y1, 1.0), TILE, shade=(0, 1))
    for fx_, fy, _ in faces:
        cv.part("pet", ellipse(fx_ - 2.9, fy - 0.2, 1.1, 2.0) | ellipse(fx_ + 2.9, fy - 0.2, 1.1, 2.0), EAR, shade=None)
    for fx_, fy, bottom in faces:
        cv.part("mid", ellipse(fx_, fy, 2.6, 2.4) | rrect(fx_ - 3.4, fy + 1.6, fx_ + 3.4, bottom - 0.5, 1.2), FACE, shade=(0, 1))
    eyes = np.zeros(_NX.shape, bool)
    for fx_, fy, _ in faces:
        for dx in (-1.1, 1.1):
            eyes |= (np.abs(_NX - (fx_ + dx)) < 0.5) & (np.abs(_NY - (fy - 0.1)) < 0.5)
    cv.fill("front", eyes, FACE["ol"])
    return _native(cv.composite())


def _area(box):
    mask = np.zeros((H, W), bool)
    x0, y0, x1, y1 = box
    mask[y0:y1, x0:x1] = True
    return mask


@lru_cache(maxsize=None)
def meeting_props():
    """The working desk with the call on its screen (in the MewLink screen's frame)."""
    props = split("mewlink_input_none")[1].copy()
    window = _area(SCREEN_WINDOW) & (props[:, :, 3] > 0)
    navy = props[150, 60].copy()
    props[window] = navy
    call = call_screen()
    drawn = window & (call[:, :, 3] > 0)
    props[drawn] = call[drawn]
    return props


def _screen_of(screen, visual):
    """The desk props with a work screen, the call, or the call connecting (a blank screen)."""
    if screen == "call":
        return meeting_props()
    props = split(f"{visual}_input_none")[1].copy()
    if screen == "blank":
        props[_area(SCREEN) & (props[:, :, 3] > 0)] = meeting_props()[150, 60]
    return props


def meeting_pup(lift=0):
    """The working pup with the headset on (or `lift` px above its head)."""
    pup = split("code_input_none")[0]
    gear = headset()
    if lift:
        gear = warp(gear, dy=-lift) if lift < H else np.zeros_like(gear)
    return over(pup, gear)


def meeting_frame(i, lift=0, screen="call", visual="code", calm=1.0, sy=1.0, waves=True):
    """A frame of the meeting at the desk: it nods and leans as it talks, and
    its voice comes out of the mic."""
    i %= N_LOOP
    t = i / N_LOOP
    nod = (0, -2, -3, -2, 0, 1)[i % 6] * calm
    pet = _pose_warp(meeting_pup(lift), sy=sy, lean=1.5 * math.sin(2 * math.pi * t) * calm, nod=nod,
                     nod_below=NOD_BELOW["meeting"])
    fx = [{"k": "wave", "x": 290, "y": 116}] if waves and i % 3 != 2 else []
    return frame(pet=pet, front=_screen_of(screen, visual), fx=fx_layer(fx))


def headset_on(visual):
    """Work to meeting, in place: the headset comes down onto its head with a
    little bounce and the call connects; then it is talking."""
    frames = [loop_end("work", visual)]
    lifts = (110, 92, 72, 52, 32, 14, 4, -3, 0)
    for j in range(1, N_TRANSITION):
        landing = j <= len(lifts)
        lift = lifts[j - 1] if landing else 0
        screen = visual if j <= 6 else "blank" if j == 7 else "call"
        sy = 0.97 if j == 8 else 1.01 if j == 9 else 1.0
        frames.append(meeting_frame((j - (N_TRANSITION - 1)) % N_LOOP, lift=lift, screen="work" if screen == visual else screen,
                                    visual=visual, calm=0.0 if j < 8 else min(1.0, (j - 7) / 4), sy=sy, waves=j >= 11))
    frames[-1] = loop_start("meeting")
    return frames


def headset_off(visual):
    """Meeting to work, in place: the headset lifts off and away, the screen
    goes back to work, and it types again."""
    frames = [loop_end("meeting")]
    lifts = (0, 4, 12, 24, 40, 60, 84, 112, 150)
    for j in range(1, len(lifts) + 1):
        screen = "call" if j <= 4 else "blank" if j == 5 else "work"
        frames.append(meeting_frame(N_LOOP - 1 + j, lift=lifts[j - 1], screen=screen, visual=visual,
                                    calm=max(0.0, 1 - j / 6), waves=False))
    typing = ("keyboard", "none", "keyboard", "pointer", "none", "both", "none", "keyboard", "none", "pointer")
    while len(frames) < N_TRANSITION - 4:
        frames.append(work_frame(typing[(len(frames) - 10) % len(typing)], visual))
    while len(frames) < N_TRANSITION:
        frames.append(loop_start("work", visual))
    return frames


def in_meeting(image):
    """An authored desk frame (a cup arriving) as it looks in a meeting."""
    out = image.copy()
    call = meeting_props()
    screen = _area(SCREEN) & (call[:, :, 3] > 0)
    out[screen] = call[screen]
    gear = headset()
    worn = gear[:, :, 3] > 0
    out[worn] = gear[worn]
    return out


def authored(prefix, n):
    """Authored frame n of an interaction; in a meeting, the desk ones with the headset and the call."""
    if prefix.startswith("water_meeting_"):
        return in_meeting(load(f"water_work_{prefix[len('water_meeting_'):]}_{n}"))
    return load(f"{prefix}_{n}")


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
        image = authored(prefix, pose_index + 1)
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
    """No hearts anywhere (the app is for friends too): drop the heart stamps standing
    apart from the pups, wherever they are, and the little strokes drawn beside them.

    A heart is a small separate shape that is reddish on average (pink stamps above
    the pups), or at least a fifth heart red even with a thick dark outline (the
    standing hug's big heart, and the ones low in the frame). Excitement marks and
    motion lines are at most a tenth heart red and stay.
    """
    import cv2
    alpha = (image[:, :, 3] > 0).astype(np.uint8)
    rgb = image[:, :, :3].astype(int)
    heart_red = (alpha > 0) & (rgb[:, :, 0] > 200) & (rgb[:, :, 1] < 130) & (rgb[:, :, 2] < 160)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(alpha, connectivity=8)
    out = image.copy()
    hearts = []
    for label in range(1, count):
        x, y, w, h, area = stats[label]
        if area > 900:
            continue
        mask = labels == label
        r, g, b = image[mask][:, :3].astype(np.float32).mean(0)
        if (y <= 120 and r > 180 and r - g > 50) or heart_red[mask].sum() >= 0.2 * area:
            out[mask] = 0
            hearts.append((x, y, w, h))
    for label in range(1, count):
        x, y, w, h, area = stats[label]
        if area > 300 or heart_red[labels == label].sum() < 6:
            continue
        if any(x < hx + hw + 16 and hx < x + w + 16 and y < hy + hh + 16 and hy < y + h + 16
               for hx, hy, hw, hh in hearts):
            out[labels == label] = 0
    return out


# Ownership contours of the visitor (right of the line) per authored pose: they
# split each hug pose into the receiver's and the visitor's layers (visit.py).
HUG_CONTOURS = {
    "work": [[(217, 0), (217, 65), (244, 78), (279, 112), (277, 137), (253, 148), (304, 145), (240, 158), (229, 166), (230, 179), (245, 189), (256, 205), (272, 232), (304, 256)],
             [(216, 0), (216, 64), (240, 75), (263, 108), (262, 131), (253, 145), (308, 141), (251, 158), (240, 165), (241, 179), (249, 189), (256, 205), (272, 232), (304, 256)],
             [(218, 0), (218, 63), (246, 76), (270, 106), (269, 133), (255, 148), (302, 144), (225, 158), (215, 165), (216, 180), (239, 189), (250, 206), (271, 234), (304, 256)],
             [(228, 0), (228, 67), (253, 80), (280, 113), (279, 140), (256, 153), (299, 145), (221, 160), (212, 170), (216, 183), (239, 194), (250, 208), (272, 234), (304, 256)]],
    "idle": [[(192, 0), (192, 60), (192, 100), (192, 140), (192, 153), (192, 166), (192, 182), (192, 256)],
             [(195, 0), (204, 61), (200, 105), (190, 141), (198, 153), (198, 168), (175, 184), (186, 256)],
             [(189, 0), (198, 81), (204, 115), (196, 146), (171, 151), (160, 170), (218, 178), (193, 256)],
             [(195, 0), (205, 62), (200, 108), (185, 145), (210, 163), (179, 178), (187, 190), (185, 256)]],
    "rest": [[(384, 0), (384, 110), (384, 144), (384, 158), (384, 177), (384, 199), (384, 221), (384, 256)],
             [(200, 0), (199, 110), (208, 144), (265, 153), (261, 176), (294, 182), (276, 218), (298, 256)],
             [(180, 0), (183, 110), (208, 144), (205, 155), (200, 174), (247, 181), (311, 219), (330, 256)],
             [(186, 0), (192, 110), (208, 144), (239, 175), (230, 184), (235, 203), (281, 211), (311, 256)]],
}
def _contour_group(prefix):
    if prefix.startswith("hug_rest"):
        return "rest"
    return {"hug_idle": "idle"}.get(prefix, "work")


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
    name = {"hug_work": None, "hug_meeting": "base_meeting", "hug_idle": "base_idle"}[prefix]
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


def _cup_of(prefix):
    """The cup that appears in the second pose (pixels new on the right-hand side)."""
    before, after = authored(prefix, 1), authored(prefix, 2)
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
        first = authored(prefix, 1)
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
        image = authored(prefix, pose_index + 1)
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


