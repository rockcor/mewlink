import type { ShownActivity } from '../domain/types';
import type { PetTarget } from './pendingCups';
import layout from './away.json';

// Away for a while (idle): the pup's desk without it, the screen on standby
// and a sticky note on it (art/aseprite/rig/away.py). The words on the note
// are the app's, in the viewer's language (components/AwayNote.tsx).

export { layout as awayLayout };

/** When the words appear in the change to away: as the note lands (0..1 of it). */
export const WORDS_AT = layout.noteLands / (layout.transitionFrames - 1);

/** The note's words: while away; arriving, once the note has landed; gone as soon as the pup comes back. */
export function awayNote({ displayedActivity, transition }: { displayedActivity: ShownActivity; transition?: { from: ShownActivity; to: ShownActivity } }) {
  if (transition) return transition.to === 'idle' ? 'arriving' as const : undefined;
  return displayedActivity === 'idle' ? 'shown' as const : undefined;
}

// A pup visiting an away pup leaves a paw print on its note; it is there
// until that pup is back (or, for TA, no longer away here). Kept across a
// restart of the app.
export type Pawed = Partial<Record<PetTarget, true>>;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const KEY = 'mewlink.pawed.v1';
const defaultStorage = () => typeof localStorage === 'undefined' ? undefined : localStorage;

export function loadPawed(storage: StorageLike | undefined = defaultStorage()): Pawed {
  try {
    const value = JSON.parse(storage?.getItem(KEY) ?? '{}') as Record<string, unknown>;
    const pawed: Pawed = {};
    for (const side of ['self', 'partner'] as const) if (value[side] === true) pawed[side] = true;
    return pawed;
  } catch {
    return {};
  }
}

/** Saves and returns the new state (so it can be the result of a state update). */
export function savePawed(pawed: Pawed, storage: StorageLike | undefined = defaultStorage()): Pawed {
  try { storage?.setItem(KEY, JSON.stringify(pawed)); } catch { /* it lasts this session */ }
  return pawed;
}

/** Without the prints of pups that are back. */
export function stillPawed(pawed: Pawed, away: Record<PetTarget, boolean>): Pawed {
  const next: Pawed = {};
  for (const side of ['self', 'partner'] as const) if (pawed[side] && away[side]) next[side] = true;
  return next.self === pawed.self && next.partner === pawed.partner ? pawed : next;
}
