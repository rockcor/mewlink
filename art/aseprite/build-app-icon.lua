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
-- Oversized floppy ears frame a short, round face instead of extending its forehead.
ellipse(ears, 9, 29, 43, 59, outline)
fill(ears, 22, 29, 29, 35, outline)
ellipse(ears, 14, 34, 33, 49, pink)
fill(ears, 24, 34, 23, 28, pink)
ellipse(ears, 20, 38, 18, 35, pinkLight)
fill(ears, 17, 65, 10, 9, pinkLight)
-- Right ear mirrors the left while retaining chunky authored pixels.
ellipse(ears, 76, 29, 43, 59, outline)
fill(ears, 77, 29, 29, 35, outline)
ellipse(ears, 81, 34, 33, 49, pink)
fill(ears, 81, 34, 23, 28, pink)
ellipse(ears, 90, 38, 18, 35, pinkLight)
fill(ears, 101, 65, 10, 9, pinkLight)
addLayer("Floppy ears", ears)

local head = image()
-- A squat oval matches the established pet: a nearly flat crown, broad cheeks,
-- and no tuft or tall egg silhouette above the eyes.
ellipse(head, 29, 34, 70, 61, outline)
fill(head, 34, 44, 60, 36, outline)
ellipse(head, 34, 38, 60, 53, cream)
fill(head, 38, 45, 52, 34, cream)
ellipse(head, 39, 70, 50, 22, cream)
-- Short chin shading keeps the face broad and visibly low.
fill(head, 45, 86, 38, 4, creamShade)
fill(head, 54, 90, 20, 3, creamShade)
addLayer("Cream dog head", head)

local face = image()
-- Eyes sit high on the round face so there is no empty forehead above them.
ellipse(face, 43, 49, 12, 14, outline)
ellipse(face, 73, 49, 12, 14, outline)
fill(face, 46, 51, 3, 3, white)
fill(face, 76, 51, 3, 3, white)
ellipse(face, 34, 63, 16, 11, cheek)
ellipse(face, 78, 63, 16, 11, cheek)
fill(face, 61, 62, 7, 5, outline)
fill(face, 57, 67, 5, 4, outline)
fill(face, 66, 67, 5, 4, outline)
fill(face, 60, 70, 8, 3, outline)
-- Two cream pixels soften the muzzle into a tiny contented smile.
fill(face, 61, 67, 2, 2, cream)
fill(face, 66, 67, 2, 2, cream)
addLayer("Cute face", face)

local badge = image()
-- Tiny front paws hug the paired-link badge, adding character below the small head.
ellipse(badge, 34, 82, 25, 22, outline)
ellipse(badge, 38, 85, 18, 16, cream)
ellipse(badge, 69, 82, 25, 22, outline)
ellipse(badge, 72, 85, 18, 16, cream)
fill(badge, 43, 94, 5, 3, creamShade)
fill(badge, 80, 94, 5, 3, creamShade)
roundedRect(badge, 48, 91, 19, 12, 5, outline)
roundedRect(badge, 52, 94, 11, 6, 3, pink)
roundedRect(badge, 61, 91, 19, 12, 5, outline)
roundedRect(badge, 65, 94, 11, 6, 3, mint)
fill(badge, 61, 94, 7, 6, outline)
fill(badge, 63, 96, 4, 2, cream)
addLayer("Paws and connection badge", badge)

app.activeSprite = sprite
sprite:saveAs(sourcePath)
sprite:saveCopyAs(previewPath)
print("MewLink app icon source created: " .. sourcePath)
