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
const atDesk = (activity: ActivityKind) => sceneFor(activity) !== 'rest';
/** The desk, and the speaker on its monitor: at work, in a meeting and away from it, and through the changes between them (in place). */
export const deskShown = ({ displayedActivity, transition }: { displayedActivity: ActivityKind; transition?: { from: ActivityKind; to: ActivityKind } }) =>
  transition ? atDesk(transition.from) && atDesk(transition.to) : atDesk(displayedActivity);

/**
 * The gesture for the receiver's activity. A cup has a strip per scene; a hug
 * happens at whatever desk the receiver is showing (pet/hugVisit.ts): the
 * sender is always at the computer (they just pressed the button), so it is
 * both working, or the receiver away and asleep (tucked in); never both away.
 */
export function gestureFor(action: InteractionKind, receiverActivity: ActivityKind): GestureVariant {
  if (action === 'hug') return 'hug';
  // Away, the cup lands on its empty desk to wait for it.
  return `water-${sceneFor(receiverActivity)}` as GestureVariant;
}

export function waterDrinkDelay(placedAt: number, now = Date.now()): number {
  return Math.max(0, placedAt + WATER_AUTO_DRINK_MS - now);
}
