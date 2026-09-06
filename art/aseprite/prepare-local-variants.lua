local root = app.params.root
if not root or root == "" then error("Pass --script-param root=/absolute/project/path") end

local frames = root .. "/art/aseprite/frames/"
local outline = app.pixelColor.rgba(76, 18, 70, 255)
local cream = app.pixelColor.rgba(255, 245, 211, 255)
local blush = app.pixelColor.rgba(237, 126, 157, 255)
local blushDark = app.pixelColor.rgba(183, 57, 105, 255)
local blue = app.pixelColor.rgba(128, 190, 226, 255)
local mint = app.pixelColor.rgba(125, 205, 188, 255)
local white = app.pixelColor.rgba(255, 255, 255, 235)
local codeBackground = app.pixelColor.rgba(28, 25, 55, 255)
local codePanel = app.pixelColor.rgba(53, 43, 82, 255)
local webBackground = app.pixelColor.rgba(240, 250, 255, 255)
local webChrome = app.pixelColor.rgba(96, 155, 205, 255)
local transparent = app.pixelColor.rgba(0, 0, 0, 0)

local function load(name) return Image { fromFile = frames .. name .. ".png" } end
local function save(image, name) image:saveAs(frames .. name .. ".png") end

local function fill(image, x, y, width, height, color)
  for py = y, y + height - 1 do
    for px = x, x + width - 1 do
      if px >= 0 and px < image.width and py >= 0 and py < image.height then image:putPixel(px, py, color) end
    end
  end
end

local function dot(image, x, y, size, color) fill(image, x, y, size, size, color) end

local function screenVariant(image, kind)
  fill(image, 48, 94, 108, 66, outline)
  if kind == "code" then
    -- A nearly black editor with a gutter and dense syntax colors. Keep most
    -- of the monitor dark so it stays distinct from the bright web scene at
    -- the small on-desktop rendering size.
    fill(image, 55, 101, 94, 52, codeBackground)
    fill(image, 55, 101, 94, 9, codePanel)
    dot(image, 60, 104, 3, blush)
    dot(image, 67, 104, 3, cream)
    dot(image, 74, 104, 3, mint)
    fill(image, 58, 114, 12, 35, codePanel)
    fill(image, 74, 115, 20, 4, blush)
    fill(image, 98, 115, 31, 4, blue)
    fill(image, 78, 123, 35, 4, mint)
    fill(image, 117, 123, 22, 4, blue)
    fill(image, 74, 131, 17, 4, cream)
    fill(image, 95, 131, 37, 4, blush)
    fill(image, 78, 139, 27, 4, blue)
    fill(image, 109, 139, 30, 4, mint)
    fill(image, 74, 147, 18, 3, blush)
    fill(image, 96, 147, 26, 3, cream)
  elseif kind == "document" then
    fill(image, 76, 100, 54, 54, cream)
    fill(image, 84, 108, 35, 4, blush)
    fill(image, 84, 119, 28, 3, blushDark)
    fill(image, 84, 128, 37, 3, blush)
    fill(image, 84, 137, 31, 3, blushDark)
  elseif kind == "web" then
    -- A bright browser window with unmistakable chrome, address bar, large
    -- image tile, and cards. Its overall value is deliberately opposite to
    -- the dark code editor above.
    fill(image, 55, 101, 94, 52, webBackground)
    fill(image, 55, 101, 94, 11, webChrome)
    dot(image, 60, 105, 3, blush)
    dot(image, 67, 105, 3, cream)
    fill(image, 75, 104, 68, 5, white)
    fill(image, 60, 117, 52, 27, blue)
    fill(image, 64, 121, 17, 14, cream)
    fill(image, 85, 121, 22, 4, white)
    fill(image, 85, 129, 17, 4, mint)
    fill(image, 118, 117, 26, 8, blush)
    fill(image, 118, 130, 26, 6, mint)
    fill(image, 118, 141, 20, 5, webChrome)
    fill(image, 60, 148, 52, 3, webChrome)
  end
end

local function face(image, expression)
  fill(image, 224, 109, 23, 19, cream)
  if expression == "surprised" then
    fill(image, 232, 114, 7, 10, outline)
    fill(image, 234, 116, 3, 6, blush)
  elseif expression == "happy" then
    fill(image, 229, 115, 3, 3, outline)
    fill(image, 232, 118, 4, 3, outline)
    fill(image, 236, 115, 3, 3, outline)
    dot(image, 233, 121, 3, blush)
  end
end

local function cupPalette(style)
  if style == "tumbler" then return blue, app.pixelColor.rgba(72, 129, 181, 255) end
  if style == "bottle" then return mint, app.pixelColor.rgba(54, 143, 128, 255) end
  return blush, blushDark
end

local function cup(image, x, y, style, steamPhase)
  local body, dark = cupPalette(style)
  if style == "bottle" then
    fill(image, x + 6, y - 5, 10, 5, outline)
    fill(image, x + 8, y - 3, 6, 3, dark)
    fill(image, x + 2, y, 19, 30, outline)
    fill(image, x + 5, y + 3, 13, 24, body)
  else
    fill(image, x, y, 24, 27, outline)
    fill(image, x + 3, y + 3, 18, 20, body)
    fill(image, x + 4, y + 5, 16, 3, cream)
    fill(image, x + 23, y + 6, 9, 15, outline)
    fill(image, x + 23, y + 9, 5, 9, transparent)
    fill(image, x + 21, y + 9, 4, 9, body)
  end
  local shift = steamPhase % 2 == 0 and 0 or 3
  fill(image, x + 6, y - 13 - shift, 3, 8, white)
  fill(image, x + 15, y - 17 + shift, 3, 10, white)
end

-- All scenes share the same bottom anchor. Rest the received drink on that
-- surface at the viewer-right edge: beside the work mouse, never in mid-air.
local function placedCup(image, style, steamPhase)
  cup(image, 350, 209, style, steamPhase)
end

local function incomingArm(image, progress)
  if progress == 0 then return end
  local length = progress == 1 and 29 or 48
  fill(image, 384 - length, 163, length, 17, outline)
  fill(image, 384 - length, 166, length, 11, cream)
  fill(image, 384 - length - 7, 160, 13, 23, outline)
  fill(image, 384 - length - 4, 163, 9, 17, cream)
end

local workNames = { "input_none", "input_keyboard", "input_pointer", "input_both" }
for _, name in ipairs(workNames) do
  local code = load(name)
  screenVariant(code, "code")
  save(code, "code_" .. name)
  local document = load(name)
  screenVariant(document, "document")
  save(document, "document_" .. name)
  local web = load(name)
  screenVariant(web, "web")
  save(web, "web_" .. name)
end

local states = {
  work = "code_input_none",
  meeting = "base_meeting",
  leisure = "base_video",
  idle = "base_idle",
  rest = "base_rest",
}
local cupStyles = { "ceramic", "tumbler", "bottle" }
for state, baseName in pairs(states) do
  for _, style in ipairs(cupStyles) do
    for frame = 1, 4 do
      local image = load(baseName)
      if state == "work" then
        if frame == 2 then incomingArm(image, 1); cup(image, 333, 151, style, frame); face(image, "surprised") end
        if frame == 3 then incomingArm(image, 2); cup(image, 306, 154, style, frame); face(image, "happy") end
        if frame == 4 then placedCup(image, style, frame); face(image, "happy") end
      elseif state == "rest" then
        if frame == 2 then incomingArm(image, 1); cup(image, 342, 170, style, frame) end
        if frame == 3 then incomingArm(image, 2); cup(image, 325, 177, style, frame) end
        if frame == 4 then placedCup(image, style, frame) end
      else
        if frame == 2 then incomingArm(image, 1); cup(image, 339, 163, style, frame) end
        if frame == 3 then incomingArm(image, 2); cup(image, 316, 169, style, frame) end
        if frame == 4 then placedCup(image, style, frame) end
      end
      save(image, "water_" .. state .. "_" .. style .. "_" .. frame)
    end
  end
end

for _, style in ipairs(cupStyles) do
  for frame = 1, 4 do
    local image = load("code_input_none")
    if frame < 4 then placedCup(image, style, frame) end
    if frame == 2 then face(image, "surprised") end
    if frame == 3 then face(image, "happy") end
    if frame == 4 then face(image, "happy") end
    save(image, "water_drink_" .. style .. "_" .. frame)
  end
end

print("Prepared work screen variants and state-preserving water animation frames")
