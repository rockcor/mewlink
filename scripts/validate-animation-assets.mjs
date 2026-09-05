import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const frameWidth = 384;
const frameHeight = 256;
const fourFrame = ['video', 'reading', 'meeting', 'browsing', 'idle', 'rest', 'coding-input', 'water', 'hug'];
const directTransitions = [
  'transition-video-coding',
  'transition-coding-reading',
  'transition-reading-meeting',
  'transition-meeting-video',
  'transition-video-browsing',
  'transition-browsing-rest',
  'transition-rest-coding',
];
const states = ['video', 'coding', 'reading', 'meeting', 'browsing', 'idle', 'rest'];
const threeFrame = [
  ...directTransitions,
  ...states.flatMap(state => [`transition-out-${state}`, `transition-in-${state}`]),
];
const expected = new Map([
  ...fourFrame.map(name => [name, 4]),
  ...threeFrame.map(name => [name, 3]),
  ['website-replay', 18],
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
