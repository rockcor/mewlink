-- Shared pixel dog mark used by both the in-app MewLink screen and App Icon.
-- Keeping one authored shape prevents the brand character from drifting.

local rgba = app.pixelColor.rgba
local outline = rgba(76, 18, 70, 255)
local cream = rgba(255, 245, 211, 255)
local blush = rgba(237, 126, 157, 255)
local pink = rgba(242, 126, 154, 255)
local pinkLight = rgba(255, 177, 190, 255)
local white = rgba(255, 255, 255, 255)

local function draw(target, originX, originY, scale)
  scale = scale or 1

  local function fill(x, y, width, height, color)
    local sx, sy = originX + x * scale, originY + y * scale
    for py = sy, sy + height * scale - 1 do
      for px = sx, sx + width * scale - 1 do
        if px >= 0 and px < target.width and py >= 0 and py < target.height then
          target:putPixel(px, py, color)
        end
      end
    end
  end

  local function roundBox(x, y, width, height, color)
    fill(x + 2, y, width - 4, height, color)
    fill(x, y + 2, width, height - 4, color)
    fill(x + 1, y + 1, width - 2, height - 2, color)
  end

  -- Large floppy ears are the widest part of the silhouette.
  roundBox(0, 6, 16, 25, outline)
  roundBox(3, 9, 11, 19, pink)
  fill(1, 16, 4, 11, outline)
  fill(5, 11, 3, 6, pinkLight)
  fill(6, 11, 2, 2, white)

  roundBox(36, 6, 16, 25, outline)
  roundBox(38, 9, 11, 19, pink)
  fill(48, 16, 4, 11, outline)
  fill(43, 11, 3, 6, pinkLight)
  fill(44, 11, 2, 2, white)

  -- This is the exact compact screen character: low crown and broad cheeks.
  roundBox(9, 0, 35, 37, outline)
  roundBox(12, 3, 29, 31, cream)
  fill(15, 0, 23, 5, cream)

  -- Tiny highlights and rounded blush make the original face a little warmer.
  fill(18, 13, 4, 4, outline)
  fill(31, 13, 4, 4, outline)
  fill(18, 13, 1, 1, white)
  fill(31, 13, 1, 1, white)
  roundBox(15, 22, 5, 5, blush)
  roundBox(35, 22, 5, 5, blush)

  -- Keep the recognizable tiny pixel muzzle from the monitor reference.
  fill(24, 21, 5, 4, outline)
  fill(21, 25, 4, 3, outline)
  fill(28, 25, 4, 3, outline)
  fill(24, 27, 5, 2, outline)

  return 52 * scale, 37 * scale
end

return draw
