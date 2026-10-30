interface Point { clientX: number; clientY: number }

const contains = (rect: DOMRect, { clientX, clientY }: Point) =>
  rect.width > 0 && rect.height > 0 && clientX >= rect.left && clientX < rect.left + rect.width
    && clientY >= rect.top && clientY < rect.top + rect.height;

/** Only the app's own artwork is sampled, never the desktop or screen content. */
export function petHitAt(avatar: HTMLElement, point: Point): boolean {
  if (!contains(avatar.getBoundingClientRect(), point)) return false;
  let unreadable = false;
  for (const canvas of avatar.querySelectorAll('canvas')) {
    if (canvas.width <= 1 || canvas.height <= 1 || getComputedStyle(canvas).visibility === 'hidden') continue;
    const rect = canvas.getBoundingClientRect();
    if (!contains(rect, point)) continue;
    const context = canvas.getContext('2d');
    if (!context) continue;
    try {
      const x = Math.min(canvas.width - 1, Math.floor((point.clientX - rect.left) / rect.width * canvas.width));
      const y = Math.min(canvas.height - 1, Math.floor((point.clientY - rect.top) / rect.height * canvas.height));
      // Ignore transparent padding and the faint drop shadow around a pet.
      if (context.getImageData(x, y, 1, 1).data[3] >= 32) return true;
    } catch {
      // Older WebKit can refuse a canvas read. Keep the compact button usable.
      unreadable = true;
    }
  }
  for (const sprite of avatar.querySelectorAll('.pet-sprite:not(.canvas-sprite), .hug-desk')) {
    if (getComputedStyle(sprite).visibility === 'hidden') continue;
    const rect = sprite.getBoundingClientRect();
    // An empty desk has no pup above it; do not react to its transparent top.
    const top = sprite.classList.contains('hug-desk') ? rect.top + rect.height * .43 : rect.top;
    if (point.clientY >= top && contains(rect, point)) return true;
  }
  return unreadable;
}
