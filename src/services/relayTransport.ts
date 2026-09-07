import { decryptEvent, encryptEvent } from '../crypto/events';
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
  devices: string[];
  messages: RelayMessage[];
  pairingRequest?: { deviceId: string; publicKey: string };
}

export class RelayError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function headers(state?: PairingState) {
  return {
    'Content-Type': 'application/json',
    ...(state ? { Authorization: `Bearer ${state.relayToken}` } : {}),
  };
}

async function checked(response: Response) {
  if (response.ok) return response;
  let message = '连接暂时不可用';
  try {
    const value = await response.json() as { error?: string };
    if (value.error === 'invite_expired') message = '邀请码已经过期';
    if (value.error === 'pair_full') message = '这组邀请码已经连接了两台设备';
    if (value.error === 'pairing_busy') message = '这个配对码正在被使用，请稍后再试';
    if (value.error === 'pairing_rejected') message = '配对码无效或已经过期';
    if (value.error === 'slow_down') message = '发送得太快了，请稍后再试';
  } catch {
    // Keep the friendly fallback message.
  }
  throw new RelayError(message, response.status);
}

export async function registerPairCreator(state: PairingState, fetcher: Fetcher = fetch) {
  if (!state.inviteCode) throw new RelayError('请重新生成配对码', 400);
  await checked(await fetcher(RELAY_ENDPOINT, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      operation: 'create',
      relationshipId: state.relationshipId,
      tokenHash: await relayTokenHash(state.relayToken),
      pairingCodeHash: await pairingCodeHash(state.inviteCode),
      deviceId: state.deviceId,
      inviteExpiresAt: Math.floor(state.inviteExpiresAt / 1000),
    }),
  }));
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
  }));
}

export async function claimPairingJoin(request: PairingJoinRequest, fetcher: Fetcher = fetch) {
  const response = await checked(await fetcher(RELAY_ENDPOINT, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ operation: 'claim_join', pairingCodeHash: request.codeHash, deviceId: request.deviceId }),
  }));
  const payload = await response.json() as { pending?: boolean; sealedInvite?: unknown };
  return typeof payload.sealedInvite === 'string' ? payload.sealedInvite : undefined;
}

export async function joinWithPairingCode(code: string, fetcher: Fetcher = fetch) {
  const request = await createPairingJoinRequest(code);
  await requestPairingJoin(request, fetcher);
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const sealedInvite = await claimPairingJoin(request, fetcher);
    if (sealedInvite) {
      const state = await openPairingInvite(request, sealedInvite);
      await registerPairJoiner(state, fetcher);
      return state;
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
  }));
}

function validEnvelope(value: unknown): value is EncryptedEnvelope {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Partial<EncryptedEnvelope>;
  return envelope.protocolVersion === 1 && typeof envelope.relationshipId === 'string'
    && typeof envelope.senderDeviceId === 'string' && typeof envelope.recipientDeviceId === 'string'
    && typeof envelope.keyId === 'string' && Number.isSafeInteger(envelope.sequence)
    && typeof envelope.nonce === 'string' && typeof envelope.ciphertext === 'string';
}

export async function syncEncryptedEvents(state: PairingState, fetcher: Fetcher = fetch) {
  const url = new URL(RELAY_ENDPOINT);
  url.searchParams.set('relationshipId', state.relationshipId);
  url.searchParams.set('deviceId', state.deviceId);
  url.searchParams.set('after', String(state.relayCursor));
  const response = await checked(await fetcher(url, { headers: headers(state) }));
  const payload = await response.json() as Partial<SyncResponse>;
  const pairingRequest = payload.pairingRequest;
  if (!state.partnerDeviceId && pairingRequest && typeof pairingRequest.deviceId === 'string' && typeof pairingRequest.publicKey === 'string') {
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
    }));
  }
  const cursor = Number.isSafeInteger(payload.cursor) && (payload.cursor ?? 0) >= state.relayCursor ? payload.cursor as number : state.relayCursor;
  const devices = Array.isArray(payload.devices) ? payload.devices.filter(device => typeof device === 'string' && device !== state.deviceId) : [];
  const receivedSequences = { ...state.receivedSequences };
  const received: StoredEvent[] = [];
  const key = await pairingKey(state);
  for (const message of Array.isArray(payload.messages) ? payload.messages : []) {
    if (!message || !Number.isSafeInteger(message.relayId) || !validEnvelope(message.envelope)) continue;
    const envelope = message.envelope;
    if (envelope.relationshipId !== state.relationshipId || envelope.recipientDeviceId !== state.deviceId
      || envelope.keyId !== state.keyId || envelope.senderDeviceId === state.deviceId
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
    ...state,
    ...(devices[0] ? { partnerDeviceId: devices[0] } : {}),
    relayCursor: cursor,
    receivedSequences,
  };
  return { state: next, received };
}

export async function sendEncryptedEvent(state: PairingState, event: PlainEvent, fetcher: Fetcher = fetch) {
  let active = state;
  if (!active.partnerDeviceId) active = (await syncEncryptedEvents(active, fetcher)).state;
  if (!active.partnerDeviceId) throw new RelayError('还在等待 TA 连接', 409);
  const sequence = active.nextSequence + 1;
  const envelope = await encryptEvent(event, active.partnerDeviceId, sequence, await pairingKey(active), active.keyId);
  await checked(await fetcher(RELAY_ENDPOINT, {
    method: 'POST',
    headers: headers(active),
    body: JSON.stringify({ operation: 'send', envelope }),
  }));
  const next = { ...active, nextSequence: sequence };
  const stored: StoredEvent = { event, direction: 'out', status: 'delivered', receivedAt: new Date().toISOString() };
  return { state: next, stored, envelope };
}
