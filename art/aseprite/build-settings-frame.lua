-- Editable pixel shell and 12-frame greeting, using the approved dog head.
local root = app.params.root
assert(root and root ~= "", "Pass --script-param root=/absolute/project/path")
local rgba = app.pixelColor.rgba
local clear = rgba(0, 0, 0, 0)
local ink = rgba(117, 76, 94, 255)
local rose = rgba(229, 166, 183, 255)
local light = rgba(255, 231, 218, 255)
local paper = rgba(255, 250, 241, 255)
local function fill(image, x, y, w, h, color)
  for py = y, y + h - 1 do
    for px = x, x + w - 1 do
      if px >= 0 and py >= 0 and px < image.width and py < image.height then image:putPixel(px, py, color) end
    end
  end
end
local function stepped(image, x, y, w, h, color)
  fill(image, x + 3, y, w - 6, h, color)
  fill(image, x + 1, y + 1, w - 2, h - 2, color)
  fill(image, x, y + 3, w, h - 6, color)
end
app.fs.makeAllDirectories(root .. "/public/ui")
local shell = Sprite(32, 32, ColorMode.RGB)
shell.layers[1].name = "Nine-slice · 8 px corners"
local frame = Image(32, 32, ColorMode.RGB)
frame:clear(clear)
stepped(frame, 0, 0, 32, 32, ink)
stepped(frame, 1, 1, 30, 30, rose)
stepped(frame, 2, 2, 28, 28, light)
stepped(frame, 4, 4, 24, 24, paper)
fill(frame, 6, 2, 20, 1, rgba(255, 255, 255, 255))
shell:newCel(shell.layers[1], 1, frame, Point(0, 0))
shell:saveAs(root .. "/art/aseprite/mewlink-settings-frame.aseprite")
frame:saveAs(root .. "/public/ui/settings-frame.png")

local head = Image { fromFile = root .. "/art/aseprite/mewlink-head-app.png" }
head:resize(40, math.floor(head.height / head.width * 40 + 0.5))
local sprite = Sprite(48, 48, ColorMode.RGB)
sprite.layers[1].name = "Dog peeks out · open once"
local strip = Image(48 * 12, 48, ColorMode.RGB)
strip:clear(clear)
for n = 1, 12 do
  if n > 1 then sprite:newEmptyFrame() end
  sprite.frames[n].duration = 0.04
  local image = Image(48, 48, ColorMode.RGB)
  image:clear(clear)
  local rise = math.floor(12 * (1 - (1 - n / 12) ^ 3))
  image:drawImage(head, Point(4, 21 - rise))
  -- The little envelope anchors the greeting. No other pet anatomy is altered.
  stepped(image, 7, 39, 34, 8, ink)
  stepped(image, 8, 40, 32, 6, rose)
  fill(image, 11, 40, 26, 1, light)
  fill(image, 21, 42, 6, 2, paper)
  sprite:newCel(sprite.layers[1], n, image, Point(0, 0))
  strip:drawImage(image, Point((n - 1) * 48, 0))
end
local tag = sprite:newTag(1, 12)
tag.name = "settings-open"
sprite:saveAs(root .. "/art/aseprite/mewlink-settings-open.aseprite")
strip:saveAs(root .. "/public/ui/settings-open.png")
print("Exported settings shell and 12 opening frames")
