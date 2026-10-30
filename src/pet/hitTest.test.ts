import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { petHitAt, registerSpritePixels } from './hitTest';
import type { SpriteSheet } from './spriteAssets';

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
  it('uses painted overhang pixels rather than clipping to the button rectangle', () => {
    const bitmap = canvas(255);
    expect(petHitAt(avatar([bitmap]), { clientX: 25, clientY: -5 })).toBe(true);
    bitmap.read.mockClear();
    expect(petHitAt(avatar([bitmap]), { clientX: 25, clientY: -20 })).toBe(false);
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
  it('never falls back to a rectangle when a pixel read fails', () => {
    const bitmap = canvas(255);
    bitmap.read.mockImplementation(() => { throw new Error('Canvas read unavailable'); });
    expect(petHitAt(avatar([bitmap]), point)).toBe(false);
    expect(petHitAt(avatar([bitmap]), { clientX: 25, clientY: -5 })).toBe(false);
  });
  it('does not guess a hit rectangle for a CSS-only image with no pixel sampler', () => {
    const desk = { getBoundingClientRect: () => rect(), classList: { contains: (name: string) => name === 'hug-desk' } };
    expect(petHitAt(avatar([], [desk]), { clientX: 25, clientY: 20 })).toBe(false);
    expect(petHitAt(avatar([], [desk]), { clientX: 25, clientY: 60 })).toBe(false);
  });

  it('checks a rotated timer against its actual pixels, not its bounding box corners', () => {
    const timer = { ...canvas(255), offsetWidth: 100, offsetHeight: 100,
      getBoundingClientRect: () => rect(0, 0, 141.421, 141.421) };
    vi.stubGlobal('getComputedStyle', () => ({ visibility: 'visible', transform: 'matrix(.707107,.707107,-.707107,.707107,0,0)' }));
    expect(petHitAt(avatar([timer]), { clientX: 1, clientY: 1 })).toBe(false);
    expect(petHitAt(avatar([timer]), { clientX: 70, clientY: 70 })).toBe(true);
  });

  it('does not hit a canvas inside an invisible ancestor', () => {
    const bitmap = { ...canvas(255), parentElement: { parentElement: null } };
    vi.stubGlobal('getComputedStyle', (node: unknown) => ({ visibility: 'visible', opacity: node === bitmap ? '1' : '0' }));
    expect(petHitAt(avatar([bitmap]), point)).toBe(false);
  });

  it('follows the current source frame and unregisters without a box fallback', () => {
    let alpha = 0, frame = 0;
    const context = { clearRect: vi.fn(), drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, alpha]) }) };
    vi.stubGlobal('document', { createElement: () => ({ width: 1, height: 1, getContext: () => context }) });
    const node = { getBoundingClientRect: () => rect(), parentElement: null } as unknown as HTMLElement;
    const sheet = { image: {}, frames: 2, layers: 1 } as SpriteSheet;
    const stop = registerSpritePixels(node, sheet, () => frame);
    expect(petHitAt(avatar([], [node]), point)).toBe(false);
    frame = 1; alpha = 255;
    expect(petHitAt(avatar([], [node]), point)).toBe(true);
    expect(context.drawImage).toHaveBeenLastCalledWith(sheet.image, 480, 102, 1, 1, 0, 0, 1, 1);
    stop();
    expect(petHitAt(avatar([], [node]), point)).toBe(false);
  });

  it('maps a left-right flipped frame to its mirrored pixel', () => {
    const bitmap = canvas(255);
    vi.stubGlobal('getComputedStyle', () => ({ visibility: 'visible', transform: 'matrix(-1,0,0,1,0,0)' }));
    expect(petHitAt(avatar([bitmap]), { clientX: 20, clientY: 40 })).toBe(true);
    expect(bitmap.read).toHaveBeenCalledWith(180, 100, 1, 1);
  });
});
