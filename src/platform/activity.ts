import { invoke } from '@tauri-apps/api/core';
import type { ActivityKind } from '../domain/types';

export interface PresenceSignal { idleSeconds: number; locked: boolean; appClass?: 'editor' | 'reader' | 'meeting' | 'media' | 'browser' | 'unknown' }
export interface ActivityProbe { sample(): Promise<PresenceSignal> }

export const classify = (signal: PresenceSignal): ActivityKind => {
  if (signal.locked || signal.idleSeconds >= 600) return 'rest';
  if (signal.idleSeconds >= 120) return 'idle';
  const map: Record<NonNullable<PresenceSignal['appClass']>, ActivityKind> = {
    editor: 'coding', reader: 'reading', meeting: 'meeting', media: 'video', browser: 'browsing', unknown: 'browsing'
  };
  return map[signal.appClass ?? 'unknown'];
};

class TauriProbe implements ActivityProbe { async sample() { return invoke<PresenceSignal>('presence_signal'); } }
class DemoProbe implements ActivityProbe {
  private lastInput = Date.now();
  private readonly demoClasses: NonNullable<PresenceSignal['appClass']>[] = ['editor', 'reader', 'meeting', 'media', 'browser'];
  constructor() { ['pointerdown', 'keydown'].forEach(name => window.addEventListener(name, () => { this.lastInput = Date.now(); })); }
  async sample(): Promise<PresenceSignal> {
    const demoFrame = Math.floor(Date.now() / 8_000) % this.demoClasses.length;
    return { idleSeconds: (Date.now() - this.lastInput) / 1000, locked: document.visibilityState === 'hidden', appClass: this.demoClasses[demoFrame] };
  }
}
export const activityProbe: ActivityProbe = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? new TauriProbe() : typeof window !== 'undefined' ? new DemoProbe() : { sample: async () => ({ idleSeconds: 0, locked: false, appClass: 'unknown' }) };
