import { useEffect, useLayoutEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Point } from '../pet/hitTest';
import { trackPixelPointer, visiblePixelHit, type PixelHit } from './pixelPointer';
import { createWindowQueue } from './desktopPanel';

// Mouse-up must finish after mouse-down, including a very fast click or a
// native drag ending. Async Tauri commands otherwise need not arrive in order.
const holds = createWindowQueue();
export const holdPetPointer = (held: boolean) => holds(() => invoke<void>('hold_pet_pointer', { held }));

export function usePixelPointer(enabled: boolean, hover: (hit: PixelHit) => void, dragging: () => boolean) {
  const latest = useRef({ hover, dragging });
  useLayoutEffect(() => { latest.current = { hover, dragging }; });
  useEffect(() => {
    if (!enabled) return;
    const stop = trackPixelPointer({
      position: () => invoke<Point | null>('pet_pointer_position'),
      capture: capture => invoke('set_pet_pointer_capture', { capture }),
      hit: point => visiblePixelHit(document, point),
      hover: target => latest.current.hover(target),
    });
    const hold = (held: boolean) => { void holdPetPointer(held).catch(() => undefined); };
    const down = () => hold(true);
    const up = () => { if (!latest.current.dragging()) hold(false); };
    document.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    window.addEventListener('blur', up);
    return () => {
      stop();
      document.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('blur', up);
      hold(false);
    };
  }, [enabled]);
}
