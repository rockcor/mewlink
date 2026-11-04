import { describe, expect, it } from 'vitest';
import { eating, MEAL_LONGEST_MINUTES } from './meal';

// Minutes since the epoch at a UTC time of day.
const at = (hours: number, minutes = 0) => Math.floor(Date.parse('2026-11-04T00:00:00Z') / 60_000) + hours * 60 + minutes;

describe('a meal at a mealtime of its own clock', () => {
  it('eats when it leaves the computer at breakfast, lunch or dinner, and sleeps otherwise', () => {
    for (const [hours, minutes] of [[8, 0], [12, 15], [18, 0]]) expect(eating(at(hours, minutes), 0, at(hours, minutes) - 10)).toBe(true);
    for (const [hours, minutes] of [[10, 0], [15, 0], [23, 30], [3, 0]]) expect(eating(at(hours, minutes), 0, at(hours, minutes) - 10)).toBe(false);
    // Lunch ends at half past one, whenever it started.
    expect(eating(at(13, 29), 0, at(12, 0))).toBe(true);
    expect(eating(at(13, 30), 0, at(12, 0))).toBe(false);
  });

  it('goes by the pup’s own time zone', () => {
    // 04:15 UTC is 12:15 in UTC+8 and 21:15 the evening before in UTC-7.
    expect(eating(at(4, 15), 480, at(4, 0))).toBe(true);
    expect(eating(at(4, 15), -420, at(4, 0))).toBe(false);
  });

  it('is not eating after a night away, or away longer than a meal', () => {
    // Left at one in the morning: at eight it is still asleep.
    expect(eating(at(8, 0), 0, at(1, 0))).toBe(false);
    expect(eating(at(12, 30), 0, at(12, 30) - MEAL_LONGEST_MINUTES - 1)).toBe(false);
    expect(eating(at(12, 30), 0, undefined)).toBe(false);
  });
});
