import { invoke } from '@tauri-apps/api/core';
import type { ActivityKind } from '../domain/types';

export type InputKind = 'keyboard' | 'pointer' | 'none';
export interface PresenceSignal { idleSeconds: number; locked: boolean; appClass?: 'editor' | 'reader' | 'meeting' | 'media' | 'browser' | 'unknown'; inputKind?: InputKind }
export interface ActivityProbe { sample(): Promise<PresenceSignal> }

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

class TauriProbe implements ActivityProbe { async sample() { return invoke<PresenceSignal>('presence_signal'); } }
class DemoProbe implements ActivityProbe {
  private lastInput = Date.now();
  private inputKind: InputKind = 'none';
  private readonly demoClasses: NonNullable<PresenceSignal['appClass']>[] = ['editor', 'reader', 'meeting', 'media', 'browser'];
  constructor() {
    ['pointerdown', 'pointermove', 'wheel'].forEach(name => window.addEventListener(name, () => { this.lastInput = Date.now(); this.inputKind = 'pointer'; }, { passive: true }));
    window.addEventListener('keydown', () => { this.lastInput = Date.now(); this.inputKind = 'keyboard'; });
  }
  async sample(): Promise<PresenceSignal> {
    const demoFrame = Math.floor(Date.now() / 8_000) % this.demoClasses.length;
    const idleSeconds = (Date.now() - this.lastInput) / 1000;
    return { idleSeconds, locked: document.visibilityState === 'hidden', appClass: this.demoClasses[demoFrame], inputKind: idleSeconds <= .9 ? this.inputKind : 'none' };
  }
}
export const activityProbe: ActivityProbe = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? new TauriProbe() : typeof window !== 'undefined' ? new DemoProbe() : { sample: async () => ({ idleSeconds: 0, locked: false, appClass: 'unknown', inputKind: 'none' }) };
