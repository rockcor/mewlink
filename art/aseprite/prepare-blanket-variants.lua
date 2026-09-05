local root = app.params.root
if not root or root == "" then error("Pass root") end
local dir = root .. "/art/aseprite/frames/"

local function clone(image)
  local result = Image(384, 256, ColorMode.RGB)
  result:drawImage(image, Point(0, 0))
  return result
end
local function pink(pixel)
  local r = app.pixelColor.rgbaR(pixel)
  local g = app.pixelColor.rgbaG(pixel)
  local b = app.pixelColor.rgbaB(pixel)
  local a = app.pixelColor.rgbaA(pixel)
  return a > 0 and r > 150 and r > g * 1.08 and b > 75 and g < 220
end
local function recolorConnected(image, seedX, seedY, style)
  if style == "blush" then return end
  local base = style == "night" and { 111, 103, 181 } or { 104, 194, 168 }
  local queueX, queueY = { seedX }, { seedY }
  local head = 1
  local seen = {}
  while head <= #queueX do
    local x, y = queueX[head], queueY[head]
    head = head + 1
    local key = y * 384 + x
    if x >= 130 and x < 315 and y >= 130 and y < 250 and not seen[key] then
      seen[key] = true
      local pixel = image:getPixel(x, y)
      if pink(pixel) then
        local r = app.pixelColor.rgbaR(pixel)
        local g = app.pixelColor.rgbaG(pixel)
        local b = app.pixelColor.rgbaB(pixel)
        local brightness = math.max(0.62, math.min(1.28, (r + g + b) / 510))
        image:putPixel(x, y, app.pixelColor.rgba(
          math.min(255, math.floor(base[1] * brightness + 0.5)),
          math.min(255, math.floor(base[2] * brightness + 0.5)),
          math.min(255, math.floor(base[3] * brightness + 0.5)),
          app.pixelColor.rgbaA(pixel)
        ))
        table.insert(queueX, x + 1); table.insert(queueY, y)
        table.insert(queueX, x - 1); table.insert(queueY, y)
        table.insert(queueX, x); table.insert(queueY, y + 1)
        table.insert(queueX, x); table.insert(queueY, y - 1)
      end
    end
  end
end

local seeds = { { 190, 222 }, { 210, 196 }, { 220, 224 }, { 220, 224 } }
for _, style in ipairs({ "blush", "night", "mint" }) do
  for frame = 1, 4 do
    local source = Image { fromFile = dir .. "hug_rest_" .. frame .. ".png" }
    local image = clone(source)
    recolorConnected(image, seeds[frame][1], seeds[frame][2], style)
    image:saveAs(dir .. "hug_rest_" .. style .. "_" .. frame .. ".png")
  end
end
print("Prepared three selectable blanket color variants")
