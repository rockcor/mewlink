import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { petHitAt } from './hitTest';

const rect = (left = 0, top = 0, width = 100, height = 100) => ({ left, top, width, height }) as DOMRect;
const point = { clientX: 25, clientY: 40 };
function canvas(alpha: number, hidden = false) {
  const read = vi.fn(() => ({ data: new Uint8ClampedArray([255, 220, 200, alpha]) }));
  return { width: 240, height: 240, hidden, read,
    getBoundingClientRect: () => rect(-10, -10, 120, 120),
    getContext: () => ({ getImageData: read }),
  };
}
function avatar(canvases: ReturnType<typeof canvas>[], sprites: unknown[] = []) {
  return { getBoundingClientRect: () => rect(), querySelectorAll: (selector: string) => selector === 'canvas' ? canvases : sprites } as unknown as HTMLElement;
}

beforeEach(() => vi.stubGlobal('getComputedStyle', (element: { hidden?: boolean }) => ({ visibility: element.hidden ? 'hidden' : 'visible' })));
afterEach(() => vi.unstubAllGlobals());

describe('pet artwork hit testing', () => {
  it('ignores transparent padding and faint shadows, but accepts the pup and desk', () => {
    expect(petHitAt(avatar([canvas(0)]), point)).toBe(false);
    expect(petHitAt(avatar([canvas(16)]), point)).toBe(false);
    expect(petHitAt(avatar([canvas(255)]), point)).toBe(true);
  });
  it('maps scaled, padded canvases back to their bitmap coordinates', () => {
    const bitmap = canvas(255);
    expect(petHitAt(avatar([bitmap]), point)).toBe(true);
    expect(bitmap.read).toHaveBeenCalledWith(70, 100, 1, 1);
  });
  it('does not activate the old headroom, even when the padded canvas extends into it', () => {
    const bitmap = canvas(255);
    expect(petHitAt(avatar([bitmap]), { clientX: 25, clientY: -5 })).toBe(false);
    expect(petHitAt(avatar([bitmap]), { clientX: 100, clientY: 40 })).toBe(false);
    expect(bitmap.read).not.toHaveBeenCalled();
  });
  it('ignores the hidden source pose during a hug and checks each visible layer', () => {
    const hidden = canvas(255, true);
    expect(petHitAt(avatar([hidden, canvas(0)]), point)).toBe(false);
    expect(hidden.read).not.toHaveBeenCalled();
    expect(petHitAt(avatar([canvas(0), canvas(255)]), point)).toBe(true);
  });
  it('does not make paused or unpainted canvases interactive', () => {
    const paused = canvas(255);
    paused.width = paused.height = 1;
    expect(petHitAt(avatar([paused]), point)).toBe(false);
    expect(petHitAt(avatar([canvas(0)]), point)).toBe(false);
  });
  it('keeps a compact fallback usable when an older WebKit refuses pixel access', () => {
    const bitmap = canvas(255);
    bitmap.read.mockImplementation(() => { throw new Error('Canvas read unavailable'); });
    expect(petHitAt(avatar([bitmap]), point)).toBe(true);
    expect(petHitAt(avatar([bitmap]), { clientX: 25, clientY: -5 })).toBe(false);
  });
  it('keeps the upper empty part of a desk inactive while its pup walks away', () => {
    const desk = { getBoundingClientRect: () => rect(), classList: { contains: (name: string) => name === 'hug-desk' } };
    expect(petHitAt(avatar([], [desk]), { clientX: 25, clientY: 20 })).toBe(false);
    expect(petHitAt(avatar([], [desk]), { clientX: 25, clientY: 60 })).toBe(true);
  });
});
