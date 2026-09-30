import { describe, expect, it, vi } from 'vitest';
import { BitmapCache } from './bitmapCache';

describe('decoded sprite budget', () => {
  it('shares one decode between two pets and evicts least-recent unused sheets', async () => {
    const dispose = vi.fn();
    const load = vi.fn(async () => ({ bytes: 8, dispose }));
    const cache = new BitmapCache(16, load);
    const a = cache.acquire('a'); const second = cache.acquire('a');
    await Promise.all([a.ready, second.ready]);
    expect(load).toHaveBeenCalledTimes(1);
    a.release(); second.release();
    for (const name of ['b', 'c']) { const lease = cache.acquire(name); await lease.ready; lease.release(); }
    expect(cache.bytes).toBe(16);
    expect(cache.has('a')).toBe(false);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
  it('never closes a frame being painted, then releases it on backgrounding', async () => {
    const dispose = vi.fn();
    const cache = new BitmapCache(4, async () => ({ bytes: 8, dispose }));
    const lease = cache.acquire('active'); await lease.ready;
    cache.setConstrained(true);
    expect(dispose).not.toHaveBeenCalled();
    lease.release(); lease.release();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(cache.bytes).toBe(0);
  });
  it('discards a late decode after the hidden view releases its lease', async () => {
    const dispose = vi.fn();
    let finish!: (value: { bytes: number; dispose: () => void }) => void;
    const cache = new BitmapCache<{ bytes: number; dispose: () => void }>(16, () => new Promise(resolve => { finish = resolve; }));
    const lease = cache.acquire('pending');
    const rejected = expect(lease.ready).rejects.toThrow('cancelled');
    lease.release(); cache.setConstrained(true);
    finish({ bytes: 8, dispose }); await rejected;
    expect(dispose).toHaveBeenCalledOnce();
    expect(cache.size).toBe(0);
  });
  it('does not retain failed loads and can retry', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ bytes: 4, dispose: vi.fn() });
    const cache = new BitmapCache(16, load);
    const first = cache.acquire('a'); await expect(first.ready).rejects.toThrow('offline'); first.release();
    const second = cache.acquire('a'); await second.ready; second.release();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
