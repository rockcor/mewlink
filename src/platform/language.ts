import { invoke, isTauri } from '@tauri-apps/api/core';

export const languages = ['zh', 'zh-Hant', 'en'] as const;
export type Language = (typeof languages)[number];
export const languageTags: Record<Language, string> = { zh: 'zh-Hans', 'zh-Hant': 'zh-Hant', en: 'en' };

// Use the first preferred UI language, not the region or a secondary language.
export function languageForLocale(locale?: string): Language {
  if (!locale?.trim()) return 'en';
  try {
    const parsed = new Intl.Locale(locale.trim().replaceAll('_', '-'));
    if (parsed.language !== 'zh') return 'en';
    if (parsed.script === 'Hant') return 'zh-Hant';
    if (parsed.script === 'Hans') return 'zh';
    return ['TW', 'HK', 'MO'].includes(parsed.region ?? '') ? 'zh-Hant' : 'zh';
  } catch {
    return 'en';
  }
}

export function browserLanguage(): Language {
  return languageForLocale(typeof navigator === 'undefined' ? undefined : navigator.languages?.[0] || navigator.language);
}

export async function systemLanguage(): Promise<Language> {
  if (isTauri()) {
    try {
      const locales = await invoke<string[]>('system_languages');
      if (locales[0]) return languageForLocale(locales[0]);
    } catch {
      // Browser language remains a safe fallback if the native query is unavailable.
    }
  }
  return browserLanguage();
}

// Refresh on focus/language changes without a background polling timer. A result
// from before a manual selection must never overwrite the user's selection.
export function watchSystemLanguage(onLanguage: (language: Language) => void): () => void {
  let revision = 0;
  const refresh = async () => {
    const request = ++revision;
    const language = await systemLanguage();
    if (request === revision) onLanguage(language);
  };
  void refresh();
  window.addEventListener('languagechange', refresh);
  window.addEventListener('focus', refresh);
  return () => {
    revision++;
    window.removeEventListener('languagechange', refresh);
    window.removeEventListener('focus', refresh);
  };
}
