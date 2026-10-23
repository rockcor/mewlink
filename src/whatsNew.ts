import type { Language } from './settings/preferences';
import { compareVersions } from './services/update';

// What a release brings, said once in a cloud under the pets after updating to
// it. Keep each to a sentence that fits two short lines; every release from
// 0.3.31 on needs one (src/whatsNew.test.ts).
export const WHATS_NEW: Record<string, Record<Language, string>> = {
  '0.3.31': {
    zh: '提示和回放避开宠物，底边自动改放上方；番茄钟可调时长、到点通知',
    'zh-Hant': '提示和回放避開寵物，底邊自動改放上方；番茄鐘可調時長、到點通知',
    en: 'Clear pet views; edge-aware notices. Adjustable pomodoros with alerts.',
  },
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const SEEN_KEY = 'mewlink.whatsNew.seen';
// Data any installation that has run before keeps (a fresh one has none yet).
const EARLIER_RUN_KEYS = ['mewlink.statistics.v3', 'mewlink.preferences.v1'];

/**
 * The version whose news to show, if any: only after an update (not on a fresh
 * install) and only once. Versions without news are just marked as seen.
 */
export function whatsNewToShow(version: string, storage: StorageLike | undefined): string | undefined {
  if (!storage) return undefined;
  try {
    const seen = storage.getItem(SEEN_KEY);
    const updated = seen ? compareVersions(version, seen) > 0 : EARLIER_RUN_KEYS.some(key => storage.getItem(key) !== null);
    if (!updated || !WHATS_NEW[version]) {
      if (seen !== version && (!seen || compareVersions(version, seen) > 0)) storage.setItem(SEEN_KEY, version);
      return undefined;
    }
    return version;
  } catch {
    return undefined;
  }
}

export function markWhatsNewSeen(version: string, storage: StorageLike | undefined) {
  try { storage?.setItem(SEEN_KEY, version); } catch { /* shown again next time, nothing worse */ }
}
