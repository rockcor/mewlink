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
local codeGutter = app.pixelColor.rgba(45, 35, 72, 255)
local webBackground = app.pixelColor.rgba(240, 250, 255, 255)
local webChrome = app.pixelColor.rgba(96, 155, 205, 255)
local webInk = app.pixelColor.rgba(68, 105, 145, 255)
local webSun = app.pixelColor.rgba(255, 214, 111, 255)
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
  -- The monitor's actual inner display is 55,116 through 148,192. Keep every
  -- scene inside that rectangle so no pixels from the source screen remain.
  if kind == "code" then
    -- A nearly black editor with two tabs, a numbered gutter, a split pane,
    -- and dense syntax colors. Large dark regions keep it unmistakable at the
    -- small on-desktop rendering size.
    fill(image, 55, 116, 94, 77, codeBackground)
    fill(image, 55, 116, 94, 10, codePanel)
    fill(image, 59, 118, 25, 7, codeBackground)
    fill(image, 87, 119, 20, 6, codeGutter)
    dot(image, 62, 120, 3, blush)
    dot(image, 69, 120, 3, cream)
    fill(image, 58, 128, 12, 61, codeGutter)
    fill(image, 72, 128, 3, 61, codePanel)
    -- Short bright gutter marks read as line numbers without tiny text.
    fill(image, 61, 133, 5, 2, mint)
    fill(image, 61, 144, 5, 2, blush)
    fill(image, 61, 155, 5, 2, blue)
    fill(image, 61, 166, 5, 2, cream)
    fill(image, 61, 177, 5, 2, mint)
    fill(image, 61, 187, 5, 2, blush)
    -- Left editor pane.
    fill(image, 78, 132, 12, 4, blush)
    fill(image, 93, 132, 19, 4, blue)
    fill(image, 83, 143, 25, 4, mint)
    fill(image, 78, 154, 17, 4, cream)
    fill(image, 98, 154, 14, 4, blush)
    fill(image, 83, 165, 27, 4, blue)
    fill(image, 78, 176, 20, 4, mint)
    fill(image, 83, 187, 25, 3, blush)
    -- A visibly separate terminal pane with a large prompt.
    fill(image, 116, 128, 30, 61, codePanel)
    fill(image, 120, 136, 4, 4, mint)
    fill(image, 124, 140, 4, 4, mint)
    fill(image, 129, 141, 11, 3, cream)
    fill(image, 121, 153, 17, 3, blush)
    fill(image, 121, 164, 12, 3, blue)
    fill(image, 121, 175, 18, 3, cream)
    fill(image, 121, 185, 14, 3, mint)
  elseif kind == "document" then
    fill(image, 55, 116, 94, 77, webBackground)
    fill(image, 55, 116, 94, 12, blushDark)
    fill(image, 55, 128, 20, 65, codePanel)
    fill(image, 60, 135, 10, 4, blush)
    fill(image, 60, 146, 8, 4, blue)
    fill(image, 60, 157, 11, 4, mint)
    fill(image, 60, 168, 8, 4, cream)
    fill(image, 60, 179, 10, 4, blush)
    fill(image, 79, 132, 64, 56, cream)
    fill(image, 84, 138, 34, 5, blush)
    fill(image, 84, 150, 50, 3, blushDark)
    fill(image, 84, 160, 42, 3, blush)
    fill(image, 84, 170, 48, 3, blushDark)
    fill(image, 84, 180, 29, 3, blush)
  elseif kind == "web" then
    -- A bright browser with a thick tab strip, navigation buttons, address
    -- bar, oversized image hero, and card column. Its layout and value are
    -- deliberately opposite to the split dark editor above.
    fill(image, 55, 116, 94, 77, webBackground)
    fill(image, 55, 116, 94, 17, webChrome)
    -- Raised active tab.
    fill(image, 59, 117, 32, 7, white)
    dot(image, 62, 119, 2, blush)
    fill(image, 67, 119, 18, 2, webInk)
    fill(image, 59, 126, 4, 4, white)
    fill(image, 66, 126, 4, 4, white)
    fill(image, 73, 125, 71, 6, white)
    dot(image, 77, 127, 2, mint)
    -- Large page hero makes this read as a website, not code lines.
    fill(image, 59, 136, 55, 39, blue)
    fill(image, 63, 141, 19, 27, webSun)
    fill(image, 86, 141, 23, 5, white)
    fill(image, 86, 151, 18, 4, white)
    fill(image, 86, 161, 13, 4, mint)
    -- Stacked cards and a wide footer block.
    fill(image, 119, 136, 25, 12, blush)
    fill(image, 119, 153, 25, 12, mint)
    fill(image, 119, 170, 25, 12, webChrome)
    fill(image, 59, 181, 55, 5, webInk)
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
