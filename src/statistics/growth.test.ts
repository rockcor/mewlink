import { describe, expect, it } from 'vitest';
import type { StatisticsData } from './statistics';
import { growthLevel, growthScale, MAX_GROWTH, partnerGrowthLevel, quantizeGrowth, usualDay } from './growth';

const hourMs = 3_600_000;
// Local noon on 15 Oct 2026, so "today" has room before and after.
const now = new Date(2026, 9, 15, 12, 0).getTime();
const hourAt = (daysAgo: number, hour: number) => {
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return Math.floor(date.getTime() / hourMs);
};
/** `hours` full hours of work from 09:00 `daysAgo` days ago, with `input` keystrokes+clicks per hour. */
function workday(daysAgo: number, hours: number, input = 0) {
  return Array.from({ length: hours }, (_, index) => ({
    hour: hourAt(daysAgo, 9 + index), keyboard: input, pointer: 0,
    activityMs: { work: hourMs, meeting: 0, leisure: 0, idle: 0, rest: 0 },
    workVisualMs: { code: hourMs, document: 0, web: 0, ai: 0, mewlink: 0 },
  }));
}
const data = (...days: ReturnType<typeof workday>[]): StatisticsData => ({ version: 3, buckets: days.flat() });

describe('busyness growth', () => {
  it('starts every day at the normal size', () => {
    expect(growthLevel(data(workday(1, 10)), now)).toBe(0);
    expect(growthScale(0)).toBe(1);
  });

  it('cold start: grows against a default six-hour day', () => {
    // Three hours of work by noon, no history: half a usual day, a third of the way to the largest size.
    expect(growthLevel(data(workday(0, 3)), now)).toBeCloseTo(0.35, 5);
    expect(usualDay(data(), now)).toEqual({ activeMs: 6 * hourMs, input: undefined, days: 0 });
  });

  it('learns the person\'s usual day from history, ignoring days off', () => {
    const history = [workday(1, 9), workday(2, 9), workday(3, 9), workday(4, 9), workday(5, 9), workday(6, 9), workday(7, 0), workday(8, 1)];
    const usual = usualDay(data(...history), now);
    // Seven usual days of 9 h (the 1 h day counts, the empty one does not), weighed against 3 days of the 6 h default.
    expect(usual.days).toBe(7);
    expect(usual.activeMs / hourMs).toBeCloseTo((3 * 6 + 7 * 9) / 10, 5);
    // The same three hours mean less to someone who usually works nine.
    expect(growthLevel(data(workday(0, 3), ...history), now)).toBeLessThan(growthLevel(data(workday(0, 3)), now));
  });

  it('counts keystrokes and clicks once there is enough history', () => {
    const history = [workday(1, 6, 1_000), workday(2, 6, 1_000), workday(3, 6, 1_000)];
    expect(usualDay(data(...history), now).input).toBe(6_000);
    const calm = growthLevel(data(workday(0, 3, 200), ...history), now);
    const intense = growthLevel(data(workday(0, 3, 3_000), ...history), now);
    expect(intense).toBeGreaterThan(calm);
  });

  it('caps at the largest size and stays coarse', () => {
    // Twelve hours of work by noon (from midnight): twice a usual day, past the largest size.
    const marathon = workday(0, 12).map((bucket, index) => ({ ...bucket, hour: hourAt(0, index) }));
    expect(growthLevel(data(marathon), now)).toBe(1);
    expect(quantizeGrowth(5)).toBe(1);
    expect(quantizeGrowth(-1)).toBe(0);
    expect(quantizeGrowth(0.333)).toBe(0.35);
    expect(quantizeGrowth('big')).toBe(0);
    expect(growthScale(1)).toBe(1 + MAX_GROWTH);
  });

  it('shows the partner\'s level only for their own today', () => {
    // Partner in UTC+8; it is 20:00 UTC = 04:00 the next day for them.
    const at = Date.UTC(2026, 9, 15, 20);
    expect(partnerGrowthLevel(0.6, new Date(Date.UTC(2026, 9, 15, 17)).toISOString(), 480, at)).toBe(0.6); // 01:00 their today
    expect(partnerGrowthLevel(0.6, new Date(Date.UTC(2026, 9, 15, 15)).toISOString(), 480, at)).toBe(0); // 23:00 their yesterday
    expect(partnerGrowthLevel(0.6, 'not a date', 480, at)).toBe(0);
    expect(partnerGrowthLevel(0.6, new Date(at).toISOString(), undefined, at)).toBe(0);
    expect(partnerGrowthLevel(Number.NaN, new Date(at).toISOString(), 480, at)).toBe(0);
  });
});
