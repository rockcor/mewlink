-- Builds the layered MewLink pet master and exports the app's PNG strips.
--
--   python3 art/aseprite/rig/build.py --out /tmp/mewlink-rig
--   aseprite -b --script-param root=$PWD --script-param build=/tmp/mewlink-rig \
--     --script art/aseprite/build-animation-master.lua
--
-- The rig animates the approved artwork split into layers. This script
-- imports every animation as a tag on one layered sprite, converts it to the
-- shared indexed palette, saves mewlink-pet-animation-master.aseprite, then
-- flattens each tag into the app's 384x256 PNG strips.

local root = app.params.root
local build = app.params.build
if not root or root == "" then error("Pass --script-param root=/absolute/project/path") end
if not build or build == "" then error("Pass --script-param build=/absolute/rig/output") end

local exportDir = root .. "/public/pets/animations/"
local projectPath = root .. "/art/aseprite/mewlink-pet-animation-master.aseprite"
local exportWidth, exportHeight = 384, 256

local file = assert(io.open(build .. "/manifest.json", "r"))
local manifest = json.decode(file:read("a"))
file:close()
local width, height = manifest.width, manifest.height
local scale = manifest.scale or 1

local sprite = Sprite(width, height, ColorMode.RGB)
sprite.filename = projectPath
local layers = {}
sprite.layers[1].name = manifest.layers[1]
layers[manifest.layers[1]] = sprite.layers[1]
for index = 2, #manifest.layers do
  local layer = sprite:newLayer()
  layer.name = manifest.layers[index]
  layers[layer.name] = layer
end

local frameCount = 0
local ranges = {}
for _, animation in ipairs(manifest.animations) do
  local first = frameCount + 1
  for index = 1, animation.frames do
    local frame = frameCount == 0 and sprite.frames[1] or sprite:newEmptyFrame()
    frameCount = frameCount + 1
    frame.duration = animation.duration / 1000
  end
  for _, layerName in ipairs(animation.layers) do
    local strip = Image { fromFile = build .. "/" .. animation.name .. "/" .. layerName .. ".png" }
    if strip.width ~= width * animation.frames then error(animation.name .. "/" .. layerName .. ": bad strip width") end
    for index = 1, animation.frames do
      local cel = Image(width, height, ColorMode.RGB)
      cel:drawImage(strip, Point(-(index - 1) * width, 0))
      if not cel:isEmpty() then
        sprite:newCel(layers[layerName], sprite.frames[first + index - 1], cel, Point(0, 0))
      end
    end
  end
  local tag = sprite:newTag(first, frameCount)
  tag.name = animation.name
  tag.aniDir = AniDir.FORWARD
  table.insert(ranges, { animation = animation, first = first })
end

-- Every layer was snapped to the shared rig palette, so converting to indexed
-- is lossless and keeps both the master and the exported strips compact.
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

local function flatten(frameNumber)
  local image = Image(width, height, ColorMode.INDEXED)
  image:clear(0)
  for _, layerName in ipairs(manifest.layers) do
    local cel = layers[layerName]:cel(frameNumber)
    if cel then image:drawImage(cel.image, cel.position) end
  end
  return image
end

for _, range in ipairs(ranges) do
  local animation = range.animation
  local strip = Image(exportWidth * animation.frames, exportHeight, ColorMode.INDEXED)
  strip:clear(0)
  for index = 1, animation.frames do
    local frame = flatten(range.first + index - 1)
    if scale ~= 1 then frame:resize(width * scale, height * scale) end
    strip:drawImage(frame, Point((index - 1) * exportWidth, exportHeight - height * scale))
  end
  strip:saveAs { filename = exportDir .. animation.name .. ".png", palette = sprite.palettes[1] }
end

print("MewLink Aseprite master: " .. frameCount .. " frames, " .. #ranges .. " tags, " .. #manifest.layers .. " layers")
