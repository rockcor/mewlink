import { describe, expect, it } from 'vitest';
import { createWindowQueue } from './desktopPanel';

describe('desktop panel operations', () => {
  it('finishes opening before closing and reopening', async () => {
    const queue = createWindowQueue();
    const calls: string[] = [];
    let release!: () => void;
    const opened = new Promise<void>(resolve => { release = resolve; });
    const a = queue(async () => { calls.push('open'); await opened; calls.push('opened'); });
    const b = queue(async () => { calls.push('close'); });
    const c = queue(async () => { calls.push('reopen'); });
    await Promise.resolve();
    expect(calls).toEqual(['open']);
    release();
    await Promise.all([a, b, c]);
    expect(calls).toEqual(['open', 'opened', 'close', 'reopen']);
  });
  it('allows closing even when expansion fails', async () => {
    const queue = createWindowQueue();
    const failed = queue(async () => { throw Error('Display removed'); });
    let closed = false;
    const next = queue(async () => { closed = true; });
    await expect(failed).rejects.toThrow('Display removed');
    await next;
    expect(closed).toBe(true);
  });
});
