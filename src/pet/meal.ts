// Resting at a mealtime of its own clock, a pup is having a meal (art:
// rig/meal.py) instead of asleep on its cushion. Each app decides for its
// own pup, by its own time zone, and says so with its heartbeat
// (ActivitySegment.meal), so TA's pup eats at TA's mealtimes.

/** Breakfast, lunch and dinner, in minutes of the pup's own day. */
export const MEALS: readonly (readonly [number, number])[] = [[7 * 60, 9 * 60], [11 * 60 + 30, 13 * 60 + 30], [17 * 60 + 30, 19 * 60 + 30]];
/** Away from the computer for longer than a meal takes, it is not eating (it went to bed, or out). */
export const MEAL_LONGEST_MINUTES = 2 * 60;

/**
 * Whether a resting pup is eating at `minute` (minutes since the epoch): its
 * own clock (`utcOffsetMinutes`) is at a mealtime, and it left the computer
 * (`leftAt`, its last input, in minutes since the epoch) a meal's length ago at most.
 */
export function eating(minute: number, utcOffsetMinutes: number, leftAt: number | undefined) {
  if (leftAt === undefined || minute - leftAt > MEAL_LONGEST_MINUTES) return false;
  const time = ((minute + utcOffsetMinutes) % 1440 + 1440) % 1440;
  return MEALS.some(([from, to]) => time >= from && time < to);
}
