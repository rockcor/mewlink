import { describe, expect, it } from 'vitest';
import { spriteClock } from './frameClock';

describe('canvas frame clock (no CSS events required)', () => {
  it('samples all source frames at their boundaries, including the last frame', () => {
    for (let frame = 0; frame < 8; frame++) expect(spriteClock(frame * 500, 4000, 8, true).frame).toBe(frame);
    expect(spriteClock(3999, 4000, 8, true).frame).toBe(7);
    expect(spriteClock(4000, 4000, 8, true)).toMatchObject({ frame: 0, cycle: 1, complete: false });
  });
  it('still recognizes boundaries after delayed or throttled timers', () => {
    expect(spriteClock(13050, 4000, 8, true)).toMatchObject({ cycle: 3, frame: 2 });
  });
  it('finishes transitions on the exact final frame instead of wrapping to frame zero', () => {
    for (let frame = 0; frame < 13; frame++) expect(spriteClock(frame * 400, 5200, 13, false).frame).toBe(frame);
    expect(spriteClock(5200, 5200, 13, false)).toMatchObject({ frame: 12, complete: true });
    expect(spriteClock(20000, 5200, 13, false).frame).toBe(12);
  });
  it('handles disabled or reduced motion and never schedules a tight spin loop', () => {
    expect(spriteClock(10, 0, 13, false)).toMatchObject({ complete: true, frame: 12, nextMs: 8 });
    expect(spriteClock(-100, 4000, 8, true).frame).toBe(0);
  });
});
