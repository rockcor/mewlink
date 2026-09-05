-- MewLink workstation companion v5.
-- Deliberately tiny, abstract, and high-energy: a 96x64 working canvas,
-- a small palette, a locked bean-shaped body, and two independent full arms.

local output = app.params["output"]
if not output or output == "" then
  error("Pass --script-param output=/absolute/path/workstation-input-v5.aseprite")
end

local W, H = 96, 64
local sprite = Sprite(W, H, ColorMode.INDEXED)
sprite.transparentColor = 0
sprite.gridBounds = Rectangle(0, 0, 8, 8)

local palette = Palette(16)
local colors = {
  { 0, 0, 0, 0 },
  { 57, 20, 58, 255 },   -- plum outline
  { 105, 37, 73, 255 },  -- soft outline/shadow
  { 255, 238, 203, 255 },-- cream
  { 255, 249, 229, 255 },-- cream highlight
  { 231, 190, 156, 255 },-- cream shadow
  { 246, 112, 151, 255 },-- coral pink
  { 193, 65, 111, 255 }, -- dark pink
  { 255, 176, 196, 255 },-- light pink
  { 73, 17, 55, 255 },   -- device shadow
  { 177, 43, 99, 255 },  -- device body
  { 255, 118, 161, 255 },-- keycap
  { 247, 118, 145, 255 },-- cheek
  { 255, 184, 45, 255 }, -- motion gold
  { 255, 255, 255, 255 },-- eye glint
  { 255, 222, 112, 255 } -- motion light
}
for index, rgba in ipairs(colors) do
  palette:setColor(index - 1, Color { r=rgba[1], g=rgba[2], b=rgba[3], a=rgba[4] })
end
sprite:setPalette(palette)

local function image()
  local result = Image(sprite.spec)
  result:clear()
  return result
end

local function pixel(img, x, y, color)
  x, y = math.floor(x + 0.5), math.floor(y + 0.5)
  if x >= 0 and x < W and y >= 0 and y < H then img:drawPixel(x, y, color) end
end

local function rect(img, x, y, width, height, color)
  for py = y, y + height - 1 do
    for px = x, x + width - 1 do pixel(img, px, py, color) end
  end
end

local function line(img, x0, y0, x1, y1, color, thickness)
  x0, y0, x1, y1 = math.floor(x0), math.floor(y0), math.floor(x1), math.floor(y1)
  local dx, sx = math.abs(x1 - x0), x0 < x1 and 1 or -1
  local dy, sy = -math.abs(y1 - y0), y0 < y1 and 1 or -1
  local err = dx + dy
  local radius = math.floor((thickness or 1) / 2)
  while true do
    for oy = -radius, radius do
      for ox = -radius, radius do pixel(img, x0 + ox, y0 + oy, color) end
    end
    if x0 == x1 and y0 == y1 then break end
    local twice = 2 * err
    if twice >= dy then err = err + dy; x0 = x0 + sx end
    if twice <= dx then err = err + dx; y0 = y0 + sy end
  end
end

local function fillEllipse(img, cx, cy, rx, ry, angle, color)
  local radians = math.rad(angle or 0)
  local cosine, sine = math.cos(radians), math.sin(radians)
  local reach = math.ceil(math.max(rx, ry))
  for y = math.floor(cy - reach), math.ceil(cy + reach) do
    for x = math.floor(cx - reach), math.ceil(cx + reach) do
      local dx, dy = x - cx, y - cy
      local localX = dx * cosine + dy * sine
      local localY = -dx * sine + dy * cosine
      if (localX * localX) / (rx * rx) + (localY * localY) / (ry * ry) <= 1 then pixel(img, x, y, color) end
    end
  end
end

local function ellipseWithOutline(img, cx, cy, rx, ry, angle, fill)
  fillEllipse(img, cx, cy, rx, ry, angle, 1)
  fillEllipse(img, cx, cy, math.max(1, rx - 1.5), math.max(1, ry - 1.5), angle, fill)
end

local function fillPolygon(img, points, color)
  local minY, maxY = H, 0
  for _, point in ipairs(points) do minY = math.min(minY, point[2]); maxY = math.max(maxY, point[2]) end
  for y = math.floor(minY), math.ceil(maxY) do
    local intersections, previous = {}, points[#points]
    for _, current in ipairs(points) do
      if (current[2] > y) ~= (previous[2] > y) then
        table.insert(intersections, previous[1] + (y - previous[2]) * (current[1] - previous[1]) / (current[2] - previous[2]))
      end
      previous = current
    end
    table.sort(intersections)
    for i = 1, #intersections - 1, 2 do
      for x = math.ceil(intersections[i]), math.floor(intersections[i + 1]) do pixel(img, x, y, color) end
    end
  end
end

local function curvedLimb(img, x0, y0, cx, cy, x1, y1, radius)
  local function drawCurve(color, r)
    for step = 0, 24 do
      local t = step / 24
      local one = 1 - t
      local x = one * one * x0 + 2 * one * t * cx + t * t * x1
      local y = one * one * y0 + 2 * one * t * cy + t * t * y1
      fillEllipse(img, x, y, r, r, 0, color)
    end
  end
  drawCurve(1, radius)
  drawCurve(3, radius - 1.5)
end

local function drawBody(img)
  -- Tail, floppy ears, then one simple bean silhouette.
  ellipseWithOutline(img, 22, 42, 7, 6, 0, 6)
  fillEllipse(img, 21, 40, 3, 2, 0, 8)
  ellipseWithOutline(img, 24, 22, 8, 15, 24, 6)
  fillEllipse(img, 22, 18, 3, 7, 24, 8)
  ellipseWithOutline(img, 72, 22, 8, 15, -24, 6)
  fillEllipse(img, 74, 18, 3, 7, -24, 8)

  fillEllipse(img, 48, 25, 22, 20, 0, 1)
  rect(img, 26, 24, 45, 23, 1)
  fillEllipse(img, 48, 47, 22, 9, 0, 1)
  fillEllipse(img, 48, 25, 20, 18, 0, 3)
  rect(img, 28, 24, 41, 22, 3)
  fillEllipse(img, 48, 46, 20, 7, 0, 3)
  fillEllipse(img, 41, 18, 9, 7, -15, 4)
  rect(img, 29, 39, 2, 7, 5)
  rect(img, 31, 47, 34, 2, 5)

  -- Compact focused face; exact same pixels in every frame.
  line(img, 38, 22, 42, 21, 1, 1)
  line(img, 54, 21, 58, 22, 1, 1)
  fillEllipse(img, 40, 28, 2.5, 3, 0, 1)
  fillEllipse(img, 56, 28, 2.5, 3, 0, 1)
  pixel(img, 39, 27, 14); pixel(img, 55, 27, 14)
  fillEllipse(img, 34, 33, 4, 2, 0, 12)
  fillEllipse(img, 62, 33, 4, 2, 0, 12)
  rect(img, 47, 33, 3, 1, 1)
  pixel(img, 48, 34, 1)
  line(img, 46, 36, 50, 36, 1, 1)
end

local function drawDevices(img)
  -- Flat, icon-like keyboard.
  fillPolygon(img, {{15,49},{67,49},{72,59},{18,61}}, 1)
  fillPolygon(img, {{18,51},{65,51},{69,57},{19,59}}, 10)
  rect(img, 20, 52, 45, 1, 11)
  for row = 0, 2 do
    for column = 0, 6 do
      local x, y = 20 + column * 6 + row, 53 + row * 2
      rect(img, x, y, 5, 1, 11)
    end
  end
  rect(img, 34, 59, 22, 1, 11)

  ellipseWithOutline(img, 80, 55, 7, 5, -5, 6)
  fillEllipse(img, 80, 54, 5, 3, -5, 8)
  rect(img, 80, 51, 1, 3, 1)
end

local function drawKeyboardArm(img, active)
  if active then
    -- A big shoulder-to-paw swing: one connected arm, no floating hand.
    curvedLimb(img, 36, 39, 24, 33, 27, 17, 5)
    ellipseWithOutline(img, 27, 15, 6, 6, -10, 3)
    line(img, 24, 16, 22, 13, 5, 1)
  else
    curvedLimb(img, 36, 39, 31, 43, 35, 50, 5)
    ellipseWithOutline(img, 36, 50, 6, 5, -8, 3)
  end
end

local function drawPointerArm(img, active)
  if active then
    -- Pointer input reads as a bold push across the desk while the bean stays put.
    curvedLimb(img, 60, 39, 70, 39, 79, 49, 5)
    ellipseWithOutline(img, 80, 50, 6, 5, 12, 3)
  else
    curvedLimb(img, 60, 39, 67, 44, 71, 50, 5)
    ellipseWithOutline(img, 72, 50, 6, 5, 12, 3)
  end
end

local function drawAccents(img, keyboardActive, pointerActive)
  if keyboardActive then
    line(img, 22, 10, 18, 6, 13, 2)
    line(img, 27, 8, 27, 3, 15, 2)
    line(img, 32, 10, 35, 6, 13, 2)
    line(img, 31, 47, 29, 43, 13, 1)
    line(img, 35, 47, 35, 42, 15, 1)
    line(img, 39, 47, 41, 43, 13, 1)
  end
  if pointerActive then
    line(img, 84, 45, 87, 42, 13, 2)
    line(img, 85, 50, 88, 50, 15, 2)
    line(img, 84, 55, 87, 58, 13, 2)
  end
end

local body = sprite.layers[1]
body.name = "01 Bean body + face (LOCKED)"
local devices = sprite:newLayer(); devices.name = "02 Keyboard + mouse (LOCKED)"
local keyboardArm = sprite:newLayer(); keyboardArm.name = "03 Left keyboard arm (FULL)"
local pointerArm = sprite:newLayer(); pointerArm.name = "04 Right pointer arm (FULL)"
local accents = sprite:newLayer(); accents.name = "05 Motion accents"
for frameNumber = 2, 4 do sprite:newEmptyFrame(frameNumber) end

local fixedBody = image(); drawBody(fixedBody)
local fixedDevices = image(); drawDevices(fixedDevices)
local states = {
  { name="idle", keyboard=false, pointer=false, duration=0.13 },
  { name="keyboard", keyboard=true, pointer=false, duration=0.11 },
  { name="pointer", keyboard=false, pointer=true, duration=0.09 },
  { name="both", keyboard=true, pointer=true, duration=0.09 }
}

for frameNumber, state in ipairs(states) do
  sprite.frames[frameNumber].duration = state.duration
  sprite:newCel(body, frameNumber, fixedBody, Point(0, 0))
  sprite:newCel(devices, frameNumber, fixedDevices, Point(0, 0))
  local left = image(); drawKeyboardArm(left, state.keyboard)
  sprite:newCel(keyboardArm, frameNumber, left, Point(0, 0))
  local right = image(); drawPointerArm(right, state.pointer)
  sprite:newCel(pointerArm, frameNumber, right, Point(0, 0))
  local marks = image(); drawAccents(marks, state.keyboard, state.pointer)
  sprite:newCel(accents, frameNumber, marks, Point(0, 0))
  local tag = sprite:newTag(frameNumber, frameNumber); tag.name = state.name
end

sprite.data = "MewLink workstation input sprite v5 | abstract bean | 96x64 | 16 colors | body/devices pixel-locked"
sprite:saveAs(output)
app.activeSprite = sprite
app.activeFrame = sprite.frames[1]
app.activeLayer = keyboardArm
app.refresh()
