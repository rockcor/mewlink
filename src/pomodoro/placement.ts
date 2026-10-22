// Where a pomodoro stands in its pup's 384x256 frame (see components/PomodoroTimer).

/**
 * Where it stands (frame pixels, centre): bottom left of the desk, beside the
 * monitor stand. The water cup always goes right of the mouse, so the two
 * never meet, whatever arrives first.
 */
export const SPOT = { x: 40, y: 222 };
/** Lifted next to the paw on the mouse while it is wound up, then carried over. */
export const PAW = { x: 318, y: 166 };
/** Frame pixels to the pet box's pixels (the strip's 384 px frame is drawn 230 px wide, 2 px in). */
export const FRAME_SCALE = 230 / 384;

/**
 * Frame x (centre) for TA's timer so it stays clear of my waiting cup. My cup
 * stands right of my mouse, in the gap where the two pups' frames overlap, so
 * at some distances it reaches TA's bottom-left spot; then the timer stands a
 * little further right. Geometry as in styles.css (.pet-pair) and pet.css
 * (.waiting-cup.target-self: 208 px x scale, 16 px wide plus a 7 px handle).
 */
export function clearOfMyCup(selfScale: number, partnerScale: number, distancePx: number) {
  const gap = distancePx * (selfScale + partnerScale) / 2;
  const width = 114 * selfScale + gap + 114 * partnerScale;
  const partnerLeft = width - 228 - 114 * (partnerScale - 1);
  // The timer's tomato in the pair's pixels, for a centre at frame x `cx` (scaled about the pup's centre).
  const tomato = (cx: number) => [-23, 23].map(edge => partnerLeft + 114 + (-2 + (cx + edge) * FRAME_SCALE - 114) * partnerScale);
  const [cupLeft, cupRight] = [208 * selfScale - 3, 208 * selfScale + 23 + 3];
  const [left, right] = tomato(SPOT.x);
  if (right <= cupLeft || left >= cupRight) return SPOT.x;
  const needed = ((cupRight - partnerLeft - 114) / partnerScale + 116) / FRAME_SCALE + 23;
  return Math.min(150, Math.ceil(needed));
}
