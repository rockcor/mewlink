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

local base = load("input_none")
local keyboardSource = load("input_keyboard")
local pointerSource = load("input_pointer")
local keyboard = clone(base)
local pointer = clone(base)
local both = clone(base)

-- Viewer-left connected arm and keyboard only.
copyRect(keyboard, keyboardSource, 160, 146, 78, 91)
copyRect(both, keyboardSource, 160, 146, 78, 91)
-- Viewer-right connected arm and mouse only. The two masks never overlap.
copyRect(pointer, pointerSource, 263, 142, 96, 101)
copyRect(both, pointerSource, 263, 142, 96, 101)

base:saveAs(dir .. "input_none.png")
keyboard:saveAs(dir .. "input_keyboard.png")
pointer:saveAs(dir .. "input_pointer.png")
both:saveAs(dir .. "input_both.png")
print("Locked work rig: one keyboard hand, one mouse hand, shared body pixels")
