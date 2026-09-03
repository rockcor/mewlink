import { invoke } from '@tauri-apps/api/core';
import type { ActivityKind } from '../domain/types';

export interface PresenceSignal { idleSeconds: number; locked: boolean; appClass?: 'editor' | 'reader' | 'meeting' | 'browser' | 'unknown' }
export interface ActivityProbe { sample(): Promise<PresenceSignal> }

export const classify = (signal: PresenceSignal): ActivityKind => {
  if (signal.locked || signal.idleSeconds >= 600) return 'rest';
  if (signal.idleSeconds >= 120) return 'idle';
  const map: Record<NonNullable<PresenceSignal['appClass']>, ActivityKind> = {
    editor: 'coding', reader: 'reading', meeting: 'meeting', browser: 'browsing', unknown: 'browsing'
  };
  return map[signal.appClass ?? 'unknown'];
};

class TauriProbe implements ActivityProbe { async sample() { return invoke<PresenceSignal>('presence_signal'); } }
class DemoProbe implements ActivityProbe {
  private lastInput = Date.now();
  constructor() { ['pointerdown', 'keydown'].forEach(name => window.addEventListener(name, () => { this.lastInput = Date.now(); })); }
  async sample(): Promise<PresenceSignal> { return { idleSeconds: (Date.now() - this.lastInput) / 1000, locked: document.visibilityState === 'hidden', appClass: 'editor' }; }
}
export const activityProbe: ActivityProbe = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? new TauriProbe() : typeof window !== 'undefined' ? new DemoProbe() : { sample: async () => ({ idleSeconds: 0, locked: false, appClass: 'unknown' }) };
