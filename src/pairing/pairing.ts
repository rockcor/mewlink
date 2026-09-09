import { decodeSecret, encodeSecret, newDemoKey } from '../crypto/events';

type Sodium = typeof import('libsodium-wrappers-sumo').default;
let sodiumPromise: Promise<Sodium> | undefined;
const readySodium = () => sodiumPromise ??= import('libsodium-wrappers-sumo').then(async module => {
  await module.default.ready;
  return module.default;
});

const STORAGE_KEY = 'mewlink.pairing.v1';
export const INVITE_LIFETIME_MS = 15 * 60 * 1000;
const PAIRING_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const pairingCodePattern = /^[2-9A-HJ-NP-Z]{4}-?[2-9A-HJ-NP-Z]{4}$/u;

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
  inviteCode?: string;
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

export interface PairingJoinRequest {
  codeHash: string;
  deviceId: string;
  publicKey: string;
  privateKey: string;
}

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function randomId(byteLength: number) {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

function randomPairingCode() {
  const random = crypto.getRandomValues(new Uint8Array(8));
  const compact = Array.from(random, byte => PAIRING_CODE_ALPHABET[byte % PAIRING_CODE_ALPHABET.length]).join('');
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

export function normalizePairingCode(code: string) {
  const normalized = code.trim().toUpperCase().replace(/[\s-]+/gu, '');
  if (!pairingCodePattern.test(normalized)) throw new Error('配对码格式不正确');
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

export async function relayTokenHash(token: string) {
  return base64Url(await sha256(token));
}

export async function pairingCodeHash(code: string) {
  return base64Url(await sha256(normalizePairingCode(code).replace('-', '')));
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
    inviteCode: randomPairingCode(),
  };
}

export function pairingInviteCode(state: PairingState) {
  return state.inviteCode ?? '';
}

export function pairingInviteSecondsLeft(state: PairingState, now = Date.now()) {
  return Math.max(0, Math.ceil((state.inviteExpiresAt - now) / 1000));
}

function pairingInvite(state: PairingState): PairingInvite {
  return {
    v: 1,
    r: state.relationshipId,
    k: state.relationshipKey,
    t: state.relayToken,
    d: state.deviceId,
    e: state.inviteExpiresAt,
    i: state.keyId,
  };
}

function pairingStateFromInvite(invite: Partial<PairingInvite>, deviceId: string, now = Date.now()): PairingState {
  const { r, k, t, d, e, i } = invite;
  if (invite.v !== 1 || typeof r !== 'string' || !idPattern.test(r) || typeof d !== 'string' || !idPattern.test(d)
    || typeof i !== 'string' || !idPattern.test(i) || typeof k !== 'string' || !idPattern.test(k)
    || typeof t !== 'string' || !idPattern.test(t)
    || typeof e !== 'number' || !Number.isFinite(e) || e <= now) throw new Error('invalid invite');
  return {
    version: 1,
    relationshipId: r,
    relationshipKey: k,
    relayToken: t,
    keyId: i,
    deviceId,
    partnerDeviceId: d,
    inviteExpiresAt: e,
    nextSequence: 0,
    relayCursor: 0,
    receivedSequences: {},
  };
}

export async function createPairingJoinRequest(code: string): Promise<PairingJoinRequest> {
  const sodium = await readySodium();
  const keypair = sodium.crypto_box_keypair();
  return {
    codeHash: await pairingCodeHash(code),
    deviceId: randomId(18),
    publicKey: sodium.to_base64(keypair.publicKey, sodium.base64_variants.URLSAFE_NO_PADDING),
    privateKey: sodium.to_base64(keypair.privateKey, sodium.base64_variants.URLSAFE_NO_PADDING),
  };
}

export async function sealPairingInvite(state: PairingState, recipientPublicKey: string) {
  const sodium = await readySodium();
  const publicKey = sodium.from_base64(recipientPublicKey, sodium.base64_variants.URLSAFE_NO_PADDING);
  const plaintext = new TextEncoder().encode(JSON.stringify(pairingInvite(state)));
  return sodium.to_base64(sodium.crypto_box_seal(plaintext, publicKey), sodium.base64_variants.URLSAFE_NO_PADDING);
}

export async function openPairingInvite(request: PairingJoinRequest, sealedInvite: string, now = Date.now()) {
  const sodium = await readySodium();
  try {
    const publicKey = sodium.from_base64(request.publicKey, sodium.base64_variants.URLSAFE_NO_PADDING);
    const privateKey = sodium.from_base64(request.privateKey, sodium.base64_variants.URLSAFE_NO_PADDING);
    const ciphertext = sodium.from_base64(sealedInvite, sodium.base64_variants.URLSAFE_NO_PADDING);
    const plaintext = sodium.crypto_box_seal_open(ciphertext, publicKey, privateKey);
    const invite = JSON.parse(new TextDecoder().decode(plaintext)) as Partial<PairingInvite>;
    return pairingStateFromInvite(invite, request.deviceId, now);
  } catch {
    throw new Error('配对码无效或已经过期');
  }
}

function isPairingState(value: unknown): value is PairingState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<PairingState>;
  return state.version === 1 && idPattern.test(state.relationshipId ?? '') && idPattern.test(state.deviceId ?? '')
    && idPattern.test(state.keyId ?? '') && idPattern.test(state.relationshipKey ?? '') && idPattern.test(state.relayToken ?? '')
    && typeof state.inviteExpiresAt === 'number' && Number.isSafeInteger(state.nextSequence)
    && Number.isSafeInteger(state.relayCursor) && Boolean(state.receivedSequences && typeof state.receivedSequences === 'object')
    && (idPattern.test(state.partnerDeviceId ?? '') || (typeof state.inviteCode === 'string' && pairingCodePattern.test(state.inviteCode)));
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
