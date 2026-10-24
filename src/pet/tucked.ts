import type { BlanketStyle } from '../domain/types';
import type { PetTarget } from './pendingCups';

// A pup tucked in by a hug keeps the blanket over it while it sleeps on; it
// is gone once the pup gets up. Kept across a restart of the app.
export type Tucked = Partial<Record<PetTarget, BlanketStyle>>;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const KEY = 'mewlink.tucked.v1';
const BLANKETS: readonly BlanketStyle[] = ['blush', 'night', 'mint'];
const defaultStorage = () => typeof localStorage === 'undefined' ? undefined : localStorage;

export function loadTucked(storage: StorageLike | undefined = defaultStorage()): Tucked {
  try {
    const value = JSON.parse(storage?.getItem(KEY) ?? '{}') as Record<string, unknown>;
    const tucked: Tucked = {};
    for (const side of ['self', 'partner'] as const) {
      if (BLANKETS.includes(value[side] as BlanketStyle)) tucked[side] = value[side] as BlanketStyle;
    }
    return tucked;
  } catch {
    return {};
  }
}

/** Saves and returns the new state (so it can be the result of a state update). */
export function saveTucked(tucked: Tucked, storage: StorageLike | undefined = defaultStorage()): Tucked {
  try { storage?.setItem(KEY, JSON.stringify(tucked)); } catch { /* it lasts this session */ }
  return tucked;
}

/** Without the blankets of pups that are up again (or gone, for TA). */
export function stillTucked(tucked: Tucked, asleep: Record<PetTarget, boolean>): Tucked {
  const next: Tucked = {};
  for (const side of ['self', 'partner'] as const) if (tucked[side] && asleep[side]) next[side] = tucked[side];
  return next.self === tucked.self && next.partner === tucked.partner ? tucked : next;
}
