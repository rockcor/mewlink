local inputPath = app.params.input
local outputPath = app.params.output or inputPath
local maxWidth = tonumber(app.params.maxWidth) or 300
local maxHeight = tonumber(app.params.maxHeight) or 190
if not inputPath or inputPath == "" then error("Pass input") end
local source = Image { fromFile = inputPath }
local minX, minY, maxX, maxY = source.width, source.height, -1, -1
for pixel in source:pixels() do
  if app.pixelColor.rgbaA(pixel()) > 0 then
    minX, minY = math.min(minX, pixel.x), math.min(minY, pixel.y)
    maxX, maxY = math.max(maxX, pixel.x), math.max(maxY, pixel.y)
  end
end
if maxX < minX then error("Empty input") end
local contentWidth, contentHeight = maxX - minX + 1, maxY - minY + 1
local scale = math.min(maxWidth / contentWidth, maxHeight / contentHeight)
local scaledWidth, scaledHeight = math.floor(contentWidth * scale + 0.5), math.floor(contentHeight * scale + 0.5)
local offsetX, offsetY = math.floor((384 - scaledWidth) / 2), 256 - scaledHeight - 10
local output = Image(384, 256, ColorMode.RGB)
output:clear(app.pixelColor.rgba(0, 0, 0, 0))
for y = 0, scaledHeight - 1 do
  local sy = minY + math.min(contentHeight - 1, math.floor(y / scale))
  for x = 0, scaledWidth - 1 do
    local sx = minX + math.min(contentWidth - 1, math.floor(x / scale))
    output:putPixel(offsetX + x, offsetY + y, source:getPixel(sx, sy))
  end
end
output:saveAs(outputPath)
print("Normalized " .. inputPath)
