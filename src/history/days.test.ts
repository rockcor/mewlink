import { describe, expect, it } from 'vitest';
import type { HistoryRef } from '../storage/events';
import { dayInstant, dayKey, dayProgress, daySpeed, formatDuration, groupReplayDays, partnerClock, sessionBreaks, SESSION_GAP_MS, unseenMs } from './days';

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

  it('merges interrupted work in one day and counts only recorded time', () => {
    // 09:00-11:00, a 5-minute pause, 11:05-12:00, lunch, 13:00-16:10 (London, UTC+1).
    const refs = [...work(8, 8, 0, 120), ...work(8, 10, 5, 55), ...work(8, 12, 0, 190)];
    const [day] = groupReplayDays(refs, LONDON);
    // The 5-minute pause belongs to the morning session; lunch is a break.
    expect(day.sessions).toHaveLength(2);
    expect(Math.round(day.activeMs / 60_000)).toBe(370);
    expect(formatDuration(day.activeMs, 'zh')).toBe('6 小时 10 分');
    expect(formatDuration(day.activeMs, 'zh-Hant')).toBe('6 小時 10 分');
    expect(formatDuration(day.activeMs, 'en')).toBe('6 h 10 min');
    expect(sessionBreaks(day)).toHaveLength(1);
    expect(daySpeed(day)).toBeGreaterThan(400); // ~6 h in ~45 s
  });

  it('maps bar positions to recorded instants and back, skipping breaks', () => {
    const refs = [...work(8, 8, 0, 60), ...work(8, 12, 0, 60)];
    const [day] = groupReplayDays(refs, LONDON);
    const lunchStart = day.sessions[0].end;
    // Halfway through the recorded time is the end of the morning session, not lunch.
    expect(dayInstant(day, 0.5)).toBe(lunchStart);
    expect(dayProgress(day, Date.parse(iso(11)))).toBeCloseTo(dayProgress(day, lunchStart)); // during the break
    for (const fraction of [0, 0.1, 0.37, 0.75, 1]) expect(dayProgress(day, dayInstant(day, fraction))).toBeCloseTo(fraction, 6);
  });

  it('measures what is still unseen', () => {
    const [day] = groupReplayDays([...work(8, 8, 0, 60), ...work(8, 12, 0, 60)], LONDON);
    expect(unseenMs(day, 0)).toBe(day.activeMs);
    expect(Math.round(unseenMs(day, Date.parse(iso(12, 30))) / 60_000)).toBe(30);
    expect(unseenMs(day, day.end)).toBe(0);
  });

  it('short gaps are a session, gaps over the limit are not', () => {
    const at = Date.parse(iso(9));
    const near = [batch(new Date(at).toISOString()), batch(new Date(at + SESSION_GAP_MS).toISOString())];
    const far = [batch(new Date(at).toISOString()), batch(new Date(at + 10_000 + SESSION_GAP_MS + 1).toISOString())];
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
