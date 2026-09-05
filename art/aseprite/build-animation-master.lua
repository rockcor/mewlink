local root = app.params.root
if not root or root == "" then
  error("Pass --script-param root=/absolute/project/path")
end

local frameWidth = 384
local frameHeight = 256
local sourceDir = root .. "/art/aseprite/frames/"
local exportDir = root .. "/public/pets/animations/"
local projectPath = root .. "/art/aseprite/mewlink-pet-animation-master.aseprite"

local function source(name)
  local image = Image { fromFile = sourceDir .. name .. ".png" }
  if image.width ~= frameWidth or image.height ~= frameHeight then
    error(name .. " must be 384x256")
  end
  return image
end

local animations = {
  { name = "video", loop = true, frames = {
    { "base_video", 620 }, { "peak_video", 150 }, { "base_video", 520 }, { "peak_video", 170 },
  }},
  { name = "reading", loop = true, frames = {
    { "base_reading", 720 }, { "peak_reading", 190 }, { "base_reading", 520 }, { "peak_reading", 180 },
  }},
  { name = "meeting", loop = true, frames = {
    { "base_meeting", 760 }, { "peak_meeting", 180 }, { "base_meeting", 620 }, { "peak_meeting", 160 },
  }},
  { name = "browsing", loop = true, frames = {
    { "base_browsing", 720 }, { "peak_browsing", 190 }, { "base_browsing", 640 }, { "peak_browsing", 170 },
  }},
  { name = "idle", loop = true, frames = {
    { "base_idle", 820 }, { "base_idle", 620 }, { "peak_idle", 220 }, { "base_idle", 520 },
  }},
  { name = "rest", loop = true, frames = {
    { "base_rest", 1050 }, { "peak_rest", 360 }, { "base_rest", 950 }, { "peak_rest", 340 },
  }},
  { name = "coding-input", loop = false, frames = {
    { "input_none", 100 }, { "input_keyboard", 100 }, { "input_pointer", 100 }, { "input_both", 100 },
  }},
  { name = "water", loop = false, frames = {
    { "base_water", 180 }, { "peak_water", 300 }, { "peak_water", 360 }, { "base_water", 240 },
  }},
  { name = "hug", loop = false, frames = {
    { "hug_1", 210 }, { "hug_2", 190 }, { "hug_3", 460 }, { "hug_4", 300 },
  }},

  -- Replay's common route gets direct prop-to-prop bridge poses.
  { name = "transition-video-coding", loop = false, frames = {
    { "base_video", 150 }, { "bridge_video_to_coding", 260 }, { "base_coding", 150 },
  }},
  { name = "transition-coding-reading", loop = false, frames = {
    { "base_coding", 150 }, { "bridge_coding_to_reading", 260 }, { "base_reading", 150 },
  }},
  { name = "transition-reading-meeting", loop = false, frames = {
    { "base_reading", 150 }, { "bridge_reading_to_meeting", 260 }, { "base_meeting", 150 },
  }},
  { name = "transition-meeting-video", loop = false, frames = {
    { "base_meeting", 150 }, { "bridge_meeting_to_video", 260 }, { "base_video", 150 },
  }},
  { name = "transition-video-browsing", loop = false, frames = {
    { "base_video", 150 }, { "bridge_video_to_coding", 260 }, { "base_browsing", 150 },
  }},
  { name = "transition-browsing-rest", loop = false, frames = {
    { "base_browsing", 150 }, { "bridge_browsing_to_rest", 280 }, { "base_rest", 170 },
  }},
  { name = "transition-rest-coding", loop = false, frames = {
    { "base_rest", 170 }, { "bridge_rest_to_coding", 280 }, { "base_coding", 150 },
  }},
  { name = "website-replay", loop = true, frames = {
    { "input_none", 667 }, { "input_both", 667 }, { "bridge_coding_to_reading", 667 },
    { "base_reading", 667 }, { "peak_reading", 667 }, { "bridge_reading_to_meeting", 667 },
    { "base_meeting", 667 }, { "peak_meeting", 667 }, { "bridge_meeting_to_video", 667 },
    { "base_video", 667 }, { "peak_video", 667 }, { "bridge_video_to_coding", 667 },
    { "base_browsing", 667 }, { "peak_browsing", 667 }, { "bridge_browsing_to_rest", 667 },
    { "base_rest", 667 }, { "peak_rest", 667 }, { "bridge_rest_to_coding", 661 },
  }},
}

local states = { "video", "coding", "reading", "meeting", "browsing", "idle", "rest" }
for _, state in ipairs(states) do
  local stateFrame = state == "coding" and "input_none" or "base_" .. state
  table.insert(animations, {
    name = "transition-out-" .. state,
    loop = false,
    frames = {
      { stateFrame, 130 }, { state == "rest" and "bridge_rest_to_coding" or "bridge_active_to_idle", 250 }, { "base_idle", 160 },
    },
  })
  table.insert(animations, {
    name = "transition-in-" .. state,
    loop = false,
    frames = {
      { "base_idle", 160 }, { state == "rest" and "bridge_browsing_to_rest" or "bridge_idle_to_active", 250 }, { stateFrame, 130 },
    },
  })
end

local sprite = Sprite(frameWidth, frameHeight, ColorMode.RGB)
sprite.filename = projectPath
local layer = sprite.layers[1]
layer.name = "Final animation frames"
local frameCount = 0

local function appendFrame(frameSpec)
  local frame
  if frameCount == 0 then
    frame = sprite.frames[1]
  else
    frame = sprite:newFrame()
  end
  frameCount = frameCount + 1
  sprite:newCel(layer, frame, source(frameSpec[1]), Point(0, 0))
  frame.duration = frameSpec[2] / 1000
end

local function exportStrip(animation)
  local strip = Image(frameWidth * #animation.frames, frameHeight, ColorMode.RGB)
  for index, frameSpec in ipairs(animation.frames) do
    strip:drawImage(source(frameSpec[1]), Point((index - 1) * frameWidth, 0))
  end
  strip:saveAs(exportDir .. animation.name .. ".png")
end

for _, animation in ipairs(animations) do
  local first = frameCount + 1
  for _, frameSpec in ipairs(animation.frames) do
    appendFrame(frameSpec)
  end
  local last = frameCount
  local tag = sprite:newTag(first, last)
  tag.name = animation.name
  tag.aniDir = AniDir.FORWARD
  exportStrip(animation)
end

app.activeSprite = sprite
sprite:saveAs(projectPath)
print("MewLink Aseprite master: " .. frameCount .. " frames, " .. #animations .. " tags")
