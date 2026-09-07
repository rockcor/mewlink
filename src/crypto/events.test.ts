import sodium from 'libsodium-wrappers-sumo';
import { describe, expect, it } from 'vitest';
import type { EncryptedEnvelope, PlainEvent } from '../domain/types';
import { decryptEvent, encryptEvent, newDemoKey } from './events';

const statisticsSnapshots = {
  day: { input: { keyboard: 31, pointer: 12 }, workVisual: { code: 3_000, document: 2_000, web: 1_000, ai: 900 }, activity: { work: 6_900, meeting: 500, idle: 200 }, bars: Array.from({ length: 6 }, (_, index) => ({ label: `${index * 4}:00`, keyboard: index, pointer: index + 1 })) },
  week: { input: { keyboard: 71, pointer: 22 }, workVisual: { code: 7_000, document: 4_000, web: 2_000, ai: 1_500 }, activity: { work: 14_500, meeting: 800, idle: 400 }, bars: Array.from({ length: 7 }, (_, index) => ({ label: String(index), keyboard: index, pointer: index + 1 })) },
  month: { input: { keyboard: 301, pointer: 92 }, workVisual: { code: 30_000, document: 20_000, web: 10_000, ai: 8_000 }, activity: { work: 68_000, meeting: 5_000, idle: 2_000 }, bars: Array.from({ length: 5 }, (_, index) => ({ label: `9/${index + 1}`, keyboard: index, pointer: index + 1 })) }
};

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

  it('encrypts and validates a partner-visible statistics summary', async () => {
    const key = await newDemoKey();
    const event: PlainEvent = {
      id: crypto.randomUUID(), version: 1, relationshipId: 'relationshipTest01', senderDeviceId: 'statisticsDevice1',
      createdAt: new Date().toISOString(), kind: 'statistics.snapshot',
      payload: { visibility: 'partner', generatedAt: new Date().toISOString(), snapshots: statisticsSnapshots }
    };
    const envelope = await encryptEvent(event, 'recipientDevice001', 2, key);
    expect(JSON.stringify(envelope)).not.toContain('keyboard');
    await expect(decryptEvent(envelope, key)).resolves.toEqual(event);
  });

  it('encrypts and validates a companion skin update', async () => {
    const key = await newDemoKey();
    const event: PlainEvent = {
      id: crypto.randomUUID(), version: 1, relationshipId: 'relationshipTest01', senderDeviceId: 'skinDevice000001',
      createdAt: new Date().toISOString(), kind: 'profile.skin', payload: { skin: 'luka' }
    };
    const envelope = await encryptEvent(event, 'recipientDevice001', 3, key);
    expect(JSON.stringify(envelope)).not.toContain('luka');
    await expect(decryptEvent(envelope, key)).resolves.toEqual(event);
  });

  it('rejects malformed decrypted statistics', async () => {
    const key = await newDemoKey();
    const malformed = {
      id: crypto.randomUUID(), version: 1, relationshipId: 'relationshipTest01', senderDeviceId: 'statisticsDevice1',
      createdAt: new Date().toISOString(), kind: 'statistics.snapshot',
      payload: { visibility: 'partner', generatedAt: new Date().toISOString(), snapshots: { ...statisticsSnapshots, day: { ...statisticsSnapshots.day, bars: [] } } }
    } as PlainEvent;
    const envelope = await encryptEvent(malformed, 'recipientDevice001', 4, key);
    await expect(decryptEvent(envelope, key)).rejects.toThrow('metadata mismatch');
  });
});
