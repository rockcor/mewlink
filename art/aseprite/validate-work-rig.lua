local root = app.params.root
if not root or root == "" then error("Pass root") end
local dir = root .. "/art/aseprite/frames/"
local base = Image { fromFile = dir .. "input_none.png" }
local checks = {
  { name = "input_keyboard", masks = { {160, 146, 78, 91} } },
  { name = "input_pointer", masks = { {263, 142, 96, 101} } },
  { name = "input_both", masks = { {160, 146, 78, 91}, {263, 142, 96, 101} } },
}
local function allowed(x, y, masks)
  for _, mask in ipairs(masks) do
    if x >= mask[1] and x < mask[1] + mask[3] and y >= mask[2] and y < mask[2] + mask[4] then return true end
  end
  return false
end
for _, check in ipairs(checks) do
  local image = Image { fromFile = dir .. check.name .. ".png" }
  for y = 0, 255 do
    for x = 0, 383 do
      if not allowed(x, y, check.masks) and image:getPixel(x, y) ~= base:getPixel(x, y) then
        error(check.name .. " moves a body/device pixel outside its assigned hand mask at " .. x .. "," .. y)
      end
    end
  end
end
print("Validated work rig: body, head, face, ears, monitor and devices are pixel-identical")
