/** Optional adoption heartbeat. No pairing IDs, input or activity information. */
const ENDPOINT = 'https://mewlink.jshmhsb.chatgpt.site/api/analytics/event';
const ID_KEY = 'mewlink.anonymousUsage.identity.v1';
const ID_TTL = 30 * 86400_000;
export const USAGE_INTERVAL_MS = 30 * 60_000;
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Runtime = {
  native: boolean; flavor?: string; qaEndpoint?: string;
  storage: StorageLike; fetch: typeof fetch; now: () => number;
  randomId: () => string; online: () => boolean;
  every: (run: () => void, ms: number) => ReturnType<typeof setInterval>;
  cancel: (id: ReturnType<typeof setInterval>) => void;
};
export function usageEndpoint(native: boolean, flavor?: string, qaEndpoint?: string): string | undefined {
  if (!native) return undefined;
  if (flavor !== 'qa') return ENDPOINT;
  // QA may exercise a loopback test collector, but never production telemetry.
  try {
    const url = new URL(qaEndpoint ?? '');
    if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      url.pathname === '/api/analytics/event' && !url.username && !url.password && !url.search && !url.hash) return url.href;
  } catch { /* No QA collector is the safe default. */ }
  return undefined;
}
export function startAnonymousUsage(enabled: boolean, runtime: Runtime): () => void {
  if (!enabled) {
    try { runtime.storage.removeItem(ID_KEY); } catch { /* Optional storage. */ }
    return () => undefined;
  }
  const endpoint = usageEndpoint(runtime.native, runtime.flavor, runtime.qaEndpoint);
  if (!endpoint) return () => undefined;
  const requestUrl: string = endpoint;
  let stopped = false;
  let inFlight: AbortController | undefined;
  async function send() {
    if (stopped || inFlight || !runtime.online()) return;
    const controller = new AbortController(); inFlight = controller;
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      let identity = JSON.parse(runtime.storage.getItem(ID_KEY) ?? 'null') as { id: string; expires: number } | null;
      if (!identity || identity.expires <= runtime.now() || !Number.isFinite(identity.expires) ||
        typeof identity.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(identity.id)) {
        identity = { id: runtime.randomId(), expires: runtime.now() + ID_TTL };
        runtime.storage.setItem(ID_KEY, JSON.stringify(identity));
      }
      await runtime.fetch(requestUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'app', consent: true, id: identity.id, event: runtime.randomId() }),
        credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal });
    } catch { /* No logging of identifiers and no effect on companion features. */ }
    finally { clearTimeout(timeout); if (inFlight === controller) inFlight = undefined; }
  }
  void send();
  const timer = runtime.every(() => { void send(); }, USAGE_INTERVAL_MS);
  return () => { stopped = true; runtime.cancel(timer); inFlight?.abort(); };
}
export function watchAnonymousUsage(enabled: boolean): () => void {
  return startAnonymousUsage(enabled, {
    native: '__TAURI_INTERNALS__' in window, flavor: import.meta.env.VITE_MEWLINK_FLAVOR,
    qaEndpoint: import.meta.env.VITE_MEWLINK_ANALYTICS_ENDPOINT,
    storage: window.localStorage, fetch: window.fetch.bind(window), now: Date.now,
    randomId: () => crypto.randomUUID(), online: () => navigator.onLine,
    every: (run, ms) => setInterval(run, ms), cancel: id => clearInterval(id),
  });
}
