import type { ActivityKind, InteractionKind } from '../domain/types';

export const WATER_AUTO_DRINK_MS = 15 * 60 * 1_000;
export const ACTIVITY_TRANSITION_MS = 4_800;

export type GestureVariant =
  | 'hug-work'
  | 'hug-meeting'
  | 'hug-leisure'
  | 'hug-idle'
  | 'hug-rest'
  | 'water-work'
  | 'water-meeting'
  | 'water-leisure'
  | 'water-idle'
  | 'water-rest'
  | 'water-drink';

export function gestureFor(action: InteractionKind, receiverActivity: ActivityKind, replaying = false): GestureVariant {
  // Away from the computer the pup sleeps, so idle gets the sleeping interactions.
  const receiver = receiverActivity === 'idle' ? 'rest' : receiverActivity;
  if (action === 'water') return `water-${receiver}` as GestureVariant;
  if (receiver === 'rest' && replaying) return 'hug-idle';
  return `hug-${receiver}` as GestureVariant;
}

export function waterDrinkDelay(placedAt: number, now = Date.now()): number {
  return Math.max(0, placedAt + WATER_AUTO_DRINK_MS - now);
}
