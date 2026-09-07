import { getVersion } from '@tauri-apps/api/app';
import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater';

export const UPDATE_MANIFEST_URL = import.meta.env.DEV
  ? '/updates/latest.json'
  : 'https://mewlink.jshmhsb.chatgpt.site/updates/latest.json';
export const FALLBACK_APP_VERSION = '0.3.9';

interface UpdatePlatform {
  signature: string;
  url: string;
}

export interface UpdateManifest {
  version: string;
  notes?: string;
  downloadUrl?: string;
  platforms?: Record<string, UpdatePlatform>;
}

export interface UpdateCheckResult {
  currentVersion: string;
  manifest: UpdateManifest;
  available: boolean;
  installable?: Update;
}

export interface UpdateProgress {
  phase: 'downloading' | 'installing';
  percent?: number;
}

export function compareVersions(left: string, right: string): number {
  const parse = (value: string) => value.split('.').slice(0, 3).map(part => Number.parseInt(part, 10) || 0);
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

async function currentVersion(): Promise<string> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) return getVersion();
  return FALLBACK_APP_VERSION;
}

export async function checkForUpdate(
  fetcher: typeof fetch = fetch,
  version = currentVersion()
): Promise<UpdateCheckResult> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window && fetcher === fetch) {
    const [{ check }, current] = await Promise.all([
      import('@tauri-apps/plugin-updater'),
      version
    ]);
    const update = await check({ timeout: 15_000 });
    if (!update) {
      return { currentVersion: current, manifest: { version: current }, available: false };
    }
    return {
      currentVersion: current,
      manifest: { version: update.version, notes: update.body },
      available: true,
      installable: update
    };
  }

  const response = await fetcher(UPDATE_MANIFEST_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`update manifest returned ${response.status}`);
  const manifest = await response.json() as Partial<UpdateManifest>;
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new Error('invalid update manifest');
  }
  const current = await version;
  const platforms = manifest.platforms && typeof manifest.platforms === 'object'
    ? manifest.platforms as Record<string, UpdatePlatform>
    : undefined;
  const downloadUrl = typeof manifest.downloadUrl === 'string'
    ? manifest.downloadUrl
    : platforms ? Object.values(platforms)[0]?.url : undefined;
  return {
    currentVersion: current,
    manifest: { ...(manifest as UpdateManifest), platforms, downloadUrl },
    available: compareVersions(manifest.version, current) > 0
  };
}

export async function installUpdate(
  update: Update,
  onProgress: (progress: UpdateProgress) => void
): Promise<void> {
  let downloaded = 0;
  let total: number | undefined;
  const report = (event: DownloadEvent) => {
    if (event.event === 'Started') {
      downloaded = 0;
      total = event.data.contentLength;
      onProgress({ phase: 'downloading', percent: total ? 0 : undefined });
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength;
      onProgress({
        phase: 'downloading',
        percent: total ? Math.min(100, Math.round((downloaded / total) * 100)) : undefined
      });
    } else {
      onProgress({ phase: 'installing', percent: 100 });
    }
  };

  await update.downloadAndInstall(report, { timeout: 120_000, restartAfterInstall: false });
  onProgress({ phase: 'installing', percent: 100 });
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}
