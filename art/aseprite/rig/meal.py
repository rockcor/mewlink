"""Having a meal: what the app shows while a pup rests at a mealtime of its
own clock (src/pet/meal.ts), instead of asleep on its cushion.

The pup is the authored mug pose (base_water) with a heaped bowl of rice in
place of the mug, chopsticks in it, its paws round the bowl; it sits at a low
table with a side dish and a cup of tea. It nods into the bowl for a bite,
rice grains hop, it chews, and steam rises from the tea.

Frames are original.py's 384x256 layer dicts: original.py hands the loop, its
cups and its scene (for every transition) over to this module, so build.py
renders them like any other strip.
"""

from __future__ import annotations

from functools import lru_cache

import cv2
import numpy as np

import original as og
from cutout import H, W, bbox, load, over
from pixel import Canvas, capsule, ellipse, ramp, rrect

# The authored mug (frame pixels): its outline, handle included; and the two
# paws that held it, which stay in front and hold the bowl.
MUG = [(146, 149), (225, 149), (225, 185), (239, 185), (239, 213), (225, 213), (225, 236), (146, 236)]
PAWS = ((96, 165, 158, 216), (221, 163, 290, 216))
# The bowl, the heap of rice on it and the chopsticks, on the art's grid
# (frame y = 3 * native y - 2); the bowl covers the mug and the paws hold it.
BOWL = (62.5, 66.5, 16.0, 11.0)
RICE = (62.5, 66.5, 15.0, 15.5)
CHOPSTICKS = ((66.0, 57.0, 72.5, 45.0), (68.5, 58.0, 76.0, 47.0))
# The low table in front of it, and what is on it.
TABLE = (26, 73, 104, 79)
DISH = (36.5, 72.6, 6.5, 1.8)
TEA = (89, 66, 95, 73)
# Its head nods into the bowl for a bite; rows below this stay still.
NOD_BELOW = 152

BOWL_PAL = ramp("#3e0935", "#436a90", "#436a90", "#609ccc", "#fffaff")
CUP_PAL = ramp("#3e0935", "#e6d9ef", "#efe6f5", "#fffaff", "#ffffff")
RICE_PAL = ramp("#3e0935", "#e6d9ef", "#efe6f5", "#fffaff", "#ffffff")
STICK_PAL = ramp("#3e0935", "#8f2e0b", "#8f2e0b", "#c26a3a", "#e0a070")
TABLE_PAL = ramp("#3e0935", "#c2465a", "#e9717e", "#fc9a98", "#fdd9d7")
DISH_PAL = ramp("#3e0935", "#e6d9ef", "#efe6f5", "#fffaff", "#ffffff")
YOLK = ramp("#3e0935", "#f7bf39", "#f7bf39", "#ffd76a", "#fff5d3")
STEAM = np.array([239, 230, 245, 255], np.uint8)
GRAIN = np.array([255, 250, 255, 255], np.uint8)


def _native(cv):
    return og._native(cv.composite())


def _zone(boxes):
    mask = np.zeros((H, W), bool)
    for x0, y0, x1, y1 in boxes:
        mask[y0:y1, x0:x1] = True
    return mask


def _paws(image):
    """The paws' fur, and their outline next to it."""
    rgb = image[:, :, :3].astype(int)
    opaque = image[:, :, 3] > 0
    fur = opaque & (rgb[:, :, 1] > 200) & (rgb[:, :, 0] - rgb[:, :, 1] < 28) & _zone(PAWS)
    near = cv2.dilate(fur.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    return fur | (opaque & (rgb.max(2) < 110) & near & _zone(PAWS))


def _mug(image):
    """Everything inside the mug's outline but the paws in front of it."""
    zone = np.zeros((H, W), np.uint8)
    cv2.fillPoly(zone, [np.array(MUG, np.int32)], 1)
    return (zone > 0) & ~_paws(image)


@lru_cache(maxsize=None)
def _bowl():
    cv = Canvas()
    cx, cy, rx, ry = RICE
    cv.part("back", ellipse(cx, cy, rx, ry) & (og._NY < cy), RICE_PAL, shade=(1, 1),
            hi=ellipse(cx - 4, cy - 10, 3.5, 2.0))
    for (x1, y1, x2, y2) in CHOPSTICKS:
        cv.part("pet", capsule(x1, y1, x2, y2, 0.55), STICK_PAL, shade=None)
    cx, cy, rx, ry = BOWL
    body = ellipse(cx, cy, rx, ry) & (og._NY >= cy)
    band = body & (og._NY >= cy + 2.5) & (og._NY < cy + 4.5)
    cv.part("mid", body | rrect(cx - rx, cy - 1, cx + rx, cy + 1, 1.0), BOWL_PAL, shade=(1, 1), hi=band)
    cv.part("paws", rrect(cx - 5, cy + ry - 1, cx + 5, cy + ry + 1, 0.5), BOWL_PAL, shade=None)
    return _native(cv)


@lru_cache(maxsize=None)
def pup():
    """The pup holding its bowl of rice (the mug pose without the mug)."""
    image = load("base_water")
    mug = _mug(image)
    bowl = _bowl()
    out = image.copy()
    # Where the mug showed and the bowl does not: the fur's commonest cream.
    rgb = image[:, :, :3].astype(int)
    cream = (image[:, :, 3] > 0) & (rgb[:, :, 1] > 200) & (rgb[:, :, 0] - rgb[:, :, 1] < 28) & ~mug
    colours, counts = np.unique(image[cream].reshape(-1, 4), axis=0, return_counts=True)
    out[mug] = colours[counts.argmax()]
    out = over(out, bowl)
    # The paws stay in front of the bowl's sides.
    paws = _paws(image) & (bowl[:, :, 3] > 0)
    out[paws] = image[paws]
    return out


@lru_cache(maxsize=None)
def table():
    """A low round table: its top and front, two stubby legs, an egg on a dish and a cup of tea."""
    cv = Canvas()
    x0, y0, x1, y1 = TABLE
    cv.part("back", rrect(x0 + 6, y1 - 1, x0 + 11, 86, 1.0) | rrect(x1 - 11, y1 - 1, x1 - 6, 86, 1.0), TABLE_PAL, shade=(1, 0))
    top = rrect(x0, y0, x1, y1, 3.0)
    cv.part("mid", top, TABLE_PAL, shade=(0, 1), hi=rrect(x0 + 3, y0 + 1, x1 - 3, y0 + 2, 0.5))
    cx, cy, rx, ry = DISH
    cv.part("paws", ellipse(cx, cy, rx, ry), DISH_PAL, shade=(0, 1))
    cv.part("front", ellipse(cx, cy - 0.8, 3.6, 1.3), DISH_PAL, shade=None, outline=False)
    cv.part("front", ellipse(cx + 0.4, cy - 1.0, 1.4, 0.9), YOLK, shade=None, outline=False)
    tx0, ty0, tx1, ty1 = TEA
    cup = rrect(tx0, ty0, tx1, ty1, 1.0) | ellipse((tx0 + tx1) / 2, ty1 - 0.5, (tx1 - tx0) / 2, 1.0)
    cv.part("front", cup, CUP_PAL, shade=(1, 0), hi=rrect(tx0 + 1, ty0 + 1, tx0 + 2, ty1 - 1, 0))
    return _native(cv)


def scene_parts():
    """Pup, props and props anchor, for original.transition."""
    props = table()
    x0, _, x1, y1 = bbox(props)
    return pup(), props, ((x0 + x1) / 2, y1)


# --------------------------------------------------------------------------- the loop

# Two bites a loop: down into the bowl, up with a mouthful, chew.
NODS = (0, 1, 3, 6, 8, 8, 5, 2, 0, -1, 0, 0)
CHEWS = {7: 0.985, 8: 1.01, 9: 0.99, 10: 1.005}


def _steam(i):
    """Two wisps over the tea, rising and swapping sides."""
    tx0, ty0, tx1, _ = TEA
    cx = (tx0 + tx1) / 2
    points = []
    for k, phase in enumerate((i / 12, i / 12 + 0.5)):
        t = phase % 1
        y = ty0 - 2 - t * 9
        x = cx - 1 + 2 * k + (1 if int(t * 6) % 2 else 0)
        if t < 0.85:
            points += [(round(x), round(y)), (round(x + (1 if k else -1)), round(y - 1))]
    layer = np.zeros((86, 128, 4), np.uint8)
    for x, y in points:
        if 0 <= x < 128 and 0 <= y < 86:
            layer[y, x] = STEAM
    return og._native(layer)


def _grains(k):
    """Rice grains hopping off the bite."""
    if k not in (6, 7):
        return np.zeros((H, W, 4), np.uint8)
    layer = np.zeros((86, 128, 4), np.uint8)
    lift = 0 if k == 6 else 1
    for x, y in ((57, 47), (68, 46), (60, 44)):
        layer[y - lift, x] = GRAIN
    return og._native(layer)


def loop_frame(i):
    i %= og.N_LOOP
    k = i % 12
    pet = og._pose_warp(pup(), sy=CHEWS.get(k, 1.0), nod=NODS[k], nod_below=NOD_BELOW)
    return og.frame(pet=pet, front=table(), fx=over(_steam(i), _grains(k)))


# --------------------------------------------------------------------------- a cup, while it eats

def water(cup_style):
    """The cup slides in from the right and lands beside the table, to wait for after the meal."""
    from cutout import warp
    cup = og._cup_of(f"water_work_{cup_style}")
    frames = [loop_frame(i) for i in range(3)]
    for k, (dx, dy) in enumerate(((90, -6), (58, -12), (30, -12), (10, -6), (0, 0))):
        f = loop_frame(3 + k)
        f["front"] = over(f["front"], warp(cup, dx=dx, dy=dy))
        if k == 4:
            f["fx"] = over(f["fx"], og.fx_layer([{"k": "sparkle_s", "x": 360, "y": 200}, {"k": "sparkle", "x": 330, "y": 170}]))
        frames.append(f)
    for i in range(8, og.N_INTERACTION):
        f = loop_frame(i)
        f["front"] = over(f["front"], cup)
        frames.append(f)
    assert len(frames) == og.N_INTERACTION, len(frames)
    return frames
