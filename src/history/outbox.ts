import { encryptEvent } from '../crypto/events';
import { nativeRatchet, type RatchetPort } from '../crypto/ratchet';
import type { PlainEvent, StoredEvent } from '../domain/types';
import { pairingKey, type PairingState } from '../pairing/pairing';
import { acknowledgeOutgoing, nextOutgoingSequence, pendingOutgoing, putEvent, saveOutgoing, storedOutgoing, type OutboxItem } from '../storage/events';
import { flushRatchetOutbox, sendEncryptedBatch } from '../services/relayTransport';

export const queueEncryptedEvent = async (state: PairingState, event: PlainEvent, ratchet: RatchetPort = nativeRatchet) => {
  if (!state.partnerDeviceId || event.relationshipId !== state.relationshipId || event.senderDeviceId !== state.deviceId) throw new Error('pairing_required');
  const existing = await storedOutgoing(event);
  if (existing && existing.direction === 'out' && existing.event.relationshipId === state.relationshipId
    && existing.event.senderDeviceId === state.deviceId) return { state, stored: existing };
  if (state.ratchet) {
    // Nothing leaves a ratchet relationship before both safety numbers match.
    if (!state.ratchet.verified) throw new Error('pairing_required');
    // The native ratchet commits the ciphertext to its own durable outbox; the
    // relay flush drains it. Only the plaintext record is kept here for replay.
    await ratchet('send', state.relationshipId, event);
    const stored: StoredEvent = { event, direction: 'out', status: 'queued', receivedAt: new Date().toISOString() };
    await putEvent(stored);
    return { state, stored };
  }
  const sequence = await nextOutgoingSequence(state);
  const envelope = await encryptEvent(event, state.partnerDeviceId, sequence, await pairingKey(state), state.keyId);
  const item: OutboxItem = { id: event.id, envelope, stored: { event, direction: 'out', status: 'queued', receivedAt: new Date().toISOString() } };
  // Commit ciphertext before a network send; retry the same sequence and nonce.
  await saveOutgoing(item);
  return { state: { ...state, nextSequence: sequence }, stored: item.stored };
};

export async function flushEncryptedOutbox(state: PairingState, fetcher: typeof fetch = fetch, ratchet: RatchetPort = nativeRatchet) {
  if (state.ratchet) {
    await flushRatchetOutbox(state, fetcher, ratchet);
    return [];
  }
  const items = await pendingOutgoing(state);
  if (!items.length) return [];
  await sendEncryptedBatch(state, items.map(item => item.envelope), fetcher);
  await acknowledgeOutgoing(items);
  return items.map(item => ({ ...item.stored, status: 'delivered' as const }));
}
