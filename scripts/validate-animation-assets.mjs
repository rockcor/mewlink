import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

const frameWidth = 384;
const frameHeight = 256;
const workVisuals = ['code', 'document', 'web', 'ai', 'mewlink'];
const inputFrame = workVisuals.map(visual => `work-${visual}`);
const stressedInputFrame = workVisuals.map(visual => `work-${visual}-stress`);
const eightFrame = [
  'meeting', 'leisure', 'idle', 'rest',
  ...['work', 'meeting', 'leisure', 'idle', 'rest'].flatMap(state =>
    ['ceramic', 'tumbler', 'bottle'].map(style => `water-${state}-${style}`)),
  ...['ceramic', 'tumbler', 'bottle'].map(style => `water-drink-${style}`),
  'hug-work', 'hug-meeting', 'hug-leisure', 'hug-idle',
  ...['blush', 'night', 'mint'].map(style => `hug-rest-${style}`),
];
const states = ['work', 'meeting', 'leisure', 'idle', 'rest'];
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
  ...eightFrame.map(name => [name, 8]),
  ...transitionSpecs.map(({ name }) => [name, 13]),
  ['website-replay', 24],
]);

const animationDir = path.resolve('public/pets/animations');
const pngSignature = '89504e470d0a1a0a';

for (const [name, frames] of expected) {
  const filename = path.join(animationDir, `${name}.png`);
  const [contents, info] = await Promise.all([readFile(filename), stat(filename)]);
  if (contents.subarray(0, 8).toString('hex') !== pngSignature) throw new Error(`${name}: invalid PNG signature`);
  const width = contents.readUInt32BE(16);
  const height = contents.readUInt32BE(20);
  const colorType = contents[25];
  if (width !== frameWidth * frames || height !== frameHeight) {
    throw new Error(`${name}: expected ${frameWidth * frames}x${frameHeight}, got ${width}x${height}`);
  }
  if (colorType !== 6 && colorType !== 4) throw new Error(`${name}: PNG has no alpha channel`);
  if (info.size < 1024) throw new Error(`${name}: suspiciously small export`);
}

const decoded = new Map();
const paeth = (left, up, upperLeft) => {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  return leftDistance <= upDistance && leftDistance <= upperLeftDistance ? left : upDistance <= upperLeftDistance ? up : upperLeft;
};

async function decodeRgba(name) {
  if (decoded.has(name)) return decoded.get(name);
  const contents = await readFile(path.join(animationDir, `${name}.png`));
  const width = contents.readUInt32BE(16);
  const height = contents.readUInt32BE(20);
  if (contents[24] !== 8 || contents[25] !== 6 || contents[28] !== 0) throw new Error(`${name}: continuity check requires non-interlaced 8-bit RGBA`);
  const chunks = [];
  for (let offset = 8; offset < contents.length;) {
    const length = contents.readUInt32BE(offset);
    const type = contents.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') chunks.push(contents.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === 'IEND') break;
  }
  const packed = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = y * (stride + 1);
    const targetOffset = y * stride;
    const filter = packed[sourceOffset];
    for (let x = 0; x < stride; x += 1) {
      const raw = packed[sourceOffset + x + 1];
      const left = x >= 4 ? pixels[targetOffset + x - 4] : 0;
      const up = y > 0 ? pixels[targetOffset + x - stride] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[targetOffset + x - stride - 4] : 0;
      const value = filter === 0 ? raw
        : filter === 1 ? raw + left
          : filter === 2 ? raw + up
            : filter === 3 ? raw + Math.floor((left + up) / 2)
              : filter === 4 ? raw + paeth(left, up, upperLeft)
                : Number.NaN;
      if (Number.isNaN(value)) throw new Error(`${name}: unsupported PNG filter ${filter}`);
      pixels[targetOffset + x] = value & 0xff;
    }
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
  if (!framePixels(transition, 12).equals(framePixels(destination, 0))) {
    throw new Error(`${spec.name}: final frame does not equal ${destinationName} entry frame`);
  }
}

console.log(`Validated ${expected.size} Aseprite animation strips (${[...expected.values()].reduce((a, b) => a + b, 0)} frames), including exact transition endpoints.`);
