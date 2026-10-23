import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const frameWidth = 384;
const frameHeight = 256;
const workVisuals = ['code', 'document', 'web', 'ai', 'mewlink'];
const inputFrame = workVisuals.map(visual => `work-${visual}`);
const stressedInputFrame = workVisuals.map(visual => `work-${visual}-stress`);
// Approved artwork animated by art/aseprite/rig and exported by Aseprite.
const loopFrames = 24;
const transitionFrames = 32;
const twentyFourFrame = [
  'meeting', 'idle', 'rest',
  ...['work', 'meeting', 'idle', 'rest'].flatMap(state =>
    ['ceramic', 'tumbler', 'bottle'].map(style => `water-${state}-${style}`)),
  ...['ceramic', 'tumbler', 'bottle'].map(style => `water-drink-${style}`),
];
// Hugs in place (art/aseprite/build-hug-master.lua): the hug at the receiver's
// desk with a row per layer (receiver, visitor, blanket), the walker, and each
// scene's desk without its pup.
const hugLayout = JSON.parse(await readFile(path.resolve('src/pet/hugVisit.json'), 'utf8'));
const hugSheets = new Map([
  ...['work', 'meeting'].map(kind => [`hug-visit-${kind}`, { frames: hugLayout.hugFrames, rows: 2 }]),
  ...['blush', 'night', 'mint'].map(style => [`hug-visit-rest-${style}`, { frames: hugLayout.hugFrames, rows: 3 }]),
  ['hug-walker', { frames: hugLayout.walker.frames, rows: 1 }],
  ...[...workVisuals.map(visual => `work-${visual}`), 'meeting', 'rest'].map(scene => [`desk-${scene}`, { frames: 1, rows: 1 }]),
]);
const states = ['work', 'meeting', 'idle', 'rest'];
const transitionSpecs = states.flatMap(from => states.filter(to => to !== from).map(to => ({
  name: `transition-${from}-${to}`,
  from,
  to,
  fromWorkVisual: 'code',
  toWorkVisual: 'code',
})));
for (const state of states.filter(state => state !== 'work')) {
  for (const visual of workVisuals.filter(visual => visual !== 'code')) {
    transitionSpecs.push({ name: `transition-work-${visual}-${state}`, from: 'work', to: state, fromWorkVisual: visual, toWorkVisual: 'code' });
    transitionSpecs.push({ name: `transition-${state}-work-${visual}`, from: state, to: 'work', fromWorkVisual: 'code', toWorkVisual: visual });
  }
}
const expected = new Map([
  ...inputFrame.map(name => [name, 4]),
  ...stressedInputFrame.map(name => [name, 4]),
  ...twentyFourFrame.map(name => [name, loopFrames]),
  ...transitionSpecs.map(({ name }) => [name, transitionFrames]),
]);

const animationDir = path.resolve('public/pets/animations');

for (const [name, frames] of expected) {
  const filename = path.join(animationDir, `${name}.png`);
  const [metadata, info] = await Promise.all([sharp(filename).metadata(), stat(filename)]);
  const { width, height } = metadata;
  if (metadata.format !== 'png') throw new Error(`${name}: invalid PNG animation strip`);
  if (width !== frameWidth * frames || height !== frameHeight) {
    throw new Error(`${name}: expected ${frameWidth * frames}x${frameHeight}, got ${width}x${height}`);
  }
  if (!metadata.hasAlpha) throw new Error(`${name}: PNG has no alpha channel`);
  if (info.size < 1024) throw new Error(`${name}: suspiciously small export`);
}

for (const [name, { frames, rows }] of hugSheets) {
  const filename = path.join(animationDir, `${name}.png`);
  const metadata = await sharp(filename).metadata();
  if (metadata.width !== frameWidth * frames || metadata.height !== frameHeight * rows) {
    throw new Error(`${name}: expected ${frameWidth * frames}x${frameHeight * rows}, got ${metadata.width}x${metadata.height}`);
  }
  if (!metadata.hasAlpha) throw new Error(`${name}: PNG has no alpha channel`);
}

const decoded = new Map();

async function decodeRgba(name) {
  if (decoded.has(name)) return decoded.get(name);
  const { data: pixels, info } = await sharp(path.join(animationDir, `${name}.png`))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset + 3] === 0) pixels.fill(0, offset, offset + 3);
  }
  const result = { width, height, pixels };
  decoded.set(name, result);
  return result;
}

function framePixels(image, frameIndex) {
  const result = Buffer.alloc(frameWidth * frameHeight * 4);
  for (let y = 0; y < frameHeight; y += 1) {
    const sourceStart = (y * image.width + frameIndex * frameWidth) * 4;
    image.pixels.copy(result, y * frameWidth * 4, sourceStart, sourceStart + frameWidth * 4);
  }
  return result;
}

const workCode = await decodeRgba('work-code');
for (const visual of workVisuals.filter(visual => visual !== 'code')) {
  const variant = await decodeRgba(`work-${visual}`);
  let changedScreenPixels = 0;
  for (let frame = 0; frame < 4; frame += 1) {
    for (let y = 0; y < frameHeight; y += 1) {
      for (let x = 0; x < frameWidth; x += 1) {
        const baseOffset = (y * workCode.width + frame * frameWidth + x) * 4;
        const variantOffset = (y * variant.width + frame * frameWidth + x) * 4;
        const equal = workCode.pixels.subarray(baseOffset, baseOffset + 4).equals(variant.pixels.subarray(variantOffset, variantOffset + 4));
        const insideMonitor = x >= 55 && x <= 148 && y >= 116 && y <= 192;
        if (!insideMonitor && !equal) throw new Error(`work-${visual}: frame ${frame + 1} changed the pet rig outside the monitor at ${x},${y}`);
        if (insideMonitor && !equal) changedScreenPixels += 1;
      }
    }
  }
  if (changedScreenPixels < 100) throw new Error(`work-${visual}: monitor content is not visually distinct`);
}

for (const visual of workVisuals) {
  const normal = await decodeRgba(`work-${visual}`);
  const stressed = await decodeRgba(`work-${visual}-stress`);
  let changedEyePixels = 0;
  for (let frame = 0; frame < 4; frame += 1) {
    for (let y = 0; y < frameHeight; y += 1) {
      for (let x = 0; x < frameWidth; x += 1) {
        const offset = (y * normal.width + frame * frameWidth + x) * 4;
        if (normal.pixels.subarray(offset, offset + 4).equals(stressed.pixels.subarray(offset, offset + 4))) continue;
        const insideEyePatch = y >= 96 && y <= 114
          && ((x >= 197 && x <= 214) || (x >= 253 && x <= 270));
        if (!insideEyePatch) throw new Error(`work-${visual}-stress: frame ${frame + 1} changed the locked rig at ${x},${y}`);
        changedEyePixels += 1;
      }
    }
  }
  if (changedEyePixels < 80) throw new Error(`work-${visual}-stress: tense expression is not visually distinct`);
}

const stateAsset = state => state === 'work' ? 'work-code' : state;
for (const spec of transitionSpecs) {
  const transition = await decodeRgba(spec.name);
  const sourceName = spec.from === 'work' ? `work-${spec.fromWorkVisual}` : stateAsset(spec.from);
  const destinationName = spec.to === 'work' ? `work-${spec.toWorkVisual}` : stateAsset(spec.to);
  const source = await decodeRgba(sourceName);
  const destination = await decodeRgba(destinationName);
  const sourceFrame = spec.from === 'work' ? 0 : source.width / frameWidth - 1;
  if (!framePixels(transition, 0).equals(framePixels(source, sourceFrame))) {
    throw new Error(`${spec.name}: first frame does not equal ${sourceName} exit frame`);
  }
  if (!framePixels(transition, transitionFrames - 1).equals(framePixels(destination, 0))) {
    throw new Error(`${spec.name}: final frame does not equal ${destinationName} entry frame`);
  }
}

// Each pixel of a hug belongs to one pup (or the blanket), so each keeps its colours.
for (const [name, { frames, rows }] of hugSheets) {
  if (rows < 2) continue;
  const sheet = await decodeRgba(name);
  for (let y = 0; y < frameHeight; y += 1) {
    for (let x = 0; x < frameWidth * frames; x += 1) {
      let owners = 0;
      for (let row = 0; row < rows; row += 1) if (sheet.pixels[((row * frameHeight + y) * sheet.width + x) * 4 + 3]) owners += 1;
      if (owners > 1) throw new Error(`${name}: pixel ${x},${y} belongs to more than one layer`);
    }
  }
}

// An empty desk is its scene's desk: where it was not hidden by the pup, it is unchanged.
for (const scene of [...workVisuals.map(visual => `work-${visual}`), 'meeting', 'rest']) {
  const desk = await decodeRgba(`desk-${scene}`);
  const everyday = await decodeRgba(scene);
  let opaque = 0;
  let same = 0;
  for (let offset = 0; offset < frameWidth * frameHeight * 4; offset += 4) {
    if (!desk.pixels[offset + 3]) continue;
    opaque += 1;
    const y = Math.floor(offset / 4 / frameWidth);
    const x = offset / 4 % frameWidth;
    const source = (y * everyday.width + x) * 4;
    if (desk.pixels.subarray(offset, offset + 4).equals(everyday.pixels.subarray(source, source + 4))) same += 1;
  }
  if (same < opaque * (scene === 'rest' ? 0.4 : 0.85)) throw new Error(`desk-${scene}: moved away from its everyday desk (${same}/${opaque} pixels)`);
}

console.log(`Validated ${expected.size} Aseprite animation strips (${[...expected.values()].reduce((a, b) => a + b, 0)} frames), including exact transition endpoints, and ${hugSheets.size} hug sheets.`);
