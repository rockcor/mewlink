import { describe, expect, it } from 'vitest';
import { loadTucked, saveTucked, stillTucked } from './tucked';

const memory = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

describe('tucked in after a hug', () => {
  it('keeps each pup’s blanket across a restart, and nothing it does not know', () => {
    const storage = memory();
    expect(loadTucked(storage)).toEqual({});
    expect(saveTucked({ partner: 'night' }, storage)).toEqual({ partner: 'night' });
    expect(loadTucked(storage)).toEqual({ partner: 'night' });
    storage.setItem('mewlink.tucked.v1', JSON.stringify({ self: 'plaid', partner: 'mint' }));
    expect(loadTucked(storage)).toEqual({ partner: 'mint' });
    storage.setItem('mewlink.tucked.v1', '{broken');
    expect(loadTucked(storage)).toEqual({});
  });

  it('takes the blanket off a pup that gets up, and keeps the same state otherwise', () => {
    const tucked = { self: 'blush' as const, partner: 'night' as const };
    expect(stillTucked(tucked, { self: true, partner: true })).toBe(tucked);
    expect(stillTucked(tucked, { self: false, partner: true })).toEqual({ partner: 'night' });
    expect(stillTucked({}, { self: false, partner: false })).toEqual({});
  });
});
