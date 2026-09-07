local root = app.params.root
if not root or root == "" then error("Pass --script-param root=/absolute/project/path") end

local sourcePath = root .. "/art/aseprite/mewlink-app-icon.aseprite"
local previewPath = root .. "/art/aseprite/mewlink-app-icon-128.png"
local drawMewLinkDog = dofile(root .. "/art/aseprite/mewlink-dog-mark.lua")

local rgba = app.pixelColor.rgba
local transparent = rgba(0, 0, 0, 0)
local outline = rgba(76, 18, 70, 255)
local background = rgba(48, 34, 51, 255)
local backgroundLight = rgba(88, 55, 82, 255)
local panel = rgba(106, 71, 126, 255)
local panelLight = rgba(142, 91, 143, 255)
local cream = rgba(255, 245, 211, 255)
local blush = rgba(237, 126, 157, 255)
local mint = rgba(125, 205, 188, 255)

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
fill(backdrop, 19, 12, 50, 4, backgroundLight)
fill(backdrop, 14, 16, 34, 4, backgroundLight)
fill(backdrop, 91, 108, 23, 4, backgroundLight)
addLayer("Rounded app background", backdrop, true)

local screen = image()
-- The inner card echoes the exact monitor tile supplied as the reference.
roundedRect(screen, 7, 17, 114, 91, 12, outline)
roundedRect(screen, 12, 22, 104, 81, 9, panel)
fill(screen, 17, 26, 94, 5, panelLight)
fill(screen, 18, 96, 92, 4, backgroundLight)
-- Tiny screen controls retain the warm, handmade pixel feel.
fill(screen, 18, 34, 4, 4, cream)
fill(screen, 25, 34, 4, 4, blush)
fill(screen, 99, 34, 11, 3, mint)
addLayer("Monitor tile", screen)

local dog = image()
-- Two-pixel blocks are the same authored dog used on the pet's monitor.
drawMewLinkDog(dog, 12, 29, 2)
addLayer("Shared MewLink dog", dog)

local stand = image()
fill(stand, 53, 104, 22, 10, outline)
fill(stand, 58, 104, 12, 7, cream)
roundedRect(stand, 43, 111, 42, 10, 4, outline)
fill(stand, 49, 114, 30, 4, blush)
addLayer("Tiny monitor stand", stand)

app.activeSprite = sprite
sprite:saveAs(sourcePath)
sprite:saveCopyAs(previewPath)
print("MewLink app icon source created from the shared screen dog: " .. sourcePath)
