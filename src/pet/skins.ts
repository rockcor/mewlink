import type { PetSkin } from '../domain/types';

export const petSkinFilters: Record<PetSkin, string> = {
  cream: 'brightness(1) saturate(1)',
  peach: 'sepia(.58) saturate(1.62) hue-rotate(338deg) brightness(1.015) contrast(1.055)',
  mint: 'hue-rotate(105deg) saturate(1.28) brightness(1.025) contrast(1.045)',
  sky: 'hue-rotate(208deg) saturate(1.38) brightness(1.015) contrast(1.05)',
  lavender: 'hue-rotate(292deg) saturate(1.35) brightness(1.015) contrast(1.045)',
  luka: 'grayscale(.72) sepia(.12) saturate(.42) brightness(1.09) contrast(1.1)',
  sixtySix: 'sepia(.82) saturate(1.32) hue-rotate(342deg) brightness(.91) contrast(1.16)',
};
