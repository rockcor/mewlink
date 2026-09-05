import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const frameWidth = 384;
const frameHeight = 256;
const fourFrame = [
  'work-code', 'work-document', 'work-web', 'meeting', 'leisure', 'idle', 'rest',
  ...['work', 'meeting', 'leisure', 'idle', 'rest'].flatMap(state =>
    ['ceramic', 'tumbler', 'bottle'].map(style => `water-${state}-${style}`)),
  ...['ceramic', 'tumbler', 'bottle'].map(style => `water-drink-${style}`),
  'hug-work', 'hug-meeting', 'hug-leisure', 'hug-idle',
  ...['blush', 'night', 'mint'].map(style => `hug-rest-${style}`),
];
const states = ['work', 'meeting', 'leisure', 'idle', 'rest'];
const sixFrame = states.flatMap(from => states.filter(to => to !== from).map(to => `transition-${from}-${to}`));
const expected = new Map([
  ...fourFrame.map(name => [name, 4]),
  ...sixFrame.map(name => [name, 6]),
  ['website-replay', 12],
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

console.log(`Validated ${expected.size} Aseprite animation strips (${[...expected.values()].reduce((a, b) => a + b, 0)} frames).`);
