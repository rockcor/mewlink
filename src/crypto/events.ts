import { petSkins, type EncryptedEnvelope, type PlainEvent } from '../domain/types';

type Sodium = typeof import('libsodium-wrappers-sumo').default;
let sodiumPromise: Promise<Sodium> | undefined;
const readySodium = () => sodiumPromise ??= import('libsodium-wrappers-sumo').then(async module => {
  await module.default.ready;
  return module.default;
});
const b64 = (sodium: Sodium, bytes: Uint8Array) => sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING);
const unb64 = (sodium: Sodium, value: string) => sodium.from_base64(value, sodium.base64_variants.URLSAFE_NO_PADDING);
const aad = (e: Omit<EncryptedEnvelope, 'nonce' | 'ciphertext'>) => new TextEncoder().encode(JSON.stringify(e));

export async function newDemoKey(): Promise<Uint8Array> { const sodium = await readySodium(); return sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES); }
export async function encodeSecret(bytes: Uint8Array): Promise<string> { return b64(await readySodium(), bytes); }
export async function decodeSecret(value: string): Promise<Uint8Array> { return unb64(await readySodium(), value); }

function isPlainEvent(value: unknown): value is PlainEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  if (event.version !== 1 || typeof event.id !== 'string' || event.id.length > 80
    || typeof event.relationshipId !== 'string' || typeof event.senderDeviceId !== 'string'
    || typeof event.createdAt !== 'string' || typeof event.payload !== 'object' || !event.payload) return false;
  const payload = event.payload as Record<string, unknown>;
  if (event.kind === 'interaction') {
    return payload.action === 'water' || payload.action === 'hug';
  }
  if (event.kind === 'activity.segment') {
    return typeof payload.category === 'string'
      && ['work', 'meeting', 'leisure', 'idle', 'rest', 'coding', 'reading', 'video', 'browsing'].includes(payload.category)
      && typeof payload.startedAt === 'string'
      && typeof payload.endedAt === 'string';
  }
  if (event.kind === 'profile.skin') return petSkins.includes(payload.skin as (typeof petSkins)[number]);
  if (event.kind !== 'statistics.snapshot'
    || (payload.visibility !== 'private' && payload.visibility !== 'partner')
    || typeof payload.generatedAt !== 'string') return false;
  if (payload.visibility === 'private') return payload.snapshots === undefined;
  if (!payload.snapshots || typeof payload.snapshots !== 'object') return false;
  const snapshots = payload.snapshots as Record<string, unknown>;
  return isStatisticsSnapshot(snapshots.day, 6)
    && isStatisticsSnapshot(snapshots.week, 7)
    && isStatisticsSnapshot(snapshots.month, 5);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000_000;
}

function isNumberRecord(value: unknown, keys: string[]): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return keys.every(key => isNonNegativeNumber(record[key]));
}

function isStatisticsSnapshot(value: unknown, expectedBars: number): boolean {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Record<string, unknown>;
  if (!isNumberRecord(snapshot.input, ['keyboard', 'pointer'])
    || !isNumberRecord(snapshot.workVisual, ['code', 'document', 'web'])
    || !isNumberRecord(snapshot.activity, ['work', 'meeting', 'idle'])
    || !Array.isArray(snapshot.bars)
    || snapshot.bars.length !== expectedBars) return false;
  return snapshot.bars.every(bar => {
    if (!bar || typeof bar !== 'object') return false;
    const item = bar as Record<string, unknown>;
    return typeof item.label === 'string'
      && item.label.length <= 20
      && isNonNegativeNumber(item.keyboard)
      && isNonNegativeNumber(item.pointer);
  });
}

export async function encryptEvent(event: PlainEvent, recipientDeviceId: string, sequence: number, key: Uint8Array, keyId = 'demo-session'): Promise<EncryptedEnvelope> {
  const sodium = await readySodium();
  const header = { protocolVersion: 1 as const, relationshipId: event.relationshipId, senderDeviceId: event.senderDeviceId, recipientDeviceId, keyId, sequence };
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const plaintext = new TextEncoder().encode(JSON.stringify(event));
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, aad(header), null, nonce, key);
  return { ...header, nonce: b64(sodium, nonce), ciphertext: b64(sodium, ciphertext) };
}
export async function decryptEvent(envelope: EncryptedEnvelope, key: Uint8Array): Promise<PlainEvent> {
  const sodium = await readySodium();
  const { nonce, ciphertext, ...header } = envelope;
  const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, unb64(sodium, ciphertext), aad(header), unb64(sodium, nonce), key);
  const event: unknown = JSON.parse(new TextDecoder().decode(plaintext));
  if (!isPlainEvent(event) || event.relationshipId !== envelope.relationshipId || event.senderDeviceId !== envelope.senderDeviceId) {
    throw new Error('encrypted event metadata mismatch');
  }
  return event;
}
