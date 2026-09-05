# MewLink pet animations

Open `mewlink-pet-animation-master.aseprite` in Aseprite. It contains 260 frames and 53 named tags.

## Animation groups

- Activity loops: `meeting`, `leisure`, `idle`, `rest`
- Work screens: `work-code`, `work-document`, `work-web`; each stores exact `none`, `keyboard`, `pointer`, `both` input frames
- State-aware interactions: `hug-<state>` and `water-<state>-<cup>`
- Rest hugs support the three blanket choices: `blush`, `night`, `mint`
- Every ordered state change has its own six-frame `transition-<from>-<to>` tag lasting 4.8 seconds
- Website demo: `website-replay`

All frames use a 384×256 transparent canvas and the same bottom-center anchor. Work frames are imported from the approved two-arm source sheet. The viewer-left arm only touches the keyboard. On pointer input, the viewer-right hand and mouse glide together by three source pixels while the shoulder, torso, head, ears, face, monitor, and keyboard stay fixed.

`import-approved-work.lua` cuts and aligns the approved source sheet. `prepare-local-variants.lua` changes only the monitor pixels, expressions, cup, steam, and incoming arm for local variants. `build-animation-master.lua` rebuilds the master project and the horizontal PNG strips under `public/pets/animations`.
