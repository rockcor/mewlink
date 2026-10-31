import type { Language } from './settings/preferences';
import { compareVersions } from './services/update';

// What a release brings, said once in a cloud under the pets after updating to
// it, under the version's title. Keep each to a sentence that fits two short
// lines; every release from 0.3.31 on needs one (src/whatsNew.test.ts).
// Next release: 起身工作不再留下睡觉重影，状态切换更干净连贯。
// Next release (zh-Hant): 起身工作不再留下睡覺重影，狀態切換更乾淨連貫。
// Next release (en): Activity transitions no longer leave the previous pose behind the moving pup.
export const WHATS_NEW: Record<string, Record<Language, string>> = {
  '0.3.41': {
    zh: '悬停小狗即可展开菜单，透明处可点击后面的窗口',
    'zh-Hant': '懸停小狗即可展開選單，透明處可點擊後方視窗',
    en: 'Hover visible pet pixels for the menu; transparent space passes clicks through.',
  },
  '0.3.40': {
    zh: '窗口贴近菜单；钥匙串需授权时可在设置恢复，启动不再自动弹窗',
    'zh-Hant': '視窗貼近選單；鑰匙圈需授權時可在設定恢復，啟動不再自動彈窗',
    en: 'A snug menu frame; authorize Keychain in settings, with no startup prompts.',
  },
  '0.3.39': {
    zh: '鼠标只响应小狗和桌面，减少上方透明空白的误触',
    'zh-Hant': '滑鼠只回應小狗和桌面，減少上方透明空白的誤觸',
    en: 'Pet controls follow the artwork, avoiding accidental activation in empty space above.',
  },
  '0.3.38': {
    zh: '微信聊天会回到工作画面，不再在通话后停留为开会状态',
    'zh-Hant': '微信聊天會回到工作畫面，不再在通話後停留為開會狀態',
    en: 'WeChat chats return to the work screen instead of keeping your pup in a meeting.',
  },
  '0.3.37': {
    zh: '开会时小狗留在自己的桌前戴上耳机；键盘焦点改为小标记',
    'zh-Hant': '開會時小狗留在自己的桌前戴上耳機；鍵盤焦點改為小標記',
    en: 'Meetings stay at your pup\'s desk with a headset; keyboard focus uses a small mark.',
  },
  '0.3.36': {
    zh: '右键小狗即可选择置于顶层或底层，无需打开设置',
    'zh-Hant': '右鍵小狗即可選擇置於頂層或底層，無需開啟設定',
    en: 'Right-click a pup to keep its window on top or below, without opening settings.',
  },
  '0.3.35': {
    zh: '钥匙串授权未完成时暂停连接，避免连续弹窗；原配对保留',
    'zh-Hant': '鑰匙圈授權未完成時暫停連線，避免連續彈窗；原配對保留',
    en: 'Keychain denial pauses connections instead of repeating prompts; your pairing stays.',
  },
  '0.3.34': {
    zh: '盖好的被子会留在睡着的小狗身上，抱完走开也不带走，起身后再收起',
    'zh-Hant': '蓋好的被子會留在睡著的小狗身上，抱完走開也不帶走，起身後再收起',
    en: 'Tucked-in pups keep their blankets after a hug, until they get up.',
  },
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
