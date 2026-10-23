#!/usr/bin/env python3
"""In-place hugs: one pup leaves its own desk, walks over, hugs the other at
the other's desk, and walks back. Nothing is enlarged and no desk moves.

    python art/aseprite/rig/visit.py --out /tmp/mewlink-hug
    aseprite -b --script-param root="$PWD" --script-param build=/tmp/mewlink-hug \
      --script art/aseprite/build-hug-master.lua

The rig writes layered strips and a manifest; the Aseprite script assembles
them into mewlink-hug-master.aseprite (a tag per sheet, a layer per pup) and
exports into public/pets/animations:

- desk-<scene>.png: each scene's props without the pup (one 384x256 frame).
  The pup's paws and fur covered parts of the keyboard, mouse and cushion;
  those pixels are rebuilt from the rest of the same prop. While its pup is
  away a desk shows this, and during a hug it is drawn over the hug, so the
  desk, keyboard and screen stay exactly where they were, in front.
- hug-visit-<kind>.png: the hug itself at the receiver's desk, a layer per
  row (the receiver, the visitor, and when tucking in the blanket), so each
  pup keeps its own colours and the blanket the one chosen for it. The
  authored hug poses are mapped back onto the receiver's everyday geometry;
  the visitor stands at the receiver's right, so these frames show the base
  frame from x = WINDOW_X to WINDOW_X + 384.
- hug-walker.png: the visiting pup: an eight-frame trot (its feet step in
  turn, its body bobs, its tail wags), then each scene's pup getting up: at a
  desk it ducks down behind it, and the walker comes out from behind it.

and writes src/pet/hugVisit.json with where the walker leaves from and
arrives, in base frame pixels, for the app to choreograph the walk.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

import original as og  # noqa: E402
from cutout import H, W, ZONES, WORK_ZONES, _cream_mask, _dark_mask, _zone_mask, bbox, load, over, split, warp  # noqa: E402
from palette import palette, snap  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "public" / "pets" / "animations"
WINDOW_X = 64
WIDE = W + WINDOW_X
BLANKETS = ["blush", "night", "mint"]
# A held pose for each authored frame (24 frames at 125 ms, like the water strips).
HUG_COUNTS = {"work": (4, 5, 9, 6), "rest": (7, 9, 8)}
HUG_FRAME_MS = 125
WALK_FRAME_MS = 100
# The authored poses' own props, in everyday geometry.
ZONES_FOR = {"work": WORK_ZONES, "rest": ZONES["base_rest"]}


# --------------------------------------------------------------------------- empty desks

def _components(mask, min_area):
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    keep = np.zeros_like(mask)
    for label in range(1, count):
        if stats[label, cv2.CC_STAT_AREA] >= min_area:
            keep |= labels == label
    return keep


def _keyboard_and_mouse(desk):
    """The keyboard and mouse of the work desk (the same in every screen's
    artwork) where the paws hid them, rebuilt from their visible parts."""
    out = desk.copy()
    dark = desk[193, 230].copy()
    gap = desk[209, 273].copy()
    # Left paw (x 163..205): above the keyboard nothing; its left outline;
    # the top outline and the first two rows of keys continue those to the
    # right of the paw (keys 39 px further right).
    out[186:193, 163:206] = 0
    out[193:213, 163:167] = dark
    out[193:213, 167:206] = desk[193:213, 206:245]
    # Right arm (x 270..291): the keyboard's top outline runs to its corner,
    # row 1 ends like row 2 one row of keys lower, with the bevel and outline
    # of the rows that are visible; then the gap to the mouse.
    out[186:193, 270:292] = 0
    out[193:195, 270:282] = dark
    out[195:202, 270:275] = gap
    out[195:202, 275:279] = desk[206:213, 275:279]
    out[195:208, 279:282] = dark
    out[202:206, 280:282] = dark
    out[193:208, 282:292] = 0
    # The mouse is symmetric about x = 319. The paw and its outline hid its
    # top (x 286..330, down to row 218): the left side mirrors the right one,
    # and the middle continues the top outline and the body over the wheel.
    wheel = out[213:219, 316:326].copy()
    out[186:219, 286:331] = 0
    out[186:219, 292:309] = desk[186:219, 346:329:-1]
    top = min(int(np.nonzero(desk[:, x, 3] > 0)[0].min()) for x in range(330, 334))
    body = desk[226, 306].copy()
    shine = desk[top + 4, 334].copy()
    out[top:top + 3, 309:331] = dark
    out[top + 3:top + 5, 309:331] = shine
    out[top + 5:219, 309:331] = body
    out[213:219, 314:316] = dark
    out[213:219, 316:326] = np.where(wheel[:, :, 3:] > 0, wheel, out[213:219, 316:326])
    return out


def _work_desk(visual):
    dog, props = split(f"{visual}_input_none")
    desk = props.copy()
    # The monitor stands in front of the pup; only an ear tip above and right
    # of its bezel was cut into the props.
    monitor = _zone_mask([("rect", 36, 104, 170, 192)])
    rows = (desk[:, :, 3] > 0) & monitor
    top = int(np.nonzero(rows.sum(1) > 80)[0].min())
    right = int(np.nonzero(rows.sum(0) > 40)[0].max())
    stray = monitor & ((np.arange(H)[:, None] < top) | (np.arange(W)[None, :] > right))
    desk[stray] = 0
    desk = _keyboard_and_mouse(desk)
    desk[~_components(desk[:, :, 3] > 0, 40)] = 0
    return desk


def _meeting_desk():
    dog, props = split("base_meeting")
    desk = props.copy()
    # Above the laptop's top edge only the webcam belongs to it; the rest is
    # the waving arm's and the headset cord's outline.
    above = np.zeros((H, W), bool)
    above[:146, :] = True
    above[:, 140:157] = False
    desk[above] = 0
    desk[~_components(desk[:, :, 3] > 0, 40)] = 0
    return desk


def _rest_bed():
    """The cushion without the sleeping pup: its front rim is drawn, the back
    rim and the floor behind the pup are added in the cushion's colours."""
    dog, props = og.dog_of("base_rest"), og.props_of("base_rest")
    bed = props.copy()
    pup = cv2.dilate((dog[:, :, 3] > 0).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
    rgb = bed[:, :, :3].astype(np.int32)
    pinkish = (rgb[:, :, 0] > 170) & (rgb[:, :, 0] - rgb[:, :, 1] > 45) & (rgb[:, :, 1] - rgb[:, :, 2] < 30)
    # Fur and outline crumbs where the pup lay.
    bed[pup & (bed[:, :, 3] > 0) & ~pinkish] = 0
    bed[~_components(bed[:, :, 3] > 0, 40)] = 0
    alpha = bed[:, :, 3] > 0
    ys, xs = np.nonzero(alpha)
    dark = alpha & (bed[:, :, :3].max(2) < 110)
    colours, counts = np.unique(bed[dark].reshape(-1, 4), axis=0, return_counts=True)
    outline = colours[counts.argmax()].copy()
    rim = bed[222, 193].copy()
    shade = bed[ys.max() - 6, 193].copy()
    # The two ends of the front rim, where it curls up at the sides.
    left_x = int(xs.min()) + 7
    right_x = int(xs.max()) - 7
    tip = lambda x: int(np.nonzero(alpha[:, x])[0].min())
    left_y, right_y = tip(left_x), tip(right_x)
    cx, half = (left_x + right_x) / 2, (right_x - left_x) / 2
    peak = min(left_y, right_y) - 12
    out = bed.copy()
    for x in range(left_x, right_x + 1):
        u = (x - cx) / half
        top = round(peak + (((left_y + right_y) / 2) - peak) * u * u)
        front = np.nonzero(alpha[top:, x])[0]
        floor_end = top + (int(front.min()) if len(front) else 0)
        column = [(top + k, outline) for k in range(3)] + [(top + k, rim) for k in range(3, 8)] \
            + [(top + 8, shade), (top + 9, shade)]
        for y, colour in column:
            if y < floor_end and not alpha[y, x]:
                out[y, x] = colour
        for y in range(top + 10, floor_end):
            if not alpha[y, x]:
                out[y, x] = shade
    return out


def desk(scene):
    """Props of a scene (work-<visual>, meeting, rest) without its pup."""
    if scene.startswith("work-"):
        return _work_desk(scene[5:])
    if scene == "meeting":
        return _meeting_desk()
    if scene == "rest":
        return _rest_bed()
    raise ValueError(scene)


# --------------------------------------------------------------------------- the hug

def _wide(layer):
    out = np.zeros((H, WIDE, 4), np.uint8)
    out[:, :W] = layer
    return out


def _to_base(image, params):
    """An authored hug frame mapped back onto the receiver's everyday geometry
    (the inverse of original._place), on the wide canvas."""
    s_, dx, dy = params
    yy, xx = np.mgrid[0:H, 0:WIDE].astype(np.float32)
    ax, ay = W / 2, H
    return cv2.remap(_wide(image), ax + s_ * (xx - ax) + dx, ay + s_ * (yy - ay) + dy, cv2.INTER_NEAREST,
                     borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))


def _wide_zone(zones, grow):
    mask = np.zeros((H, WIDE), bool)
    mask[:, :W] = _zone_mask(zones)
    return cv2.dilate(mask.astype(np.uint8), np.ones((grow, grow), np.uint8)) > 0


def _without_props(image, zone):
    """Drop the authored pose's own props (the everyday desk is drawn in front
    instead): inside the zone keep only fur joined to the body outside it and
    the outline that hugs that fur, as cutout.split does."""
    opaque = image[:, :, 3] > 0
    cream, dark = _cream_mask(image), _dark_mask(image)
    keep = opaque & ~zone
    _, labels = cv2.connectedComponents(cream.astype(np.uint8), connectivity=8)
    attached = np.unique(labels[cream & ~zone])
    keep |= zone & cream & np.isin(labels, attached[attached > 0])
    fur = (keep & cream).astype(np.uint8)
    keep |= zone & dark & (cv2.dilate(fur, np.ones((5, 5), np.uint8)) > 0)
    return np.where(keep[..., None], image, 0).astype(np.uint8)


def _behind_monitor(receiver, mapped, monitor_right, monitor_top):
    """The authored monitor is a little bigger than the everyday one. Where it
    hid the receiver, right of and above the everyday monitor, the receiver
    continues: its body behind the monitor, its ear hanging over the corner."""
    out = receiver.copy()
    dark, cream = _dark_mask(mapped), _cream_mask(mapped)
    rgb = mapped[:, :, :3].astype(np.int32)
    opaque = mapped[:, :, 3] > 0
    pink = opaque & ~dark & ~cream & (rgb[:, :, 0] > 200) & (rgb[:, :, 0] - rgb[:, :, 1] > 50)
    colours, counts = np.unique(mapped[cream].reshape(-1, 4), axis=0, return_counts=True)
    fur = colours[counts.argmax()]
    # The authored monitor's right outline is the rightmost straight dark
    # column beside the everyday monitor; its top outline the first straight
    # dark row above it.
    side = dark[monitor_top + 10:monitor_top + 80, monitor_right:monitor_right + 32].mean(0)
    columns = np.nonzero(side > 0.6)[0]
    if not len(columns):
        return out
    right = monitor_right + int(columns.max()) + 1
    rows = dark[monitor_top - 24:monitor_top + 4, 40:150].mean(1)
    top = monitor_top - 24 + int(np.nonzero(rows > 0.6)[0].min())
    out[top:monitor_top + 100, :right] = 0
    # Above the authored monitor everything is the receiver's (the props zone
    # around the everyday monitor took a few rows of the ear).
    above = slice(top - 12, top)
    out[above, :right + 4] = np.where(opaque[above, :right + 4, None], mapped[above, :right + 4], out[above, :right + 4])
    outline = mapped[top, 60]
    # Above the everyday monitor only the ear hangs on (from its last row
    # above the authored monitor), closed by its outline.
    band = slice(monitor_right - 24, right + 4)
    ear_rows = [y for y in range(top - 10, top) if pink[y, band].sum() >= 10]
    if ear_rows:
        ear_row = ear_rows[-1]
        ear = np.nonzero(pink[ear_row, band])[0]
        x0, x1 = band.start + int(ear[0]), band.start + int(ear[-1]) + 1
        for y in range(ear_row + 1, monitor_top):
            out[y, x0:min(x1, right)] = mapped[ear_row, x0] if y < monitor_top - 3 else outline
            out[y, x0 - 3:x0] = outline
    previous = None
    for y in range(monitor_top, monitor_top + 96):
        x = right
        while x < right + 8 and opaque[y, x] and not (cream[y, x] or pink[y, x]):
            x += 1
        if pink[y, x] and previous is not None and previous is not fur:
            # The ear hanging down behind the monitor.
            colour = mapped[y, x]
        else:
            colour = fur
            # Through the pale edge pixels the authored monitor left on the fur.
            x = right
            while x < right + 3 and opaque[y, x] and not (cream[y, x] or pink[y, x] or dark[y, x]):
                x += 1
        out[y, monitor_right - 4:x] = colour
        previous = colour
    return out


def _refine_owner(pets, side):
    """The ownership contours are hand-drawn polylines: a patch of fur they
    cut goes, whole, to the pup most of it belongs to, and each outline pixel
    to the fur around it. A patch shared about evenly (two pups touching
    without an outline) keeps the contour."""
    opaque = pets[:, :, 3] > 0
    dark = _dark_mask(pets)
    fur = opaque & ~dark
    count, labels = cv2.connectedComponents(fur.astype(np.uint8), connectivity=4)
    total = np.bincount(labels[fur], minlength=count)
    visitor = np.bincount(labels[fur & side], minlength=count)
    share = visitor / np.maximum(total, 1)
    out = side.copy()
    out[fur] = np.where(share[labels[fur]] >= 0.65, True, np.where(share[labels[fur]] <= 0.35, False, side[fur]))
    near_visitor = cv2.boxFilter((fur & out).astype(np.float32), -1, (9, 9), normalize=False)
    near_receiver = cv2.boxFilter((fur & ~out).astype(np.float32), -1, (9, 9), normalize=False)
    lines = opaque & dark & ((near_visitor + near_receiver) > 0)
    out[lines] = near_visitor[lines] > near_receiver[lines]
    return out


def _blanket_mask(prefix, pose):
    """Where the blanket is in a tucking-in pose: the three blanket colours differ only there."""
    a = load(f"hug_rest_blush_{pose + 1}").astype(np.int32)
    b = load(f"hug_rest_night_{pose + 1}").astype(np.int32)
    mask = (np.abs(a - b)[:, :, :3].sum(2) > 60) & (a[:, :, 3] > 0)
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0
    return mask & (a[:, :, 3] > 0)


def hug_visit(kind):
    """Frames of (receiver, visitor[, blanket]) layers, each 384x256, of the
    hug at the receiver's desk; kind is "work", "meeting" or "rest-<blanket>". In a
    meeting the receiver keeps its headset and laptop: the visitor of the
    desk hug puts its arms round the pup as it is."""
    group = "rest" if kind.startswith("rest") else "work"
    prefix = "hug_work" if kind == "meeting" else f"hug_{kind.replace('-', '_')}"
    first = 1 if group == "rest" else 0
    counts = HUG_COUNTS[group]
    base = og._receiver_base("hug_rest_blush" if group == "rest" else "hug_work")
    desk_props = desk("rest" if group == "rest" else "work-code")
    zone = _wide_zone(ZONES_FOR[group], 15)
    poses = []
    for pose in range(first, first + len(counts)):
        raw = og.without_hearts(load(f"{prefix}_{pose + 1}"))
        visitor_side = og._visitor_mask(group, pose)
        params = og._align_params(base, raw, ~visitor_side)
        if group == "rest":
            blanket = _blanket_mask(prefix, pose)
            visitor_side = visitor_side | blanket
        mapped = _to_base(raw, params)
        side = _to_base(np.dstack([visitor_side.astype(np.uint8) * 255] * 4), params)[:, :, 3] > 0
        if group == "rest":
            # The cushion is the everyday one, drawn behind: keep the pups
            # and the blanket, which differs between the blanket colours.
            kept_blanket = _to_base(np.dstack([blanket.astype(np.uint8) * 255] * 4), params)[:, :, 3] > 0
            pets = _without_props(mapped, zone & ~kept_blanket)
        else:
            pets = _without_props(mapped, zone)
        side = _refine_owner(pets, side)
        if group == "rest":
            side |= kept_blanket & (pets[:, :, 3] > 0)
        receiver = np.where(~side[..., None], pets, 0).astype(np.uint8)
        visitor = np.where(side[..., None], pets, 0).astype(np.uint8)
        extra = []
        if group == "rest":
            # The blanket keeps the colour chosen for it, whichever pups hold it.
            cover = kept_blanket & (pets[:, :, 3] > 0)
            extra = [np.where(cover[..., None], pets, 0).astype(np.uint8)]
            visitor[cover] = 0
        if kind == "meeting":
            # The visitor is in front: each pixel belongs to one of them.
            receiver = _wide(og.dog_of("base_meeting"))
            receiver[visitor[:, :, 3] > 0] = 0
        elif group == "work":
            right = int(np.nonzero(desk_props[150, :200, 3] > 0)[0].max())
            top = int(np.nonzero(desk_props[:, 100, 3] > 0)[0].min())
            receiver = _behind_monitor(receiver, np.where(~side[..., None], mapped, 0).astype(np.uint8), right + 1, top)
        poses.append((receiver, visitor, *extra))
    frames = []
    index = 0
    for ordinal, (pose_layers, count) in enumerate(zip(poses, counts)):
        x0, _, x1, y1 = bbox(np.maximum.reduce(pose_layers))
        for k in range(count):
            sy = og._settle(ordinal, k, index)
            nod = (0, -1, -2, -1)[k % 4] if ordinal else 0
            layers = []
            for layer in pose_layers:
                moved = _warp_wide(layer, sy=sy, sx=1 / math.sqrt(sy), nod=nod, nod_below=200,
                                   anchor=((x0 + x1) / 2, y1))
                layers.append(moved[:, WINDOW_X:WINDOW_X + W].copy())
            frames.append(tuple(layers))
            index += 1
    return frames


def _warp_wide(layer, sy, sx, nod, nod_below, anchor):
    """cutout.warp's squash and nod, on a canvas of any width."""
    h, w = layer.shape[:2]
    ax, ay = anchor
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    src_y = ay + (yy - ay) / sy
    src_x = ax + (xx - ax) / sx
    if nod:
        src_y = src_y - nod * np.clip((nod_below - src_y) / 24.0, 0, 1)
    return cv2.remap(layer, src_x.astype(np.float32), src_y.astype(np.float32), cv2.INTER_NEAREST,
                     borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))


# --------------------------------------------------------------------------- the walk

# The walker's frames are everyday 384x256 frames with the feet at ANCHOR, so
# the frames that take a pup from its seat line up with its scene pixel for pixel.
ANCHOR = (192, 246)
WALK_FRAMES = 8
# How far a pup sinks behind its desk (laptop) as it gets up, frame by frame.
SINK = {"work": (0, 18, 50, 100), "meeting": (0, 24, 60, 110)}


def _walking_pup():
    """The authored pup running in to hug (left of hug_1, facing right),
    without its excitement marks, its pinholes filled."""
    image = og.without_hearts(load("hug_1"))
    image[:, W // 2:] = 0
    alpha = (image[:, :, 3] > 0).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(alpha, connectivity=8)
    for label in range(1, count):
        x, y, w, h, area = stats[label]
        if y + h < 50 or area < 30:
            image[labels == label] = 0
    outside = (image[:, :, 3] == 0).astype(np.uint8)
    cv2.floodFill(outside, None, (0, 0), 2)
    holes = outside == 1
    for _ in range(4):
        grown = cv2.dilate(image, np.ones((3, 3), np.uint8))
        need = holes & (image[:, :, 3] == 0)
        image[need] = grown[need]
    return image


def _shift(layer, dx, dy):
    matrix = np.float32([[1, 0, dx], [0, 1, dy]])
    return cv2.warpAffine(layer, matrix, (layer.shape[1], layer.shape[0]), flags=cv2.INTER_NEAREST,
                          borderValue=(0, 0, 0, 0))


def _bridge(frame, foot, region, outline):
    """Where a lowered foot left a gap under its leg, the leg goes on down: fur
    in the middle, outline at its sides; the foot's top edge becomes fur."""
    out = frame.copy()
    opaque = frame[:, :, 3] > 0
    has_foot = foot[:, :, 3] > 0
    cream, foot_dark = _cream_mask(frame), _dark_mask(foot)
    xs = np.nonzero(region.any(0))[0]
    for x in range(xs.min(), xs.max() + 1):
        rows = np.nonzero(has_foot[:, x])[0]
        if not len(rows):
            continue
        top = rows.min()
        y = top - 1
        while y > top - 10 and not opaque[y, x]:
            y -= 1
        if y <= top - 10 or y == top - 1:
            continue
        side = foot_dark[min(top + 4, H - 1), x]
        above = y
        while above > y - 6 and not cream[above, x]:
            above -= 1
        colour = outline if side or not cream[above, x] else frame[above, x]
        out[y + 1:top, x] = colour
        k = top
        while not side and k < top + 4 and foot_dark[k, x]:
            out[k, x] = colour
            k += 1
    return out


def _seal(frame, region, outline, reach=5):
    """Close the pinholes a moved foot leaves along the outline it shared with the body."""
    opaque = frame[:, :, 3] > 0
    def near(axis, step):
        hit = np.zeros_like(opaque)
        for d in range(1, reach + 1):
            hit |= np.roll(opaque, step * d, axis=axis)
        return hit
    gap = ~opaque & region & ((near(0, 1) & near(0, -1)) | (near(1, 1) & near(1, -1)))
    out = frame.copy()
    out[gap] = outline
    return out


def walk_cycle():
    """Eight frames of the pup trotting to the right: its feet step in turn
    (one lifts as the other comes down), its body bobs as each foot lifts and
    its tail wags; then scaled to the visitor's size, feet on ANCHOR."""
    pup = _walking_pup()
    rgb = pup[:, :, :3].astype(np.int32)
    pink = (pup[:, :, 3] > 0) & (rgb[:, :, 0] > 200) & (rgb[:, :, 0] - rgb[:, :, 1] > 55)
    pink[:165] = False
    dark = _dark_mask(pup)
    colours, counts = np.unique(pup[dark].reshape(-1, 4), axis=0, return_counts=True)
    outline = colours[counts.argmax()]
    count, labels, stats, _ = cv2.connectedComponentsWithStats(pink.astype(np.uint8), connectivity=8)
    parts = {}
    for label in range(1, count):
        x, y, w, h, area = stats[label]
        if area < 60:
            continue
        centre = x + w / 2
        name = "tail" if centre < 45 else "back" if centre < 95 else "front"
        mask = labels == label
        ring = (cv2.dilate(mask.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0) & dark
        parts[name] = parts.get(name, np.zeros_like(mask)) | mask | ring
    body = pup.copy()
    for mask in parts.values():
        body[mask] = 0
    layer = {name: np.where(mask[..., None], pup, 0).astype(np.uint8) for name, mask in parts.items()}
    hips = np.zeros((H, W), bool)
    hips[165:225, 15:160] = True
    frames = []
    for k in range(WALK_FRAMES):
        phase = 2 * math.pi * k / WALK_FRAMES
        lift = math.sin(phase)
        bob = -round(2 * abs(lift))
        back = _shift(layer["back"], round(5 * lift), round(-6 * max(0, lift)))
        front = _shift(layer["front"], round(-5 * lift), round(4 * max(0, lift) - 5 * max(0, -lift)))
        tail = _shift(layer["tail"], 0, bob + round(2 * math.sin(2 * phase)))
        frame = over(tail, _shift(body, 0, bob), back, front)
        frame = _bridge(frame, front, hips, outline)
        frame = _bridge(frame, back, hips, outline)
        frames.append(_seal(frame, hips, outline))
    # The visitor's size in the hug, feet on the anchor.
    visitor = hug_visit("work")[0][1]
    target = bbox(visitor)[3] - bbox(visitor)[1]
    x0, y0, x1, y1 = bbox(np.maximum.reduce(frames))
    k = target / (y1 - y0)
    feet_x = (x0 + x1) / 2
    out = []
    for frame in frames:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        src_x = feet_x + (xx - ANCHOR[0]) / k
        src_y = y1 + (yy - ANCHOR[1]) / k
        out.append(cv2.remap(frame, src_x, src_y, cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT,
                             borderValue=(0, 0, 0, 0)))
    return out


def scene_pup(scene):
    """A scene's pup as its everyday strip shows it (work at rest hands, the
    meeting's first frame, asleep)."""
    if scene == "rest":
        return og.loop_frame("rest", 0)["pet"]
    if scene == "meeting":
        return og.loop_frame("meeting", 0)["pet"]
    return split(f"{scene[5:] if scene.startswith('work-') else 'code'}_input_none")[0]


def seat(scene):
    """Where a scene's pup sits, as the walker's feet would be (frame pixels)."""
    return round(float(og.head_cx(scene_pup(scene)))), ANCHOR[1]


def leave_frames(scene):
    """A pup getting up, at its seat: at a desk it ducks down behind it (the
    walker then comes out from behind it); on its cushion it stretches."""
    pup = scene_pup(scene)
    sx, _ = seat(scene)
    placed = _shift(pup, ANCHOR[0] - sx, 0)
    if scene == "rest":
        return [warp(placed, sy=sy, sx=1 / math.sqrt(sy), anchor=(ANCHOR[0], bbox(placed)[3])) for sy in (1.0, 0.95, 0.9, 1.06)]
    frames = []
    for sink in SINK["meeting" if scene == "meeting" else "work"]:
        frame = _shift(placed, 0, sink)
        # Below the floor it is under the desk.
        frame[ANCHOR[1]:] = 0 if sink else frame[ANCHOR[1]:]
        frames.append(frame)
    return frames


def visit_spot(kind):
    """Where the walker stops before it hugs (frame pixels of the receiver's
    everyday frame): under the visitor, no further right than the visitor reaches."""
    visitor = hug_visit(kind)[0][1]
    x0, _, x1, _ = bbox(visitor)
    walk = walk_cycle()
    reach = max(bbox(frame)[2] for frame in walk) - ANCHOR[0]
    return round(min((x0 + x1) / 2, x1 - reach) + WINDOW_X), ANCHOR[1]


# --------------------------------------------------------------------------- export

SCENES = [f"work-{visual}" for visual in og.WORK_VISUALS] + ["meeting", "rest"]
KINDS = ["work", "meeting"] + [f"rest-{blanket}" for blanket in BLANKETS]
LEAVES = ["work", "meeting", "rest"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, type=Path, help="build directory for build-hug-master.lua")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    sheets = []

    def sheet(name, rows, duration):
        directory = args.out / name
        directory.mkdir(exist_ok=True)
        for layer, frames in rows.items():
            Image.fromarray(snap(np.concatenate(frames, axis=1))).save(directory / f"{layer}.png", optimize=True)
        sheets.append({"name": name, "frames": len(next(iter(rows.values()))), "duration": duration, "layers": list(rows)})

    for scene in SCENES:
        sheet(f"desk-{scene}", {"desk": [desk(scene)]}, 1000)
    overhang = 0
    for kind in KINDS:
        frames = hug_visit(kind)
        names = ["receiver", "visitor", "blanket"][:len(frames[0])]
        sheet(f"hug-visit-{kind}", {name: [layers[n] for layers in frames] for n, name in enumerate(names)}, HUG_FRAME_MS)
        overhang = max(overhang, max(bbox(np.maximum.reduce(layers[1:]))[2] for layers in frames) + WINDOW_X - W)
    walk = walk_cycle()
    leaves = {scene: leave_frames(scene) for scene in LEAVES}
    sheet("hug-walker", {"walker": walk + [frame for scene in LEAVES for frame in leaves[scene]]}, WALK_FRAME_MS)
    spots = {kind: visit_spot(kind) for kind in ("work", "meeting", "rest-blush")}
    reach = max(bbox(frame)[2] for frame in walk) - ANCHOR[0]
    overhang = max(overhang, max(x for x, _ in spots.values()) + reach - W)
    (args.out / "manifest.json").write_text(json.dumps({"width": W, "height": H, "palette": palette().tolist(), "sheets": sheets}))
    first = len(walk)
    leave_at = {}
    for scene in LEAVES:
        leave_at[scene] = first
        first += len(leaves[scene])
    layout = {
        "hugFrames": len(hug_visit("work")),
        "window": WINDOW_X,
        "overhang": int(overhang),
        "walker": {"frames": first, "walk": len(walk), "leave": leave_at, "leaveFrames": len(leaves["work"]),
                   "anchor": list(ANCHOR)},
        "seats": {scene: list(seat(scene)) for scene in SCENES},
        "visit": {kind: list(spot) for kind, spot in spots.items()},
    }
    (ROOT / "src" / "pet" / "hugVisit.json").write_text(json.dumps(layout, indent=1) + "\n")
    print(json.dumps(layout))


if __name__ == "__main__":
    main()
