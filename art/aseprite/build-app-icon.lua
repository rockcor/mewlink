local root = app.params.root
if not root or root == "" then error("Pass --script-param root=/absolute/project/path") end

local sourcePath = root .. "/art/aseprite/mewlink-app-icon.aseprite"
local previewPath = root .. "/art/aseprite/mewlink-app-icon-128.png"
local directHead = Image { fromFile = root .. "/art/aseprite/mewlink-head-app.png" }

local rgba = app.pixelColor.rgba
local transparent = rgba(0, 0, 0, 0)
local outline = rgba(76, 18, 70, 255)
local background = rgba(48, 34, 51, 255)
local backgroundLight = rgba(88, 55, 82, 255)
local panel = rgba(106, 71, 126, 255)
local panelLight = rgba(142, 91, 143, 255)
local blush = rgba(237, 126, 157, 255)
local cream = rgba(255, 245, 211, 255)

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
fill(backdrop, 18, 12, 50, 4, backgroundLight)
fill(backdrop, 14, 16, 34, 4, backgroundLight)
addLayer("Rounded app background", backdrop, true)

local screen = image()
roundedRect(screen, 6, 16, 116, 91, 12, outline)
roundedRect(screen, 11, 21, 106, 81, 9, panel)
fill(screen, 16, 25, 96, 5, panelLight)
addLayer("Monitor background", screen)

-- No reconstructed shapes: this bitmap is a half-scale copy of the approved
-- pet's actual head and ears from the work frame.
local dog = image()
dog:drawImage(directHead, Point(12, 28))
addLayer("Direct approved pet crop", dog)

-- The lower screen rim hides the natural crop edge, just like the reference.
local rim = image()
fill(rim, 11, 91, 106, 11, panel)
fill(rim, 16, 94, 96, 4, backgroundLight)
fill(rim, 52, 102, 24, 12, outline)
fill(rim, 58, 102, 12, 8, cream)
roundedRect(rim, 42, 111, 44, 10, 4, outline)
fill(rim, 49, 114, 30, 4, blush)
addLayer("Monitor rim and stand", rim)

app.activeSprite = sprite
sprite:saveAs(sourcePath)
sprite:saveCopyAs(previewPath)
print("MewLink app icon created from the direct approved pet crop")
