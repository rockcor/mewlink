import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { cupStyles } from '../domain/types';
import { CupIcon } from './CupIcon';

describe('built-in mug icons', () => {
  it('renders a sized vector for every mug without requiring emoji support', () => {
    const icons = cupStyles.map(style => renderToStaticMarkup(createElement(CupIcon, { style })));
    for (const icon of icons) {
      expect(icon).toContain('<svg');
      expect(icon).toContain('<path');
      expect(icon).toContain('width="24"');
      expect(icon).not.toContain('🥤');
    }
    expect(new Set(icons).size).toBe(3);
  });
});
