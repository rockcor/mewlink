import { describe, expect, it, vi } from 'vitest';
import { PetDrag } from './petDrag';

const point = { pointerId: 1, clientX: 10, clientY: 20 };

describe('pet native drag gestures', () => {
  it('distinguishes an ordinary click from a drag and ignores other pointers', () => {
    const drag = new PetDrag();
    drag.press(point);
    expect(drag.move({ ...point, clientX: 14 })).toBe(false);
    expect(drag.move({ ...point, pointerId: 2, clientX: 40 })).toBe(false);
    drag.release(1);
    expect(drag.move({ ...point, clientX: 40 })).toBe(false);
    expect(drag.suppressClick).toBe(false);
  });

  it('suppresses a delayed drop click until the next genuine press, even without pointerup', async () => {
    vi.useFakeTimers();
    try {
      const drag = new PetDrag();
      drag.press(point);
      expect(drag.move({ ...point, clientX: 15 })).toBe(true);
      expect(drag.dragging).toBe(true);
      expect(drag.move({ ...point, clientX: 30 })).toBe(false);
      drag.finish();
      expect(drag.dragging).toBe(false);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(drag.suppressClick).toBe(true);
      drag.press(point);
      expect(drag.suppressClick).toBe(false);
      drag.release(1);
    } finally { vi.useRealTimers(); }
  });

  it('does not let capture cancellation or another press end the native drag early', () => {
    const drag = new PetDrag();
    drag.press(point);
    drag.move({ ...point, clientX: 20 });
    drag.release(1);
    drag.press(point);
    drag.newClick();
    expect(drag.dragging).toBe(true);
    expect(drag.suppressClick).toBe(true);
    drag.finish();
    drag.newClick();
    expect(drag.suppressClick).toBe(false);
  });
});
