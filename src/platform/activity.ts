import { invoke } from '@tauri-apps/api/core';
import type { ActivityKind, WorkVisual } from '../domain/types';

export type InputKind = 'keyboard' | 'pointer' | 'none';
export type InputMotion = InputKind | 'both';
export interface PresenceSignal { idleSeconds: number; locked: boolean; appClass?: 'editor' | 'reader' | 'meeting' | 'media' | 'browser' | 'ai' | 'mewlink' | 'unknown'; inputKind?: InputKind }
export interface InputSignal { keyboardSequence: number; pointerSequence: number; pointerClickSequence: number; recentKind: InputKind }
export interface InputChanges { keyboard: boolean; pointer: boolean }
export interface InputBurstSample { at: number; keyboard: number; pointer: number }
export interface ActivityProbe { sample(): Promise<PresenceSignal> }
export interface InputProbe { sample(): Promise<InputSignal> }

export const POINTER_ANIMATION_INTERVAL_MS = 180;
export const POINTER_ANIMATION_HOLD_MS = 110;
export const POINTER_EVENTS_PER_ANIMATION = 4;
export const INPUT_STRESS_WINDOW_MS = 1_200;
export const INPUT_STRESS_HOLD_MS = 1_800;
export const KEYBOARD_STRESS_THRESHOLD = 18;
export const POINTER_STRESS_THRESHOLD = 72;

export const shouldAnimatePointer = (lastAnimationAt: number, now: number) =>
  now - lastAnimationAt >= POINTER_ANIMATION_INTERVAL_MS;

export const classify = (signal: PresenceSignal): ActivityKind => {
  if (signal.locked || signal.idleSeconds >= 600) return 'rest';
  if (signal.idleSeconds >= 120) return 'idle';
  const map: Record<NonNullable<PresenceSignal['appClass']>, ActivityKind> = {
    editor: 'work', reader: 'work', meeting: 'meeting', media: 'leisure', browser: 'work', ai: 'work', mewlink: 'work', unknown: 'work'
  };
  return map[signal.appClass ?? 'unknown'];
};

export const nextSampleDelay = (signal: PresenceSignal) => {
  if (signal.locked) return 5_000;
  if (signal.idleSeconds >= 120) return 900;
  if (signal.inputKind && signal.inputKind !== 'none') return 260;
  return 500;
};

export const visualInputForActivity = (activity: ActivityKind, keyboard: boolean, pointer: boolean): InputMotion => {
  if (activity !== 'work') return 'none';
  if (keyboard && pointer) return 'both';
  if (keyboard) return 'keyboard';
  if (pointer) return 'pointer';
  return 'none';
};

export const workVisualFor = (signal: PresenceSignal): WorkVisual => {
  if (signal.appClass === 'mewlink') return 'mewlink';
  if (signal.appClass === 'ai') return 'ai';
  if (signal.appClass === 'editor') return 'code';
  if (signal.appClass === 'reader') return 'document';
  return 'web';
};

export const trimInputBurst = (samples: InputBurstSample[], now: number) =>
  samples.filter(sample => sample.at >= now - INPUT_STRESS_WINDOW_MS);

export const inputBurstReached = (samples: InputBurstSample[]) => {
  let keyboard = 0;
  let pointer = 0;
  for (const sample of samples) {
    keyboard += sample.keyboard;
    pointer += sample.pointer;
  }
  return keyboard >= KEYBOARD_STRESS_THRESHOLD || pointer >= POINTER_STRESS_THRESHOLD;
};

export const inputChangesForSequence = (previous: InputSignal, current: InputSignal): InputChanges => ({
  keyboard: current.keyboardSequence !== previous.keyboardSequence,
  pointer: current.pointerSequence !== previous.pointerSequence,
});

export const pointerEventsForSequence = (previous: InputSignal, current: InputSignal) =>
  current.pointerSequence >= previous.pointerSequence
    ? current.pointerSequence - previous.pointerSequence
    : 1;

export const pointerClicksForSequence = (previous: InputSignal, current: InputSignal) =>
  current.pointerClickSequence >= previous.pointerClickSequence
    ? current.pointerClickSequence - previous.pointerClickSequence
    : 1;

export const keyboardEventsForSequence = (previous: InputSignal, current: InputSignal) =>
  current.keyboardSequence >= previous.keyboardSequence
    ? current.keyboardSequence - previous.keyboardSequence
    : 1;

class TauriProbe implements ActivityProbe { async sample() { return invoke<PresenceSignal>('presence_signal'); } }
class TauriInputProbe implements InputProbe { async sample() { return invoke<InputSignal>('input_signal'); } }

const demoInput = {
  lastInput: Date.now(),
  recentKind: 'none' as InputKind,
  keyboardSequence: 0,
  pointerSequence: 0,
  pointerClickSequence: 0,
};

const demoActivityClass: Record<ActivityKind, NonNullable<PresenceSignal['appClass']>> = {
  work: 'editor',
  meeting: 'meeting',
  leisure: 'media',
  idle: 'unknown',
  rest: 'unknown',
};
const demoTransitionPair = (() => {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return undefined;
  const value = new URLSearchParams(window.location.search).get('transitionQa');
  const match = value?.match(/^(work|meeting|leisure)-(work|meeting|leisure)$/);
  if (!match || match[1] === match[2]) return undefined;
  return { from: match[1] as ActivityKind, to: match[2] as ActivityKind, startedAt: Date.now() };
})();

export const demoInitialActivity = demoTransitionPair?.from;
export const demoInitialWorkVisual: WorkVisual = demoTransitionPair?.from === 'work' ? 'code' : 'web';

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => {
    demoInput.lastInput = Date.now();
    demoInput.recentKind = 'pointer';
    demoInput.pointerSequence += 1;
    demoInput.pointerClickSequence += 1;
  }, { passive: true });
  ['pointermove', 'wheel'].forEach(name => window.addEventListener(name, () => {
    demoInput.lastInput = Date.now();
    demoInput.recentKind = 'pointer';
    demoInput.pointerSequence += 1;
  }, { passive: true }));
  window.addEventListener('keydown', () => {
    demoInput.lastInput = Date.now();
    demoInput.recentKind = 'keyboard';
    demoInput.keyboardSequence += 1;
  });
}

class DemoProbe implements ActivityProbe {
  private readonly demoClasses: NonNullable<PresenceSignal['appClass']>[] = ['editor', 'reader', 'ai', 'mewlink', 'meeting', 'media', 'browser'];
  async sample(): Promise<PresenceSignal> {
    if (demoTransitionPair) {
      const activity = Date.now() - demoTransitionPair.startedAt < 800 ? demoTransitionPair.from : demoTransitionPair.to;
      return { idleSeconds: 0, locked: false, appClass: demoActivityClass[activity] };
    }
    const demoFrame = Math.floor(Date.now() / 8_000) % this.demoClasses.length;
    const idleSeconds = (Date.now() - demoInput.lastInput) / 1000;
    return { idleSeconds, locked: document.visibilityState === 'hidden', appClass: this.demoClasses[demoFrame] };
  }
}

class DemoInputProbe implements InputProbe {
  async sample(): Promise<InputSignal> {
    return {
      keyboardSequence: demoInput.keyboardSequence,
      pointerSequence: demoInput.pointerSequence,
      pointerClickSequence: demoInput.pointerClickSequence,
      recentKind: Date.now() - demoInput.lastInput <= 120 ? demoInput.recentKind : 'none',
    };
  }
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export const activityProbe: ActivityProbe = isTauri ? new TauriProbe() : typeof window !== 'undefined' ? new DemoProbe() : { sample: async () => ({ idleSeconds: 0, locked: false, appClass: 'unknown' }) };
export const inputProbe: InputProbe = isTauri ? new TauriInputProbe() : typeof window !== 'undefined' ? new DemoInputProbe() : { sample: async () => ({ keyboardSequence: 0, pointerSequence: 0, pointerClickSequence: 0, recentKind: 'none' }) };
