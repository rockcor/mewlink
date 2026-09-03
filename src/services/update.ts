import { getVersion } from '@tauri-apps/api/app';

export const UPDATE_MANIFEST_URL = import.meta.env.DEV
  ? '/updates/latest.json'
  : 'https://mewlink.jshmhsb.chatgpt.site/updates/latest.json';
export const FALLBACK_APP_VERSION = '0.2.1';

export interface UpdateManifest {
  version: string;
  notes?: string;
  downloadUrl?: string;
}

export interface UpdateCheckResult {
  currentVersion: string;
  manifest: UpdateManifest;
  available: boolean;
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
  const response = await fetcher(UPDATE_MANIFEST_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`update manifest returned ${response.status}`);
  const manifest = await response.json() as Partial<UpdateManifest>;
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new Error('invalid update manifest');
  }
  const current = await version;
  return {
    currentVersion: current,
    manifest: manifest as UpdateManifest,
    available: compareVersions(manifest.version, current) > 0
  };
}
