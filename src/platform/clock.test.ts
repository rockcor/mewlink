import { describe, expect, it } from 'vitest';
import { normalizeUtcOffsetMinutes, replayClock } from './clock';

describe('privacy-preserving replay clock', () => {
  it('rounds offsets to a 15-minute boundary and clamps untrusted values', () => {
    expect(normalizeUtcOffsetMinutes(482)).toBe(480);
    expect(normalizeUtcOffsetMinutes(5_000)).toBe(840);
  });

  it('translates one instant into both partners local clocks', () => {
    expect(replayClock('2026-09-03T06:30:00.000Z', -420, 480)).toEqual({
      senderUtcOffsetMinutes: -420,
      receiverUtcOffsetMinutes: 480,
      offsetDeltaMinutes: 900,
      label: 'TA 09/02 23:30 → 你 09/03 14:30'
    });
  });

  it('keeps legacy events replayable when the sender offset is missing', () => {
    expect(replayClock('2026-09-03T06:30:00.000Z', undefined, 480).label).toBe('你这里 14:30');
  });

  it('renders both clocks in English when English is selected', () => {
    expect(replayClock('2026-09-03T06:30:00.000Z', -420, 480, 'en').label).toBe('Partner 09/02 23:30 → You 09/03 14:30');
  });
});
