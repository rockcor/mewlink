import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { spriteSheets } from '../pet/spriteAssets';

export function useRenderBudget(locked: boolean) {
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  const paused = hidden || locked;
  useEffect(() => {
    spriteSheets.setConstrained(paused);
    if ('__TAURI_INTERNALS__' in window) {
      // Do not suspend the WebView: relay delivery and timers must remain alive.
      void invoke('set_low_memory_mode', { lowMemory: paused }).catch(() => undefined);
    }
  }, [paused]);
  return paused;
}
