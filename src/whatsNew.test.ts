import { describe, expect, it } from 'vitest';
import { version } from '../package.json';
import { compareVersions } from './services/update';
import { markWhatsNewSeen, WHATS_NEW, whatsNewToShow } from './whatsNew';

const memory = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, values };
};

describe('what\'s new', () => {
  it('shows once after an update, never on a fresh install', () => {
    const fresh = memory();
    expect(whatsNewToShow('0.3.31', fresh)).toBeUndefined();
    expect(fresh.values.get('mewlink.whatsNew.seen')).toBe('0.3.31');

    // Updating from 0.3.30, which did not record versions yet: its statistics tell it ran before.
    const updated = memory({ 'mewlink.statistics.v3': '{}' });
    expect(whatsNewToShow('0.3.31', updated)).toBe('0.3.31');
    expect(whatsNewToShow('0.3.31', updated)).toBe('0.3.31'); // until closed
    markWhatsNewSeen('0.3.31', updated);
    expect(whatsNewToShow('0.3.31', updated)).toBeUndefined();

    // A later version without news is just remembered.
    expect(whatsNewToShow('0.3.99', updated)).toBeUndefined();
    expect(updated.values.get('mewlink.whatsNew.seen')).toBe('0.3.99');
    expect(whatsNewToShow('0.3.31', memory({ 'mewlink.whatsNew.seen': '0.3.32' }))).toBeUndefined();
  });

  it('has news, short and in every language, for this release', () => {
    if (compareVersions(version, '0.3.31') < 0) return;
    const news = WHATS_NEW[version];
    expect(news, `src/whatsNew.ts needs an entry for ${version}`).toBeDefined();
    for (const language of ['zh', 'zh-Hant', 'en'] as const) {
      expect(news[language]?.trim()).toBeTruthy();
      // Two short lines under the version's title (the strip under the pets is 50px tall).
      expect(news[language].length).toBeLessThanOrEqual(language === 'en' ? 90 : 40);
    }
  });
});
