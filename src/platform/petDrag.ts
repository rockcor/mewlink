interface DragPoint { pointerId: number; clientX: number; clientY: number }

/** Native dragging may swallow pointerup or deliver click long after it returns.
 * Suppress that click until a new pointer press, rather than guessing a timeout. */
export class PetDrag {
  private start?: DragPoint;
  dragging = false;
  suppressClick = false;

  press(point: DragPoint) {
    if (this.dragging) return;
    this.suppressClick = false;
    this.start = { pointerId: point.pointerId, clientX: point.clientX, clientY: point.clientY };
  }

  newClick() {
    if (!this.dragging) this.suppressClick = false;
  }

  move(point: DragPoint): boolean {
    const start = this.start;
    if (!start || start.pointerId !== point.pointerId || this.dragging
      || Math.hypot(point.clientX - start.clientX, point.clientY - start.clientY) < 5) return false;
    this.start = undefined;
    this.dragging = true;
    this.suppressClick = true;
    return true;
  }

  release(pointerId: number) {
    if (this.start?.pointerId === pointerId) this.start = undefined;
  }

  finish() {
    this.start = undefined;
    this.dragging = false;
    // Keep suppressClick: the native drag's click can arrive later, or not at all.
  }
}
