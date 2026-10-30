import { describe, expect, it } from 'vitest';
import { petWindowLayout } from './petWindow';

describe('compact native pet window', () => {
  it('ends six pixels above either a single-row or wrapped menu', () => {
    for (const menu of [52, 103, 154]) {
      const { menuBottom, height } = petWindowLayout(menu, 1, 1);
      expect(height - 50 - menuBottom - menu).toBe(6);
    }
  });
  it('leaves room above the larger pet without scaling the artwork', () => {
    const layout = petWindowLayout(103, 0.8, 1.5);
    expect(layout.menuBottom).toBeGreaterThanOrEqual(159 * 1.5 + 8);
    expect(layout.height - 50 - layout.menuBottom - 103).toBe(6);
  });
});
