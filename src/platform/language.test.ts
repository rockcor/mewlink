import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { browserLanguage, languageForLocale, systemLanguage, watchSystemLanguage } from './language';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: vi.fn() }));

beforeEach(() => {
  vi.mocked(isTauri).mockReturnValue(false);
  vi.stubGlobal('navigator', { languages: ['en-US'], language: 'en-US' });
  vi.stubGlobal('window', new EventTarget());
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe('system UI language selection', () => {
  it.each([
    ['zh', 'zh'], ['zh-CN', 'zh'], ['zh-SG', 'zh'], ['zh-Hans', 'zh'], ['zh-Hans-TW', 'zh'],
    ['zh-TW', 'zh-Hant'], ['zh-HK', 'zh-Hant'], ['zh-MO', 'zh-Hant'], ['zh-Hant', 'zh-Hant'],
    ['zh-Hant-CN', 'zh-Hant'], ['ZH_hAnT_hK', 'zh-Hant'], ['zh-TW-u-ca-chinese', 'zh-Hant'],
    ['en-CN', 'en'], ['en-TW', 'en'], ['ja-JP', 'en'], ['ko-KR', 'en'], ['fr-FR', 'en'],
    ['de-DE', 'en'], ['es-ES', 'en'], ['ar-SA', 'en'], ['invalid_locale!', 'en'], ['', 'en'], [undefined, 'en'],
  ])('maps %s to %s', (locale, expected) => {
    expect(languageForLocale(locale)).toBe(expected);
  });

  it('never selects secondary Chinese when the preferred language is non-Chinese', () => {
    vi.stubGlobal('navigator', { languages: ['ja-JP', 'zh-TW'], language: 'zh-TW' });
    expect(browserLanguage()).toBe('en');
  });

  it('uses the native preferred UI language instead of the WebView language', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockResolvedValue(['zh-Hant-HK', 'en-US']);
    expect(await systemLanguage()).toBe('zh-Hant');
    expect(invoke).toHaveBeenCalledWith('system_languages');
    vi.mocked(invoke).mockResolvedValue(['de-DE', 'zh-CN']);
    expect(await systemLanguage()).toBe('en');
  });

  it('falls back safely if the native query fails or returns no preferences', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.stubGlobal('navigator', { language: 'zh-SG' });
    vi.mocked(invoke).mockRejectedValueOnce(new Error('unavailable'));
    expect(await systemLanguage()).toBe('zh');
    vi.mocked(invoke).mockResolvedValueOnce([]);
    expect(await systemLanguage()).toBe('zh');
  });

  it('refreshes on focus and language changes, then stops when system mode is disabled', async () => {
    const onLanguage = vi.fn();
    const stop = watchSystemLanguage(onLanguage);
    await vi.waitFor(() => expect(onLanguage).toHaveBeenLastCalledWith('en'));
    vi.stubGlobal('navigator', { language: 'zh-TW' });
    window.dispatchEvent(new Event('languagechange'));
    await vi.waitFor(() => expect(onLanguage).toHaveBeenLastCalledWith('zh-Hant'));
    vi.stubGlobal('navigator', { language: 'zh-CN' });
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(onLanguage).toHaveBeenLastCalledWith('zh'));
    stop();
    onLanguage.mockClear();
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('languagechange'));
    await Promise.resolve();
    expect(onLanguage).not.toHaveBeenCalled();
  });

  it('ignores native results arriving after manual selection or a newer query', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    let finishOld!: (value: string[]) => void;
    vi.mocked(invoke).mockReturnValueOnce(new Promise<string[]>(resolve => { finishOld = resolve; }));
    vi.mocked(invoke).mockResolvedValueOnce(['zh-Hant']);
    const onLanguage = vi.fn();
    const stop = watchSystemLanguage(onLanguage);
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(onLanguage).toHaveBeenCalledOnce());
    expect(onLanguage).toHaveBeenLastCalledWith('zh-Hant');
    stop();
    finishOld(['en-US']);
    await Promise.resolve();
    await Promise.resolve();
    expect(onLanguage).toHaveBeenCalledOnce();
  });
});
