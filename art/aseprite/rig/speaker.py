"""The speaker on top of the pup's monitor, bouncing while a video or music plays.

Drawn on the art's 128x86 grid (pixel.py) and upscaled 3x like every other
prop, standing on the monitor's top edge (every desk has the same monitor);
the strip is only the box around it. Frame 0 is the speaker at rest. Frames
1-8 loop while sound plays: the woofer thumps twice, the box with it, and two
notes float up and fade.

  python3 art/aseprite/rig/speaker.py --out /tmp/mewlink-speaker
  aseprite -b --script-param root=$PWD --script-param build=/tmp/mewlink-speaker \\
    --script-param project=mewlink-speaker-master --script art/aseprite/build-hug-master.lua

It also writes src/pet/speaker.json: where the box sits in the 384x256 frame.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

from palette import palette, snap
from pixel import Canvas, ellipse, ramp, rrect, shift

ROOT = Path(__file__).resolve().parents[3]
FRAME_W, FRAME_H = 384, 256
# The box on the art's grid: columns 10-43, rows 3-36. Row 36 is the
# monitor's top outline, which the speaker's own outline stands on.
CROP = (10, 3, 44, 37)
FRAME_MS = 120
LOOP = 8

BODY = ramp("#2b0f17", "#5a2a45", "#6e3555", "#8a4a6c", "#a8668a")
CONE = ramp("#2b0f17", "#d9b99b", "#f3d7b4", "#fdf0dc", "#fffaf0")
NOTE = ramp("#2b0f17", "#c2465a", "#e9717e", "#fc9a98", "#fdd9d7")

# The two notes, as masks: an eighth note and a beamed pair.
EIGHTH = [
    "..XX.",
    "..X.X",
    "..X..",
    "..X..",
    "XXX..",
    "XXX..",
]
BEAMED = [
    "..XXXXX",
    "..X...X",
    "..X...X",
    "XXX.XXX",
    "XXX.XXX",
]

def _glyph(rows, x, y):
    mask = np.zeros((86, 128), bool)
    for dy, row in enumerate(rows):
        for dx, cell in enumerate(row):
            if cell == "X" and 0 <= y + dy < 86 and 0 <= x + dx < 128:
                mask[y + dy, x + dx] = True
    return mask


def _note(cv, rows, x, y, fade):
    """A note with a dark rim, fading to its light tones as it rises."""
    mask = _glyph(rows, int(round(x)), int(round(y)))
    rim = mask | shift(mask, 1, 0) | shift(mask, -1, 0) | shift(mask, 0, 1) | shift(mask, 0, -1)
    rim &= ~mask
    cv.fill("fx", rim, NOTE["ol"] if fade < 1 else NOTE["line"])
    cv.fill("fx", mask, (NOTE["base"], NOTE["hi"], CONE["hi"])[fade])


def speaker(beat: int | None):
    """The speaker at rest (None), or the loop's frame `beat` (0-7)."""
    cv = Canvas()
    thump = beat is not None and beat % 4 == 0
    top = 22 if thump else 21
    # The box, squashed a row on each thump.
    cv.part("back", rrect(19, top, 31, 37, 1.6), BODY, shade=(1, 1), hi=rrect(20, top + 1, 21.2, 34, 0.5))
    # The tweeter, then the woofer, each in a dark surround; the woofer is
    # pushed out on the beat and back in after it.
    cv.fill("mid", ellipse(25, 24.2, 1.9, 1.9), BODY["ol"])
    cv.fill("mid", ellipse(25, 24.2, 1.0, 1.0), CONE["base"])
    reach = 3.3 if beat is None else (3.8, 3.5, 3.0, 3.3)[beat % 4]
    cv.fill("paws", ellipse(25, 32.0, reach + 0.9, reach + 0.9), BODY["ol"])
    cv.part("front", ellipse(25, 32.0, reach, reach), CONE, shade=(1, 1), outline=False, hi=ellipse(24, 31.0, 1.0, 0.8))
    cv.fill("front", ellipse(25, 32.0, 0.9, 0.9), BODY["shade"])
    if beat is not None:
        # The eighth note rises from the right corner on the first thump, the pair from the left on the second.
        for rows, start, x0, drift, y0 in ((EIGHTH, 0, 31.0, 0.7, 18.0), (BEAMED, 4, 15.0, -0.5, 18.0)):
            t = (beat - start) % LOOP
            if t == 0:
                continue
            fade = 0 if t < 5 else 1 if t < 7 else 2
            wobble = (0, 0.6, 0, -0.6)[t % 4]
            _note(cv, rows, x0 + drift * t + wobble, y0 - 2.0 * t, fade)
    return cv.composite()


def _frame(native):
    """3x, in the 384x256 frame (the art grid starts two frame rows up), then the box."""
    big = native.repeat(3, 0).repeat(3, 1)[2:2 + FRAME_H, :FRAME_W]
    x0, y0, x1, y1 = CROP
    return big[3 * y0 - 2:3 * y1 - 2, 3 * x0:3 * x1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, type=Path, help="build directory for build-hug-master.lua")
    args = parser.parse_args()
    (args.out / "speaker").mkdir(parents=True, exist_ok=True)
    frames = [_frame(speaker(None))] + [_frame(speaker(beat)) for beat in range(LOOP)]
    Image.fromarray(snap(np.concatenate(frames, axis=1))).save(args.out / "speaker" / "speaker.png", optimize=True)
    height, width = frames[0].shape[:2]
    sheets = [{"name": "speaker", "frames": len(frames), "duration": FRAME_MS, "layers": ["speaker"]}]
    (args.out / "manifest.json").write_text(json.dumps({"width": width, "height": height, "palette": palette().tolist(), "sheets": sheets}))
    x0, y0, _, _ = CROP
    layout = {"x": 3 * x0, "y": 3 * y0 - 2, "width": width, "height": height, "frames": len(frames), "frameMs": FRAME_MS}
    (ROOT / "src" / "pet" / "speaker.json").write_text(json.dumps(layout, indent=1) + "\n")
    print(json.dumps(layout))


if __name__ == "__main__":
    main()
