-- MewLink activity-pose design sheet.
-- Four transparent 96x64 pixel-art frames: video, code, paper, meeting.

local output = app.params["output"]
if not output or output == "" then
  error("Pass --script-param output=/absolute/path/activity-designs-v1.aseprite")
end

local W, H = 96, 64
local sprite = Sprite(W, H, ColorMode.INDEXED)
sprite.transparentColor = 0
sprite.gridBounds = Rectangle(0, 0, 8, 8)

local palette = Palette(20)
local colors = {
  {0,0,0,0}, {57,20,58,255}, {105,37,73,255}, {255,238,203,255},
  {255,249,229,255}, {231,190,156,255}, {246,112,151,255}, {193,65,111,255},
  {255,176,196,255}, {73,17,55,255}, {177,43,99,255}, {255,118,161,255},
  {247,118,145,255}, {255,184,45,255}, {255,255,255,255}, {255,222,112,255},
  {55,205,231,255}, {137,236,244,255}, {218,205,207,255}, {95,45,91,255}
}
for index, rgba in ipairs(colors) do
  palette:setColor(index-1, Color{r=rgba[1],g=rgba[2],b=rgba[3],a=rgba[4]})
end
sprite:setPalette(palette)

local function image()
  local result = Image(sprite.spec)
  result:clear()
  return result
end

local function pixel(img,x,y,color)
  x,y=math.floor(x+0.5),math.floor(y+0.5)
  if x>=0 and x<W and y>=0 and y<H then img:drawPixel(x,y,color) end
end

local function rect(img,x,y,width,height,color)
  for py=y,y+height-1 do for px=x,x+width-1 do pixel(img,px,py,color) end end
end

local function line(img,x0,y0,x1,y1,color,thickness)
  x0,y0,x1,y1=math.floor(x0),math.floor(y0),math.floor(x1),math.floor(y1)
  local dx,sx=math.abs(x1-x0),x0<x1 and 1 or -1
  local dy,sy=-math.abs(y1-y0),y0<y1 and 1 or -1
  local err=dx+dy
  local radius=math.floor((thickness or 1)/2)
  while true do
    for oy=-radius,radius do for ox=-radius,radius do pixel(img,x0+ox,y0+oy,color) end end
    if x0==x1 and y0==y1 then break end
    local twice=2*err
    if twice>=dy then err=err+dy;x0=x0+sx end
    if twice<=dx then err=err+dx;y0=y0+sy end
  end
end

local function fillEllipse(img,cx,cy,rx,ry,angle,color)
  local radians=math.rad(angle or 0)
  local cosine,sine=math.cos(radians),math.sin(radians)
  local reach=math.ceil(math.max(rx,ry))
  for y=math.floor(cy-reach),math.ceil(cy+reach) do
    for x=math.floor(cx-reach),math.ceil(cx+reach) do
      local dx,dy=x-cx,y-cy
      local lx=dx*cosine+dy*sine
      local ly=-dx*sine+dy*cosine
      if (lx*lx)/(rx*rx)+(ly*ly)/(ry*ry)<=1 then pixel(img,x,y,color) end
    end
  end
end

local function ellipseWithOutline(img,cx,cy,rx,ry,angle,fill)
  fillEllipse(img,cx,cy,rx,ry,angle,1)
  fillEllipse(img,cx,cy,math.max(1,rx-1.5),math.max(1,ry-1.5),angle,fill)
end

local function fillPolygon(img,points,color)
  local minY,maxY=H,0
  for _,point in ipairs(points) do minY=math.min(minY,point[2]);maxY=math.max(maxY,point[2]) end
  for y=math.floor(minY),math.ceil(maxY) do
    local intersections,previous={},points[#points]
    for _,current in ipairs(points) do
      if (current[2]>y)~=(previous[2]>y) then
        table.insert(intersections,previous[1]+(y-previous[2])*(current[1]-previous[1])/(current[2]-previous[2]))
      end
      previous=current
    end
    table.sort(intersections)
    for i=1,#intersections-1,2 do
      for x=math.ceil(intersections[i]),math.floor(intersections[i+1]) do pixel(img,x,y,color) end
    end
  end
end

local function curvedLimb(img,x0,y0,cx,cy,x1,y1,radius)
  local function curve(color,r)
    for step=0,24 do
      local t=step/24
      local one=1-t
      local x=one*one*x0+2*one*t*cx+t*t*x1
      local y=one*one*y0+2*one*t*cy+t*t*y1
      fillEllipse(img,x,y,r,r,0,color)
    end
  end
  curve(1,radius)
  curve(3,radius-1.5)
end

local function drawBean(img,expression)
  ellipseWithOutline(img,21,42,7,6,0,6)
  fillEllipse(img,20,40,3,2,0,8)
  ellipseWithOutline(img,24,22,8,15,24,6)
  fillEllipse(img,22,18,3,7,24,8)
  ellipseWithOutline(img,72,22,8,15,-24,6)
  fillEllipse(img,74,18,3,7,-24,8)

  fillEllipse(img,48,25,22,20,0,1)
  rect(img,26,24,45,23,1)
  fillEllipse(img,48,47,22,9,0,1)
  fillEllipse(img,48,25,20,18,0,3)
  rect(img,28,24,41,22,3)
  fillEllipse(img,48,46,20,7,0,3)
  fillEllipse(img,41,18,9,7,-15,4)
  rect(img,29,39,2,7,5)
  rect(img,31,47,34,2,5)

  if expression=="relaxed" then
    line(img,37,27,42,27,1,1);line(img,54,27,59,27,1,1)
    pixel(img,39,26,1);pixel(img,57,26,1)
    rect(img,47,33,3,1,1);pixel(img,48,34,1)
    line(img,46,36,50,36,1,1)
  else
    if expression=="serious" or expression=="focus" then
      line(img,37,22,42,21,1,1);line(img,54,21,59,22,1,1)
    end
    fillEllipse(img,40,28,2.5,3,0,1);fillEllipse(img,56,28,2.5,3,0,1)
    pixel(img,39,27,14);pixel(img,55,27,14)
    rect(img,47,33,3,1,1);pixel(img,48,34,1)
    if expression=="serious" then
      rect(img,46,36,5,1,1)
    else
      line(img,46,36,50,36,1,1)
    end
  end
  fillEllipse(img,34,33,4,2,0,12);fillEllipse(img,62,33,4,2,0,12)
end

local function drawVideoBack(img)
  curvedLimb(img,36,39,31,44,31,50,5)
  curvedLimb(img,60,39,65,44,65,50,5)
end

local function drawVideoProp(img)
  rect(img,26,38,44,20,1)
  rect(img,28,40,40,15,9)
  rect(img,29,41,38,13,19)
  fillPolygon(img,{{44,43},{44,52},{52,47}},6)
  rect(img,31,42,2,2,16);rect(img,64,42,2,2,6)
  rect(img,42,56,12,1,2)
end

local function drawCodeArms(img)
  curvedLimb(img,35,39,29,40,29,47,5)
  curvedLimb(img,61,39,72,40,79,49,5)
  ellipseWithOutline(img,80,50,6,5,10,3)
end

local function drawCodeProp(img)
  rect(img,25,36,48,22,1)
  rect(img,28,39,42,16,9)
  rect(img,31,42,3,2,16);rect(img,36,42,14,2,16)
  rect(img,31,46,3,2,6);rect(img,36,46,20,2,6);rect(img,57,46,7,2,17)
  rect(img,31,50,3,2,16);rect(img,36,50,11,2,6);rect(img,49,50,16,2,16)
  fillPolygon(img,{{23,57},{75,57},{80,61},{19,61}},1)
  rect(img,27,58,45,1,10);rect(img,42,60,15,1,11)
  ellipseWithOutline(img,80,56,6,4,0,6)
  rect(img,80,53,1,3,1)
end

local function drawPaperArms(img)
  curvedLimb(img,35,39,28,44,24,51,5)
  curvedLimb(img,61,39,68,44,73,51,5)
  ellipseWithOutline(img,23,52,6,5,-8,3)
  ellipseWithOutline(img,74,52,6,5,8,3)
end

local function drawPaperProp(img)
  fillPolygon(img,{{21,36},{72,36},{76,58},{20,58}},1)
  fillPolygon(img,{{23,38},{69,38},{73,56},{22,56}},14)
  rect(img,27,49,3,5,16);rect(img,31,46,3,8,6);rect(img,35,43,3,11,13)
  rect(img,43,43,20,2,2);rect(img,43,48,23,2,2);rect(img,43,53,17,2,2)
  fillPolygon(img,{{67,38},{73,38},{73,45}},18)
  line(img,69,37,74,33,13,2);line(img,73,38,78,37,15,2)
end

local function drawMeetingBack(img)
  -- Headset band and ear cups sit over the locked bean silhouette.
  line(img,27,19,32,10,1,3);line(img,32,10,64,10,1,3);line(img,64,10,70,19,1,3)
  line(img,29,19,34,12,6,1);line(img,34,12,62,12,6,1);line(img,62,12,68,19,6,1)
  rect(img,24,22,6,13,1);rect(img,26,23,4,11,10)
  rect(img,67,22,6,13,1);rect(img,67,23,4,11,10)
  line(img,70,32,62,36,1,2);fillEllipse(img,61,36,3,2,0,6)
end

local function drawMeetingArms(img)
  curvedLimb(img,36,41,32,46,34,52,5)
  curvedLimb(img,61,40,72,34,80,21,5)
  ellipseWithOutline(img,80,19,6,6,-10,3)
end

local function drawMeetingProp(img)
  rect(img,30,42,39,17,1)
  rect(img,32,44,35,12,9)
  line(img,49,44,49,56,2,1)
  fillEllipse(img,41,48,3,3,0,16);rect(img,37,52,8,3,16)
  fillEllipse(img,57,48,3,3,0,6);rect(img,53,52,8,3,6)
  rect(img,46,59,8,2,1);rect(img,40,61,20,1,1)
end

local function drawAccents(img,state)
  if state=="video" then
    pixel(img,22,29,16);pixel(img,21,30,16);pixel(img,22,32,6);pixel(img,23,33,6)
  elseif state=="code" then
    line(img,85,45,89,42,13,2);line(img,86,50,91,50,15,2);line(img,85,55,89,58,13,2)
  elseif state=="meeting" then
    line(img,85,14,89,10,13,2);line(img,87,19,92,18,15,2)
  end
end

local body=sprite.layers[1];body.name="01 Bean + expression"
local back=sprite:newLayer();back.name="02 Headset + back props"
local arms=sprite:newLayer();arms.name="03 Complete arms"
local props=sprite:newLayer();props.name="04 Foreground props"
local accents=sprite:newLayer();accents.name="05 Motion accents"
for frameNumber=2,4 do sprite:newEmptyFrame(frameNumber) end

local states={
  {name="video",expression="relaxed"},
  {name="code",expression="focus"},
  {name="paper",expression="neutral"},
  {name="meeting",expression="serious"}
}

for frameNumber,state in ipairs(states) do
  sprite.frames[frameNumber].duration=0.18
  local bodyImage=image();drawBean(bodyImage,state.expression)
  sprite:newCel(body,frameNumber,bodyImage,Point(0,0))
  local backImage=image()
  local armsImage=image()
  local propsImage=image()
  if state.name=="video" then
    drawVideoBack(armsImage);drawVideoProp(propsImage)
  elseif state.name=="code" then
    drawCodeArms(armsImage);drawCodeProp(propsImage)
  elseif state.name=="paper" then
    drawPaperArms(armsImage);drawPaperProp(propsImage)
  else
    drawMeetingBack(backImage);drawMeetingArms(armsImage);drawMeetingProp(propsImage)
  end
  sprite:newCel(back,frameNumber,backImage,Point(0,0))
  sprite:newCel(arms,frameNumber,armsImage,Point(0,0))
  sprite:newCel(props,frameNumber,propsImage,Point(0,0))
  local marks=image();drawAccents(marks,state.name)
  sprite:newCel(accents,frameNumber,marks,Point(0,0))
  local tag=sprite:newTag(frameNumber,frameNumber);tag.name=state.name
end

sprite.data="MewLink activity pose designs v1 | video, code, paper, meeting | 96x64 | transparent indexed pixel art"
sprite:saveAs(output)
app.activeSprite=sprite
app.activeFrame=sprite.frames[1]
app.activeLayer=props
app.refresh()

