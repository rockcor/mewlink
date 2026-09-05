# Workstation pixel companion

Open `workstation-input-v5.aseprite` in Aseprite. The 96 × 64 source uses a
16-color indexed palette and four tagged frames:

1. `idle`
2. `keyboard`
3. `pointer`
4. `both`

The body/face and keyboard/mouse layers are identical in every frame. The two
complete arm layers are independent, so keyboard and pointer input can be
combined without moving the character's face or body.

`build_workstation_pixel_v5.lua` regenerates the editable project. Export at
4× nearest-neighbor scale in a two-column sprite sheet to produce the 768 × 512
runtime asset.

## Activity pose concepts

Open `activity-designs-v1.aseprite` to review the four 96 × 64 activity poses:

1. `video`
2. `code`
3. `paper`
4. `meeting`

The body/expression, headset/back props, complete arms, foreground props, and
motion accents stay on separate layers. `build_activity_designs_v1.lua`
regenerates the indexed-color source and exports the 4× two-column preview
sheet `activity-designs-v1.png`.
