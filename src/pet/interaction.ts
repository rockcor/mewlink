import type { ActivityKind, InteractionKind } from '../domain/types';

export const WATER_AUTO_DRINK_MS = 15 * 60 * 1_000;
export const ACTIVITY_TRANSITION_MS = 4_800;

export type GestureVariant =
  | 'hug-work'
  | 'hug-rest'
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
 * The gesture strip for the receiver's activity. The sender is always at the
 * computer (they just pressed the button), so a hug is either both working
 * (the receiver at its desk, meetings included) or the receiver away and
 * asleep (tucked in); never both away.
 */
export function gestureFor(action: InteractionKind, receiverActivity: ActivityKind): GestureVariant {
  // Away from the computer the pup sleeps, so idle gets the sleeping interactions.
  const scene = sceneFor(receiverActivity);
  const receiver = scene === 'idle' ? 'rest' : scene;
  if (action === 'water') return `water-${receiver}` as GestureVariant;
  return receiver === 'rest' ? 'hug-rest' : 'hug-work';
}

export function waterDrinkDelay(placedAt: number, now = Date.now()): number {
  return Math.max(0, placedAt + WATER_AUTO_DRINK_MS - now);
}
