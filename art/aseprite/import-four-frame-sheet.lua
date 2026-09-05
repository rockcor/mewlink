local root = app.params.root
local inputPath = app.params.input
local prefix = app.params.prefix
local maxWidth = tonumber(app.params.maxWidth) or 356
local maxHeight = tonumber(app.params.maxHeight) or 220
if not root or root == "" or not inputPath or inputPath == "" or not prefix or prefix == "" then
  error("Pass root, input, and prefix script parameters")
end

local source = Image { fromFile = inputPath }
local cellWidth = math.floor(source.width / 2)
local cellHeight = math.floor(source.height / 2)
local outputWidth, outputHeight = 384, 256

local function channels(pixel)
  return app.pixelColor.rgbaR(pixel), app.pixelColor.rgbaG(pixel), app.pixelColor.rgbaB(pixel), app.pixelColor.rgbaA(pixel)
end
local function isBackground(pixel)
  local r, g, b, a = channels(pixel)
  if a == 0 then return true end
  if g > 72 and g > r * 1.24 and g > b * 1.24 then return true end
  -- Generated transparency previews sometimes contain a white checkerboard.
  return math.abs(r - g) < 7 and math.abs(g - b) < 7 and r > 225
end

for index = 1, 4 do
  local column = (index - 1) % 2
  local row = math.floor((index - 1) / 2)
  local originX, originY = column * cellWidth, row * cellHeight
  local minX, minY, maxX, maxY = cellWidth, cellHeight, -1, -1
  for y = 0, cellHeight - 1 do
    for x = 0, cellWidth - 1 do
      local pixel = source:getPixel(originX + x, originY + y)
      if not isBackground(pixel) then
        minX, minY = math.min(minX, x), math.min(minY, y)
        maxX, maxY = math.max(maxX, x), math.max(maxY, y)
      end
    end
  end
  if maxX < minX then error("No foreground in frame " .. index) end
  local contentWidth, contentHeight = maxX - minX + 1, maxY - minY + 1
  local scale = math.min(maxWidth / contentWidth, maxHeight / contentHeight)
  local scaledWidth = math.floor(contentWidth * scale + 0.5)
  local scaledHeight = math.floor(contentHeight * scale + 0.5)
  local offsetX = math.floor((outputWidth - scaledWidth) / 2)
  local offsetY = outputHeight - scaledHeight - 9
  local output = Image(outputWidth, outputHeight, ColorMode.RGB)
  output:clear(app.pixelColor.rgba(0, 0, 0, 0))
  for targetY = 0, scaledHeight - 1 do
    local sourceY = minY + math.min(contentHeight - 1, math.floor(targetY / scale))
    for targetX = 0, scaledWidth - 1 do
      local sourceX = minX + math.min(contentWidth - 1, math.floor(targetX / scale))
      local pixel = source:getPixel(originX + sourceX, originY + sourceY)
      if not isBackground(pixel) then output:putPixel(offsetX + targetX, offsetY + targetY, pixel) end
    end
  end
  output:saveAs(root .. "/art/aseprite/frames/" .. prefix .. "_" .. index .. ".png")
end
print("Imported " .. prefix .. " as four Aseprite frames")
