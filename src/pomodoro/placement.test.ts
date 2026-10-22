import { describe, expect, it } from 'vitest';
import { petDistance } from '../settings/preferences';
import { clearOfMyCup, SPOT } from './placement';

describe('pomodoro placement', () => {
  it('stands bottom left unless my cup reaches TA\'s spot', () => {
    // Far apart (130%) the cup is out of the way.
    expect(clearOfMyCup(1, 1, petDistance(130))).toBe(SPOT.x);
    // Close (80%) the bottom-left spot would end a pixel short of my cup, inside the margin: it moves right too.
    expect(clearOfMyCup(1, 1, petDistance(80))).toBeGreaterThan(SPOT.x);
    // At the default distance my cup sits in TA's bottom-left corner: the timer stands a little right.
    const shifted = clearOfMyCup(1, 1, petDistance(100));
    expect(shifted).toBeGreaterThan(SPOT.x);
    expect(shifted).toBeLessThanOrEqual(150);
  });

  it('accounts for the pups\' sizes', () => {
    // Grown pups spread apart, so the cup is out of the way sooner.
    expect(clearOfMyCup(1.25, 1.25, petDistance(110))).toBeLessThanOrEqual(clearOfMyCup(1, 1, petDistance(110)));
    for (const [self, partner] of [[0.8, 1.2], [1.2, 0.8], [1.1, 1.375]]) {
      const x = clearOfMyCup(self, partner, petDistance(100));
      expect(x).toBeGreaterThanOrEqual(SPOT.x);
      expect(x).toBeLessThanOrEqual(150);
    }
  });
});
