import sodium from 'libsodium-wrappers-sumo';
import { describe, expect, it } from 'vitest';
import type { EncryptedEnvelope, PlainEvent } from '../domain/types';
import { decryptEvent, newDemoKey } from './events';

describe('encrypted event compatibility', () => {
  it('decrypts an envelope created by an independent libsodium peer', async () => {
    await sodium.ready;
    const key = await newDemoKey();
    const event: PlainEvent = {
      id: crypto.randomUUID(),
      version: 1,
      relationshipId: 'relationshipTest01',
      senderDeviceId: 'independentDevice01',
      createdAt: new Date().toISOString(),
      kind: 'interaction',
      payload: { action: 'water', cupStyle: 'bottle' },
    };
    const header = {
      protocolVersion: 1 as const,
      relationshipId: event.relationshipId,
      senderDeviceId: event.senderDeviceId,
      recipientDeviceId: 'recipientDevice001',
      keyId: 'independentKey01',
      sequence: 1,
    };
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const text = new TextEncoder();
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      text.encode(JSON.stringify(event)),
      text.encode(JSON.stringify(header)),
      null,
      nonce,
      key,
    );
    const envelope: EncryptedEnvelope = {
      ...header,
      nonce: sodium.to_base64(nonce, sodium.base64_variants.URLSAFE_NO_PADDING),
      ciphertext: sodium.to_base64(ciphertext, sodium.base64_variants.URLSAFE_NO_PADDING),
    };
    await expect(decryptEvent(envelope, key)).resolves.toEqual(event);
  });
});
