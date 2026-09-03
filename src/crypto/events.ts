import sodium from 'libsodium-wrappers-sumo';
import type { EncryptedEnvelope, PlainEvent } from '../domain/types';

const b64 = (bytes: Uint8Array) => sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING);
const unb64 = (value: string) => sodium.from_base64(value, sodium.base64_variants.URLSAFE_NO_PADDING);
const aad = (e: Omit<EncryptedEnvelope, 'nonce' | 'ciphertext'>) => new TextEncoder().encode(JSON.stringify(e));

export async function newDemoKey(): Promise<Uint8Array> { await sodium.ready; return sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES); }
export async function encryptEvent(event: PlainEvent, recipientDeviceId: string, sequence: number, key: Uint8Array): Promise<EncryptedEnvelope> {
  await sodium.ready;
  const header = { protocolVersion: 1 as const, relationshipId: event.relationshipId, senderDeviceId: event.senderDeviceId, recipientDeviceId, keyId: 'demo-session', sequence };
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const plaintext = new TextEncoder().encode(JSON.stringify(event));
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, aad(header), null, nonce, key);
  return { ...header, nonce: b64(nonce), ciphertext: b64(ciphertext) };
}
export async function decryptEvent(envelope: EncryptedEnvelope, key: Uint8Array): Promise<PlainEvent> {
  await sodium.ready;
  const { nonce, ciphertext, ...header } = envelope;
  const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, unb64(ciphertext), aad(header), unb64(nonce), key);
  return JSON.parse(new TextDecoder().decode(plaintext)) as PlainEvent;
}
