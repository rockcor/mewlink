import { BitmapCache, type CachedBitmap } from './bitmapCache';

export const SOURCE_FRAME_WIDTH = 384;
export const SOURCE_FRAME_HEIGHT = 256;
/** A layered sheet has a row per layer: a hug (hug-visit-*) the receiver, the visitor and maybe a blanket; a tucked-in pup (rest-tucked-*) the pup and its blanket. */
export interface SpriteSheet extends CachedBitmap { image: CanvasImageSource; frames: number; layers: number }

// Decoded bytes, not PNG size. The 24- and 32-frame Aseprite strips decode to
// 9 MB (loops, cups) and 12 MB (transitions); a hug decodes to 19 MB (two
// layers) or 28 MB (tucking in: three). Both pets mid-transition during a hug
// need about 72 MB. Low-memory mode still drops unused sheets.
export const SPRITE_CACHE_BUDGET_BYTES = 76 * 1024 * 1024;
/** A hug sheet has up to three rows of layers; everything else is one row of frames. */
const MAX_LAYERS = 3;
export async function loadSpriteSheet(name: string): Promise<SpriteSheet> {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid sprite name');
  // WKWebView can display tauri:// images but cannot fetch that custom scheme.
  // Loading the image directly keeps the per-pet canvas masks working on macOS
  // instead of silently falling back to a single, whole-strip CSS skin.
  const image = new Image();
  try {
    image.src = `/pets/animations/${name}.png`;
    await image.decode();
    const layers = image.height / SOURCE_FRAME_HEIGHT;
    if (!image.width || image.width % SOURCE_FRAME_WIDTH !== 0 || !Number.isInteger(layers) || layers < 1 || layers > MAX_LAYERS) {
      throw new Error('Invalid sprite dimensions');
    }
    if (typeof createImageBitmap === 'function') {
      // Some WebKit versions expose the API but reject an otherwise usable
      // image source. The decoded image itself is still a CanvasImageSource.
      try {
        const bitmap = await createImageBitmap(image);
        image.src = '';
        return { image: bitmap, frames: bitmap.width / SOURCE_FRAME_WIDTH, layers, bytes: bitmap.width * bitmap.height * 4, dispose: () => bitmap.close() };
      } catch { /* Keep the decoded image on older WebKit. */ }
    }
    return { image, frames: image.width / SOURCE_FRAME_WIDTH, layers, bytes: image.width * image.height * 4, dispose: () => { image.src = ''; } };
  } catch (error) {
    image.src = '';
    throw error;
  }
}
export const spriteSheets = new BitmapCache<SpriteSheet>(SPRITE_CACHE_BUDGET_BYTES, loadSpriteSheet);

export async function preloadSprite(name: string) {
  const lease = spriteSheets.acquire(name);
  try { await lease.ready; } finally { lease.release(); }
}

export function spriteAssetFor(className: string): string {
  const classes = className.split(/\s+/);
  const transition = classes.find(name => name.startsWith('transition-') && name !== 'transition-source-frame');
  if (transition) return transition;
  const desk = classes.find(name => name.startsWith('desk-'));
  if (desk) return desk;
  const visit = classes.find(name => name.startsWith('hug-visit-'));
  if (visit) return visit;
  const interaction = classes.find(name => name.startsWith('water-'));
  if (interaction) return `${interaction}-${classes.find(name => name.startsWith('cup-'))?.slice(4) ?? 'ceramic'}`;
  const work = classes.find(name => name.startsWith('work-'));
  if (work) return `${work}${classes.includes('input-stressed') ? '-stress' : ''}`;
  const loop = classes.find(name => ['meeting', 'idle', 'rest'].includes(name)) ?? 'idle';
  // Asleep (idle sleeps too) under the blanket a hug left on it.
  const tucked = classes.find(name => name.startsWith('tucked-'));
  return tucked && loop !== 'meeting' ? `rest-${tucked}` : loop;
}

export function frameFromPosition(position: string, count: number): number {
  const percent = Number.parseFloat(position) || 0;
  return Math.max(0, Math.min(count - 1, Math.round(percent / 100 * (count - 1))));
}
