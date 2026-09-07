# MewLink pet animations

Open `mewlink-pet-animation-master.aseprite` in Aseprite. It contains 972 frames and 92 named tags.

## Animation groups

- Eight-frame activity loops: `meeting`, `leisure`, `idle`, `rest`
- Work screens: `work-code`, `work-document`, `work-web`, `work-ai`, `work-mewlink`; each stores exact `none`, `keyboard`, `pointer`, `both` input frames
- High-intensity input variants: `work-<screen>-stress`, with authored `> <` eyes while the body and equipment remain locked
- Eight-frame state-aware interactions: `hug-<state>` and `water-<state>-<cup>`
- Rest hugs support the three blanket choices: `blush`, `night`, `mint`
- Every ordered state change has its own thirteen-frame `transition-<from>-<to>` tag lasting 4.8 seconds. Work transitions also include screen-matched document and web variants.
- Website demo: 24-frame `website-replay`

All frames use a 384×256 transparent canvas and the same bottom-center anchor. Work frames are imported from the approved two-arm source sheet. The viewer-left arm only touches the keyboard. On pointer input, the viewer-right hand and mouse glide together by three source pixels while the shoulder, torso, head, ears, face, monitor, and keyboard stay fixed.

`import-approved-work.lua` cuts and aligns the approved source sheet. `prepare-local-variants.lua` changes only the monitor pixels, expressions, cup, steam, and incoming arm for local variants. The AI screen uses a brand-neutral prompt-and-response graphic without provider logos or text. The MewLink screen uses the product's own floppy-ear dog-head mark. `motion-tween.py` creates motion-compensated in-betweens so faces and limbs travel instead of appearing twice. `build-animation-master.lua` imports those frames into the master project while preserving total timing, then exports the horizontal PNG strips under `public/pets/animations`.

Each transition starts with the exact final bitmap of its source loop and ends with the exact first bitmap of its destination loop. Work waits for both hands to return to their neutral frame and retains the current code, document, web, AI, or MewLink screen before leaving.

Create a temporary Python environment from `requirements-animation.txt`, make an empty temporary tween directory, and pass its Python executable and directory to `build-animation-master.lua` as the `python` and `tweenDir` script parameters.
