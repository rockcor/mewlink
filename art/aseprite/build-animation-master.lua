local root = app.params.root
if not root or root == "" then error("Pass --script-param root=/absolute/project/path") end

local frameWidth, frameHeight = 384, 256
local sourceDir = root .. "/art/aseprite/frames/"
local exportDir = root .. "/public/pets/animations/"
local projectPath = root .. "/art/aseprite/mewlink-pet-animation-master.aseprite"

local function source(name)
  local image = Image { fromFile = sourceDir .. name .. ".png" }
  if image.width ~= frameWidth or image.height ~= frameHeight then error(name .. " must be 384x256") end
  return image
end

local animations = {}
local function add(name, loop, frames) table.insert(animations, { name = name, loop = loop, frames = frames }) end
local function four(prefix, durations)
  local result = {}
  for index = 1, 4 do table.insert(result, { prefix .. "_" .. index, durations[index] }) end
  return result
end

add("work-code", false, {
  { "code_input_none", 100 }, { "code_input_keyboard", 100 }, { "code_input_pointer", 100 }, { "code_input_both", 100 },
})
add("work-document", false, {
  { "document_input_none", 100 }, { "document_input_keyboard", 100 }, { "document_input_pointer", 100 }, { "document_input_both", 100 },
})
add("work-web", false, {
  { "web_input_none", 100 }, { "web_input_keyboard", 100 }, { "web_input_pointer", 100 }, { "web_input_both", 100 },
})
add("meeting", true, {
  { "base_meeting", 760 }, { "peak_meeting", 180 }, { "base_meeting", 620 }, { "peak_meeting", 160 },
})
add("leisure", true, {
  { "base_video", 760 }, { "peak_video", 190 }, { "base_video", 620 }, { "peak_video", 180 },
})
add("idle", true, {
  { "base_idle", 1100 }, { "base_idle", 1050 }, { "peak_idle", 180 }, { "base_idle", 1250 },
})
add("rest", true, {
  { "base_rest", 1050 }, { "peak_rest", 360 }, { "base_rest", 950 }, { "peak_rest", 340 },
})

for _, state in ipairs({ "work", "meeting", "leisure", "idle", "rest" }) do
  for _, style in ipairs({ "ceramic", "tumbler", "bottle" }) do
    add("water-" .. state .. "-" .. style, false, four("water_" .. state .. "_" .. style, { 600, 800, 900, 900 }))
  end
end
for _, style in ipairs({ "ceramic", "tumbler", "bottle" }) do
  add("water-drink-" .. style, false, four("water_drink_" .. style, { 650, 700, 1050, 800 }))
end

add("hug-work", false, four("hug_work", { 550, 500, 1400, 750 }))
add("hug-meeting", false, four("hug_meeting", { 550, 500, 1400, 750 }))
add("hug-leisure", false, four("hug_leisure", { 550, 500, 1400, 750 }))
add("hug-idle", false, four("hug_idle", { 550, 500, 1400, 750 }))
for _, blanket in ipairs({ "blush", "night", "mint" }) do
  add("hug-rest-" .. blanket, false, four("hug_rest_" .. blanket, { 550, 600, 1250, 800 }))
end

local stateBase = {
  work = "code_input_none",
  meeting = "base_meeting",
  leisure = "base_video",
  idle = "base_idle",
  rest = "base_rest",
}
local statePeak = {
  work = "code_input_both",
  meeting = "peak_meeting",
  leisure = "peak_video",
  idle = "peak_idle",
  rest = "peak_rest",
}
local bridgeOut = {
  work = "bridge_active_to_idle",
  meeting = "bridge_active_to_idle",
  leisure = "bridge_active_to_idle",
  idle = "base_idle",
  rest = "bridge_rest_to_coding",
}
local bridgeIn = {
  work = "bridge_idle_to_active",
  meeting = "bridge_reading_to_meeting",
  leisure = "bridge_meeting_to_video",
  idle = "base_idle",
  rest = "bridge_browsing_to_rest",
}
local states = { "work", "meeting", "leisure", "idle", "rest" }
for _, from in ipairs(states) do
  for _, to in ipairs(states) do
    if from ~= to then
      add("transition-" .. from .. "-" .. to, false, {
        { stateBase[from], 800 },
        { statePeak[from], 800 },
        { bridgeOut[from], 800 },
        { bridgeIn[to], 800 },
        { statePeak[to], 800 },
        { stateBase[to], 800 },
      })
    end
  end
end

add("website-replay", true, {
  { "code_input_none", 667 }, { "code_input_both", 667 }, { "bridge_active_to_idle", 667 },
  { "base_meeting", 667 }, { "peak_meeting", 667 }, { "bridge_meeting_to_video", 667 },
  { "base_video", 667 }, { "peak_video", 667 }, { "bridge_active_to_idle", 667 },
  { "base_rest", 667 }, { "peak_rest", 667 }, { "bridge_rest_to_coding", 661 },
})

local sprite = Sprite(frameWidth, frameHeight, ColorMode.RGB)
sprite.filename = projectPath
local layer = sprite.layers[1]
layer.name = "Approved animation frames"
local frameCount = 0

local function appendFrame(frameSpec)
  local frame = frameCount == 0 and sprite.frames[1] or sprite:newFrame()
  frameCount = frameCount + 1
  sprite:newCel(layer, frame, source(frameSpec[1]), Point(0, 0))
  frame.duration = frameSpec[2] / 1000
end

local function exportStrip(animation)
  local strip = Image(frameWidth * #animation.frames, frameHeight, ColorMode.RGB)
  for index, frameSpec in ipairs(animation.frames) do strip:drawImage(source(frameSpec[1]), Point((index - 1) * frameWidth, 0)) end
  strip:saveAs(exportDir .. animation.name .. ".png")
end

for _, animation in ipairs(animations) do
  local first = frameCount + 1
  for _, frameSpec in ipairs(animation.frames) do appendFrame(frameSpec) end
  local tag = sprite:newTag(first, frameCount)
  tag.name = animation.name
  tag.aniDir = AniDir.FORWARD
  exportStrip(animation)
end

app.activeSprite = sprite
sprite:saveAs(projectPath)
print("MewLink Aseprite master: " .. frameCount .. " frames, " .. #animations .. " tags")
