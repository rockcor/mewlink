import type { CupStyle } from '../domain/types';
import { PixelIcon } from './PixelIcon';

// Exported from the same Aseprite atlas as the other menu controls.
export function CupIcon({ style }: { style: CupStyle }) {
  return <PixelIcon name={style} className={`cup-icon cup-icon-${style}`} />;
}
