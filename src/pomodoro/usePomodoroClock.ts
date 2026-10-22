import { useEffect, useState } from 'react';
import { nextPhaseChange, type Pomodoro } from './pomodoro';

/**
 * The time to judge a pomodoro by: re-read at each phase change (wound, set
 * down, ringing, put away) and every 15 s for the minutes left.
 */
export function usePomodoroClock(pomodoro: Pomodoro | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!pomodoro) return;
    const next = nextPhaseChange(pomodoro, Date.now());
    const wait = Math.min(15_000, next === undefined ? 15_000 : next - Date.now());
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, now < pomodoro.startedAt ? 0 : wait));
    return () => window.clearTimeout(timer);
  }, [pomodoro, now]);
  return now;
}

/** While a pup winds its timer, its paw on the mouse presses and lifts. */
export function useWindingPaw(active: boolean) {
  const [down, setDown] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setDown(value => !value), 180);
    return () => window.clearInterval(timer);
  }, [active]);
  return active && down;
}
