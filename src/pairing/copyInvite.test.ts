import { describe, expect, it, vi } from 'vitest';
import { copyPairingInvite } from './copyInvite';
import type { PairingState } from './pairing';
import capabilities from '../../src-tauri/capabilities/default.json';

const now = 1_800_000_000_000;
const pending: PairingState = {
  version: 1, relationshipId: 'test-relationship', relationshipKey: 'never-copy-this',
  relayToken: 'never-copy-this-either', keyId: 'test-key', deviceId: 'test-device',
  inviteCode: '2345-6789', inviteExpiresAt: now + 60_000,
  nextSequence: 0, relayCursor: 0, receivedSequences: {},
};

describe('copy a pending pairing code', () => {
  it('copies only the display code, never the invite payload or secrets', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    await copyPairingInvite(pending, write, now);
    expect(write).toHaveBeenCalledExactlyOnceWith('2345-6789');
  });
  it.each([
    undefined, { ...pending, partnerDeviceId: 'partner' }, { ...pending, inviteExpiresAt: now },
    { ...pending, inviteExpiresAt: now - 1 }, { ...pending, inviteCode: '' },
    { ...pending, inviteCode: undefined }, { ...pending, inviteCode: 'invalid' },
  ])('refuses a missing, paired, expired or malformed invite (%#)', async state => {
    const write = vi.fn();
    await expect(copyPairingInvite(state, write, now)).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
  });
  it('allows retrying after a failed write', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(undefined);
    await expect(copyPairingInvite(pending, write, now)).rejects.toThrow('unavailable');
    await expect(copyPairingInvite(pending, write, now)).resolves.toBeUndefined();
    expect(write).toHaveBeenCalledTimes(2);
  });
  it('grants only native text-write permission to the main window', () => {
    expect(capabilities.windows).toEqual(['main']);
    expect(capabilities.permissions.filter(permission => permission.startsWith('clipboard-manager:')))
      .toEqual(['clipboard-manager:allow-write-text']);
  });
});
