import { decryptEvent, encryptEvent, isPlainEvent } from '../crypto/events';
import { initializeRatchet, nativeRatchet, isRejectedMessage, RatchetError, type RatchetPort, type RatchetStatus, type RatchetPending } from '../crypto/ratchet';
import type { EncryptedEnvelope, PlainEvent, StoredEvent } from '../domain/types';
import {
  createPairingJoinRequest,
  openPairingInvite,
  pairingCodeHash,
  pairingKey,
  relayTokenHash,
  sealPairingInvite,
  type PairingJoinRequest,
  type PairingState,
} from '../pairing/pairing';
import type { Revocation } from '../pairing/secureStore';

export const RELAY_ENDPOINT = import.meta.env.VITE_RELAY_ENDPOINT || (import.meta.env.DEV
  ? 'http://localhost:3000/api/relay'
  : 'https://mewlink.jshmhsb.chatgpt.site/api/relay');

type Fetcher = typeof fetch;

interface RelayMessage {
  relayId: number;
  envelope: EncryptedEnvelope;
}

interface SyncResponse {
  cursor: number;
  inviteExpiresAt?: number;
  devices: string[];
  messages: RelayMessage[];
  pairingRequest?: { deviceId: string; publicKey: string };
}

export class RelayError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

function headers(state?: Pick<PairingState, 'relayToken'>) {
  return {
    'Content-Type': 'application/json',
    ...(state ? { Authorization: `Bearer ${state.relayToken}` } : {}),
  };
}

async function checked(response: Response) {
  if (response.ok) return response;
  let message = '连接暂时不可用';
  let code: string | undefined;
  try {
    const value = await response.json() as { error?: string };
    code = value.error;
    if (value.error === 'invite_expired') message = '邀请码已经过期';
    if (value.error === 'pair_full') message = '这组邀请码已经连接了两台设备';
    if (value.error === 'pairing_busy') message = '这个配对码正在被使用，请稍后再试';
    if (value.error === 'pairing_rejected') message = '配对码无效或已经过期';
    if (value.error === 'slow_down') message = '发送得太快了，请稍后再试';
  } catch {
    // Keep the friendly fallback message.
  }
  throw new RelayError(message, response.status, code);
}

export async function revokeRelationship(state: Revocation, fetcher: Fetcher = fetch) {
  const response = await checked(await fetcher(RELAY_ENDPOINT, {
    method: 'POST', headers: headers(state),
    body: JSON.stringify({ operation: 'revoke', relationshipId: state.relationshipId, deviceId: state.deviceId }),
    signal: AbortSignal.timeout(10_000),
  }));
  const result = await response.json() as { revoked?: boolean };
  if (result.revoked !== true) throw new RelayError('revocation_not_confirmed', 502);
}

export async function registerPairCreator(state: PairingState, fetcher: Fetcher = fetch) {
  if (!state.inviteCode) throw new RelayError('请重新生成配对码', 400);
  const response = await checked(await fetcher(RELAY_ENDPOINT, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      operation: 'create',
      protocolVersion: state.ratchet ? 2 : 1,
      relationshipId: state.relationshipId,
      tokenHash: await relayTokenHash(state.relayToken),
      pairingCodeHash: await pairingCodeHash(state.inviteCode),
      deviceId: state.deviceId,
      inviteExpiresAt: Math.floor(state.inviteExpiresAt / 1000),
    }),
    signal: AbortSignal.timeout(10_000),
  }));
  const payload = await response.json() as { inviteExpiresAt?: number };
  return { ...withServerExpiry(state, payload.inviteExpiresAt), registration: undefined };
}

function withServerExpiry(state: PairingState, expiresAt?: number): PairingState {
  return Number.isSafeInteger(expiresAt) && (expiresAt ?? 0) > 0
    ? { ...state, inviteExpiresAt: (expiresAt as number) * 1000 }
    : state;
}

export async function requestPairingJoin(request: PairingJoinRequest, fetcher: Fetcher = fetch) {
  await checked(await fetcher(RELAY_ENDPOINT, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      operation: 'request_join',
      pairingCodeHash: request.codeHash,
      deviceId: request.deviceId,
      publicKey: request.publicKey,
    }),
    signal: AbortSignal.timeout(10_000),
  }));
}

export async function claimPairingJoin(request: PairingJoinRequest, fetcher: Fetcher = fetch) {
  const response = await checked(await fetcher(RELAY_ENDPOINT, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ operation: 'claim_join', pairingCodeHash: request.codeHash, deviceId: request.deviceId }),
    signal: AbortSignal.timeout(10_000),
  }));
  const payload = await response.json() as { pending?: boolean; sealedInvite?: unknown };
  return typeof payload.sealedInvite === 'string' ? payload.sealedInvite : undefined;
}

export async function joinWithPairingCode(code: string, fetcher: Fetcher = fetch, persist?: (state: PairingState) => Promise<void>) {
  const request = await createPairingJoinRequest(code);
  await requestPairingJoin(request, fetcher);
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const sealedInvite = await claimPairingJoin(request, fetcher);
    if (sealedInvite) {
      let state = await openPairingInvite(request, sealedInvite);
      if (!state.ratchet) throw new RatchetError('upgrade_required');
      await persist?.(state);
      state = await initializeRatchet(state);
      await persist?.(state);
      await registerPairJoiner(state, fetcher);
      return { ...state, registration: undefined };
    }
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  throw new RelayError('等待超时，请确认对方的 MewLink 保持打开', 408);
}

export async function registerPairJoiner(state: PairingState, fetcher: Fetcher = fetch) {
  await checked(await fetcher(RELAY_ENDPOINT, {
    method: 'POST',
    headers: headers(state),
    body: JSON.stringify({ operation: 'join', relationshipId: state.relationshipId, deviceId: state.deviceId }),
    signal: AbortSignal.timeout(10_000),
  }));
}

export async function resumePairingRegistration(state: PairingState, fetcher: Fetcher = fetch): Promise<PairingState> {
  if (state.ratchet && state.registration) state = await initializeRatchet(state);
  if (state.registration === 'create') return registerPairCreator(state, fetcher);
  if (state.registration === 'join') {
    await registerPairJoiner(state, fetcher);
    return { ...state, registration: undefined };
  }
  return state;
}

function validEnvelope(value: unknown): value is EncryptedEnvelope {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Partial<EncryptedEnvelope>;
  return (envelope.protocolVersion === 1 || envelope.protocolVersion === 2) && typeof envelope.relationshipId === 'string'
    && typeof envelope.senderDeviceId === 'string' && typeof envelope.recipientDeviceId === 'string'
    && typeof envelope.keyId === 'string' && Number.isSafeInteger(envelope.sequence)
    && typeof envelope.nonce === 'string' && typeof envelope.ciphertext === 'string';
}

export async function syncEncryptedEvents(state: PairingState, fetcher: Fetcher = fetch, ratchet: RatchetPort = nativeRatchet) {
  if (state.ratchet) {
    // Drain durable deliveries before fetching another batch. Otherwise a full
    // inbox after a crash could prevent the very acknowledgements that free it.
    const local = await ratchetDeliveries(state, ratchet);
    if (local.received.length) return local;
    await flushRatchetOutbox(state, fetcher, ratchet);
  }
  const url = new URL(RELAY_ENDPOINT);
  url.searchParams.set('relationshipId', state.relationshipId);
  url.searchParams.set('deviceId', state.deviceId);
  url.searchParams.set('after', String(state.relayCursor));
  const response = await checked(await fetcher(url, { headers: headers(state), signal: AbortSignal.timeout(10_000) }));
  const payload = await response.json() as Partial<SyncResponse>;
  const pairingRequest = payload.pairingRequest;
  if (!state.partnerDeviceId && state.relationshipKey && pairingRequest && typeof pairingRequest.deviceId === 'string' && typeof pairingRequest.publicKey === 'string') {
    const sealedInvite = await sealPairingInvite(state, pairingRequest.publicKey);
    await checked(await fetcher(RELAY_ENDPOINT, {
      method: 'POST',
      headers: headers(state),
      body: JSON.stringify({
        operation: 'approve_join',
        relationshipId: state.relationshipId,
        deviceId: pairingRequest.deviceId,
        sealedInvite,
      }),
      signal: AbortSignal.timeout(10_000),
    }));
  }
  const cursor = Number.isSafeInteger(payload.cursor) && (payload.cursor ?? 0) >= state.relayCursor ? payload.cursor as number : state.relayCursor;
  if (state.ratchet) {
    for (const message of Array.isArray(payload.messages) ? payload.messages : []) {
      if (!message || !Number.isSafeInteger(message.relayId) || !validEnvelope(message.envelope)) continue;
      if (message.envelope.protocolVersion !== 2) continue; // Never decrypt v1 inside a v2 relationship.
      try { await ratchet('receive', state.relationshipId, message.envelope); }
      catch (error) { if (!isRejectedMessage(error)) throw error; }
    }
    await flushRatchetOutbox(state, fetcher, ratchet);
    return ratchetDeliveries({ ...withServerExpiry(state, payload.inviteExpiresAt), relayCursor: cursor }, ratchet);
  }
  const devices = Array.isArray(payload.devices) ? payload.devices.filter(device => typeof device === 'string' && device !== state.deviceId) : [];
  const receivedSequences = { ...state.receivedSequences };
  const received: StoredEvent[] = [];
  const key = await pairingKey(state);
  for (const message of Array.isArray(payload.messages) ? payload.messages : []) {
    if (!message || !Number.isSafeInteger(message.relayId) || !validEnvelope(message.envelope)) continue;
    const envelope = message.envelope;
    if (envelope.relationshipId !== state.relationshipId || envelope.recipientDeviceId !== state.deviceId
      || envelope.keyId !== state.keyId || envelope.senderDeviceId !== (state.partnerDeviceId ?? devices[0])
      || envelope.sequence <= (receivedSequences[envelope.senderDeviceId] ?? 0)) continue;
    try {
      const event = await decryptEvent(envelope, key);
      receivedSequences[envelope.senderDeviceId] = envelope.sequence;
      received.push({ event, direction: 'in', status: 'delivered', receivedAt: new Date().toISOString() });
    } catch {
      // Advance the opaque relay cursor while ignoring unauthenticated envelopes.
    }
  }
  const next: PairingState = {
    ...withServerExpiry(state, payload.inviteExpiresAt),
    ...(!state.partnerDeviceId && devices[0] ? { partnerDeviceId: devices[0] } : {}),
    relayCursor: cursor,
    receivedSequences,
  };
  return { state: next, received };
}

export async function sendEncryptedEvent(state: PairingState, event: PlainEvent, fetcher: Fetcher = fetch, ratchet: RatchetPort = nativeRatchet) {
  if (state.ratchet) {
    const envelope = await ratchet<EncryptedEnvelope>('send', state.relationshipId, event);
    await flushRatchetOutbox(state, fetcher, ratchet);
    const stored: StoredEvent = { event, direction: 'out', status: 'delivered', receivedAt: new Date().toISOString() };
    return { state, stored, envelope };
  }
  let active = state;
  if (!active.partnerDeviceId) active = (await syncEncryptedEvents(active, fetcher)).state;
  if (!active.partnerDeviceId) throw new RelayError('还在等待 TA 连接', 409);
  const sequence = active.nextSequence + 1;
  const envelope = await encryptEvent(event, active.partnerDeviceId, sequence, await pairingKey(active), active.keyId);
  await checked(await fetcher(RELAY_ENDPOINT, {
    method: 'POST',
    headers: headers(active),
    body: JSON.stringify({ operation: 'send', envelope }),
    signal: AbortSignal.timeout(10_000),
  }));
  const next = { ...active, nextSequence: sequence };
  const stored: StoredEvent = { event, direction: 'out', status: 'delivered', receivedAt: new Date().toISOString() };
  return { state: next, stored, envelope };
}

async function flushRatchetOutbox(state: PairingState, fetcher: Fetcher, ratchet: RatchetPort) {
  const { outgoing } = await ratchet<RatchetPending>('pending', state.relationshipId);
  for (const { receipt, envelope } of outgoing) {
    await checked(await fetcher(RELAY_ENDPOINT, { method: 'POST', headers: headers(state),
      body: JSON.stringify({ operation: 'send', envelope }), signal: AbortSignal.timeout(10_000) }));
    await ratchet('ack_outgoing', state.relationshipId, receipt);
  }
}

async function ratchetDeliveries(state: PairingState, ratchet: RatchetPort) {
  if (!state.ratchet) throw new RatchetError('upgrade_required');
  const status = await ratchet<RatchetStatus>('status', state.relationshipId);
  const pending = await ratchet<RatchetPending>('pending', state.relationshipId);
  const received: StoredEvent[] = [];
  for (const delivery of pending.incoming) {
    if (!isPlainEvent(delivery.event)) {
      await ratchet('ack_incoming', state.relationshipId, delivery.receipt);
      continue;
    }
    received.push({ event: delivery.event, direction: 'in', status: 'delivered',
      receivedAt: new Date().toISOString(), ratchetReceipt: delivery.receipt });
  }
  return { state: { ...state, partnerDeviceId: status.peerId ?? state.partnerDeviceId,
    relationshipKey: status.established ? '' : state.relationshipKey,
    ratchet: { ...state.ratchet, established: status.established, verified: status.verified, safetyNumber: status.safetyNumber },
  }, received };
}
