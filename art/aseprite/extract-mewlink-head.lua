local root = app.params.root
if not root or root == "" then error("Pass --script-param root=/absolute/project/path") end

local source = Image { fromFile = root .. "/art/aseprite/frames/input_none.png" }
local head = Image(205, 125, ColorMode.RGB)
head:clear(app.pixelColor.rgba(0, 0, 0, 0))

-- Direct crop of the approved work pet: full ears, original face, no redraw.
head:drawImage(source, Point(-128, -18))

-- The monitor overlaps only this empty area below the left ear. Remove that
-- unrelated prop while leaving every pet pixel unchanged.
local transparent = app.pixelColor.rgba(0, 0, 0, 0)
for y = 92, 124 do
  for x = 0, 38 do head:putPixel(x, y, transparent) end
end

head:saveAs(root .. "/art/aseprite/mewlink-head-direct.png")
print("Extracted the MewLink head directly from input_none.png")
