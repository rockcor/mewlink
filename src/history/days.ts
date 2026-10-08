import type { HistoryRef } from '../storage/events';
import type { Language } from '../platform/language';
import { OPERATION_BATCH_MS } from './operations';

// Replay is offered per day of the partner's own calendar (a day ends at their
// midnight) and runs on their real clock, from the first record of the day to
// the last. While the app runs, two minutes without input are recorded as idle
// and ten as rest, so a longer silence means the app was offline (closed,
// asleep, recording off): all of it is shown as rest, taking its true share of
// the bar and of the playback time.
export const REST_GAP_MS = 3 * 60_000;
/** A whole day plays back in about this long; the user can jump anywhere on the bar. */
export const DAY_PLAYBACK_MS = 45_000;

export interface ReplaySession { start: number; end: number }
export interface ReplayDay {
  key: string;
  refs: HistoryRef[];
  /** Stretches with records; the gaps between them are rest. */
  sessions: ReplaySession[];
  /** Time inside sessions. */
  activeMs: number;
  start: number;
  end: number;
}

/** "10/08 14:05" in the partner's own time, for the replay bar. */
export function partnerClock(at: number, offsetMinutes: number) {
  const local = new Date(at + offsetMinutes * 60_000).toISOString();
  return `${local.slice(5, 7)}/${local.slice(8, 10)} ${local.slice(11, 16)}`;
}

/** The partner's calendar date of an instant, as YYYY-MM-DD. */
export function dayKey(at: number, offsetMinutes: number) {
  return new Date(at + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

const refSpan = (ref: HistoryRef) => ref.kind === 'operation.batch' ? OPERATION_BATCH_MS : 1_000;

export function groupReplayDays(refs: readonly HistoryRef[], offsetMinutes: number): ReplayDay[] {
  const days = new Map<string, ReplayDay>();
  for (const ref of [...refs].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))) {
    const at = Date.parse(ref.at);
    if (!Number.isFinite(at)) continue;
    const key = dayKey(at, offsetMinutes);
    let day = days.get(key);
    if (!day) { day = { key, refs: [], sessions: [], activeMs: 0, start: at, end: at }; days.set(key, day); }
    day.refs.push(ref);
    const end = at + refSpan(ref);
    const last = day.sessions.at(-1);
    if (last && at - last.end <= REST_GAP_MS) last.end = Math.max(last.end, end);
    else day.sessions.push({ start: at, end });
    day.end = Math.max(day.end, end);
  }
  for (const day of days.values()) day.activeMs = day.sessions.reduce((sum, s) => sum + (s.end - s.start), 0);
  return [...days.values()].sort((a, b) => a.start - b.start);
}

/** From the first record to the last, rest included. */
export const daySpanMs = (day: ReplayDay) => day.end - day.start;

/** Share (0..1) of the day that has passed at instant `at`. */
export function dayProgress(day: ReplayDay, at: number) {
  const span = daySpanMs(day);
  return span > 0 ? Math.min(1, Math.max(0, (at - day.start) / span)) : 0;
}

/** The instant at `fraction` of the day. */
export function dayInstant(day: ReplayDay, fraction: number) {
  return day.start + Math.min(1, Math.max(0, fraction)) * daySpanMs(day);
}

/** The rests between sessions, as bar positions (0..1). */
export function restSpans(day: ReplayDay) {
  return day.sessions.slice(1).map((session, index) => ({
    from: dayProgress(day, day.sessions[index].end), to: dayProgress(day, session.start),
  }));
}

/** Whether `at` falls in a rest between two sessions. */
export function restingAt(day: ReplayDay, at: number) {
  return day.sessions.some((session, index) => index > 0 && at < session.start && at >= day.sessions[index - 1].end);
}

/** Time after `seen` (the replay watermark), rest included. */
export function unseenMs(day: ReplayDay, seen: number) {
  return Math.max(0, day.end - Math.max(day.start, seen));
}

/** Time in sessions after `seen`. */
export function unseenWorkMs(day: ReplayDay, seen: number) {
  return day.sessions.reduce((sum, s) => sum + Math.max(0, s.end - Math.max(s.start, seen)), 0);
}

/** Playback speed so a day lasts about DAY_PLAYBACK_MS, never slower than 4x. */
export function daySpeed(day: ReplayDay) {
  return Math.max(4, daySpanMs(day) / DAY_PLAYBACK_MS);
}

export function formatDuration(ms: number, language: Language) {
  const minutes = Math.round(ms / 60_000);
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  if (language === 'en') {
    if (minutes < 1) return 'under 1 min';
    return hours ? `${hours} h${rest ? ` ${rest} min` : ''}` : `${minutes} min`;
  }
  const hour = language === 'zh-Hant' ? '小時' : '小时', minute = language === 'zh-Hant' ? '分鐘' : '分钟';
  if (minutes < 1) return language === 'zh-Hant' ? '不到 1 分鐘' : '不到 1 分钟';
  return hours ? `${hours} ${hour}${rest ? ` ${rest} 分` : ''}` : `${minutes} ${minute}`;
}
