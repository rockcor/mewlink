import type { CSSProperties } from 'react';

const icons = ['settings', 'statistics', 'hug', 'replay', 'close', 'ceramic', 'tumbler', 'bottle'] as const;
export type PixelIconName = typeof icons[number];

export function PixelIcon({ name, className = '' }: { name: PixelIconName; className?: string }) {
  return <span aria-hidden="true" className={`pixel-icon ${className}`} data-icon={name}
    style={{ '--icon-position': `${icons.indexOf(name) / (icons.length - 1) * 100}%` } as CSSProperties} />;
}
