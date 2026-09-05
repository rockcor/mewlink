# MewLink pet animations

Open `mewlink-pet-animation-master.aseprite` in Aseprite. It contains 117 frames and 31 named tags.

## Animation groups

- Activity loops: `video`, `reading`, `meeting`, `browsing`, `idle`, `rest`
- Exact input frames: `coding-input` in the order `none`, `keyboard`, `pointer`, `both`
- Interactions: `water`, `hug`
- Direct replay bridges: `transition-<from>-<to>`
- Universal state bridges: `transition-out-<state>` and `transition-in-<state>`
- Website demo: `website-replay`

All frames use a 384×256 transparent canvas and the same bottom-center anchor. Activity loops must keep the torso fixed; redraw only the face, connected arms, ears, and props.

`build-animation-master.lua` rebuilds the master project and the horizontal PNG strips under `public/pets/animations`. It intentionally replaces those generated outputs, so preserve hand-edited work in the master or source frames before rebuilding.
