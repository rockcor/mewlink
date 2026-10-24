import type { Language } from './settings/preferences';
import { compareVersions } from './services/update';

// What a release brings, said once in a cloud under the pets after updating to
// it, under the version's title. Keep each to a sentence that fits two short
// lines; every release from 0.3.31 on needs one (src/whatsNew.test.ts).
export const WHATS_NEW: Record<string, Record<Language, string>> = {
  '0.3.33': {
    zh: '拥抱改成走过去：小狗起身走到对方桌前抱一抱，再走回来',
    'zh-Hant': '擁抱改成走過去：小狗起身走到對方桌前抱一抱，再走回來',
    en: 'Hugs walk over: your pup leaves its desk, hugs at theirs, and walks back.',
  },
  '0.3.32': {
    zh: '拥抱保留双方配色和位置，休息时盖被子；对方退出后不再显示工作中',
    'zh-Hant': '擁抱保留雙方配色和位置，休息時蓋被子；對方退出後不再顯示工作中',
    en: 'Hugs keep both pups\' colors; resting friends get tucked in; offline ones stop working.',
  },
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
