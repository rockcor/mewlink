import { describe, expect, it, vi } from 'vitest';
import { createPairingState } from './pairing';
import { SecurePairingStore, SerialTasks } from './secureStore';

function fixture(legacyValue: string | null = null) {
  let secret: string | null = null;
  let old = legacyValue;
  const backend = { read: vi.fn(async () => secret), write: vi.fn(async (value: string) => { secret = value; }) };
  const legacy = { getItem: () => old, removeItem: vi.fn(() => { old = null; }) };
  return { backend, legacy, store: new SecurePairingStore(backend, legacy), secret: () => secret };
}

describe('native pairing secret storage', () => {
  it('migrates existing pairing without changing identities, then removes the plaintext copy', async () => {
    const state = await createPairingState();
    const { store, backend, legacy, secret } = fixture(JSON.stringify(state));
    expect(await store.load()).toEqual(state);
    expect(backend.read).toHaveBeenCalledTimes(2);
    expect(secret()).toContain(state.relationshipKey);
    expect(legacy.getItem()).toBeNull();
    expect(await new SecurePairingStore(backend, legacy).load()).toEqual(state);
  });
  it('keeps the old copy on access denial and never falls back to using plaintext', async () => {
    const state = await createPairingState();
    const { store, backend, legacy } = fixture(JSON.stringify(state));
    backend.write.mockRejectedValue(new Error('access_denied'));
    await expect(store.load()).rejects.toThrow('access_denied');
    expect(legacy.removeItem).not.toHaveBeenCalled();
    await expect(store.save(state)).rejects.toThrow('secure_storage_not_ready');
  });
  it('requires successful read-back before removing legacy data', async () => {
    const state = await createPairingState();
    const { store, backend, legacy } = fixture(JSON.stringify(state));
    backend.read.mockResolvedValue(null);
    await expect(store.load()).rejects.toThrow('verification_failed');
    expect(legacy.removeItem).not.toHaveBeenCalled();
  });
  it('does not resurrect a stale plaintext pair after an interrupted cleanup', async () => {
    const state = await createPairingState();
    const f = fixture(JSON.stringify(state));
    await f.backend.write(JSON.stringify({ version: 2, kind: 'empty' }));
    expect(await f.store.load()).toBeUndefined();
    expect(f.legacy.getItem()).toBeNull();
  });
  it('rejects corrupt keychain data rather than reading a legacy fallback', async () => {
    const f = fixture(JSON.stringify(await createPairingState()));
    await f.backend.write('{broken');
    await expect(f.store.load()).rejects.toThrow();
    expect(f.legacy.removeItem).not.toHaveBeenCalled();
  });
  it('persists offline revocation without retaining the encryption key', async () => {
    const state = await createPairingState();
    const f = fixture();
    await f.store.load();
    await f.store.save(state);
    await f.store.beginRevocation(state);
    expect(f.secret()).not.toContain(state.relationshipKey);
    const restarted = new SecurePairingStore(f.backend, f.legacy);
    expect(await restarted.load()).toBeUndefined();
    expect(restarted.pending()?.relationshipId).toBe(state.relationshipId);
    await expect(restarted.save(await createPairingState())).rejects.toThrow('revocation_pending');
    await restarted.completeRevocation('wrong-pair');
    expect(restarted.pending()).toBeDefined();
    await restarted.completeRevocation(state.relationshipId);
    expect(f.secret()).not.toContain(state.relayToken);
    const replacement = await createPairingState();
    await restarted.save(replacement);
    expect(replacement.relationshipKey).not.toBe(state.relationshipKey);
    expect(replacement.relayToken).not.toBe(state.relayToken);
  });
  it('skips unchanged saves and does not mutate state through aliases', async () => {
    const f = fixture();
    await f.store.load();
    const state = await createPairingState();
    await f.store.save(state);
    const writes = f.backend.write.mock.calls.length;
    await f.store.save(state);
    expect(f.backend.write).toHaveBeenCalledTimes(writes);
    state.nextSequence = 99;
    expect((await f.store.load())?.nextSequence).toBe(0);
  });
});

describe('session serialization', () => {
  it('orders sync, send and unpair, and skips an old queued send once blocked', async () => {
    const queue = new SerialTasks();
    const log: string[] = [];
    let resume!: () => void;
    let blocked = false;
    const gate = new Promise<void>(resolve => { resume = resolve; });
    const sync = queue.run(async () => { await gate; if (!blocked) log.push('sync-commit'); });
    const send = queue.run(async () => { if (!blocked) log.push('send'); });
    blocked = true;
    const disconnect = queue.run(async () => { log.push('unpair'); });
    resume();
    await Promise.all([sync, send, disconnect]);
    expect(log).toEqual(['unpair']);
    await expect(queue.run(async () => { throw new Error('offline'); })).rejects.toThrow();
    await queue.run(async () => { log.push('retry'); });
    expect(log).toEqual(['unpair', 'retry']);
  });
});
