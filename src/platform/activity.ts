import { invoke } from '@tauri-apps/api/core';
import type { ActivityKind } from '../domain/types';

export type InputKind = 'keyboard' | 'pointer' | 'none';
export type InputMotion = InputKind | 'both';
export interface PresenceSignal { idleSeconds: number; locked: boolean; appClass?: 'editor' | 'reader' | 'meeting' | 'media' | 'browser' | 'unknown'; inputKind?: InputKind }
export interface InputSignal { keyboardSequence: number; pointerSequence: number; recentKind: InputKind }
export interface InputChanges { keyboard: boolean; pointer: boolean }
export interface ActivityProbe { sample(): Promise<PresenceSignal> }
export interface InputProbe { sample(): Promise<InputSignal> }

export const classify = (signal: PresenceSignal): ActivityKind => {
  if (signal.locked || signal.idleSeconds >= 600) return 'rest';
  if (signal.idleSeconds >= 120) return 'idle';
  const map: Record<NonNullable<PresenceSignal['appClass']>, ActivityKind> = {
    editor: 'coding', reader: 'reading', meeting: 'meeting', media: 'video', browser: 'browsing', unknown: 'browsing'
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
  if (activity !== 'coding') return 'none';
  if (keyboard && pointer) return 'both';
  if (keyboard) return 'keyboard';
  if (pointer) return 'pointer';
  return 'none';
};

export const inputChangesForSequence = (previous: InputSignal, current: InputSignal): InputChanges => ({
  keyboard: current.keyboardSequence !== previous.keyboardSequence,
  pointer: current.pointerSequence !== previous.pointerSequence,
});

class TauriProbe implements ActivityProbe { async sample() { return invoke<PresenceSignal>('presence_signal'); } }
class TauriInputProbe implements InputProbe { async sample() { return invoke<InputSignal>('input_signal'); } }

const demoInput = {
  lastInput: Date.now(),
  recentKind: 'none' as InputKind,
  keyboardSequence: 0,
  pointerSequence: 0,
};

if (typeof window !== 'undefined') {
  ['pointerdown', 'pointermove', 'wheel'].forEach(name => window.addEventListener(name, () => {
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
  private readonly demoClasses: NonNullable<PresenceSignal['appClass']>[] = ['editor', 'reader', 'meeting', 'media', 'browser'];
  async sample(): Promise<PresenceSignal> {
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
      recentKind: Date.now() - demoInput.lastInput <= 120 ? demoInput.recentKind : 'none',
    };
  }
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export const activityProbe: ActivityProbe = isTauri ? new TauriProbe() : typeof window !== 'undefined' ? new DemoProbe() : { sample: async () => ({ idleSeconds: 0, locked: false, appClass: 'unknown' }) };
export const inputProbe: InputProbe = isTauri ? new TauriInputProbe() : typeof window !== 'undefined' ? new DemoInputProbe() : { sample: async () => ({ keyboardSequence: 0, pointerSequence: 0, recentKind: 'none' }) };
