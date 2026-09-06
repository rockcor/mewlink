import type { PetSkin } from '../domain/types';

export const petSkinFilters: Record<PetSkin, string> = {
  cream: 'brightness(1)',
  peach: 'hue-rotate(24deg) saturate(1.06) brightness(1.02)',
  mint: 'hue-rotate(136deg) saturate(.9) brightness(1.03)',
  sky: 'hue-rotate(205deg) saturate(.9) brightness(1.03)',
  lavender: 'hue-rotate(276deg) saturate(.94) brightness(1.02)',
};
