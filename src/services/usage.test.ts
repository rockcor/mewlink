import { afterEach, describe, expect, it, vi } from 'vitest';
import { startAnonymousUsage, usageEndpoint, USAGE_INTERVAL_MS } from './usage';
import { defaultPreferences, loadPreferences } from '../settings/preferences';
const ID = '55c15eea-a5e6-469f-aee4-957978541e15';
function setup(overrides = {}) {
  let next: (() => void) | undefined;
  const values = new Map<string, string>();
  const runtime = { native: true, storage: { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } },
    fetch: vi.fn(async () => new Response(null, { status: 202 })), now: () => Date.parse('2026-10-23T00:00:00Z'),
    randomId: () => ID, online: () => true,
    every: vi.fn((run: () => void) => { next = run; return 1 as unknown as ReturnType<typeof setInterval>; }),
    cancel: vi.fn(), ...overrides };
  return { runtime, values, next: () => next?.() };
}
afterEach(() => vi.restoreAllMocks());
describe('optional adoption analytics', () => {
  it('is off for new and upgraded installations unless explicitly enabled', () => {
    expect(defaultPreferences().anonymousUsage).toBe(false);
    for (const value of [{}, { anonymousUsage: 'true' }, { anonymousUsage: 1 }])
      expect(loadPreferences({ getItem: () => JSON.stringify(value), setItem: vi.fn() }).anonymousUsage).toBe(false);
    const { runtime, values } = setup(); startAnonymousUsage(false, runtime);
    expect(runtime.fetch).not.toHaveBeenCalled(); expect(runtime.every).not.toHaveBeenCalled(); expect(values.size).toBe(0);
  });
  it('never sends browser demos or QA builds to production', () => {
    expect(usageEndpoint(false)).toBeUndefined(); expect(usageEndpoint(true, 'qa')).toBeUndefined();
    for (const url of ['https://mewlink.jshmhsb.chatgpt.site/api/analytics/event', 'http://localhost.evil/api/analytics/event', 'http://user:password@localhost/api/analytics/event', 'http://localhost/private'])
      expect(usageEndpoint(true, 'qa', url)).toBeUndefined();
    expect(usageEndpoint(true, 'qa', 'http://127.0.0.1:3000/api/analytics/event')).toBe('http://127.0.0.1:3000/api/analytics/event');
    const { runtime } = setup({ flavor: 'qa' }); startAnonymousUsage(true, runtime); expect(runtime.fetch).not.toHaveBeenCalled();
  });
  it('sends only consent and independent random identifiers, once then every 30 minutes', async () => {
    const { runtime, next } = setup(); const stop = startAnonymousUsage(true, runtime);
    expect(runtime.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = runtime.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://mewlink.jshmhsb.chatgpt.site/api/analytics/event');
    expect(JSON.parse(init.body as string)).toEqual({ source: 'app', consent: true, id: ID, event: ID });
    expect(runtime.every).toHaveBeenCalledWith(expect.any(Function), USAGE_INTERVAL_MS);
    await Promise.resolve(); next(); expect(runtime.fetch).toHaveBeenCalledTimes(2); stop();
    expect(runtime.cancel).toHaveBeenCalled(); next(); expect(runtime.fetch).toHaveBeenCalledTimes(2);
  });
  it('removes the analytics identity when disabled without touching other storage', () => {
    const { runtime, values } = setup(); startAnonymousUsage(true, runtime);
    values.set('mewlink.pairing', 'untouched'); startAnonymousUsage(false, runtime);
    expect(values.size).toBe(1); expect(values.get('mewlink.pairing')).toBe('untouched');
  });
  it('does not send while offline and aborts an in-flight request on cleanup', () => {
    const offline = setup({ online: () => false }); startAnonymousUsage(true, offline.runtime);
    expect(offline.runtime.fetch).not.toHaveBeenCalled();
    const { runtime } = setup({ fetch: vi.fn(() => new Promise<Response>(() => undefined)) });
    const stop = startAnonymousUsage(true, runtime);
    const signal = (runtime.fetch.mock.calls[0] as unknown as [string, RequestInit])[1].signal;
    stop(); expect(signal?.aborted).toBe(true);
  });
  it('does not fingerprint when storage is unavailable', () => {
    const { runtime } = setup(); runtime.storage.setItem = () => { throw new Error('No storage'); };
    startAnonymousUsage(true, runtime); expect(runtime.fetch).not.toHaveBeenCalled();
  });
});
