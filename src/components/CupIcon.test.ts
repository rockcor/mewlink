import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { cupStyles } from '../domain/types';
import { CupIcon } from './CupIcon';

describe('built-in mug icons', () => {
  it('uses an Aseprite atlas cell for every mug without emoji dependencies', () => {
    const icons = cupStyles.map(style => renderToStaticMarkup(createElement(CupIcon, { style })));
    for (const icon of icons) {
      expect(icon).toContain('pixel-icon');
      expect(icon).toContain('data-icon=');
      expect(icon).toContain('--icon-position:');
      expect(icon).not.toContain('🥤');
    }
    expect(new Set(icons).size).toBe(3);
  });
});
