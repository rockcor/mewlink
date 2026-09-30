import { describe, expect, it } from 'vitest';
import { createPairingJoinRequest, createPairingState, openPairingInvite, pairingInviteCode, pairingInviteSecondsLeft, sealPairingInvite } from './pairing';
import { SecurePairingStore } from './secureStore';

function memoryStorage() {
  let value: string | null = null;
  return new SecurePairingStore({ read: async () => value, write: async next => { value = next; } },
    { getItem: () => null, removeItem: () => undefined });
}

describe('macOS test pairing', () => {
  it('accepts a code before 15 minutes and rejects it at the exact deadline', async () => {
    const start = 1_000;
    const creator = await createPairingState(start);
    expect(creator.inviteExpiresAt).toBe(start + 900_000);
    const request = await createPairingJoinRequest(pairingInviteCode(creator));
    const sealed = await sealPairingInvite(creator, request.publicKey);
    expect(pairingInviteSecondsLeft(creator, start)).toBe(900);
    expect(pairingInviteSecondsLeft(creator, creator.inviteExpiresAt - 1)).toBe(1);
    expect(pairingInviteSecondsLeft(creator, creator.inviteExpiresAt)).toBe(0);
    const joiner = await openPairingInvite(request, sealed, creator.inviteExpiresAt - 1);
    await expect(openPairingInvite(request, sealed, creator.inviteExpiresAt)).rejects.toThrow();
    await expect(openPairingInvite(request, sealed, creator.inviteExpiresAt + 60_000)).rejects.toThrow();
    const storage = memoryStorage();
    await storage.load();
    await storage.save(joiner);
    expect((await storage.load())?.partnerDeviceId).toBe(creator.deviceId);
  });

  it('creates two distinct devices with one shared relationship key', async () => {
    const creator = await createPairingState(1_000);
    const request = await createPairingJoinRequest(pairingInviteCode(creator));
    const joiner = await openPairingInvite(request, await sealPairingInvite(creator, request.publicKey), 2_000);
    expect(joiner.relationshipId).toBe(creator.relationshipId);
    expect(joiner.relationshipKey).toBe(creator.relationshipKey);
    expect(joiner.deviceId).not.toBe(creator.deviceId);
    expect(joiner.partnerDeviceId).toBe(creator.deviceId);
    expect(pairingInviteCode(creator)).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/u);
  });

  it('does not put the shared key inside the visible pairing code', async () => {
    const creator = await createPairingState();
    const code = pairingInviteCode(creator);
    expect(code).toHaveLength(9);
    expect(code).not.toContain(creator.relationshipKey);
    expect(code).not.toContain(creator.relayToken);
  });

  it('persists one device identity between launches', async () => {
    const storage = memoryStorage();
    const state = await createPairingState();
    await storage.load();
    await storage.save(state);
    expect((await storage.load())?.deviceId).toBe(state.deviceId);
  });

  it('returns to standalone mode as soon as pairing is cleared', async () => {
    const storage = memoryStorage();
    const state = await createPairingState();
    await storage.load();
    await storage.save(state);
    await storage.beginRevocation(state);
    expect(await storage.load()).toBeUndefined();
  });
});
