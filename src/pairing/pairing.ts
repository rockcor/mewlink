import { decodeSecret, encodeSecret, newDemoKey } from '../crypto/events';

const STORAGE_KEY = 'mewlink.pairing.v1';
const INVITE_PREFIX = 'MEW1-';
const INVITE_LIFETIME_MS = 24 * 60 * 60 * 1000;

export interface PairingState {
  version: 1;
  relationshipId: string;
  relationshipKey: string;
  relayToken: string;
  keyId: string;
  deviceId: string;
  partnerDeviceId?: string;
  inviteExpiresAt: number;
  nextSequence: number;
  relayCursor: number;
  receivedSequences: Record<string, number>;
}

interface PairingInvite {
  v: 1;
  r: string;
  k: string;
  t: string;
  d: string;
  e: number;
  i: string;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const idPattern = /^[A-Za-z0-9_-]{16,64}$/;

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function randomId(byteLength: number) {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

export async function relayTokenHash(token: string) {
  return base64Url(await sha256(token));
}

export async function pairingSafetyCode(state: PairingState) {
  const digest = await sha256(`${state.relationshipId}.${state.relationshipKey}`);
  const number = ((digest[0] << 16) | (digest[1] << 8) | digest[2]) % 1_000_000;
  return String(number).padStart(6, '0').replace(/(\d{3})(\d{3})/u, '$1 $2');
}

export async function createPairingState(now = Date.now()): Promise<PairingState> {
  const relationshipKey = await encodeSecret(await newDemoKey());
  const keyDigest = await sha256(relationshipKey);
  return {
    version: 1,
    relationshipId: randomId(18),
    relationshipKey,
    relayToken: randomId(32),
    keyId: base64Url(keyDigest.slice(0, 12)),
    deviceId: randomId(18),
    inviteExpiresAt: now + INVITE_LIFETIME_MS,
    nextSequence: 0,
    relayCursor: 0,
    receivedSequences: {},
  };
}

export function pairingInviteCode(state: PairingState) {
  const invite: PairingInvite = {
    v: 1,
    r: state.relationshipId,
    k: state.relationshipKey,
    t: state.relayToken,
    d: state.deviceId,
    e: state.inviteExpiresAt,
    i: state.keyId,
  };
  return `${INVITE_PREFIX}${base64Url(new TextEncoder().encode(JSON.stringify(invite)))}`;
}

export function joinPairingState(code: string, now = Date.now()): PairingState {
  const normalized = code.trim().replace(/\s+/gu, '');
  if (!normalized.startsWith(INVITE_PREFIX) || normalized.length > 1_024) throw new Error('邀请码格式不正确');
  try {
    const invite = JSON.parse(new TextDecoder().decode(fromBase64Url(normalized.slice(INVITE_PREFIX.length)))) as Partial<PairingInvite>;
    const { r, k, t, d, e, i } = invite;
    if (invite.v !== 1 || typeof r !== 'string' || !idPattern.test(r) || typeof d !== 'string' || !idPattern.test(d)
      || typeof i !== 'string' || !idPattern.test(i) || typeof k !== 'string' || !idPattern.test(k)
      || typeof t !== 'string' || !idPattern.test(t)
      || typeof e !== 'number' || e < now) throw new Error('invalid invite');
    return {
      version: 1,
      relationshipId: r,
      relationshipKey: k,
      relayToken: t,
      keyId: i,
      deviceId: randomId(18),
      partnerDeviceId: d,
      inviteExpiresAt: e,
      nextSequence: 0,
      relayCursor: 0,
      receivedSequences: {},
    };
  } catch {
    throw new Error('邀请码无效或已经过期');
  }
}

function isPairingState(value: unknown): value is PairingState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<PairingState>;
  return state.version === 1 && idPattern.test(state.relationshipId ?? '') && idPattern.test(state.deviceId ?? '')
    && idPattern.test(state.keyId ?? '') && idPattern.test(state.relationshipKey ?? '') && idPattern.test(state.relayToken ?? '')
    && typeof state.inviteExpiresAt === 'number' && Number.isSafeInteger(state.nextSequence)
    && Number.isSafeInteger(state.relayCursor) && Boolean(state.receivedSequences && typeof state.receivedSequences === 'object');
}

export function loadPairing(storage?: StorageLike): PairingState | undefined {
  const source = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  if (!source) return undefined;
  try {
    const value: unknown = JSON.parse(source.getItem(STORAGE_KEY) ?? 'null');
    return isPairingState(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function savePairing(state: PairingState, storage?: StorageLike) {
  const destination = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  destination?.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearPairing(storage?: StorageLike) {
  const destination = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  destination?.removeItem(STORAGE_KEY);
}

export async function pairingKey(state: PairingState) {
  return decodeSecret(state.relationshipKey);
}
