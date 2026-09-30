import { describe, expect, it } from 'vitest';
import { normalizeHugSenderPalette } from './hugPalette';

describe('idle hug base palette', () => {
  it('normalizes lilac ears to pink without shifting cream fur or alpha', () => {
    const pixels = new Uint8ClampedArray([200, 184, 216, 255, 255, 240, 212, 255, 255, 152, 160, 255, 16, 8, 16, 255, 200, 184, 216, 0]);
    normalizeHugSenderPalette(pixels);
    expect(pixels[0]).toBeGreaterThan(245);
    expect(pixels[1]).toBeGreaterThan(145);
    expect(pixels[1]).toBeLessThan(165);
    expect(pixels[2]).toBeLessThan(175);
    expect([...pixels.slice(3)]).toEqual([255, 255, 240, 212, 255, 255, 152, 160, 255, 16, 8, 16, 255, 200, 184, 216, 0]);
  });
});
