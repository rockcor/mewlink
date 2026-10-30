import type { SpriteSheet } from './spriteAssets';
import { SOURCE_FRAME_HEIGHT as H, SOURCE_FRAME_WIDTH as W } from './spriteAssets';

export interface Point { clientX: number; clientY: number }

const contains = (rect: DOMRect, { clientX, clientY }: Point) =>
  rect.width > 0 && rect.height > 0 && clientX >= rect.left && clientX < rect.left + rect.width
    && clientY >= rect.top && clientY < rect.top + rect.height;

const samplers = new WeakMap<Element, (x: number, y: number) => number>();

/** A 1px surface reuses the decoded sheet. No full-frame readback or screenshot. */
export function registerSpritePixels(node: HTMLElement, sheet: SpriteSheet, frame: () => number) {
  const pixel = document.createElement('canvas');
  pixel.width = pixel.height = 1;
  const context = pixel.getContext('2d', { willReadFrequently: true });
  if (!context) return () => undefined;
  const sample = (x: number, y: number) => {
    context.clearRect(0, 0, 1, 1);
    for (let row = 0; row < sheet.layers; row++) {
      context.drawImage(sheet.image, frame() * W + Math.min(W - 1, Math.floor(x * W)),
        row * H + Math.min(H - 1, Math.floor(y * H)), 1, 1, 0, 0, 1, 1);
    }
    return context.getImageData(0, 0, 1, 1).data[3];
  };
  samplers.set(node, sample);
  return () => { if (samplers.get(node) === sample) samplers.delete(node); pixel.width = pixel.height = 1; };
}

/** Includes ancestor opacity: a faded-out menu/source pose is not clickable. */
export function visiblyPainted(node: Element): boolean {
  let opacity = 1;
  for (let current: Element | null = node; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    const value = Number.parseFloat(style.opacity);
    opacity *= Number.isFinite(value) ? value : 1;
    if (opacity < .01) return false;
  }
  return true;
}

/** Invert the accumulated linear transform, including flipped/rotated frames. */
function unitPoint(node: HTMLElement, point: Point): { x: number; y: number } | undefined {
  const rect = node.getBoundingClientRect();
  if (!contains(rect, point)) return;
  let [a, b, c, d] = [1, 0, 0, 1];
  for (let current: Element | null = node; current; current = current.parentElement) {
    const transform = getComputedStyle(current).transform ?? 'none';
    const numbers = transform.match(/^matrix(3d)?\((.+)\)$/);
    if (!numbers) continue;
    const values = numbers[2].split(',').map(Number);
    const [ma, mb, mc, md] = numbers[1] ? [values[0], values[1], values[4], values[5]] : values;
    [a, b, c, d] = [ma * a + mc * b, mb * a + md * b, ma * c + mc * d, mb * c + md * d];
  }
  const width = node.offsetWidth || rect.width, height = node.offsetHeight || rect.height;
  const xs = [0, a * width, c * height, a * width + c * height];
  const ys = [0, b * width, d * height, b * width + d * height];
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const x = (point.clientX - rect.left) / rect.width * (Math.max(...xs) - minX) + minX;
  const y = (point.clientY - rect.top) / rect.height * (Math.max(...ys) - minY) + minY;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-8) return;
  const localX = (d * x - c * y) / determinant / width;
  const localY = (-b * x + a * y) / determinant / height;
  if (localX < 0 || localX >= 1 || localY < 0 || localY >= 1) return;
  return { x: localX, y: localY };
}

export function spritePixelHit(node: HTMLElement, point: Point): boolean {
  const sampler = samplers.get(node);
  if (!sampler || !visiblyPainted(node)) return false;
  const at = unitPoint(node, point);
  try { return Boolean(at && sampler(at.x, at.y) >= 32); } catch { return false; }
}

/** Only the app's own current artwork, never the desktop or a rectangular fallback. */
export function petHitAt(avatar: HTMLElement, point: Point): boolean {
  for (const sprite of avatar.querySelectorAll<HTMLElement>('[data-sprite]')) {
    if (spritePixelHit(sprite, point)) return true;
  }
  for (const canvas of avatar.querySelectorAll('canvas')) {
    // SpriteCanvas has a source-frame sampler, excluding its padded shadow.
    let owner: Element | null = canvas.parentElement;
    while (owner && !samplers.has(owner)) owner = owner.parentElement;
    if (owner || canvas.width <= 1 || canvas.height <= 1 || !visiblyPainted(canvas)) continue;
    const at = unitPoint(canvas, point);
    if (!at) continue;
    try {
      if ((canvas.getContext('2d')?.getImageData(
        Math.min(canvas.width - 1, Math.floor(at.x * canvas.width)),
        Math.min(canvas.height - 1, Math.floor(at.y * canvas.height)), 1, 1).data[3] ?? 0) >= 32) return true;
    } catch { /* A read failure must never turn transparent space into a box. */ }
  }
  return false;
}
