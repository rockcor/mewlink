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
  if (action === 'water') return `water-${receiverActivity}` as GestureVariant;
  if (receiverActivity === 'rest' && replaying) return 'hug-idle';
  return `hug-${receiverActivity}` as GestureVariant;
}

export function waterDrinkDelay(placedAt: number, now = Date.now()): number {
  return Math.max(0, placedAt + WATER_AUTO_DRINK_MS - now);
}
