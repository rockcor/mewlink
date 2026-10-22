// A kitchen-style pomodoro: the pup winds a tomato timer to 25 minutes, sets
// it on the desk, and the dial runs back to zero; then it rings. A partner sees
// the same timer on this pup's desk: it travels with the presence heartbeat as
// { id, startedAt, durationMs }, so both sides count down from the same instant.

export const POMODORO_MS = 25 * 60_000;
/** The dial of a kitchen timer goes up to an hour. */
export const DIAL_MS = 60 * 60_000;
/** Lifted by the paw and wound up, click by click. */
export const WIND_MS = 1_800;
/** Then carried over and set down on the desk. */
export const PLACE_MS = 1_000;
/** It rings this long once the time is up, then is put away. */
export const RING_MS = 4_000;
const MIN_MS = 60_000;
const MAX_MS = 2 * 3_600_000;

export interface Pomodoro { id: string; startedAt: number; durationMs: number }
/** What the heartbeat carries. */
export interface PomodoroPayload { id: string; startedAt: string; durationMs: number }
export type PomodoroPhase = 'winding' | 'placing' | 'counting' | 'ringing' | 'over';

export function newPomodoro(id: string, now = Date.now(), durationMs = POMODORO_MS): Pomodoro {
  return { id, startedAt: now, durationMs };
}

export const pomodoroEnd = (pomodoro: Pomodoro) => pomodoro.startedAt + pomodoro.durationMs;
export const remainingMs = (pomodoro: Pomodoro, now = Date.now()) => Math.max(0, pomodoroEnd(pomodoro) - now);

export function pomodoroPhase(pomodoro: Pomodoro | undefined, now = Date.now()): PomodoroPhase {
  if (!pomodoro) return 'over';
  const elapsed = now - pomodoro.startedAt;
  if (now >= pomodoroEnd(pomodoro)) return now < pomodoroEnd(pomodoro) + RING_MS ? 'ringing' : 'over';
  if (elapsed < WIND_MS) return 'winding';
  if (elapsed < WIND_MS + PLACE_MS) return 'placing';
  return 'counting';
}

/** When the phase next changes, for a timer that re-renders only then. */
export function nextPhaseChange(pomodoro: Pomodoro, now = Date.now()): number | undefined {
  const marks = [pomodoro.startedAt + WIND_MS, pomodoro.startedAt + WIND_MS + PLACE_MS, pomodoroEnd(pomodoro), pomodoroEnd(pomodoro) + RING_MS];
  return marks.find(mark => mark > now);
}

/**
 * Minutes the pointer shows. While winding it climbs to the full time in
 * one-minute clicks; afterwards it is the time left, running back to zero.
 */
export function dialMinutes(pomodoro: Pomodoro, now = Date.now()): number {
  const elapsed = now - pomodoro.startedAt;
  const full = pomodoro.durationMs / 60_000;
  if (elapsed < WIND_MS) {
    // A short lift, then the clicks; the last stretch holds at the full time.
    const progress = Math.min(1, Math.max(0, (elapsed - 250) / (WIND_MS - 550)));
    return Math.round(progress * full);
  }
  return remainingMs(pomodoro, now) / 60_000;
}

/** The pointer's angle in degrees clockwise from the top, on a one-hour dial. */
export const dialAngle = (minutes: number) => Math.min(360, Math.max(0, minutes / (DIAL_MS / 60_000) * 360));

/** Whole minutes left, for the menu and screen readers (a started minute counts). */
export const minutesLeft = (pomodoro: Pomodoro, now = Date.now()) => Math.ceil(remainingMs(pomodoro, now) / 60_000);

export const toPayload = (pomodoro: Pomodoro): PomodoroPayload => ({
  id: pomodoro.id, startedAt: new Date(pomodoro.startedAt).toISOString(), durationMs: pomodoro.durationMs,
});

/** A pomodoro from a heartbeat or storage, if it is well formed and not long over. */
export function fromPayload(value: unknown, now = Date.now()): Pomodoro | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { id, startedAt, durationMs } = value as Record<string, unknown>;
  if (typeof id !== 'string' || !id || id.length > 80) return undefined;
  const start = typeof startedAt === 'string' ? Date.parse(startedAt) : typeof startedAt === 'number' ? startedAt : NaN;
  if (!Number.isFinite(start) || typeof durationMs !== 'number' || !Number.isFinite(durationMs)
    || durationMs < MIN_MS || durationMs > MAX_MS) return undefined;
  // A start far in the future is a broken clock, not a timer.
  if (start > now + 5 * 60_000) return undefined;
  const pomodoro = { id, startedAt: start, durationMs };
  return pomodoroPhase(pomodoro, now) === 'over' ? undefined : pomodoro;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const STORAGE_KEY = 'mewlink.pomodoro.v1';

/** The running pomodoro survives a restart of the app. */
export function loadPomodoro(storage: StorageLike | undefined = typeof localStorage === 'undefined' ? undefined : localStorage, now = Date.now()) {
  try {
    return fromPayload(JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null'), now);
  } catch {
    return undefined;
  }
}

export function savePomodoro(pomodoro: Pomodoro | undefined, storage: StorageLike | undefined = typeof localStorage === 'undefined' ? undefined : localStorage) {
  try {
    if (pomodoro) storage?.setItem(STORAGE_KEY, JSON.stringify(toPayload(pomodoro)));
    else storage?.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable; the timer still runs for this session.
  }
}
