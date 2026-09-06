import { describe, expect, it } from 'vitest';
import { checkForUpdate, compareVersions } from './update';

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
    expect(result.manifest.downloadUrl).toBe('https://example.com/MewLink.app.tar.gz');
  });
});
