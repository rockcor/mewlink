import { describe, expect, it } from 'vitest';
import { createPairingState, joinPairingState, loadPairing, pairingInviteCode, savePairing } from './pairing';

function memoryStorage() {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; },
    removeItem: () => { value = null; },
  };
}

describe('macOS test pairing', () => {
  it('creates two distinct devices with one shared relationship key', async () => {
    const creator = await createPairingState(1_000);
    const joiner = joinPairingState(pairingInviteCode(creator), 2_000);
    expect(joiner.relationshipId).toBe(creator.relationshipId);
    expect(joiner.relationshipKey).toBe(creator.relationshipKey);
    expect(joiner.deviceId).not.toBe(creator.deviceId);
    expect(joiner.partnerDeviceId).toBe(creator.deviceId);
  });

  it('persists one device identity between launches', async () => {
    const storage = memoryStorage();
    const state = await createPairingState();
    savePairing(state, storage);
    expect(loadPairing(storage)?.deviceId).toBe(state.deviceId);
  });
});
