import { invoke, isTauri } from '@tauri-apps/api/core';
import { disable, isEnabled } from '@tauri-apps/plugin-autostart';

export interface AutostartBackend {
  isEnabled: () => Promise<boolean>;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}
export interface AutostartState {
  enabled?: boolean;
  phase: 'checking' | 'ready' | 'saving' | 'error' | 'unsupported';
  error?: 'read' | 'write';
}

// The OS is authoritative: never persist a competing localStorage preference
// or re-enable an entry the user removed in System Settings / Task Manager.
export function createAutostartController(backend?: AutostartBackend) {
  let state: AutostartState = { phase: backend ? 'checking' : 'unsupported' };
  let pending = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = (next: AutostartState) => { state = next; listeners.forEach(listener => listener()); };
  const enqueue = (operation: () => Promise<void>) => {
    const result = pending.then(operation);
    pending = result.catch(() => undefined);
    return result;
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh: () => enqueue(async () => {
      if (!backend) return;
      publish({ ...state, phase: 'checking', error: undefined });
      try { publish({ enabled: await backend.isEnabled(), phase: 'ready' }); }
      catch { publish({ phase: 'error', error: 'read' }); }
    }),
    setEnabled: (enabled: boolean) => enqueue(async () => {
      if (!backend) return;
      publish({ ...state, phase: 'saving', error: undefined });
      try {
        if (enabled) await backend.enable(); else await backend.disable();
        const actual = await backend.isEnabled();
        publish({ enabled: actual, phase: actual === enabled ? 'ready' : 'error', ...(actual !== enabled ? { error: 'write' as const } : {}) });
      } catch {
        // A failed write may still have changed the OS entry. Re-read instead
        // of optimistically showing success or blindly restoring a stale value.
        const actual = await backend.isEnabled().catch(() => undefined);
        publish({ enabled: actual, phase: 'error', error: 'write' });
      }
    }),
  };
}

let controller: ReturnType<typeof createAutostartController> | undefined;
export function getAutostartController() {
  // Keep in-flight work serialized even when the settings panel is reopened.
  return controller ??= createAutostartController(isTauri() ? {
    isEnabled, disable, enable: () => invoke<void>('enable_autostart'),
  } : undefined);
}
