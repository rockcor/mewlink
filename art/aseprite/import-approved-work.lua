local root = app.params.root
local inputPath = app.params.input
if not root or root == "" or not inputPath or inputPath == "" then
  error("Pass --script-param root=... --script-param input=...")
end

local source = Image { fromFile = inputPath }
local cellWidth = math.floor(source.width / 2)
local cellHeight = math.floor(source.height / 2)
local outputWidth = 384
local outputHeight = 256
local names = { "input_none", "input_keyboard", "input_pointer", "input_both" }

local function rgba(pixel)
  return app.pixelColor.rgbaR(pixel), app.pixelColor.rgbaG(pixel), app.pixelColor.rgbaB(pixel), app.pixelColor.rgbaA(pixel)
end

local function isBackground(pixel)
  local r, g, b, a = rgba(pixel)
  return a == 0 or (g > 72 and g > r * 1.24 and g > b * 1.24)
end

local function transparent()
  return app.pixelColor.rgba(0, 0, 0, 0)
end

for index, name in ipairs(names) do
  local column = (index - 1) % 2
  local row = math.floor((index - 1) / 2)
  local originX = column * cellWidth
  local originY = row * cellHeight
  local minX, minY = cellWidth, cellHeight
  local maxX, maxY = -1, -1

  for y = 0, cellHeight - 1 do
    for x = 0, cellWidth - 1 do
      local pixel = source:getPixel(originX + x, originY + y)
      if not isBackground(pixel) then
        minX = math.min(minX, x)
        minY = math.min(minY, y)
        maxX = math.max(maxX, x)
        maxY = math.max(maxY, y)
      end
    end
  end

  if maxX < minX or maxY < minY then error("No foreground found in " .. name) end
  local contentWidth = maxX - minX + 1
  local contentHeight = maxY - minY + 1
  local scale = math.min(356 / contentWidth, 220 / contentHeight)
  local scaledWidth = math.max(1, math.floor(contentWidth * scale + 0.5))
  local scaledHeight = math.max(1, math.floor(contentHeight * scale + 0.5))
  local offsetX = math.floor((outputWidth - scaledWidth) / 2)
  local offsetY = outputHeight - scaledHeight - 10
  local output = Image(outputWidth, outputHeight, ColorMode.RGB)
  output:clear(transparent())

  for targetY = 0, scaledHeight - 1 do
    local sourceY = minY + math.min(contentHeight - 1, math.floor(targetY / scale))
    for targetX = 0, scaledWidth - 1 do
      local sourceX = minX + math.min(contentWidth - 1, math.floor(targetX / scale))
      local pixel = source:getPixel(originX + sourceX, originY + sourceY)
      if not isBackground(pixel) then output:putPixel(offsetX + targetX, offsetY + targetY, pixel) end
    end
  end

  output:saveAs(root .. "/art/aseprite/frames/" .. name .. ".png")
end

print("Imported approved two-arm work sheet into four aligned Aseprite frames")
