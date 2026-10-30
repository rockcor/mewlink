import { petHitAt, spritePixelHit, visiblyPainted, type Point } from '../pet/hitTest';

export type PixelHit = 'self' | 'partner' | 'menu' | 'control' | undefined;

function cloudHit(button: HTMLElement, point: Point): boolean {
  for (const shape of button.querySelectorAll<SVGGeometryElement>('.whats-new-fill > *')) {
    const matrix = shape.getScreenCTM();
    if (matrix && shape.isPointInFill(new DOMPoint(point.clientX, point.clientY).matrixTransform(matrix.inverse()))) return true;
  }
  return false;
}

/** Visible controls win over artwork behind them. Hidden menus never count. */
export function visiblePixelHit(document: Document, point: Point): PixelHit {
  for (const element of document.elementsFromPoint(point.clientX, point.clientY)) {
    const control = element.closest<HTMLElement>('button, input, select, textarea, [role="slider"]');
    if (!control || control.closest('.pet-avatar') || !visiblyPainted(control)) continue;
    if (control.classList.contains('whats-new') && !cloudHit(control, point)) continue;
    const menu = control.closest('.hover-ui');
    if (menu && !menu.classList.contains('menu-visible')) continue;
    return menu ? 'menu' : 'control';
  }
  for (const pet of document.querySelectorAll<HTMLElement>('.pet-avatar')) {
    if (petHitAt(pet, point)) return pet.classList.contains('partner-pet') ? 'partner' : 'self';
  }
  for (const walker of document.querySelectorAll<HTMLElement>('.hug-walker')) {
    if (spritePixelHit(walker, point)) return walker.dataset.petTarget === 'partner' ? 'partner' : 'self';
  }
}

interface Options {
  position: () => Promise<Point | null>;
  capture: (capture: boolean) => Promise<unknown>;
  hit: (point: Point) => PixelHit;
  hover: (hit: PixelHit) => void;
}

/** Single in-flight probe. Still works while the native window ignores mouse
 * events; no dependence on mouseenter, and no per-frame bitmap allocations. */
export function trackPixelPointer({ position, capture, hit, hover }: Options) {
  let stopped = false;
  let captured: boolean | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function tick() {
    let inside = false;
    try {
      const point = await position();
      if (stopped) return;
      inside = Boolean(point);
      const target = point ? hit(point) : undefined;
      hover(target);
      const next = target !== undefined;
      if (captured !== next) {
        await capture(next);
        captured = next;
      }
    } catch {
      // A failed sample must not leave an invisible rectangular input shield.
      if (!stopped) {
        await capture(false).catch(() => undefined);
        captured = undefined;
      }
    }
    if (!stopped) timer = setTimeout(() => { void tick(); }, inside ? 16 : 32);
  }
  void tick();
  return () => { stopped = true; clearTimeout(timer); };
}
