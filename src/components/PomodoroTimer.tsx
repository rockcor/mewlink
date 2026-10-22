import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { dialAngle, dialMinutes, PLACE_MS, pomodoroPhase, WIND_MS, type Pomodoro } from '../pomodoro/pomodoro';
import { PAW, SPOT } from '../pomodoro/placement';

// The tomato kitchen timer on a pup's desk, drawn in the pets' pixel style:
// 32x32 art pixels, two frame pixels each, in the 384x256 frame the pet strips
// use (so it scales, fades and hides with its pup).
const ART = 32;
const SCALE = 2;

const C = { outline: '#2b0f17', body: '#ec5a5f', shade: '#c8434f', light: '#ff9e95', leaf: '#6cc070', stem: '#3f7f45',
  face: '#fff1d6', wedge: '#f8a7ad', tick: '#7a2f3c' };
// Leaves and the knob on top, drawn over the body (columns 9..22).
const LEAVES = [
  '......KK......',
  '.....KSSK.....',
  '..KK.KSSK.KK..',
  '.KLLKKSSKKLLK.',
  'KLLLLLLLLLLLLK',
  '.KLLLKLLKLLLK.',
  '..KK..KK..KK..',
];

function draw(context: CanvasRenderingContext2D, minutes: number, ringing: boolean, beat: number) {
  context.clearRect(0, 0, ART * SCALE, ART * SCALE);
  const px = (x: number, y: number, color: string) => { context.fillStyle = color; context.fillRect(x * SCALE, y * SCALE, SCALE, SCALE); };
  // Body: an outlined tomato with a shaded lower right and a highlight.
  const [cx, cy, rx, ry] = [16, 19, 11.5, 9.5];
  for (let y = 0; y < ART; y++) for (let x = 0; x < ART; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    const d = dx * dx + dy * dy;
    if (d > 1) continue;
    const ix = (x + 0.5 - cx) / (rx - 1.2), iy = (y + 0.5 - cy) / (ry - 1.2);
    if (ix * ix + iy * iy > 1) { px(x, y, C.outline); continue; }
    const lit = ((x + 0.5 - 10.5) / 2.2) ** 2 + ((y + 0.5 - 14) / 1.5) ** 2 <= 1;
    px(x, y, lit ? C.light : dx + dy > 0.75 ? C.shade : C.body);
  }
  LEAVES.forEach((row, y) => [...row].forEach((cell, x) => {
    if (cell !== '.') px(9 + x, 4 + y, cell === 'K' ? C.outline : cell === 'S' ? C.stem : C.leaf);
  }));
  // Dial: the time left as a pink wedge clockwise from the top, and the pointer.
  const [fx, fy] = [16, 20];
  const angle = dialAngle(minutes) * Math.PI / 180;
  for (let y = 12; y < 29; y++) for (let x = 8; x < 25; x++) {
    const dx = x + 0.5 - fx, dy = y + 0.5 - fy, r = Math.hypot(dx, dy);
    if (r > 6.2) continue;
    if (r > 5.3) { px(x, y, C.outline); continue; }
    const theta = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI);
    px(x, y, r < 4.9 && theta < angle ? C.wedge : C.face);
  }
  for (const tick of [0, 0.5, 1, 1.5]) px(Math.floor(fx + 0.5 + 4.4 * Math.sin(tick * Math.PI) - 0.5), Math.floor(fy + 0.5 - 4.4 * Math.cos(tick * Math.PI) - 0.5), C.tick);
  for (let r = 0; r <= 4.2; r += 0.35) px(Math.floor(fx + r * Math.sin(angle)), Math.floor(fy - r * Math.cos(angle)), C.outline);
  px(fx - 1, fy - 1, C.tick);
  // Ringing: little marks around it, alternating like a bell.
  if (ringing) {
    const marks = beat % 2 ? [[2, 5], [3, 6], [29, 5], [28, 6], [16, 0], [16, 1]] : [[1, 8], [2, 8], [30, 8], [29, 8], [12, 1], [20, 1]];
    for (const [x, y] of marks) px(x, y, C.outline);
  }
}

const ease = (t: number) => 1 - (1 - t) ** 3;

/** Where the timer is and how it moves at `now`: lifted and twisted, set down, standing, or ringing. */
function pose(pomodoro: Pomodoro, now: number, atPaw: boolean, x: number) {
  const home = { x, y: SPOT.y };
  const lift = atPaw ? PAW : { x: home.x, y: home.y - 26 };
  const elapsed = now - pomodoro.startedAt;
  const phase = pomodoroPhase(pomodoro, now);
  if (phase === 'winding') {
    const pop = Math.min(1, elapsed / 250);
    // Each click of the dial twists it a little one way, then the other.
    const click = Math.floor((elapsed - 250) / 90);
    const twist = elapsed > 250 && elapsed < WIND_MS - 300 ? (click % 2 ? 7 : -7) : 0;
    return { ...lift, y: lift.y + (1 - ease(pop)) * 10, transform: `rotate(${twist}deg) scale(${0.45 + 0.55 * ease(pop)})` };
  }
  if (phase === 'placing') {
    const t = (elapsed - WIND_MS) / PLACE_MS;
    if (t < 0.75) {
      const p = ease(t / 0.75);
      // Carried across in front of the keyboard in one easy hop.
      return { x: lift.x + (home.x - lift.x) * p, y: lift.y + (home.y - lift.y) * p - Math.sin(Math.PI * p) * 28, transform: 'none' };
    }
    // Lands with a little squash.
    const s = (t - 0.75) / 0.25;
    return { ...home, transform: `scale(${1.12 - 0.12 * s}, ${0.86 + 0.14 * s})` };
  }
  if (phase === 'ringing') {
    const shake = Math.sin(now / 38) * 11;
    return { x: home.x + Math.sin(now / 23) * 1.5, y: home.y, transform: `rotate(${shake}deg)` };
  }
  return { ...home, transform: 'none' };
}

interface Props {
  pomodoro: Pomodoro;
  /** Wound next to the paw (at the desk), or just above its spot (other scenes). */
  atPaw: boolean;
  /** Frame x of its spot, when it has to make room (see clearOfMyCup). */
  x?: number;
  paused: boolean;
  label: string;
}

/** A pup's pomodoro, from being wound up to ringing; nothing once it is over. */
export function PomodoroTimer({ pomodoro, atPaw, x = SPOT.x, paused, label }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const phase = pomodoroPhase(pomodoro, now);
  // Smooth while it moves or rings; otherwise the pointer only needs a step now and then.
  const moving = phase === 'winding' || phase === 'placing' || phase === 'ringing';
  useEffect(() => {
    if (paused || phase === 'over') return;
    if (moving) {
      let frame = requestAnimationFrame(function tick() { setNow(Date.now()); frame = requestAnimationFrame(tick); });
      return () => cancelAnimationFrame(frame);
    }
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    const next = window.setTimeout(() => setNow(Date.now()), Math.max(0, pomodoro.startedAt + pomodoro.durationMs - Date.now()));
    return () => { window.clearInterval(timer); window.clearTimeout(next); };
  }, [paused, phase, moving, pomodoro]);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (context) draw(context, dialMinutes(pomodoro, now), phase === 'ringing', Math.floor(now / 160));
  }, [pomodoro, now, phase]);
  if (phase === 'over') return null;
  const at = pose(pomodoro, now, atPaw, x);
  const style = {
    left: `${(at.x - ART) / 384 * 100}%`, top: `${(at.y - ART) / 256 * 100}%`, transform: at.transform,
  } as CSSProperties;
  return <span className="pomodoro-frame" aria-hidden={phase === 'winding' || phase === 'placing'}>
    <canvas ref={canvas} className={`pomodoro-timer ${phase}`} width={ART * SCALE} height={ART * SCALE} style={style}
      role="img" aria-label={label} />
  </span>;
}
