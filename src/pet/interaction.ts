import type { ActivityKind, InteractionKind } from '../domain/types';

export const WATER_AUTO_DRINK_MS = 15 * 60 * 1_000;
export const ACTIVITY_TRANSITION_MS = 4_800;

export type GestureVariant =
  | 'hug'
  | 'water-work'
  | 'water-meeting'
  | 'water-idle'
  | 'water-rest'
  | 'water-drink';

/**
 * The scene a pup shows for an activity. Watching videos (leisure, from media
 * apps and older versions) is drawn at the desk like any other screen time;
 * the activity itself is kept, so it never counts as work in the statistics.
 */
export const sceneFor = (activity: ActivityKind): Exclude<ActivityKind, 'leisure'> => activity === 'leisure' ? 'work' : activity;

/**
 * The gesture for the receiver's activity. A cup has a strip per scene; a hug
 * happens at whatever desk the receiver is showing (pet/hugVisit.ts): the
 * sender is always at the computer (they just pressed the button), so it is
 * both working, or the receiver away and asleep (tucked in); never both away.
 */
export function gestureFor(action: InteractionKind, receiverActivity: ActivityKind): GestureVariant {
  if (action === 'hug') return 'hug';
  // Away from the computer the pup sleeps, so idle gets the sleeping interactions.
  const scene = sceneFor(receiverActivity);
  return `water-${scene === 'idle' ? 'rest' : scene}` as GestureVariant;
}

export function waterDrinkDelay(placedAt: number, now = Date.now()): number {
  return Math.max(0, placedAt + WATER_AUTO_DRINK_MS - now);
}
