import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSpriteSheet } from './spriteAssets';

class DecodedImage {
  static last: DecodedImage;
  width = 384 * 40;
  height = 256;
  src = '';
  decode = vi.fn(async () => undefined);
  constructor() { DecodedImage.last = this; }
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('local sprite image loading', () => {
  it('loads custom-scheme images without fetch, blob URLs or bitmap support', async () => {
    vi.stubGlobal('Image', DecodedImage);
    vi.stubGlobal('createImageBitmap', undefined);
    const fetcher = vi.fn(() => { throw new TypeError('Load failed'); });
    vi.stubGlobal('fetch', fetcher);
    const sheet = await loadSpriteSheet('hug-visit-work');
    expect(fetcher).not.toHaveBeenCalled();
    expect(DecodedImage.last.src).toBe('/pets/animations/hug-visit-work.png');
    expect(DecodedImage.last.decode).toHaveBeenCalledOnce();
    expect(sheet).toMatchObject({ image: DecodedImage.last, frames: 40, layers: 1, bytes: 384 * 40 * 256 * 4 });
    sheet.dispose();
    expect(DecodedImage.last.src).toBe('');
  });

  it('uses and releases an ImageBitmap where supported', async () => {
    vi.stubGlobal('Image', DecodedImage);
    const bitmap = { width: 384 * 40, height: 256, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
    const sheet = await loadSpriteSheet('hug-visit-rest-blush');
    expect(sheet.image).toBe(bitmap);
    expect(DecodedImage.last.src).toBe('');
    sheet.dispose();
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('keeps the decoded image when WebKit rejects createImageBitmap', async () => {
    vi.stubGlobal('Image', DecodedImage);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new TypeError('Unsupported source'); }));
    const sheet = await loadSpriteSheet('hug-visit-work');
    expect(sheet.image).toBe(DecodedImage.last);
    expect(DecodedImage.last.src).toBe('/pets/animations/hug-visit-work.png');
  });

  it('rejects invalid names before constructing an image', async () => {
    const image = vi.fn();
    vi.stubGlobal('Image', image);
    await expect(loadSpriteSheet('../secret')).rejects.toThrow('Invalid sprite name');
    expect(image).not.toHaveBeenCalled();
  });

  it('releases failed image decodes', async () => {
    class FailedImage extends DecodedImage {
      decode = vi.fn(async () => { throw new TypeError('Load failed'); });
    }
    vi.stubGlobal('Image', FailedImage);
    await expect(loadSpriteSheet('hug-visit-work')).rejects.toThrow('Load failed');
    expect(DecodedImage.last.src).toBe('');
  });

  it('rejects malformed strips and releases their source', async () => {
    class BadImage extends DecodedImage { width = 383; }
    vi.stubGlobal('Image', BadImage);
    await expect(loadSpriteSheet('hug-visit-work')).rejects.toThrow('Invalid sprite dimensions');
    expect(DecodedImage.last.src).toBe('');
    class TallImage extends DecodedImage { height = 256 * 4; }
    vi.stubGlobal('Image', TallImage);
    await expect(loadSpriteSheet('hug-visit-work')).rejects.toThrow('Invalid sprite dimensions');
  });

  it('reads a hug sheet\u2019s rows as its layers (receiver, visitor, blanket)', async () => {
    class LayeredImage extends DecodedImage { width = 384 * 24; height = 256 * 3; }
    vi.stubGlobal('Image', LayeredImage);
    vi.stubGlobal('createImageBitmap', undefined);
    expect(await loadSpriteSheet('hug-visit-rest-mint')).toMatchObject({ frames: 24, layers: 3 });
  });
});
