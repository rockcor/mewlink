import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackPixelPointer, visiblePixelHit } from './pixelPointer';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('getComputedStyle', (node: { opacity?: string }) => ({ visibility: 'visible', opacity: node.opacity ?? '1' }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('visible pixel input policy', () => {
  it('ignores a hidden menu at the same coordinates that accept a shown button', () => {
    let visible = false;
    const menu = { classList: { contains: () => visible } };
    const button = { parentElement: null, classList: { contains: () => false },
      closest: (selector: string) => selector === '.hover-ui' ? menu : selector === '.pet-avatar' ? null : button };
    const element = { closest: () => button };
    const doc = { elementsFromPoint: () => [element], querySelectorAll: () => [] } as unknown as Document;
    expect(visiblePixelHit(doc, { clientX: 20, clientY: 20 })).toBeUndefined();
    visible = true;
    expect(visiblePixelHit(doc, { clientX: 20, clientY: 20 })).toBe('menu');
  });

  it('passes empty native-window space through; hovering the pup restores input without mouseenter', async () => {
    let target: 'self' | undefined;
    const capture = vi.fn(async () => undefined), hover = vi.fn();
    const stop = trackPixelPointer({ position: async () => ({ clientX: 20, clientY: 20 }),
      capture, hover, hit: () => target });
    await vi.advanceTimersByTimeAsync(1);
    expect(capture).toHaveBeenLastCalledWith(false);
    target = 'self';
    await vi.advanceTimersByTimeAsync(16);
    expect(capture).toHaveBeenLastCalledWith(true);
    expect(hover).toHaveBeenLastCalledWith('self');
    target = undefined;
    await vi.advanceTimersByTimeAsync(16);
    expect(capture).toHaveBeenLastCalledWith(false);
    stop();
  });

  it('never overlaps probes and discards a response after unmount', async () => {
    let resolve!: (point: { clientX: number; clientY: number }) => void;
    const position = vi.fn(() => new Promise<{ clientX: number; clientY: number }>(done => { resolve = done; }));
    const capture = vi.fn(async () => undefined);
    const stop = trackPixelPointer({ position, capture, hover: vi.fn(), hit: () => 'self' });
    await vi.advanceTimersByTimeAsync(500);
    expect(position).toHaveBeenCalledTimes(1);
    stop();
    resolve({ clientX: 20, clientY: 20 });
    await vi.advanceTimersByTimeAsync(500);
    expect(capture).not.toHaveBeenCalled();
  });

  it('does not repeatedly toggle native input while the cursor stays over the same artwork', async () => {
    const capture = vi.fn(async () => undefined);
    const stop = trackPixelPointer({ position: async () => ({ clientX: 20, clientY: 20 }),
      capture, hover: vi.fn(), hit: () => 'self' });
    await vi.advanceTimersByTimeAsync(160);
    expect(capture).toHaveBeenCalledTimes(1);
    stop();
  });

  it('fails open to the background if coordinate sampling breaks', async () => {
    const capture = vi.fn(async () => undefined);
    const stop = trackPixelPointer({ position: async () => { throw new Error('window closed'); },
      capture, hover: vi.fn(), hit: () => 'self' });
    await vi.advanceTimersByTimeAsync(1);
    expect(capture).toHaveBeenCalledWith(false);
    stop();
  });
});
