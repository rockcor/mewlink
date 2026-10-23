import { describe, expect, it } from 'vitest';
import { dialAngle, dialMinutes, finishedWhileAway, fromPayload, loadPomodoro, minutesLeft, newPomodoro, nextPhaseChange, PLACE_MS, POMODORO_MS,
  pomodoroPhase, RING_MS, savePomodoro, toPayload, WIND_MS } from './pomodoro';

const t0 = Date.UTC(2026, 9, 22, 9, 0);
const memory = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
};

describe('pomodoro', () => {
  it('winds, is set down, counts down, rings and is put away', () => {
    const pomodoro = newPomodoro('p1', t0);
    expect(pomodoroPhase(pomodoro, t0)).toBe('winding');
    expect(pomodoroPhase(pomodoro, t0 + WIND_MS)).toBe('placing');
    expect(pomodoroPhase(pomodoro, t0 + WIND_MS + PLACE_MS)).toBe('counting');
    expect(pomodoroPhase(pomodoro, t0 + POMODORO_MS)).toBe('ringing');
    expect(pomodoroPhase(pomodoro, t0 + POMODORO_MS + RING_MS)).toBe('over');
    expect(pomodoroPhase(undefined, t0)).toBe('over');
    expect(nextPhaseChange(pomodoro, t0 + 10 * 60_000)).toBe(t0 + POMODORO_MS);
    expect(nextPhaseChange(pomodoro, t0 + POMODORO_MS + RING_MS)).toBeUndefined();
  });

  it('winds the pointer up to 25 minutes in clicks, then runs it back to zero', () => {
    const pomodoro = newPomodoro('p1', t0);
    expect(dialMinutes(pomodoro, t0 + 100)).toBe(0);
    const winding = [400, 700, 1000, 1200].map(ms => dialMinutes(pomodoro, t0 + ms));
    expect(winding.every(Number.isInteger)).toBe(true);
    expect([...winding].sort((a, b) => a - b)).toEqual(winding);
    expect(dialMinutes(pomodoro, t0 + WIND_MS - 1)).toBe(25);
    expect(dialMinutes(pomodoro, t0 + 10 * 60_000)).toBeCloseTo(15, 5);
    expect(dialMinutes(pomodoro, t0 + POMODORO_MS + 1_000)).toBe(0);
    // A kitchen timer's dial is an hour: 25 minutes is 150 degrees.
    expect(dialAngle(25)).toBe(150);
    expect(dialAngle(0)).toBe(0);
    expect(minutesLeft(pomodoro, t0 + 10 * 60_000 + 30_000)).toBe(15);
  });

  it('accepts only well-formed timers from the partner', () => {
    const pomodoro = newPomodoro('p1', t0);
    expect(fromPayload(toPayload(pomodoro), t0 + 60_000)).toEqual(pomodoro);
    expect(fromPayload({ ...toPayload(pomodoro), durationMs: 10 }, t0)).toBeUndefined();
    expect(fromPayload({ ...toPayload(pomodoro), durationMs: 10 * 3_600_000 }, t0)).toBeUndefined();
    expect(fromPayload({ ...toPayload(pomodoro), startedAt: 'soon' }, t0)).toBeUndefined();
    expect(fromPayload({ ...toPayload(pomodoro), id: 7 }, t0)).toBeUndefined();
    expect(fromPayload({ ...toPayload(pomodoro), startedAt: new Date(t0 + 3_600_000).toISOString() }, t0)).toBeUndefined();
    // Long over: nothing to show.
    expect(fromPayload(toPayload(pomodoro), t0 + POMODORO_MS + RING_MS)).toBeUndefined();
    expect(fromPayload(null, t0)).toBeUndefined();
  });

  it('survives a restart, and is forgotten once over', () => {
    const storage = memory();
    const pomodoro = newPomodoro('p1', t0);
    savePomodoro(pomodoro, storage);
    expect(loadPomodoro(storage, t0 + 5 * 60_000)).toEqual(pomodoro);
    expect(loadPomodoro(storage, t0 + POMODORO_MS + RING_MS)).toBeUndefined();
    savePomodoro(undefined, storage);
    expect(loadPomodoro(storage, t0)).toBeUndefined();
    expect(loadPomodoro({ ...memory(), getItem: () => '{broken' }, t0)).toBeUndefined();
  });

  it('finds one that ran out while the app was closed, to count it', () => {
    const storage = memory();
    const pomodoro = newPomodoro('p2', t0, 40 * 60_000);
    savePomodoro(pomodoro, storage);
    expect(finishedWhileAway(storage, t0 + 10 * 60_000)).toBeUndefined(); // still running
    expect(finishedWhileAway(storage, t0 + 3 * 3_600_000)).toEqual(pomodoro);
    // Ended early or already counted: it is no longer stored.
    savePomodoro(undefined, storage);
    expect(finishedWhileAway(storage, t0 + 3 * 3_600_000)).toBeUndefined();
  });
});
