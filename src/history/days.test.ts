import { describe, expect, it } from 'vitest';
import type { HistoryRef } from '../storage/events';
import { dayInstant, dayKey, dayProgress, daySpanMs, daySpeed, formatDuration, groupReplayDays, partnerClock, REST_GAP_MS, restingAt, restSpans, unseenMs, unseenWorkMs } from './days';

const LONDON = 60;
const iso = (h: number, m = 0, day = 8) => new Date(Date.UTC(2026, 9, day, h, m)).toISOString();
const batch = (at: string, id = at): HistoryRef => ({ id, at, kind: 'operation.batch' });
/** Batches every 10 s from `from` (UTC hours) for `minutes`. */
function work(day: number, hour: number, minute: number, minutes: number) {
  return Array.from({ length: minutes * 6 }, (_, i) => batch(new Date(Date.UTC(2026, 9, day, hour, minute) + i * 10_000).toISOString()));
}

describe('replay days', () => {
  it('ends a day at the partner\'s own midnight', () => {
    // 22:30 UTC is 23:30 in London (still the 8th); 23:30 UTC is 00:30 on the 9th there.
    expect(dayKey(Date.parse(iso(22, 30)), LONDON)).toBe('2026-10-08');
    expect(dayKey(Date.parse(iso(23, 30)), LONDON)).toBe('2026-10-09');
    const days = groupReplayDays([batch(iso(22, 30)), batch(iso(23, 30))], LONDON);
    expect(days.map(day => day.key)).toEqual(['2026-10-08', '2026-10-09']);
  });

  it('keeps interrupted work in one day and shows the pauses as rest', () => {
    // 09:00-11:00, a 2-minute pause, 11:02-12:00, lunch, 13:00-16:10 (London, UTC+1).
    const refs = [...work(8, 8, 0, 120), ...work(8, 10, 2, 58), ...work(8, 12, 0, 190)];
    const [day] = groupReplayDays(refs, LONDON);
    // The short pause belongs to the morning; lunch is rest.
    expect(day.sessions).toHaveLength(2);
    expect(Math.round(daySpanMs(day) / 60_000)).toBe(430);
    expect(Math.round(day.activeMs / 60_000)).toBe(370);
    expect(formatDuration(daySpanMs(day), 'zh')).toBe('7 小时 10 分');
    expect(formatDuration(day.activeMs, 'zh-Hant')).toBe('6 小時 10 分');
    expect(formatDuration(day.activeMs, 'en')).toBe('6 h 10 min');
    const [lunch] = restSpans(day);
    expect(restSpans(day)).toHaveLength(1);
    expect((lunch.to - lunch.from) * daySpanMs(day) / 60_000).toBeCloseTo(60, 0); // its true length
    expect(daySpeed(day)).toBeGreaterThan(500); // ~7 h in ~45 s
  });

  it('maps bar positions to the partner\'s real time, rest included', () => {
    const refs = [...work(8, 8, 0, 60), ...work(8, 12, 0, 60)];
    const [day] = groupReplayDays(refs, LONDON);
    expect(dayInstant(day, 0)).toBe(day.start);
    expect(dayInstant(day, 1)).toBe(day.end);
    expect(restingAt(day, Date.parse(iso(10)))).toBe(true); // during the break
    expect(restingAt(day, Date.parse(iso(8, 30)))).toBe(false);
    for (const fraction of [0, 0.1, 0.37, 0.75, 1]) expect(dayProgress(day, dayInstant(day, fraction))).toBeCloseTo(fraction, 6);
  });

  it('measures what is still unseen, rest included', () => {
    const [day] = groupReplayDays([...work(8, 8, 0, 60), ...work(8, 12, 0, 60)], LONDON);
    expect(unseenMs(day, 0)).toBe(daySpanMs(day));
    expect(unseenWorkMs(day, 0)).toBe(day.activeMs);
    expect(Math.round(unseenMs(day, Date.parse(iso(10))) / 60_000)).toBe(180);
    expect(Math.round(unseenWorkMs(day, Date.parse(iso(10))) / 60_000)).toBe(60);
    expect(unseenMs(day, day.end)).toBe(0);
  });

  it('short gaps are still work, longer ones are rest', () => {
    const at = Date.parse(iso(9));
    const near = [batch(new Date(at).toISOString()), batch(new Date(at + 10_000 + REST_GAP_MS).toISOString())];
    const far = [batch(new Date(at).toISOString()), batch(new Date(at + 10_000 + REST_GAP_MS + 1).toISOString())];
    expect(groupReplayDays(near, 0)[0].sessions).toHaveLength(1);
    expect(groupReplayDays(far, 0)[0].sessions).toHaveLength(2);
  });

  it('shows the bar time in the partner\'s own clock', () => {
    expect(partnerClock(Date.parse(iso(13, 5)), LONDON)).toBe('10/08 14:05');
    expect(partnerClock(Date.parse(iso(23, 30)), LONDON)).toBe('10/09 00:30');
  });

  it('formats short durations', () => {
    expect(formatDuration(40 * 60_000, 'zh')).toBe('40 分钟');
    expect(formatDuration(20_000, 'zh')).toBe('不到 1 分钟');
    expect(formatDuration(2 * 3_600_000, 'en')).toBe('2 h');
    expect(formatDuration(5 * 60_000, 'en')).toBe('5 min');
  });
});
