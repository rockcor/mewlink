local root = app.params.root
if not root or root == "" then error("Pass --script-param root=/absolute/project/path") end

local frameWidth, frameHeight = 384, 256
local sourceDir = root .. "/art/aseprite/frames/"
local exportDir = root .. "/public/pets/animations/"
local projectPath = root .. "/art/aseprite/mewlink-pet-animation-master.aseprite"
local tweenDir = app.params.tweenDir
local python = app.params.python
if not tweenDir or tweenDir == "" then error("Pass --script-param tweenDir=/absolute/temp/path") end
if not python or python == "" then error("Pass --script-param python=/absolute/python/path") end
local sourceCache = {}
local blendCache = {}

local function source(name)
  if sourceCache[name] then return sourceCache[name] end
  local image = Image { fromFile = sourceDir .. name .. ".png" }
  if image.width ~= frameWidth or image.height ~= frameHeight then error(name .. " must be 384x256") end
  sourceCache[name] = image
  return image
end

local function tweenPath(fromName, toName) return tweenDir .. "/" .. fromName .. "--" .. toName .. ".png" end

local function blended(fromName, toName)
  if fromName == toName then return source(fromName) end
  local key = fromName .. "->" .. toName
  if blendCache[key] then return blendCache[key] end
  local result = Image { fromFile = tweenPath(fromName, toName) }
  if result.width ~= frameWidth or result.height ~= frameHeight then error("Invalid motion tween: " .. key) end
  blendCache[key] = result
  return result
end

local animations = {}
local function add(name, loop, frames, smooth)
  local animation = { name = name, loop = loop, frames = frames, smooth = smooth ~= false }
  table.insert(animations, animation)
  return animation
end
local function four(prefix, durations)
  local result = {}
  for index = 1, 4 do table.insert(result, { prefix .. "_" .. index, durations[index] }) end
  return result
end

add("work-code", false, {
  { "code_input_none", 100 }, { "code_input_keyboard", 100 }, { "code_input_pointer", 100 }, { "code_input_both", 100 },
}, false)
add("work-document", false, {
  { "document_input_none", 100 }, { "document_input_keyboard", 100 }, { "document_input_pointer", 100 }, { "document_input_both", 100 },
}, false)
add("work-web", false, {
  { "web_input_none", 100 }, { "web_input_keyboard", 100 }, { "web_input_pointer", 100 }, { "web_input_both", 100 },
}, false)
add("work-ai", false, {
  { "ai_input_none", 100 }, { "ai_input_keyboard", 100 }, { "ai_input_pointer", 100 }, { "ai_input_both", 100 },
}, false)
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
local stateLoopLast = {
  meeting = "peak_meeting",
  leisure = "peak_video",
  idle = "base_idle",
  rest = "peak_rest",
}
local workVisualBase = {
  code = "code_input_none",
  document = "document_input_none",
  web = "web_input_none",
  ai = "ai_input_none",
}
local workVisualPeak = {
  code = "code_input_both",
  document = "document_input_both",
  web = "web_input_both",
  ai = "ai_input_both",
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
local function frameFor(stateFrames, workFrames, state, workVisual)
  if state == "work" then return workFrames[workVisual or "code"] end
  return stateFrames[state]
end

local function addTransition(name, from, to, fromWorkVisual, toWorkVisual)
  local animation = add(name, false, {
    { frameFor(stateBase, workVisualBase, from, fromWorkVisual), 800 },
    { frameFor(statePeak, workVisualPeak, from, fromWorkVisual), 800 },
    { bridgeOut[from], 800 },
    { bridgeIn[to], 800 },
    { frameFor(statePeak, workVisualPeak, to, toWorkVisual), 800 },
    { frameFor(stateBase, workVisualBase, to, toWorkVisual), 800 },
  })
  animation.transitionFrom = from
  animation.transitionFromWorkVisual = fromWorkVisual
end

for _, from in ipairs(states) do
  for _, to in ipairs(states) do
    if from ~= to then
      addTransition("transition-" .. from .. "-" .. to, from, to)
    end
  end
end


-- Work keeps the currently classified monitor content while its hands settle.
-- The generic transition uses the code screen; document and web get exact
-- variants so changing activity never swaps the monitor before motion begins.
for _, state in ipairs({ "meeting", "leisure", "idle", "rest" }) do
  for _, visual in ipairs({ "document", "web", "ai" }) do
    addTransition("transition-work-" .. visual .. "-" .. state, "work", state, visual, nil)
    addTransition("transition-" .. state .. "-work-" .. visual, state, "work", nil, visual)
  end
end

add("website-replay", true, {
  { "code_input_none", 667 }, { "code_input_both", 667 }, { "web_input_none", 667 },
  { "web_input_pointer", 667 }, { "base_meeting", 667 }, { "peak_meeting", 667 },
  { "bridge_meeting_to_video", 667 }, { "base_video", 667 }, { "peak_video", 667 },
  { "bridge_active_to_idle", 667 }, { "base_rest", 667 }, { "peak_rest", 661 },
})

local function prepareMotionTweens()
  local manifestPath = tweenDir .. "/manifest.tsv"
  local manifest = assert(io.open(manifestPath, "w"))
  local seen = {}
  for _, animation in ipairs(animations) do
    if animation.smooth then
      for index, frameSpec in ipairs(animation.frames) do
        local nextSpec = animation.frames[index + 1]
        if not nextSpec then nextSpec = animation.loop and animation.frames[1] or frameSpec end
        local fromName, toName = frameSpec[1], nextSpec[1]
        local key = fromName .. "->" .. toName
        if fromName ~= toName and not seen[key] then
          seen[key] = true
          manifest:write(sourceDir .. fromName .. ".png\t" .. sourceDir .. toName .. ".png\t" .. tweenPath(fromName, toName) .. "\n")
        end
      end
    end
  end
  manifest:close()
  local helper = root .. "/art/aseprite/motion-tween.py"
  local command = string.format("%q %q --manifest %q", python, helper, manifestPath)
  local ok, reason, code = os.execute(command)
  if ok ~= true and ok ~= 0 then error("Motion tween generation failed: " .. tostring(reason) .. " " .. tostring(code)) end
end

prepareMotionTweens()

-- Insert one motion-compensated in-between after every authored frame. Loops blend
-- their last frame back into the first; one-shot animations ease into and
-- hold their final pose. Total playback time stays exactly the same.
local function expandedFrames(animation)
  if not animation.smooth then return animation.frames end
  local result = {}
  for index, frameSpec in ipairs(animation.frames) do
    local nextSpec = animation.frames[index + 1]
    if not nextSpec then nextSpec = animation.loop and animation.frames[1] or frameSpec end
    local halfDuration = frameSpec[2] / 2
    table.insert(result, { image = source(frameSpec[1]), duration = halfDuration })
    table.insert(result, { image = blended(frameSpec[1], nextSpec[1]), duration = halfDuration })
  end
  if animation.transitionFrom then
    local from = animation.transitionFrom
    local exitImage
    if from == "work" then
      exitImage = source(workVisualBase[animation.transitionFromWorkVisual or "code"])
    else
      -- Activity loops finish on the generated peak-to-base in-between. Use
      -- that exact bitmap as the transition's first frame.
      exitImage = blended(stateLoopLast[from], stateBase[from])
    end
    table.insert(result, 1, { image = exitImage, duration = 0 })
    local duration = 4800 / #result
    for _, frameSpec in ipairs(result) do frameSpec.duration = duration end
  end
  return result
end

for _, animation in ipairs(animations) do animation.renderFrames = expandedFrames(animation) end

local sprite = Sprite(frameWidth, frameHeight, ColorMode.RGB)
sprite.filename = projectPath
local layer = sprite.layers[1]
layer.name = "Smoothed animation frames"
local frameCount = 0

local function appendFrame(frameSpec)
  local frame = frameCount == 0 and sprite.frames[1] or sprite:newFrame()
  frameCount = frameCount + 1
  local image = frameSpec.image or source(frameSpec[1])
  local duration = frameSpec.duration or frameSpec[2]
  sprite:newCel(layer, frame, image, Point(0, 0))
  frame.duration = duration / 1000
end

local function exportStrip(animation)
  local strip = Image(frameWidth * #animation.renderFrames, frameHeight, ColorMode.RGB)
  for index, frameSpec in ipairs(animation.renderFrames) do
    local image = frameSpec.image or source(frameSpec[1])
    strip:drawImage(image, Point((index - 1) * frameWidth, 0))
  end
  strip:saveAs(exportDir .. animation.name .. ".png")
end

for _, animation in ipairs(animations) do
  local first = frameCount + 1
  for _, frameSpec in ipairs(animation.renderFrames) do appendFrame(frameSpec) end
  local tag = sprite:newTag(first, frameCount)
  tag.name = animation.name
  tag.aniDir = AniDir.FORWARD
  exportStrip(animation)
end

app.activeSprite = sprite
sprite:saveAs(projectPath)
print("MewLink Aseprite master: " .. frameCount .. " frames, " .. #animations .. " tags")
