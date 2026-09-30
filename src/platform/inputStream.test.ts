import { afterEach, describe, expect, it, vi } from 'vitest';
import { acceptInput, watchInput } from './inputStream';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
const baseline = { keyboardSequence: 10, pointerSequence: 20, pointerClickSequence: 3, recentKind: 'none' as const };
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers(); });

describe('input change stream', () => {
  it('accepts simultaneous hands, suppresses unchanged and stale snapshots', () => {
    expect(acceptInput(baseline, baseline)).toBe(false);
    expect(acceptInput(baseline, { ...baseline, keyboardSequence: 9 })).toBe(false);
    expect(acceptInput(baseline, { ...baseline, keyboardSequence: 11, pointerSequence: 21 })).toBe(true);
    expect(acceptInput(baseline, { ...baseline, pointerClickSequence: 4 })).toBe(true);
  });
  it('uses one bootstrap call and zero idle polling calls', async () => {
    vi.useFakeTimers(); vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    const unlisten = vi.fn();
    vi.mocked(listen).mockResolvedValue(unlisten);
    vi.mocked(invoke).mockResolvedValue(baseline);
    const handler = vi.fn();
    const stop = watchInput(handler);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledExactlyOnceWith(baseline);
    stop(); expect(unlisten).toHaveBeenCalledOnce();
  });
  it('cleans up even when the native subscription arrives after unmount', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    const unlisten = vi.fn();
    vi.mocked(listen).mockResolvedValue(unlisten);
    watchInput(vi.fn())(); await Promise.resolve();
    expect(unlisten).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalled();
  });
});
