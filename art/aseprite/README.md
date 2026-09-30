# MewLink pet animations

Open `mewlink-pet-animation-master.aseprite` in Aseprite. It holds 2448 frames in 92 named tags on four layers (`back`, `pet`, `front`, `fx`), indexed to one shared 256-colour palette. All artwork is the approved illustrated pup from `frames/`; the rig only moves it.

## Animation groups

- Activity loops, 24 frames each: `idle` (sways, squashes, then hops with the `> <` face), `meeting` (nods and waves behind the laptop, sound waves by the mic), `leisure` (munches with a bob, laughs with flying chips), `rest` (breathes on the cushion, rising z's)
- Work screens: `work-code`, `work-document`, `work-web`, `work-ai`, `work-mewlink`; each stores the exact authored `none`, `keyboard`, `pointer`, `both` input frames
- High-intensity input variants: `work-<screen>-stress`, with authored `> <` eyes while the body and equipment stay locked
- 24-frame interactions: `hug-<state>`, `hug-rest-<blanket>` (`blush`, `night`, `mint`), `water-<state>-<cup>` and `water-drink-<cup>` (`ceramic`, `tumbler`, `bottle`); authored poses land with a squash, bob gently and add hearts and sparkles
- Every ordered state change has its own 32-frame `transition-<from>-<to>` tag lasting 4.8 seconds, plus screen-matched `transition-work-<screen>-<state>` and `transition-<state>-work-<screen>` variants
- Website demo: 48-frame `website-replay`

## How transitions move

`rig/cutout.py` separates the pup from its props in each authored scene (fur and outlines that hug it stay with the pup; desk, laptop, TV, snacks and cushion go to the props), so both can move independently. A transition then plays in three beats: the pup winds up with a squash and a lean while its props shrink away under a dust poof and it re-appears in its sitting pose; it cheer-hops to the next spot and lands squashed with the `> <` face; the next props pop in with a springy overshoot and a sparkle, and a second poof reveals the destination pose. Every transition starts with the exact final bitmap of its source loop (or the neutral work frame) and ends with the exact first bitmap of its destination loop.

## Building

```bash
python3 -m venv /tmp/mewlink-venv && /tmp/mewlink-venv/bin/pip install -r art/aseprite/requirements-animation.txt
/tmp/mewlink-venv/bin/python art/aseprite/rig/build.py --out /tmp/mewlink-rig
aseprite -b --script-param root="$PWD" --script-param build=/tmp/mewlink-rig --script art/aseprite/build-animation-master.lua
pnpm test:animations
```

`rig/original.py` choreographs every loop, transition and interaction. `rig/fx.py` and `rig/pixel.py` draw the effects. `rig/palette.json` is the shared palette; regenerate it with `rig/palette.py` only when the source artwork changes. `build.py` writes per-layer strips and a manifest; `build-animation-master.lua` imports them into the layered master, converts it to the indexed palette and exports every tag under `public/pets/animations`.

The older helper scripts (`import-*.lua`, `lock-work-rig.lua`, `prepare-*.lua`, `normalize-frame.lua`, `validate-work-rig.lua`) produced the frames in `frames/`. `motion-tween.py` is the retired optical-flow in-betweener; the build no longer uses it.
