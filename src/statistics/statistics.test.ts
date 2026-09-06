import { describe, expect, it } from 'vitest';
import { aggregateStatistics, emptyStatisticsData } from './statistics';

describe('local statistics aggregation', () => {
  it('summarizes input, work visuals, and activity time for the selected day', () => {
    const now = new Date(2026, 8, 6, 12, 0, 0).getTime();
    const hour = Math.floor((now - 60 * 60 * 1_000) / (60 * 60 * 1_000));
    const data = emptyStatisticsData();
    data.buckets.push({
      hour,
      keyboard: 120,
      pointer: 45,
      activityMs: { work: 3_600_000, meeting: 1_800_000, leisure: 600_000, idle: 300_000, rest: 0 },
      workVisualMs: { code: 1_800_000, document: 1_200_000, web: 600_000 }
    });

    const result = aggregateStatistics(data, 'day', now);
    expect(result.input).toEqual({ keyboard: 120, pointer: 45 });
    expect(result.workVisual).toEqual({ code: 1_800_000, document: 1_200_000, web: 600_000 });
    expect(result.activity).toEqual({ work: 3_600_000, meeting: 1_800_000, idle: 900_000 });
    expect(result.bars.reduce((total, bar) => total + bar.keyboard, 0)).toBe(120);
  });

  it('excludes buckets outside the requested rolling range', () => {
    const now = new Date(2026, 8, 6, 12, 0, 0).getTime();
    const data = emptyStatisticsData();
    data.buckets.push({
      hour: Math.floor((now - 8 * 24 * 60 * 60 * 1_000) / (60 * 60 * 1_000)),
      keyboard: 99,
      pointer: 99,
      activityMs: { work: 1_000, meeting: 0, leisure: 0, idle: 0, rest: 0 },
      workVisualMs: { code: 1_000, document: 0, web: 0 }
    });
    expect(aggregateStatistics(data, 'week', now).input.keyboard).toBe(0);
    expect(aggregateStatistics(data, 'month', now).input.keyboard).toBe(99);
  });
});
