-- Builds the layered master of the hug in place and exports its PNG sheets.
--
--   python3 art/aseprite/rig/visit.py --out /tmp/mewlink-hug
--   aseprite -b --script-param root=$PWD --script-param build=/tmp/mewlink-hug \
--     --script art/aseprite/build-hug-master.lua
--
-- Every sheet (the walker, each hug, each empty desk) is a tag on one sprite;
-- each pup (and the blanket, and the desk) has its own layer, so a frame can
-- be retouched in Aseprite and exported again with this script. The sprite is
-- converted to the shared indexed palette and saved as
-- mewlink-hug-master.aseprite; each tag is exported with a row per layer,
-- which the app colours one by one (pet/SpriteCanvas.tsx).

local root = app.params.root
local build = app.params.build
if not root or root == "" then error("Pass --script-param root=/absolute/project/path") end
if not build or build == "" then error("Pass --script-param build=/absolute/rig/output") end

local exportDir = root .. "/public/pets/animations/"
local projectPath = root .. "/art/aseprite/mewlink-hug-master.aseprite"

local file = assert(io.open(build .. "/manifest.json", "r"))
local manifest = json.decode(file:read("a"))
file:close()
local width, height = manifest.width, manifest.height

local sprite = Sprite(width, height, ColorMode.RGB)
sprite.filename = projectPath
local layers = {}
local order = {}
local function layerNamed(name)
  if layers[name] then return layers[name] end
  local layer = #order == 0 and sprite.layers[1] or sprite:newLayer()
  layer.name = name
  layers[name] = layer
  table.insert(order, name)
  return layer
end

local frameCount = 0
local ranges = {}
for _, sheet in ipairs(manifest.sheets) do
  local first = frameCount + 1
  for index = 1, sheet.frames do
    local frame = frameCount == 0 and sprite.frames[1] or sprite:newEmptyFrame()
    frameCount = frameCount + 1
    frame.duration = sheet.duration / 1000
  end
  for _, layerName in ipairs(sheet.layers) do
    local layer = layerNamed(layerName)
    local strip = Image { fromFile = build .. "/" .. sheet.name .. "/" .. layerName .. ".png" }
    if strip.width ~= width * sheet.frames then error(sheet.name .. "/" .. layerName .. ": bad strip width") end
    for index = 1, sheet.frames do
      local cel = Image(width, height, ColorMode.RGB)
      cel:drawImage(strip, Point(-(index - 1) * width, 0))
      if not cel:isEmpty() then sprite:newCel(layer, sprite.frames[first + index - 1], cel, Point(0, 0)) end
    end
  end
  local tag = sprite:newTag(first, frameCount)
  tag.name = sheet.name
  table.insert(ranges, { sheet = sheet, first = first })
end

-- The rig snapped every layer to the shared palette, so this is lossless.
local palette = Palette(#manifest.palette + 1)
palette:setColor(0, Color { r = 0, g = 0, b = 0, a = 0 })
for index, rgb in ipairs(manifest.palette) do
  palette:setColor(index, Color { r = rgb[1], g = rgb[2], b = rgb[3], a = 255 })
end
app.activeSprite = sprite
sprite:setPalette(palette)
app.command.ChangePixelFormat { format = "indexed", dithering = "none" }
sprite.transparentColor = 0
sprite:saveAs(projectPath)

for _, range in ipairs(ranges) do
  local sheet = range.sheet
  local strip = Image(width * sheet.frames, height * #sheet.layers, ColorMode.INDEXED)
  strip:clear(0)
  for row, layerName in ipairs(sheet.layers) do
    for index = 1, sheet.frames do
      local cel = layers[layerName]:cel(range.first + index - 1)
      if cel then strip:drawImage(cel.image, Point((index - 1) * width + cel.position.x, (row - 1) * height + cel.position.y)) end
    end
  end
  strip:saveAs { filename = exportDir .. sheet.name .. ".png", palette = sprite.palettes[1] }
end

print("MewLink hug master: " .. frameCount .. " frames, " .. #ranges .. " tags, " .. #order .. " layers")
