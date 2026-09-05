import { describe, expect, it } from 'vitest';
import { gestureFor, WATER_AUTO_DRINK_MS, waterDrinkDelay } from './interaction';

describe('state-aware pet interactions', () => {
  it('chooses a different hug pose for work, leisure, and sleep', () => {
    expect(gestureFor('hug', 'work')).toBe('hug-work');
    expect(gestureFor('hug', 'leisure')).toBe('hug-leisure');
    expect(gestureFor('hug', 'rest')).toBe('hug-rest');
    expect(gestureFor('hug', 'rest', true)).toBe('hug-idle');
  });

  it('keeps a received cup for fifteen minutes', () => {
    expect(waterDrinkDelay(1_000, 1_000)).toBe(WATER_AUTO_DRINK_MS);
    expect(waterDrinkDelay(1_000, 1_000 + WATER_AUTO_DRINK_MS - 50)).toBe(50);
    expect(waterDrinkDelay(1_000, 1_000 + WATER_AUTO_DRINK_MS + 1)).toBe(0);
  });
});
