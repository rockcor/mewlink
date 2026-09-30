export interface CachedBitmap { bytes: number; dispose(): void }
interface Entry<T> { ready: Promise<T>; value?: T; references: number; touched: number }

// Active leases cannot be evicted. Unused sheets are LRU-limited by decoded bytes,
// not compressed PNG size. Pending loads are also discarded on backgrounding.
export class BitmapCache<T extends CachedBitmap> {
  private entries = new Map<string, Entry<T>>();
  private clock = 0;
  private constrained = false;
  constructor(readonly budget: number, private readonly load: (key: string) => Promise<T>) {}
  acquire(key: string) {
    let entry = this.entries.get(key);
    if (!entry) {
      const created: Entry<T> = { ready: undefined as unknown as Promise<T>, references: 0, touched: ++this.clock };
      this.entries.set(key, created);
      created.ready = this.load(key).then(value => {
        if (this.entries.get(key) !== created) { value.dispose(); throw new Error('Bitmap load cancelled'); }
        created.value = value;
        this.trim();
        return value;
      }).catch(error => {
        if (this.entries.get(key) === created) this.entries.delete(key);
        throw error;
      });
      entry = created;
    }
    entry.references++;
    entry.touched = ++this.clock;
    let released = false;
    return {
      ready: entry.ready,
      release: () => {
        if (released) return;
        released = true;
        entry.references--;
        this.trim();
      },
    };
  }
  get bytes() { return [...this.entries.values()].reduce((sum, entry) => sum + (entry.value?.bytes ?? 0), 0); }
  get size() { return this.entries.size; }
  has(key: string) { return Boolean(this.entries.get(key)?.value); }
  setConstrained(value: boolean) { this.constrained = value; if (value) this.clearUnused(); }
  private trim() {
    if (this.constrained) { this.clearUnused(); return; }
    for (const [key, entry] of [...this.entries].sort((a, b) => a[1].touched - b[1].touched)) {
      if (this.bytes <= this.budget) break;
      if (entry.references === 0 && entry.value) { entry.value.dispose(); this.entries.delete(key); }
    }
  }
  clearUnused() {
    for (const [key, entry] of this.entries) if (entry.references === 0) {
      entry.value?.dispose();
      this.entries.delete(key);
    }
  }
}
