import { BitmapCache, type CachedBitmap } from './bitmapCache';

export const SOURCE_FRAME_WIDTH = 384;
export const SOURCE_FRAME_HEIGHT = 256;
export interface SpriteSheet extends CachedBitmap { image: CanvasImageSource; frames: number }

// Decoded bytes, not PNG size. The 24- and 32-frame Aseprite strips decode to
// 9 MB (loops, interactions) and 12 MB (transitions); both pets mid-transition
// plus an interaction need about 53 MB. Low-memory mode still drops unused sheets.
export const SPRITE_CACHE_BUDGET_BYTES = 64 * 1024 * 1024;
export const spriteSheets = new BitmapCache<SpriteSheet>(SPRITE_CACHE_BUDGET_BYTES, async name => {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid sprite name');
  const response = await fetch(`/pets/animations/${name}.png`);
  if (!response.ok) throw new Error('Sprite unavailable');
  const blob = await response.blob();
  if (typeof createImageBitmap === 'function') {
    const image = await createImageBitmap(blob);
    return { image, frames: image.width / SOURCE_FRAME_WIDTH, bytes: image.width * image.height * 4, dispose: () => image.close() };
  }
  const image = new Image();
  const url = URL.createObjectURL(blob);
  try {
    image.src = url;
    await image.decode();
    return { image, frames: image.width / SOURCE_FRAME_WIDTH, bytes: image.width * image.height * 4, dispose: () => { image.src = ''; } };
  } finally { URL.revokeObjectURL(url); }
});

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
  return classes.find(name => ['meeting', 'leisure', 'idle', 'rest'].includes(name)) ?? 'idle';
}

export function frameFromPosition(position: string, count: number): number {
  const percent = Number.parseFloat(position) || 0;
  return Math.max(0, Math.min(count - 1, Math.round(percent / 100 * (count - 1))));
}
