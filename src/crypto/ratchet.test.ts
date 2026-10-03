import { describe, expect, it, vi } from 'vitest';
import { initializeRatchet, isRejectedMessage, RatchetError, type RatchetPort } from './ratchet';
import { createPairingState, isPairingState, createPairingJoinRequest, openPairingInvite, sealPairingInvite } from '../pairing/pairing';
import { syncEncryptedEvents } from '../services/relayTransport';

const offer = { identity: 'A'.repeat(43), oneTimeKey: 'B'.repeat(43) };
const metadata = { protocol: 2 as const, offer, established: false, verified: false, safetyNumber: '' };

describe('native ratchet boundary', () => {
  it('only receives public metadata from initialization; transports the offer inside the sealed invite', async () => {
    const port = vi.fn(async () => ({ offer })) as unknown as RatchetPort;
    const creator = await initializeRatchet(await createPairingState(), port);
    const request = await createPairingJoinRequest(creator.inviteCode!);
    const sealed = await sealPairingInvite(creator, request.publicKey);
    expect(sealed).not.toContain(offer.oneTimeKey);
    const joined = await openPairingInvite(request, sealed);
    expect(joined.ratchet?.offer).toEqual(offer);
    expect(isPairingState(joined)).toBe(true);
    const established = { ...joined, relationshipKey: '', ratchet: { ...metadata, established: true } };
    expect(isPairingState(established)).toBe(true);
    const forbidden = vi.fn();
    expect(await initializeRatchet(established, forbidden)).toBe(established);
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('refuses a legacy invite instead of silently choosing old encryption', async () => {
    const state = { ...await createPairingState(), partnerDeviceId: 'partner_device_123' };
    await expect(initializeRatchet(state, vi.fn())).rejects.toMatchObject({ code: 'upgrade_required' });
  });

  it('never treats storage, full queues or unknown failures as invalid ciphertext', () => {
    expect(isRejectedMessage(new RatchetError('message_rejected'))).toBe(true);
    for (const code of ['ratchet_storage_error', 'ratchet_anchor_missing', 'inbox_full', 'outbox_full', 'session_missing', 'ratchet_rollback_or_corruption']) {
      expect(isRejectedMessage(new RatchetError(code))).toBe(false);
    }
    expect(isRejectedMessage(new Error('message_rejected'))).toBe(false);
  });

  it('does not advance the relay cursor when native storage fails', async () => {
    const state = { ...await createPairingState(), ratchet: metadata };
    const envelope = { protocolVersion: 2, relationshipId: state.relationshipId, senderDeviceId: 'partner_device_123',
      recipientDeviceId: state.deviceId, keyId: state.keyId, sequence: 1, nonce: '0', ciphertext: 'test' };
    const fetcher: typeof fetch = async () => Response.json({ cursor: 9, messages: [{ relayId: 9, envelope }] });
    const port = vi.fn(async (operation: string) => {
      if (operation === 'receive') throw new RatchetError('ratchet_storage_error');
      return { incoming: [], outgoing: [] };
    }) as unknown as RatchetPort;
    await expect(syncEncryptedEvents(state, fetcher, port)).rejects.toMatchObject({ code: 'ratchet_storage_error' });
    expect(state.relayCursor).toBe(0);
  });

  it('skips a downgrade without passing it to either decryptor; does not trust relay-supplied peer IDs', async () => {
    const state = { ...await createPairingState(), ratchet: metadata };
    const fetcher: typeof fetch = async () => Response.json({ cursor: 1, devices: ['attacker_device123'],
      messages: [{ relayId: 1, envelope: { protocolVersion: 1, relationshipId: state.relationshipId,
        senderDeviceId: 'attacker_device123', recipientDeviceId: state.deviceId, keyId: state.keyId, sequence: 1, nonce: 'fake', ciphertext: 'fake' } }] });
    const port = vi.fn(async (operation: string) => operation === 'status'
      ? { established: false, verified: false, safetyNumber: '', peerId: null }
      : { incoming: [], outgoing: [] }) as unknown as RatchetPort;
    const result = await syncEncryptedEvents(state, fetcher, port);
    expect(result.received).toEqual([]);
    expect(result.state.partnerDeviceId).toBeUndefined();
    expect(vi.mocked(port).mock.calls.some(([operation]) => operation === 'receive')).toBe(false);
  });

  it('drains a full persisted inbox before contacting the relay again', async () => {
    const state = { ...await createPairingState(), ratchet: metadata };
    const incoming = Array.from({ length: 100 }, (_, index) => ({ receipt: String(index), event: {
      version: 1, id: String(index), relationshipId: state.relationshipId, senderDeviceId: 'partner_device_123',
      createdAt: '2026-09-09T00:00:00Z', kind: 'interaction', payload: { action: 'hug' },
    } }));
    const fetcher = vi.fn();
    const port = vi.fn(async (operation: string) => operation === 'status'
      ? { established: true, verified: true, safetyNumber: 'test', peerId: 'partner_device_123' }
      : { incoming, outgoing: [] }) as unknown as RatchetPort;
    const result = await syncEncryptedEvents(state, fetcher, port);
    expect(result.received).toHaveLength(100);
    expect(result.state.relayCursor).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
