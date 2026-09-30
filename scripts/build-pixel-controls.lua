-- Run from project root: aseprite --batch --script scripts/build-pixel-controls.lua
-- One editable layer per icon; integer pixels only, no OS emoji dependencies.
local icons = {
  {"settings", {
    "      ####      ", "      #pp#      ", "  ##  #pp#  ##  ", " #pp##pppp##pp# ",
    " #pppppppppppp# ", "  #pp######pp#  ", "###pp#cccc#pp###", "#pppp#cccc#pppp#",
    "#pppp#cccc#pppp#", "###pp#cccc#pp###", "  #pp######pp#  ", " #pppppppppppp# ",
    " #pp##pppp##pp# ", "  ##  #pp#  ##  ", "      #pp#      ", "      ####      "}},
  {"statistics", {
    "                ", "          ####  ", "          #bb#  ", "          #bb#  ",
    "     #### #bb#  ", "     #pp# #bb#  ", "     #pp# #bb#  ", "#### #pp# #bb#  ",
    "#mm# #pp# #bb#  ", "#mm# #pp# #bb#  ", "#mm# #pp# #bb#  ", "#mm# #pp# #bb#  ",
    "#### #### ####  ", "                ", "############### ", "                "}},
  {"hug", {
    "                ", "   ###    ###   ", "  #ppp#  #ppp#  ", " #pccpp##ppppp# ",
    " #pcpppppppppp# ", " #pppppppppppp# ", "  #pppppppppp#  ", "  ##pppppppp##  ",
    " #cc#pppppp#cc# ", "#cccc#pppp#cccc#", "#cccc#pppp#cccc#", " #ccc#pppp#ccc# ",
    "  ### #pp# ###  ", "       ##       ", "                ", "                "}},
  {"replay", {
    "                ", "     ######     ", "   ##mmmmmm##   ", "  #mmm####mmm#  ",
    " #mm##    ##mm# ", " #m#   ##   #m# ", " #m#   #p#  #m# ", "###m#  #pp# #m# ",
    " #m#   #pp# #m# ", "  #    #p#  #m# ", "       ##  #mm# ", "   ##     #mm#  ",
    "   #m#####mm#   ", "    #mmmmmm#    ", "     ######     ", "                "}},
  {"close", {
    "                ", "                ", "  ###      ###  ", "  #pp#    #pp#  ",
    "   #pp#  #pp#   ", "    #pp##pp#    ", "     #pppp#     ", "      #pp#      ",
    "      #pp#      ", "     #pppp#     ", "    #pp##pp#    ", "   #pp#  #pp#   ",
    "  #pp#    #pp#  ", "  ###      ###  ", "                ", "                "}},
  {"ceramic", {
    "    #    #      ", "   #    #       ", "    #    #      ", "                ",
    " ###########    ", " #ccccccccc###  ", " #cpppppppc#cp# ", " #cpccppppc#cp# ",
    " #cpppppppc#cp# ", " #cpppppppc###  ", " #cpppppppc#    ", " #cpppppppc#    ",
    "  #ppppppp#     ", "   #######      ", "  #########     ", "                "}},
  {"tumbler", {
    "         ####   ", "        #mm#    ", "        #mm#    ", "   ############ ",
    "   #cccccccccc# ", "   ############ ", "    #bbbbbbbb#  ", "    #bcbbbbbb#  ",
    "    #bcbbbbbb#  ", "    #bcbbbbbb#  ", "     #bbbbbb#   ", "     #bbbbbb#   ",
    "     #bbbbbb#   ", "     #bbbbbb#   ", "      ######    ", "                "}},
  {"bottle", {
    "     ######     ", "     #mmmm#     ", "     ######     ", "     #cccc#     ",
    "    #cccccc#    ", "   #cccccccc#   ", "   #cmmmmmmc#   ", "   #cmmmmmmc#   ",
    "   ##########   ", "   #cccccccc#   ", "   #ccmmmmcc#   ", "   #cccccccc#   ",
    "   ##########   ", "   #mmmmmmmm#   ", "    ########    ", "                "}},
}
local palette = {
  ["#"] = app.pixelColor.rgba(104, 62, 81, 255),
  p = app.pixelColor.rgba(232, 148, 174, 255),
  c = app.pixelColor.rgba(255, 245, 219, 255),
  b = app.pixelColor.rgba(139, 188, 211, 255),
  m = app.pixelColor.rgba(157, 202, 178, 255),
}
local sprite = Sprite(#icons * 16, 16, ColorMode.RGB)
for index, icon in ipairs(icons) do
  local layer = index == 1 and sprite.layers[1] or sprite:newLayer()
  layer.name = icon[1]
  local image = Image(16, 16, ColorMode.RGB)
  for y, line in ipairs(icon[2]) do
    assert(#line == 16, icon[1] .. ": row " .. y .. " is not 16 pixels")
    for x = 1, 16 do
      local color = palette[line:sub(x, x)]
      if color then image:drawPixel(x - 1, y - 1, color) end
    end
  end
  sprite:newCel(layer, 1, image, Point((index - 1) * 16, 0))
end
sprite:saveAs("art/aseprite/mewlink-pixel-controls.aseprite")
Image(sprite):saveAs("public/ui/pixel-controls.png")
sprite:close()
print("Exported 8 pixel controls and their editable Aseprite source.")
