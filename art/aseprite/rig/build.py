#!/usr/bin/env python3
"""Render every MewLink pet animation from the approved artwork as layer strips.

    python art/aseprite/rig/build.py --out /tmp/mewlink-rig

writes <out>/<animation>/<layer>.png (384x256 frames laid out horizontally),
<out>/<animation>/composite.png and <out>/manifest.json.
`build-animation-master.lua` imports those into the layered Aseprite master
and exports the app strips.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

import original as og  # noqa: E402
from palette import palette, snap  # noqa: E402
from cutout import H, W  # noqa: E402

CUPS = ["ceramic", "tumbler", "bottle"]
BLANKETS = ["blush", "night", "mint"]
LOOP_MS = dict(meeting=2500, leisure=2900, idle=3800, rest=4300)


def animations():
    """Yield (name, loop, frame factory, per-frame duration ms)."""
    for visual in og.WORK_VISUALS:
        for stress in (False, True):
            yield (f"work-{visual}{'-stress' if stress else ''}", False,
                   lambda v=visual, st=stress: [og.work_frame(i, v, st) for i in ("none", "keyboard", "pointer", "both")], 100)
    for state, total in LOOP_MS.items():
        yield state, True, (lambda st=state: [og.loop_frame(st, i) for i in range(og.N_LOOP)]), total / og.N_LOOP
    step = 3200 / og.N_INTERACTION
    for state in og.STATES:
        for cup in CUPS:
            yield f"water-{state}-{cup}", False, (lambda st=state, c=cup: og.water(f"water_{st}_{c}")), step
    for cup in CUPS:
        yield f"water-drink-{cup}", False, (lambda c=cup: og.water_drink(f"water_drink_{c}")), step
    hug_step = 3200 / og.N_HUG
    for state in ("work", "meeting", "leisure", "idle"):
        yield f"hug-{state}", False, (lambda st=state: og.hug(f"hug_{st}")), hug_step
    for blanket in BLANKETS:
        yield f"hug-rest-{blanket}", False, (lambda b=blanket: og.hug(f"hug_rest_{b}", counts=(4, 5, 9, 6))), hug_step
    step = 4800 / og.N_TRANSITION
    for a in og.STATES:
        for b in og.STATES:
            if a != b:
                yield f"transition-{a}-{b}", False, (lambda a=a, b=b: og.transition(a, b)), step
    for state in og.STATES:
        if state == "work":
            continue
        for visual in og.WORK_VISUALS[1:]:
            yield (f"transition-work-{visual}-{state}", False,
                   lambda st=state, v=visual: og.transition("work", st, visual_a=v), step)
            yield (f"transition-{state}-work-{visual}", False,
                   lambda st=state, v=visual: og.transition(st, "work", visual_b=v), step)
    yield "website-replay", True, og.website_replay, 250


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--only", nargs="*", help="animation names to render")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    manifest = []
    total = 0
    for name, loop, factory, duration in animations():
        if args.only and name not in args.only:
            continue
        frames = factory()
        directory = args.out / name
        directory.mkdir(exist_ok=True)
        used = []
        for layer in og.LAYERS:
            strip = snap(np.concatenate([f[layer] for f in frames], axis=1))
            if strip[:, :, 3].any():
                Image.fromarray(strip).save(directory / f"{layer}.png", optimize=True)
                used.append(layer)
        composite = snap(np.concatenate([og.composite(f) for f in frames], axis=1))
        Image.fromarray(composite).save(directory / "composite.png", optimize=True)
        manifest.append({"name": name, "loop": loop, "frames": len(frames), "duration": round(duration, 3), "layers": used})
        total += len(frames)
    (args.out / "manifest.json").write_text(json.dumps(
        {"width": W, "height": H, "scale": 1, "layers": og.LAYERS,
         "palette": palette().tolist(), "animations": manifest}, indent=1))
    if og.HUG_TIMELINES:
        # Who owns which pixels in each hug frame, for skinning the visitor in the app.
        target = Path(__file__).resolve().parents[3] / "src" / "pet" / "hugTimeline.json"
        timelines = json.loads(target.read_text()) if target.exists() else {}
        timelines.update({prefix.replace("_", "-"): frames for prefix, frames in og.HUG_TIMELINES.items()})
        target.write_text(json.dumps(dict(sorted(timelines.items())), separators=(",", ":")) + "\n")
    print(f"Rendered {len(manifest)} animations, {total} frames")


if __name__ == "__main__":
    main()
