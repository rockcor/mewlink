import { describe, expect, it } from 'vitest';
import { petSkins } from '../domain/types';
import { petSkinFilters } from './skins';

describe('pet skin themes', () => {
  it('defines one visibly distinct full-scene palette for every skin', () => {
    expect(Object.keys(petSkinFilters)).toEqual([...petSkins]);
    expect(new Set(Object.values(petSkinFilters)).size).toBe(petSkins.length);
  });
});
