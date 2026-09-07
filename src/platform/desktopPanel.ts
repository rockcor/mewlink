import { invoke } from '@tauri-apps/api/core';

// Serialize open/close/restore, including rapid toggles and React StrictMode effects.
export function createWindowQueue() {
  let pending = Promise.resolve();
  return (operation: () => Promise<void>) => {
    const result = pending.then(operation);
    pending = result.catch(() => undefined);
    return result;
  };
}

export const queueDesktopWindow = createWindowQueue();
export const setDesktopPanel = (open: boolean) => queueDesktopWindow(() => invoke('set_panel_open', { open }));
