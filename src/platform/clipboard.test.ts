import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isTauri } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { copyText } from './clipboard';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: vi.fn() }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: vi.fn() }));

function browserDocument() {
  class Field {
    value = '';
    style = { cssText: '' };
    selectionStart = 1;
    selectionEnd = 3;
    selectionDirection = 'forward';
    focus = vi.fn();
    select = vi.fn();
    remove = vi.fn();
    setSelectionRange = vi.fn();
  }
  const active = new Field();
  const field = new Field();
  const range = { cloneRange: vi.fn(() => 'saved range') };
  const selection = { rangeCount: 1, getRangeAt: vi.fn(() => range), removeAllRanges: vi.fn(), addRange: vi.fn() };
  const document = {
    activeElement: active, getSelection: () => selection, createElement: vi.fn(() => field),
    body: { appendChild: vi.fn() }, execCommand: vi.fn(() => true),
  };
  vi.stubGlobal('HTMLInputElement', Field);
  vi.stubGlobal('HTMLTextAreaElement', Field);
  vi.stubGlobal('document', document);
  return { active, field, document, selection };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(isTauri).mockReturnValue(false);
  vi.stubGlobal('navigator', {});
});
afterEach(() => vi.unstubAllGlobals());

describe('write-only clipboard', () => {
  it('uses the native plugin in desktop windows, even with a browser API present', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const browserWrite = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText: browserWrite } });
    await copyText('2345-6789');
    expect(writeText).toHaveBeenCalledExactlyOnceWith('2345-6789');
    expect(browserWrite).not.toHaveBeenCalled();
  });
  it('propagates a native failure instead of reporting a false success', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(writeText).mockRejectedValueOnce(new Error('OS clipboard locked'));
    await expect(copyText('2345-6789')).rejects.toThrow('OS clipboard locked');
  });
  it('waits for native completion before reporting success', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    let finish!: () => void;
    vi.mocked(writeText).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const success = vi.fn();
    const copying = copyText('2345-6789').then(success);
    await Promise.resolve();
    expect(success).not.toHaveBeenCalled();
    finish();
    await copying;
    expect(success).toHaveBeenCalledOnce();
  });
  it('uses the browser API outside Tauri', async () => {
    const browserWrite = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText: browserWrite } });
    await copyText('2345-6789');
    expect(browserWrite).toHaveBeenCalledExactlyOnceWith('2345-6789');
    expect(writeText).not.toHaveBeenCalled();
  });
  it.each(['missing', 'rejected'])('falls back when the browser API is %s, cleaning up and restoring focus', async mode => {
    const { active, field, document } = browserDocument();
    if (mode === 'rejected') vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    await copyText('2345-6789');
    expect(field.value).toBe('2345-6789');
    expect(field.select).toHaveBeenCalledOnce();
    expect(document.execCommand).toHaveBeenCalledExactlyOnceWith('copy');
    expect(field.remove).toHaveBeenCalledOnce();
    expect(active.focus).toHaveBeenCalled();
    expect(active.setSelectionRange).toHaveBeenCalledWith(1, 3, 'forward');
  });
  it('restores a normal text selection after fallback', async () => {
    const { document, selection } = browserDocument();
    Object.assign(document, { activeElement: { focus: vi.fn() } });
    await copyText('2345-6789');
    expect(selection.removeAllRanges).toHaveBeenCalledOnce();
    expect(selection.addRange).toHaveBeenCalledWith('saved range');
  });
  it.each(['false', 'throws'])('reports fallback failure (%s) and removes the temporary field', async mode => {
    const { field, document } = browserDocument();
    document.execCommand.mockImplementation(() => {
      if (mode === 'throws') throw new Error('unavailable');
      return false;
    });
    await expect(copyText('2345-6789')).rejects.toThrow();
    expect(field.remove).toHaveBeenCalledOnce();
  });
  it('does not overwrite the clipboard with an empty code', async () => {
    await expect(copyText('  ')).rejects.toThrow('Nothing to copy');
    expect(writeText).not.toHaveBeenCalled();
  });
});
