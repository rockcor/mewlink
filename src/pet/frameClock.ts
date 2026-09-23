// A canvas must not depend on CSS animation events for state reconciliation:
// WebKit can omit them when background-image is none, or motion is reduced.
export function spriteClock(elapsedMs: number, durationMs: number, frames: number, loop: boolean) {
  const duration = Math.max(1, durationMs);
  const elapsed = Math.max(0, elapsedMs);
  const cycle = Math.floor(elapsed / duration);
  const complete = !loop && elapsed >= duration;
  const progress = complete ? 1 : (elapsed % duration) / duration;
  return {
    cycle,
    complete,
    frame: Math.min(frames - 1, Math.floor(progress * frames)),
    nextMs: Math.max(8, duration / frames - elapsed % (duration / frames) + 1),
  };
}
