import { describe, expect, it, vi } from 'vitest';
import type { Update } from '@tauri-apps/plugin-updater';
import { checkForUpdate, compareVersions, installUpdate } from './update';

vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }));

describe('update checks', () => {
  it('compares semantic versions numerically', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0);
  });

  it('detects a newer published version', async () => {
    const fetcher = async () => new Response(JSON.stringify({
      version: '0.3.0',
      platforms: {
        'darwin-aarch64': { signature: 'signed', url: 'https://example.com/MewLink.app.tar.gz' }
      }
    }), { status: 200 });
    const result = await checkForUpdate(fetcher as typeof fetch, Promise.resolve('0.2.0'));
    expect(result.available).toBe(true);
    expect(result.manifest.version).toBe('0.3.0');
    expect(result.manifest.downloadUrl).toBe('https://mewlink.jshmhsb.chatgpt.site/#install');
  });

  it('installs with Windows restart enabled and relaunches after a successful install', async () => {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    vi.mocked(relaunch).mockClear();
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
    await installUpdate({ downloadAndInstall } as unknown as Update, vi.fn());
    expect(downloadAndInstall).toHaveBeenCalledWith(expect.any(Function), { timeout: 120_000, restartAfterInstall: true });
    expect(relaunch).toHaveBeenCalledOnce();
  });

  it('does not restart after a rejected download or signature', async () => {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    vi.mocked(relaunch).mockClear();
    const downloadAndInstall = vi.fn().mockRejectedValue(new Error('signature rejected'));
    await expect(installUpdate({ downloadAndInstall } as unknown as Update, vi.fn())).rejects.toThrow('signature rejected');
    expect(relaunch).not.toHaveBeenCalled();
  });
});
