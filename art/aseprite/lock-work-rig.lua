local root = app.params.root
if not root or root == "" then error("Pass root") end
local dir = root .. "/art/aseprite/frames/"
local function load(name) return Image { fromFile = dir .. name .. ".png" } end
local function clone(image)
  local result = Image(384, 256, ColorMode.RGB)
  result:drawImage(image, Point(0, 0))
  return result
end
local function copyRect(target, source, x, y, width, height)
  for py = y, y + height - 1 do
    for px = x, x + width - 1 do target:putPixel(px, py, source:getPixel(px, py)) end
  end
end
local function copyShiftedRect(target, source, x, y, width, height, offsetX, offsetY)
  for py = y, y + height - 1 do
    for px = x, x + width - 1 do
      local targetX, targetY = px + offsetX, py + offsetY
      if targetX >= 0 and targetX < target.width and targetY >= 0 and targetY < target.height then
        target:putPixel(targetX, targetY, source:getPixel(px, py))
      end
    end
  end
end
local function clearRect(image, x, y, width, height)
  local transparent = app.pixelColor.rgba(0, 0, 0, 0)
  for py = y, y + height - 1 do
    for px = x, x + width - 1 do image:putPixel(px, py, transparent) end
  end
end

local base = load("input_none")
local keyboardSource = load("input_keyboard")
local pointerSource = load("input_pointer")
local keyboard = clone(base)
local pointer = clone(base)
local both = clone(base)

-- Viewer-left connected arm and keyboard only.
copyRect(keyboard, keyboardSource, 160, 146, 78, 91)
copyRect(both, keyboardSource, 160, 146, 78, 91)
-- The viewer-right lower arm and mouse travel together by three source pixels.
-- The shoulder stays on the base frame, so the body cannot drift. A small
-- overlap at the elbow keeps the shifted hand connected without a seam.
local pointerX, pointerY, pointerWidth, pointerHeight, pointerShift = 299, 169, 82, 74, 3
clearRect(pointer, pointerX + pointerShift, pointerY, pointerWidth, pointerHeight)
clearRect(both, pointerX + pointerShift, pointerY, pointerWidth, pointerHeight)
copyShiftedRect(pointer, pointerSource, pointerX, pointerY, pointerWidth, pointerHeight, pointerShift, 0)
copyShiftedRect(both, pointerSource, pointerX, pointerY, pointerWidth, pointerHeight, pointerShift, 0)

base:saveAs(dir .. "input_none.png")
keyboard:saveAs(dir .. "input_keyboard.png")
pointer:saveAs(dir .. "input_pointer.png")
both:saveAs(dir .. "input_both.png")
print("Locked work rig: one keyboard hand, one mouse hand, and a three-pixel mouse glide")
