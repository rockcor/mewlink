import { describe, expect, it } from 'vitest';
import { deskShown, gestureFor, sceneFor, WATER_AUTO_DRINK_MS, waterDrinkDelay } from './interaction';

describe('state-aware pet interactions', () => {
  it('keeps the desk (and its speaker) through work, meetings and stepping away, but not through lying down', () => {
    expect(deskShown({ displayedActivity: 'leisure' })).toBe(true);
    expect(deskShown({ displayedActivity: 'meeting' })).toBe(true);
    expect(deskShown({ displayedActivity: 'idle' })).toBe(true);
    expect(deskShown({ displayedActivity: 'rest' })).toBe(false);
    expect(deskShown({ displayedActivity: 'meal' })).toBe(false);
    expect(deskShown({ displayedActivity: 'idle', transition: { from: 'idle', to: 'meal' } })).toBe(false);
    expect(deskShown({ displayedActivity: 'work', transition: { from: 'work', to: 'idle' } })).toBe(true);
    expect(deskShown({ displayedActivity: 'idle', transition: { from: 'idle', to: 'rest' } })).toBe(false);
    expect(deskShown({ displayedActivity: 'work', transition: { from: 'work', to: 'meeting' } })).toBe(true);
    expect(deskShown({ displayedActivity: 'work', transition: { from: 'work', to: 'rest' } })).toBe(false);
    expect(deskShown({ displayedActivity: 'rest', transition: { from: 'rest', to: 'work' } })).toBe(false);
  });
  it('hugs wherever the receiver is: the scene is picked at its desk (hugVisit)', () => {
    for (const activity of ['work', 'meeting', 'rest', 'idle', 'leisure'] as const) expect(gestureFor('hug', activity)).toBe('hug');
  });

  it('draws watching videos at the desk: there is no leisure scene any more', () => {
    expect(sceneFor('leisure')).toBe('work');
    expect(sceneFor('meeting')).toBe('meeting');
    expect(gestureFor('water', 'leisure')).toBe('water-work');
  });

  it('lands a cup on an away pup’s empty desk', () => {
    expect(gestureFor('water', 'idle')).toBe('water-idle');
    expect(gestureFor('water', 'meal')).toBe('water-meal');
  });

  it('keeps a received cup for fifteen minutes', () => {
    expect(waterDrinkDelay(1_000, 1_000)).toBe(WATER_AUTO_DRINK_MS);
    expect(waterDrinkDelay(1_000, 1_000 + WATER_AUTO_DRINK_MS - 50)).toBe(50);
    expect(waterDrinkDelay(1_000, 1_000 + WATER_AUTO_DRINK_MS + 1)).toBe(0);
  });
});
