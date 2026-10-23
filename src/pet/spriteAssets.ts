import { BitmapCache, type CachedBitmap } from './bitmapCache';

export const SOURCE_FRAME_WIDTH = 384;
export const SOURCE_FRAME_HEIGHT = 256;
export interface SpriteSheet extends CachedBitmap { image: CanvasImageSource; frames: number }

// Decoded bytes, not PNG size. The 24- and 32-frame Aseprite strips decode to
// 9 MB (loops, interactions) and 12 MB (transitions); both pets mid-transition
// plus an interaction need about 53 MB. Low-memory mode still drops unused sheets.
export const SPRITE_CACHE_BUDGET_BYTES = 64 * 1024 * 1024;
export async function loadSpriteSheet(name: string): Promise<SpriteSheet> {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid sprite name');
  // WKWebView can display tauri:// images but cannot fetch that custom scheme.
  // Loading the image directly keeps the per-pet canvas masks working on macOS
  // instead of silently falling back to a single, whole-strip CSS skin.
  const image = new Image();
  try {
    image.src = `/pets/animations/${name}.png`;
    await image.decode();
    if (!image.width || image.width % SOURCE_FRAME_WIDTH !== 0 || image.height !== SOURCE_FRAME_HEIGHT) {
      throw new Error('Invalid sprite dimensions');
    }
    if (typeof createImageBitmap === 'function') {
      // Some WebKit versions expose the API but reject an otherwise usable
      // image source. The decoded image itself is still a CanvasImageSource.
      try {
        const bitmap = await createImageBitmap(image);
        image.src = '';
        return { image: bitmap, frames: bitmap.width / SOURCE_FRAME_WIDTH, bytes: bitmap.width * bitmap.height * 4, dispose: () => bitmap.close() };
      } catch { /* Keep the decoded image on older WebKit. */ }
    }
    return { image, frames: image.width / SOURCE_FRAME_WIDTH, bytes: image.width * image.height * 4, dispose: () => { image.src = ''; } };
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
  const interaction = classes.find(name => name.startsWith('water-') || name.startsWith('hug-'));
  if (interaction?.startsWith('water-')) return `${interaction}-${classes.find(name => name.startsWith('cup-'))?.slice(4) ?? 'ceramic'}`;
  if (interaction === 'hug-rest') return `${interaction}-${classes.find(name => name.startsWith('blanket-'))?.slice(8) ?? 'blush'}`;
  if (interaction) return interaction;
  const work = classes.find(name => name.startsWith('work-'));
  if (work) return `${work}${classes.includes('input-stressed') ? '-stress' : ''}`;
  return classes.find(name => ['meeting', 'idle', 'rest'].includes(name)) ?? 'idle';
}

export function frameFromPosition(position: string, count: number): number {
  const percent = Number.parseFloat(position) || 0;
  return Math.max(0, Math.min(count - 1, Math.round(percent / 100 * (count - 1))));
}
