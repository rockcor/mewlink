import type { EncryptedEnvelope, PlainEvent } from '../domain/types';

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
export async function encryptEvent(event: PlainEvent, recipientDeviceId: string, sequence: number, key: Uint8Array): Promise<EncryptedEnvelope> {
  const sodium = await readySodium();
  const header = { protocolVersion: 1 as const, relationshipId: event.relationshipId, senderDeviceId: event.senderDeviceId, recipientDeviceId, keyId: 'demo-session', sequence };
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const plaintext = new TextEncoder().encode(JSON.stringify(event));
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, aad(header), null, nonce, key);
  return { ...header, nonce: b64(sodium, nonce), ciphertext: b64(sodium, ciphertext) };
}
export async function decryptEvent(envelope: EncryptedEnvelope, key: Uint8Array): Promise<PlainEvent> {
  const sodium = await readySodium();
  const { nonce, ciphertext, ...header } = envelope;
  const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, unb64(sodium, ciphertext), aad(header), unb64(sodium, nonce), key);
  return JSON.parse(new TextDecoder().decode(plaintext)) as PlainEvent;
}
