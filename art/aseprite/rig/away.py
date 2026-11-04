"""Away for a while (the app's idle): the pup's desk without it, the screen on
standby and a sticky note on it. The app writes "back soon" on the note in
the viewer's language (src/components/AwayNote.tsx).

Nothing moves to get there: the pup ducks down behind its desk and the note
pops onto the screen; when it is back it pops up again and the note goes.
Going to sleep, the desk gives way to the cushion under a poof, and back.
A cup for an away pup lands on its desk; a pup visiting it leaves a paw print
on the note (the app shows it; the print is exported here).

Frames are original.py's 384x256 layer dicts, so build.py renders the idle
loop, its transitions and its cups like any other strip (original.py hands
them over). `--out` writes the paw print for build-hug-master.lua and
src/pet/away.json: where the note's words and the print go.

  python3 art/aseprite/rig/away.py --out /tmp/mewlink-away
  aseprite -b --script-param root=$PWD --script-param build=/tmp/mewlink-away \\
    --script-param project=mewlink-away-master --script art/aseprite/build-hug-master.lua
"""

from __future__ import annotations

import argparse
import json
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image

import original as og
import visit
from cutout import H, W, bbox, over, scale_about, warp
from palette import palette, snap
from pixel import Canvas, poly, ramp, rrect

ROOT = Path(__file__).resolve().parents[3]
# The pup ducks behind its desk at the keyboard's height: below this it is hidden.
DESK_LINE = 196
# On the art's grid (frame y = 3 * native y - 2): a square note in the middle
# of the screen, its corner folded up; the words on it in two short lines, a
# visitor's paw print under them, and the standby light on the monitor's chin.
NOTE = (26, 43, 43, 61)
FOLD = 4
WORDS = (27, 44, 42, 54)
PAW = (27, 54, 34, 60)
LED = (40, 67)

NOTE_PAL = ramp("#3e0935", "#f7bf39", "#f7bf39", "#ffd76a", "#fff5d3")
FOLD_PAL = ramp("#3e0935", "#e07b05", "#e07b05", "#f7bf39", "#f7bf39")
GLINT = np.array([83, 78, 97, 255], np.uint8)
SCREEN_OFF_LINE = np.array([200, 196, 236, 255], np.uint8)
LED_ON = np.array([252, 192, 14, 255], np.uint8)
LED_DIM = np.array([143, 46, 11, 255], np.uint8)
INK = np.array([125, 51, 83, 255], np.uint8)
_NY, _NX = np.mgrid[0:86, 0:128]

# The note pops on with a springy overshoot; it settles on this transition frame.
NOTE_POP = (0.35, 0.8, 1.15, 0.94, 1.03, 1.0)
NOTE_FIRST = 14
NOTE_LANDS = NOTE_FIRST + len(NOTE_POP) - 1
SINK = (6, 20, 44, 78, 118, 158, 190)


def _native(cv_or_layer):
    return og._native(cv_or_layer.composite() if isinstance(cv_or_layer, Canvas) else cv_or_layer)


def _cells(points, colour):
    layer = np.zeros((86, 128, 4), np.uint8)
    for x, y in points:
        layer[y, x] = colour
    return og._native(layer)


@lru_cache(maxsize=None)
def _navy():
    return og.meeting_props()[150, 60].copy()


def _screen(desk, look):
    """The desk's screen switched off: standby, the line it shrinks to, or the dot after it."""
    out = desk.copy()
    out[og._area(og.SCREEN) & (out[:, :, 3] > 0)] = _navy()
    if look == "line":
        out = over(out, _cells([(x, 52) for x in range(20, 50)], SCREEN_OFF_LINE))
    elif look == "dot":
        out = over(out, _cells([(34, 52), (35, 52)], SCREEN_OFF_LINE))
    elif look == "standby":
        out = over(out, _cells([(20, 43), (21, 42), (22, 41), (20, 46), (21, 45)], GLINT))
    return out


@lru_cache(maxsize=None)
def standby_desk():
    """Every desk on standby is the same: the work desk, its screen off."""
    return _screen(visit.desk("work-code"), "standby")


@lru_cache(maxsize=None)
def note(curl=False):
    """The sticky note, its bottom corner folded up (further in a draught)."""
    cv = Canvas()
    x0, y0, x1, y1 = NOTE
    fold = FOLD + (1 if curl else 0)
    corner = poly([(x1 - fold, y1), (x1, y1), (x1, y1 - fold)])
    cv.part("mid", rrect(x0, y0, x1, y1, 0.6) & ~corner, NOTE_PAL, shade=(1, 1), hi=rrect(x0 + 1, y0 + 1, x0 + 3, y0 + 2, 0))
    cv.part("front", poly([(x1 - fold, y1), (x1, y1 - fold), (x1 - fold, y1 - fold)]), FOLD_PAL, shade=None)
    return _native(cv)


def _note_center():
    x0, y0, x1, y1 = bbox(note())
    return (x0 + x1) / 2, (y0 + y1) / 2


def _led(on):
    return _cells([LED], LED_ON if on else LED_DIM)


def scene(i, note_scale=1.0):
    """The away desk at loop frame `i`: the light breathes slowly, the note's corner lifts now and then."""
    i %= og.N_LOOP
    sticky = note(curl=i in (16, 17))
    if note_scale != 1.0:
        sticky = scale_about(sticky, note_scale, *_note_center())
    return over(standby_desk(), _led(i < og.N_LOOP // 2), sticky)


def loop_frame(i):
    return og.frame(front=scene(i))


# --------------------------------------------------------------------------- stepping away and back

def _at_desk(state, visual):
    """The pup, and its desk without it (keys and mouse whole), as `state` shows them."""
    if state == "meeting":
        return og.meeting_pup(), visit.desk("meeting")
    return og.split(f"{visual}_input_none")[0], visit.desk(f"work-{visual}")


def _behind(pup, sink, sy=1.0):
    """The pup `sink` pixels lower, hidden below the desk line."""
    layer = warp(pup, dy=sink, sy=sy, sx=1 / np.sqrt(sy))
    layer[DESK_LINE:] = 0
    return layer


def _sparkles(k):
    cx, cy = _note_center()
    return og.fx_layer([{"k": "sparkle", "x": cx + 44, "y": cy - 30}, {"k": "sparkle_s", "x": cx - 46, "y": cy - 20}] if k else [])


def step_away(state, visual="code"):
    """Work (or a meeting) to away: it ducks down behind its desk, the screen
    switches off and the note pops onto it."""
    pup, desk = _at_desk(state, visual)
    frames = [og.loop_end(state, visual)]
    for sy in (0.97, 0.94):
        frames.append(og.frame(pet=_behind(pup, 0, sy), front=desk))
    for k, sink in enumerate(SINK):
        frames.append(og.frame(pet=_behind(pup, sink, 1.04 if 1 <= k <= 4 else 1.0), front=desk))
    frames.append(og.frame(front=desk, fx=og.fx_layer(og.dust(240, DESK_LINE + 4, 0.8))))
    for look in ("line", "dot"):
        frames.append(og.frame(front=_screen(desk, look)))
    frames.append(og.frame(front=over(standby_desk(), _led(True))))
    for k, s in enumerate(NOTE_POP):
        frames.append(og.frame(front=scene(0, s), fx=_sparkles(k in (2, 3))))
    frames += [loop_frame(i) for i in range(og.N_LOOP - 11, og.N_LOOP)]
    frames.append(loop_frame(0))
    assert len(frames) == og.N_TRANSITION, len(frames)
    return frames


def step_back(state, visual="code"):
    """Away to work (or a meeting): it pops up from behind its desk, the note
    goes, the screen comes on and it gets back to it."""
    pup, desk = _at_desk(state, visual)
    frames = [loop_frame(og.N_LOOP - 1)] + [loop_frame(i) for i in range(3)]
    # Up it pops, overshooting with a stretch (it stays on the floor behind the desk).
    for k, (sink, sy) in enumerate(((190, 1.04), (140, 1.04), (80, 1.04), (30, 1.0), (0, 1.06), (0, 0.98))):
        frames.append(og.frame(pet=_behind(pup, sink, sy), front=scene(3 + k)))
    cx, cy = _note_center()
    for k, s in enumerate((1.08, 0.7, 0.3, 0.0)):
        fx = og.fx_layer([{"k": "puff", "x": cx, "y": cy, "r": 4 - k}]) if k >= 2 else None
        frames.append(og.frame(pet=_behind(pup, 0), front=over(standby_desk(), _led(True), scale_about(note(), s, cx, cy)), fx=fx))
    for look in ("line", "dot"):
        frames.append(og.frame(pet=_behind(pup, 0), front=_screen(desk, look)))
    for sy in (0.97, 1.02):
        frames.append(og.frame(pet=_behind(pup, 0, sy), front=desk))
    rest = og.N_TRANSITION - 1 - len(frames)
    if state == "meeting":
        frames += [og.meeting_frame(og.N_LOOP - rest + k) for k in range(rest)]
    else:
        frames += [og.work_frame("none", visual)] * rest
    frames.append(og.loop_start(state, visual))
    assert len(frames) == og.N_TRANSITION, len(frames)
    return frames


# --------------------------------------------------------------------------- to sleep and back

# Things pop in with a springy overshoot, and shrink away under a poof.
POP_IN = (0.2, 0.45, 0.8, 1.12, 0.96, 1.0)
SHRINK = (1.08, 0.72, 0.34, 0.0, 0.0, 0.0, 0.0, 0.0)


def _anchor(layer):
    x0, _, x1, y1 = bbox(layer)
    return (x0 + x1) / 2, y1


def _centre(layer):
    x0, y0, x1, y1 = bbox(layer)
    return (x0 + x1) / 2, (y0 + y1) / 2


def _shrinking(layers, anchor, centre):
    """Layers (by name) shrinking away about `anchor` under a poof at `centre`."""
    frames = []
    for k, s in enumerate(SHRINK):
        fx = og.poof(*centre, k - 1) if 1 <= k <= 5 else []
        frames.append(og.frame(**{name: scale_about(layer, s, *anchor) for name, layer in layers.items()}, fx=og.fx_layer(fx)))
    return frames + [og.frame(fx=og.fx_layer(og.dust(192, 248, 0.6) if k < 2 else [])) for k in range(3)]


def _popping(name, layer, sparkle_y):
    x, y = _anchor(layer)
    return [og.frame(**{name: scale_about(layer, s, x, y)},
                     fx=og.fx_layer([{"k": "sparkle", "x": x + 70, "y": y - sparkle_y}, {"k": "sparkle_s", "x": x - 76, "y": y - sparkle_y + 30}]
                                    if k in (3, 4) else []))
            for k, s in enumerate(POP_IN)]


def to_bed():
    """Away to asleep: the desk shrinks away under a poof, its cushion pops in
    and a second poof finds the pup asleep on it, breathing on into its loop."""
    frames = [loop_frame(og.N_LOOP - 1)] + [loop_frame(i) for i in range(2)]
    desk = scene(2)
    frames += _shrinking({"front": desk}, _anchor(desk), _centre(desk))
    frames += _popping("back", visit.desk("rest"), 80)
    pup = og.dog_of("base_rest")
    centre = _centre(pup)
    for k in range(5):
        pet = None if k < 2 else og._pose_warp(pup, sy=(0.94, 1.02, 0.99)[k - 2], nod_below=og.NOD_BELOW["rest"])
        frames.append(og.frame(pet=pet, back=og.props_of("base_rest") if pet is not None else visit.desk("rest"),
                               fx=og.fx_layer(og.poof(*centre, k))))
    frames += [og.loop_frame("rest", i) for i in range(og.N_LOOP - 6, og.N_LOOP)]
    frames.append(og.loop_start("rest"))
    assert len(frames) == og.N_TRANSITION, len(frames)
    return frames


def from_bed():
    """Asleep to away: the pup and its cushion go under a poof, and its desk
    pops back in with the note on the screen."""
    start = og.loop_end("rest")
    frames = [start]
    pup, bed = start["pet"], start["back"]
    for sy, lean in ((0.975, 0), (0.955, 3), (1.0, 6)):
        frames.append(og.frame(pet=og._pose_warp(pup, sy=sy, lean=lean, nod_below=og.NOD_BELOW["rest"]), back=bed))
    frames += _shrinking({"pet": pup, "back": bed}, _anchor(bed), _centre(pup))
    frames += _popping("front", scene(og.N_LOOP - 17), 120)
    frames += [loop_frame(i) for i in range(og.N_LOOP - 10, og.N_LOOP)]
    frames.append(loop_frame(0))
    assert len(frames) == og.N_TRANSITION, len(frames)
    return frames


def transition(a, b, visual_a="code", visual_b="code"):
    if a == "idle" and b == "rest":
        return to_bed()
    if a == "rest" and b == "idle":
        return from_bed()
    if a == "idle":
        return step_back(b, visual_b)
    return step_away(a, visual_a)


# --------------------------------------------------------------------------- a cup, while it is away

def water(cup_style):
    """The cup slides in from the right and lands on its desk, beside the mouse, to wait for it."""
    cup = og._cup_of(f"water_work_{cup_style}")
    frames = [loop_frame(i) for i in range(3)]
    for k, (dx, dy) in enumerate(((90, -6), (58, -12), (30, -12), (10, -6), (0, 0))):
        fx = og.fx_layer([{"k": "sparkle_s", "x": 360, "y": 200}, {"k": "sparkle", "x": 330, "y": 170}]) if k == 4 else None
        frames.append(og.frame(front=over(scene(3 + k), warp(cup, dx=dx, dy=dy)), fx=fx))
    for i in range(8, og.N_INTERACTION):
        fx = og.fx_layer([{"k": "sparkle_s", "x": 300, "y": 50 - 3 * (i - 8)}]) if 8 <= i < 12 else None
        frames.append(og.frame(front=over(scene(i), cup), fx=fx))
    assert len(frames) == og.N_INTERACTION, len(frames)
    return frames


# --------------------------------------------------------------------------- the paw print

# Two toes on top, one either side and the pad: a paw, not a heart.
PAW_PRINT = [
    ".XX.XX.",
    "X.....X",
    "..XXX..",
    ".XXXXX.",
    ".XXXXX.",
    "..XXX..",
]


def paw():
    """A paw print in plum ink, where it goes on the note (frame pixels)."""
    x0, y0, _, _ = PAW
    return _cells([(x0 + dx, y0 + dy) for dy, row in enumerate(PAW_PRINT) for dx, cell in enumerate(row) if cell == "X"], INK)


def _box(native_box):
    """A native box in frame pixels (x, y, width, height)."""
    x0, y0, x1, y1 = native_box
    return {"x": 3 * x0, "y": 3 * y0 - 2, "width": 3 * (x1 - x0), "height": 3 * (y1 - y0)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, type=Path, help="build directory for build-hug-master.lua")
    args = parser.parse_args()
    (args.out / "away-paw").mkdir(parents=True, exist_ok=True)
    box = _box(PAW)
    print_ = paw()[box["y"]:box["y"] + box["height"], box["x"]:box["x"] + box["width"]]
    Image.fromarray(snap(print_)).save(args.out / "away-paw" / "paw.png", optimize=True)
    sheets = [{"name": "away-paw", "frames": 1, "duration": 1000, "layers": ["paw"]}]
    (args.out / "manifest.json").write_text(json.dumps(
        {"width": box["width"], "height": box["height"], "palette": palette().tolist(), "sheets": sheets}))
    layout = {
        # The words go on the note above the print, inside its outline.
        "words": _box(WORDS),
        "paw": box,
        # Arriving, the words appear as the note settles (of the 32-frame transition).
        "noteLands": NOTE_LANDS,
        "transitionFrames": og.N_TRANSITION,
    }
    (ROOT / "src" / "pet" / "away.json").write_text(json.dumps(layout, indent=1) + "\n")
    print(json.dumps(layout))


if __name__ == "__main__":
    main()
