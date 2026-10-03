import { invoke } from '@tauri-apps/api/core';
import type { EncryptedEnvelope, PlainEvent } from '../domain/types';
import type { PairingState, RatchetOffer } from '../pairing/pairing';

export interface RatchetStatus { established: boolean; verified: boolean; safetyNumber: string; peerId?: string }
export interface RatchetPending {
  outgoing: Array<{ receipt: string; envelope: EncryptedEnvelope }>;
  incoming: Array<{ receipt: string; event: PlainEvent }>;
}
export class RatchetError extends Error {
  constructor(readonly code: string) { super(code); }
}
export type RatchetPort = <T>(operation: string, relationshipId: string, input?: unknown) => Promise<T>;
export const nativeRatchet: RatchetPort = async <T>(operation: string, relationshipId: string, input: unknown = null): Promise<T> => {
  try { return await invoke<T>('ratchet_command', { operation, relationshipId, input }); }
  catch (error) { throw new RatchetError(typeof error === 'string' ? error : 'ratchet_unavailable'); }
};

// Only authentication/format failures may be skipped. Disk/Keychain failures,
// full queues and missing sessions must keep the relay cursor unchanged.
const rejectedMessageCodes = new Set(['invalid_envelope', 'message_rejected', 'prekey_required',
  'invalid_message', 'metadata_mismatch', 'hello_required', 'bootstrap_missing', 'bootstrap_invalid',
  'invalid_message_kind', 'invalid_event']);
export const isRejectedMessage = (error: unknown) => error instanceof RatchetError && rejectedMessageCodes.has(error.code);

export async function initializeRatchet(state: PairingState, port: RatchetPort = nativeRatchet): Promise<PairingState> {
  if (state.ratchet?.established) return state; // Never reconstruct an established session from an invite.
  if (state.partnerDeviceId && !state.ratchet?.offer) throw new RatchetError('upgrade_required');
  const { offer } = await port<{ offer: RatchetOffer }>(state.partnerDeviceId ? 'join' : 'create', state.relationshipId, {
    context: { relationshipId: state.relationshipId, deviceId: state.deviceId, peerId: state.partnerDeviceId ?? null },
    bootstrap: state.relationshipKey, offer: state.ratchet?.offer,
  });
  return { ...state, ratchet: { protocol: 2, offer, established: false, verified: false, safetyNumber: '' } };
}
