import { describe, expect, it } from 'vitest';
import { gestureFor, sceneFor, WATER_AUTO_DRINK_MS, waterDrinkDelay } from './interaction';

describe('state-aware pet interactions', () => {
  it('hugs at the desk when both work, tucks in when the receiver is away; never both away', () => {
    expect(gestureFor('hug', 'work')).toBe('hug-work');
    // A meeting is work: both are at the computer.
    expect(gestureFor('hug', 'meeting')).toBe('hug-work');
    expect(gestureFor('hug', 'rest')).toBe('hug-rest');
  });

  it('draws watching videos at the desk: there is no leisure scene any more', () => {
    expect(sceneFor('leisure')).toBe('work');
    expect(sceneFor('meeting')).toBe('meeting');
    expect(gestureFor('hug', 'leisure')).toBe('hug-work');
    expect(gestureFor('water', 'leisure')).toBe('water-work');
  });

  it('treats an idle pup as asleep', () => {
    expect(gestureFor('hug', 'idle')).toBe('hug-rest');
    expect(gestureFor('water', 'idle')).toBe('water-rest');
  });

  it('keeps a received cup for fifteen minutes', () => {
    expect(waterDrinkDelay(1_000, 1_000)).toBe(WATER_AUTO_DRINK_MS);
    expect(waterDrinkDelay(1_000, 1_000 + WATER_AUTO_DRINK_MS - 50)).toBe(50);
    expect(waterDrinkDelay(1_000, 1_000 + WATER_AUTO_DRINK_MS + 1)).toBe(0);
  });
});
