local root = app.params.root
if not root or root == "" then error("Pass --script-param root=/absolute/project/path") end

local sourcePath = root .. "/art/aseprite/mewlink-app-icon.aseprite"
local previewPath = root .. "/art/aseprite/mewlink-app-icon-128.png"

local rgba = app.pixelColor.rgba
local transparent = rgba(0, 0, 0, 0)
local outline = rgba(75, 20, 72, 255)
local background = rgba(53, 38, 57, 255)
local backgroundLight = rgba(94, 55, 91, 255)
local halo = rgba(132, 70, 117, 255)
local haloLight = rgba(171, 83, 133, 255)
local cream = rgba(255, 246, 216, 255)
local creamShade = rgba(247, 220, 183, 255)
local pink = rgba(242, 126, 154, 255)
local pinkLight = rgba(255, 174, 185, 255)
local cheek = rgba(247, 143, 164, 255)
local white = rgba(255, 255, 255, 255)
local mint = rgba(117, 211, 195, 255)
local blue = rgba(120, 190, 225, 255)

local function image()
  local result = Image(128, 128, ColorMode.RGB)
  result:clear(transparent)
  return result
end

local function fill(target, x, y, width, height, color)
  for py = y, y + height - 1 do
    for px = x, x + width - 1 do
      if px >= 0 and px < target.width and py >= 0 and py < target.height then
        target:putPixel(px, py, color)
      end
    end
  end
end

local function ellipse(target, x, y, width, height, color)
  local cx = x + (width - 1) / 2
  local cy = y + (height - 1) / 2
  local rx = width / 2
  local ry = height / 2
  for py = y, y + height - 1 do
    for px = x, x + width - 1 do
      local dx = (px - cx) / rx
      local dy = (py - cy) / ry
      if dx * dx + dy * dy <= 1 then target:putPixel(px, py, color) end
    end
  end
end

local function roundedRect(target, x, y, width, height, radius, color)
  fill(target, x + radius, y, width - radius * 2, height, color)
  fill(target, x, y + radius, width, height - radius * 2, color)
  ellipse(target, x, y, radius * 2, radius * 2, color)
  ellipse(target, x + width - radius * 2, y, radius * 2, radius * 2, color)
  ellipse(target, x, y + height - radius * 2, radius * 2, radius * 2, color)
  ellipse(target, x + width - radius * 2, y + height - radius * 2, radius * 2, radius * 2, color)
end

local sprite = Sprite(128, 128, ColorMode.RGB)
sprite.filename = sourcePath

local function addLayer(name, target, useDefault)
  local layer = useDefault and sprite.layers[1] or sprite:newLayer()
  layer.name = name
  sprite:newCel(layer, 1, target, Point(0, 0))
end

local backdrop = image()
roundedRect(backdrop, 2, 2, 124, 124, 29, outline)
roundedRect(backdrop, 6, 6, 116, 116, 25, background)
-- Pixel-stepped diagonal light catches keep the dark icon lively without text.
fill(backdrop, 18, 13, 54, 4, backgroundLight)
fill(backdrop, 14, 17, 40, 4, backgroundLight)
fill(backdrop, 85, 108, 25, 4, backgroundLight)
fill(backdrop, 94, 104, 20, 4, backgroundLight)
addLayer("Rounded background", backdrop, true)

local glow = image()
ellipse(glow, 17, 15, 94, 96, halo)
ellipse(glow, 24, 22, 80, 82, haloLight)
-- Small link-like accents make the mark recognizable even without a letter.
fill(glow, 18, 34, 4, 12, mint)
fill(glow, 14, 38, 12, 4, mint)
fill(glow, 106, 83, 4, 12, blue)
fill(glow, 102, 87, 12, 4, blue)
addLayer("Halo and sparkles", glow)

local ears = image()
-- Left floppy ear: blocky silhouette plus a soft rounded lobe.
ellipse(ears, 10, 27, 42, 62, outline)
fill(ears, 20, 27, 28, 42, outline)
ellipse(ears, 15, 32, 32, 52, pink)
fill(ears, 23, 32, 22, 35, pink)
ellipse(ears, 20, 38, 18, 38, pinkLight)
fill(ears, 18, 66, 10, 10, pinkLight)
-- Right ear mirrors the left while retaining chunky authored pixels.
ellipse(ears, 76, 27, 42, 62, outline)
fill(ears, 80, 27, 28, 42, outline)
ellipse(ears, 81, 32, 32, 52, pink)
fill(ears, 83, 32, 22, 35, pink)
ellipse(ears, 90, 38, 18, 38, pinkLight)
fill(ears, 100, 66, 10, 10, pinkLight)
addLayer("Floppy ears", ears)

local head = image()
-- A compact head matches the small-headed desktop pet, with no forehead drift.
ellipse(head, 29, 20, 70, 84, outline)
fill(head, 34, 38, 60, 49, outline)
ellipse(head, 34, 25, 60, 73, cream)
fill(head, 38, 40, 52, 46, cream)
ellipse(head, 39, 76, 50, 23, cream)
-- Chin shade and tiny top tuft provide depth while staying pixel-readable.
fill(head, 42, 91, 44, 4, creamShade)
fill(head, 50, 95, 28, 3, creamShade)
fill(head, 57, 20, 14, 7, outline)
fill(head, 54, 24, 9, 8, outline)
fill(head, 64, 22, 10, 8, outline)
fill(head, 58, 24, 10, 7, cream)
fill(head, 55, 27, 8, 5, cream)
fill(head, 66, 25, 7, 5, cream)
addLayer("Cream dog head", head)

local face = image()
-- Bright oval eyes survive at 32 px; highlights keep the expression friendly.
ellipse(face, 44, 53, 11, 13, outline)
ellipse(face, 73, 53, 11, 13, outline)
fill(face, 47, 55, 3, 3, white)
fill(face, 76, 55, 3, 3, white)
ellipse(face, 34, 66, 15, 10, cheek)
ellipse(face, 79, 66, 15, 10, cheek)
fill(face, 61, 66, 7, 5, outline)
fill(face, 57, 71, 5, 4, outline)
fill(face, 66, 71, 5, 4, outline)
fill(face, 60, 74, 8, 3, outline)
-- Two cream pixels soften the muzzle into a tiny contented smile.
fill(face, 61, 71, 2, 2, cream)
fill(face, 66, 71, 2, 2, cream)
addLayer("Cute face", face)

local badge = image()
-- A miniature paired-link badge hints at connection, not a lettermark.
roundedRect(badge, 47, 101, 22, 12, 5, outline)
roundedRect(badge, 51, 104, 14, 6, 3, pink)
roundedRect(badge, 61, 101, 22, 12, 5, outline)
roundedRect(badge, 65, 104, 14, 6, 3, mint)
fill(badge, 62, 104, 7, 6, outline)
fill(badge, 64, 106, 4, 2, cream)
addLayer("Connection badge", badge)

app.activeSprite = sprite
sprite:saveAs(sourcePath)
sprite:saveCopyAs(previewPath)
print("MewLink app icon source created: " .. sourcePath)
