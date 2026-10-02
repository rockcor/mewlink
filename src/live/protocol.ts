// Live typing: what a pulse carries and how the receiver turns pulses back
// into paw movement. Only counts per 250 ms window ever leave the device.

import { activityKinds, workVisuals, type ActivityKind, type WorkVisual } from '../domain/types';
import {
  INPUT_STRESS_HOLD_MS,
  INPUT_STRESS_WINDOW_MS,
  KEYBOARD_STRESS_THRESHOLD,
  POINTER_ANIMATION_HOLD_MS,
  POINTER_CLICK_STRESS_THRESHOLD,
  POINTER_EVENTS_PER_ANIMATION,
  type InputSignal,
} from '../platform/activity';

export const WINDOW_MS = 250;

export interface Pulse {
  window: number;
  keyboard: number;
  pointer: number;
  clicks: number;
  activity: number;
  visual: number;
  nudge: boolean;
}

export const encodeActivity = (activity: ActivityKind) => Math.max(0, activityKinds.indexOf(activity));
export const encodeVisual = (visual: WorkVisual) => Math.max(0, workVisuals.indexOf(visual));
export const decodeActivity = (index: number): ActivityKind | undefined => activityKinds[index];
export const decodeVisual = (index: number): WorkVisual | undefined => workVisuals[index];

/** Accumulates input counter deltas between window boundaries. */
export class WindowCounter {
  private keyboard = 0;
  private pointer = 0;
  private clicks = 0;

  add(previous: InputSignal, current: InputSignal) {
    // A counter reset (restart, wrap) is not a burst of input.
    const delta = (a: number, b: number) => (b >= a ? Math.min(b - a, 10_000) : 0);
    this.keyboard += delta(previous.keyboardSequence, current.keyboardSequence);
    this.pointer += delta(previous.pointerSequence, current.pointerSequence);
    this.clicks += delta(previous.pointerClickSequence, current.pointerClickSequence);
  }

  take() {
    const counts = {
      keyboard: Math.min(this.keyboard, 0xffff),
      pointer: Math.min(this.pointer, 0xffff),
      clicks: Math.min(this.clicks, 0xffff),
    };
    this.keyboard = this.pointer = this.clicks = 0;
    return counts;
  }
}

/**
 * Plays window n at n * 250 ms + offset. The offset follows recent transit:
 * median + 2 x mean absolute deviation, kept between 250 ms and 1 s above the
 * fastest packet. No clock sync: only sender window numbers and local arrival.
 */
export class Playout {
  private samples: number[] = [];
  private offset: number | undefined;
  private lastWindow = Number.NEGATIVE_INFINITY;

  constructor(private readonly options = { initialBufferMs: 400, minBufferMs: 250, maxBufferMs: 1000, history: 40 }) {}

  reset() {
    this.samples = [];
    this.offset = undefined;
    this.lastWindow = Number.NEGATIVE_INFINITY;
  }

  /** Local time at which this window should play, or undefined when late or a duplicate. */
  accept(window: number, arrivalMs: number): number | undefined {
    if (window <= this.lastWindow) return undefined;
    const transit = arrivalMs - window * WINDOW_MS;
    this.samples.push(transit);
    if (this.samples.length > this.options.history) this.samples.shift();
    const fastest = Math.min(...this.samples);
    let target: number;
    if (this.samples.length < 10) {
      target = fastest + this.options.initialBufferMs;
    } else {
      const sorted = [...this.samples].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const deviation = sorted.reduce((sum, value) => sum + Math.abs(value - median), 0) / sorted.length;
      target = median + 2 * deviation;
    }
    const buffer = Math.min(this.options.maxBufferMs, Math.max(this.options.minBufferMs, target - fastest));
    const next = fastest + buffer;
    // Move gently so playback never jumps backwards or stalls hard.
    this.offset = this.offset === undefined ? next : this.offset + Math.max(-20, Math.min(40, next - this.offset));
    const playAt = window * WINDOW_MS + this.offset;
    if (playAt < arrivalMs) return undefined;
    this.lastWindow = window;
    return playAt;
  }
}

export interface Hands { keyboard: boolean; pointer: boolean; stressed: boolean }
export interface HandStep { atMs: number; keyboard?: boolean; pointer?: boolean }

/**
 * Turns played windows back into paw movement with the local pup's rules: a
 * key press shows the typing paw for up to 110 ms, pointer motion animates
 * every 4 events, and 18 keys or 10 clicks within 1.2 s show the tense face
 * for 1.8 s. Steps are partial updates at local times.
 */
export class HandsPlayer {
  private recent: Array<{ atMs: number; keyboard: number; clicks: number }> = [];
  private stressedUntil = Number.NEGATIVE_INFINITY;
  private pendingPointer = 0;

  reset() {
    this.recent = [];
    this.stressedUntil = Number.NEGATIVE_INFINITY;
    this.pendingPointer = 0;
  }

  /** Whether the tense face shows at a local time; ask again at `stressedUntilMs`. */
  stressedAt(atMs: number) { return atMs < this.stressedUntil; }
  get stressedUntilMs() { return this.stressedUntil; }

  steps(pulse: Pick<Pulse, 'keyboard' | 'pointer' | 'clicks'>, playAt: number): HandStep[] {
    this.recent = this.recent.filter(entry => entry.atMs > playAt - INPUT_STRESS_WINDOW_MS);
    this.recent.push({ atMs: playAt, keyboard: pulse.keyboard, clicks: pulse.clicks });
    const keys = this.recent.reduce((sum, entry) => sum + entry.keyboard, 0);
    const clicks = this.recent.reduce((sum, entry) => sum + entry.clicks, 0);
    if (keys >= KEYBOARD_STRESS_THRESHOLD || clicks >= POINTER_CLICK_STRESS_THRESHOLD) {
      this.stressedUntil = Math.max(this.stressedUntil, playAt + INPUT_STRESS_HOLD_MS);
    }

    const steps: HandStep[] = [];
    // Spread key presses across the window, as they were typed; the paw rests between them.
    const taps = Math.min(pulse.keyboard, 4);
    for (let index = 0; index < taps; index++) {
      const at = playAt + (index * WINDOW_MS) / taps;
      steps.push({ atMs: at, keyboard: true });
      steps.push({ atMs: Math.min(at + POINTER_ANIMATION_HOLD_MS, playAt + ((index + 1) * WINDOW_MS) / taps - 1), keyboard: false });
    }
    this.pendingPointer += pulse.pointer;
    if (this.pendingPointer >= POINTER_EVENTS_PER_ANIMATION || pulse.clicks > 0) {
      this.pendingPointer = 0;
      steps.push({ atMs: playAt, pointer: true }, { atMs: playAt + POINTER_ANIMATION_HOLD_MS, pointer: false });
    }
    return steps.sort((a, b) => a.atMs - b.atMs);
  }
}
