import { describe, expect, it } from 'vitest';
import { awayNote, loadPawed, savePawed, stillPawed, WORDS_AT } from './away';

function memory() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe('away for a while', () => {
  it('writes on the note while away, as the note lands, and takes the words off as soon as the pup is back', () => {
    expect(awayNote({ displayedActivity: 'idle' })).toBe('shown');
    expect(awayNote({ displayedActivity: 'work', transition: { from: 'work', to: 'idle' } })).toBe('arriving');
    expect(awayNote({ displayedActivity: 'idle', transition: { from: 'idle', to: 'work' } })).toBeUndefined();
    expect(awayNote({ displayedActivity: 'rest' })).toBeUndefined();
    expect(WORDS_AT).toBeGreaterThan(0.5);
    expect(WORDS_AT).toBeLessThan(1);
  });

  it('keeps a visitor’s paw print until that pup is back, across a restart', () => {
    const storage = memory();
    savePawed({ partner: true }, storage);
    const pawed = loadPawed(storage);
    expect(pawed).toEqual({ partner: true });
    expect(stillPawed(pawed, { self: false, partner: true })).toBe(pawed);
    expect(stillPawed(pawed, { self: true, partner: false })).toEqual({});
    storage.setItem('mewlink.pawed.v1', '{"self":"yes","partner":true}');
    expect(loadPawed(storage)).toEqual({ partner: true });
    storage.setItem('mewlink.pawed.v1', 'not json');
    expect(loadPawed(storage)).toEqual({});
  });
});
