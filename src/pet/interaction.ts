import type { ActivityKind, InteractionKind } from '../domain/types';

export const WATER_AUTO_DRINK_MS = 15 * 60 * 1_000;
export const ACTIVITY_TRANSITION_MS = 4_800;

export type GestureVariant =
  | 'hug-work'
  | 'hug-meeting'
  | 'hug-idle'
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

export function gestureFor(action: InteractionKind, receiverActivity: ActivityKind, replaying = false): GestureVariant {
  // Away from the computer the pup sleeps, so idle gets the sleeping interactions.
  const scene = sceneFor(receiverActivity);
  const receiver = scene === 'idle' ? 'rest' : scene;
  if (action === 'water') return `water-${receiver}` as GestureVariant;
  if (receiver === 'rest' && replaying) return 'hug-idle';
  return `hug-${receiver}` as GestureVariant;
}

export function waterDrinkDelay(placedAt: number, now = Date.now()): number {
  return Math.max(0, placedAt + WATER_AUTO_DRINK_MS - now);
}
