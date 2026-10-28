// Rebuild the README GIFs from the app's exported Aseprite sheets and hug plan.
// Run from the repository root: node scripts/build-readme-previews.mjs
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { createServer } from 'vite';

const W = 384, H = 256;
const background = '#fffaf5';
const output = 'docs/previews';
const sheets = new Map();
const frames = new Map();

async function sheet(name) {
  if (!sheets.has(name)) {
    sheets.set(name, sharp(`public/pets/animations/${name}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
  }
  return sheets.get(name);
}

// Match the app's lavender filter; all scene props get the same palette.
function lavender(pixels) {
  const radians = 292 * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians);
  const matrix = [
    [.213 + c * .787 - s * .213, .715 - c * .715 - s * .715, .072 - c * .072 + s * .928],
    [.213 - c * .213 + s * .143, .715 + c * .285 + s * .140, .072 - c * .072 - s * .283],
    [.213 - c * .213 - s * .787, .715 - c * .715 + s * .715, .072 + c * .928 + s * .072],
  ];
  const clamp = value => Math.max(0, Math.min(255, value));
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (!pixels[offset + 3]) continue;
    const rgb = [...pixels.subarray(offset, offset + 3)];
    const hue = matrix.map(row => clamp(row.reduce((sum, value, index) => sum + value * rgb[index], 0)));
    const gray = hue[0] * .213 + hue[1] * .715 + hue[2] * .072;
    for (let channel = 0; channel < 3; channel++) {
      const saturated = clamp(gray + 1.35 * (hue[channel] - gray));
      pixels[offset + channel] = Math.round(clamp((clamp(saturated * 1.015) - 127.5) * 1.045 + 127.5));
    }
  }
  return pixels;
}

async function frame(name, index = 0, row = 0, skin = 'cream') {
  const key = `${name}:${index}:${row}:${skin}`;
  if (!frames.has(key)) {
    const source = await sheet(name);
    assert(index >= 0 && index < source.info.width / W, `Missing frame ${key}`);
    assert(row >= 0 && row < source.info.height / H, `Missing layer ${key}`);
    const raw = Buffer.alloc(W * H * 4);
    for (let y = 0; y < H; y++) {
      source.data.copy(raw, y * W * 4, ((row * H + y) * source.info.width + index * W) * 4,
        ((row * H + y) * source.info.width + (index + 1) * W) * 4);
    }
    frames.set(key, await sharp(skin === 'lavender' ? lavender(raw) : raw, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer());
  }
  return frames.get(key);
}

async function stage(overlays, width = W, height = H) {
  return sharp({ create: { width, height, channels: 4, background } }).composite(overlays).raw().toBuffer();
}

async function gif(name, images, delays, width = W, height = H) {
  assert.equal(images.length, delays.length);
  await sharp(Buffer.concat(images), { raw: { width, height: height * images.length, channels: 4, pageHeight: height } })
    .gif({ loop: 0, delay: delays, dither: 0, colours: 256, effort: 7 })
    .toFile(`${output}/${name}.gif`);
  const metadata = await sharp(`${output}/${name}.gif`, { animated: true }).metadata();
  assert.equal(metadata.width, width);
  assert.equal(metadata.pageHeight, height);
  assert(metadata.pages > 1);
  console.log(`${name}.gif: ${metadata.pages} frames, ${metadata.delay.reduce((sum, delay) => sum + delay, 0)} ms`);
}

async function sequence(name, parts) {
  const images = [], delays = [];
  for (const { asset, indices, delay, skin = 'cream' } of parts) {
    for (const index of indices) {
      images.push(await stage([{ input: await frame(asset, index, 0, skin), left: 0, top: 0 }]));
      delays.push(delay);
    }
  }
  await gif(name, images, delays);
}

const range = length => Array.from({ length }, (_, index) => index);
const strip = (asset, count, delay, skin) => ({ asset, indices: range(count), delay, skin });
const hold = (asset, delay, skin) => ({ asset, indices: [0], delay, skin });

await mkdir(output, { recursive: true });
await sequence('work', ['code', 'document', 'web', 'ai', 'mewlink'].flatMap(visual => [
  hold(`work-${visual}`, 600),
  { asset: `work-${visual}`, indices: [1, 0, 1, 0, 3, 2, 0, 2, 0, 1, 0], delay: 120 },
]));
await sequence('meeting', [
  hold('work-code', 900), strip('transition-work-meeting', 32, 150),
  strip('meeting', 24, 110), strip('meeting', 24, 110),
  strip('transition-meeting-work', 32, 150), hold('work-code', 900),
]);
await sequence('water', [
  hold('work-code', 900), strip('water-work-ceramic', 24, 125),
  { asset: 'water-work-ceramic', indices: [23], delay: 1700 },
]);
await sequence('replay', [
  hold('work-document', 900, 'lavender'),
  strip('transition-work-document-meeting', 32, 70, 'lavender'),
  strip('meeting', 24, 80, 'lavender'), strip('transition-meeting-rest', 32, 70, 'lavender'),
  strip('rest', 24, 100, 'lavender'), strip('transition-rest-work-ai', 32, 70, 'lavender'),
  hold('work-ai', 1200, 'lavender'),
]);

// Load the actual app choreography, rather than maintaining a second walk.
const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null } });
try {
  const { planHug, hugPhase, seatOf, visitSpotOf, FRAME_TO_CSS, HUG_FRAME_MS } = await server.ssrLoadModule('/src/pet/hugVisit.ts');
  const layout = JSON.parse(await readFile('src/pet/hugVisit.json', 'utf8'));
  const plan = planHug({ sender: 'self', senderScene: 'work', receiverScene: 'work',
    seat: seatOf('work', 'code'), spot: visitSpotOf('work'), geometry: { selfScale: 1, partnerScale: 1, distance: 212 } });
  const zoom = 1 / FRAME_TO_CSS, origin = 24, floor = 285;
  const left = Math.round(origin - 2 * zoom), right = Math.round(left + 212 * zoom);
  const top = floor - Math.round(6 * zoom) - H;
  const images = [], delays = [];
  const width = 840, height = 320;
  async function pair(elapsed) {
    const phase = hugPhase(plan, elapsed);
    const overlays = [];
    const walker = [...plan.frames].reverse().find(pose => pose.at <= elapsed);
    if (phase.senderAway && walker?.shown) {
      const anchor = layout.walker.anchor;
      const raw = await frame('hug-walker', walker.frame);
      const walkerWidth = Math.max(1, Math.round(W * walker.squash));
      let transformed = sharp(raw).resize(walkerWidth, H, { kernel: 'nearest' });
      if (walker.facing === -1) transformed = transformed.flop();
      const anchorX = (walker.facing === -1 ? W - anchor[0] : anchor[0]) * walker.squash;
      const walkerLeft = Math.round(origin + walker.x * zoom - anchorX);
      const walkerTop = Math.round(floor - walker.y * zoom - anchor[1]);
      // The part below the desk's floor is hidden as the pup gets up/sits down.
      const clipHeight = Math.min(H, height - walkerTop, walker.sink ? anchor[1] - walker.sink : H);
      if (clipHeight > 0) overlays.push({ input: await transformed.extract({ left: 0, top: 0, width: walkerWidth, height: clipHeight }).png().toBuffer(),
        left: walkerLeft, top: walkerTop });
    }
    overlays.push({ input: await frame(phase.senderAway ? 'desk-work-code' : 'work-code'), left, top });
    if (phase.hosting) {
      const index = Math.min(layout.hugFrames - 1, Math.floor((elapsed - plan.host[0]) / HUG_FRAME_MS));
      const x = right + layout.window;
      overlays.push({ input: await frame('hug-visit-work', index, 0, 'lavender'), left: x, top });
      overlays.push({ input: await frame('hug-visit-work', index, 1), left: x, top });
      overlays.push({ input: await frame('desk-work-code', 0, 0, 'lavender'), left: right, top });
    } else overlays.push({ input: await frame('work-code', 0, 0, 'lavender'), left: right, top });
    return stage(overlays, width, height);
  }
  images.push(await pair(-1)); delays.push(800);
  for (let elapsed = 0; elapsed < plan.duration; elapsed += 100) {
    images.push(await pair(elapsed)); delays.push(100);
  }
  images.push(await pair(plan.duration)); delays.push(1200);
  await gif('hug', images, delays, width, height);
} finally {
  await server.close();
}
