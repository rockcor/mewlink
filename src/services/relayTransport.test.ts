import { describe, expect, it } from 'vitest';
import type { EncryptedEnvelope, PlainEvent } from '../domain/types';
import { createPairingState, joinPairingState, pairingInviteCode, relayTokenHash } from '../pairing/pairing';
import { registerPairCreator, registerPairJoiner, sendEncryptedEvent, syncEncryptedEvents } from './relayTransport';

interface Relationship {
  tokenHash: string;
  devices: Set<string>;
  messages: Array<{ relayId: number; envelope: EncryptedEnvelope }>;
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Content-Type': 'application/json' } });
}

function fakeRelay() {
  const relationships = new Map<string, Relationship>();
  const bodies: string[] = [];
  let relayId = 0;

  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const authorization = request.headers.get('authorization') ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const bodyText = request.method === 'POST' ? await request.text() : '';
    if (bodyText) bodies.push(bodyText);
    const body = bodyText ? JSON.parse(bodyText) as Record<string, unknown> : undefined;

    if (body?.operation === 'create') {
      const relationshipId = body.relationshipId as string;
      relationships.set(relationshipId, {
        tokenHash: body.tokenHash as string,
        devices: new Set([body.deviceId as string]),
        messages: [],
      });
      return json({ ok: true });
    }

    const envelope = body?.envelope as EncryptedEnvelope | undefined;
    const relationshipId = (body?.relationshipId ?? envelope?.relationshipId ?? url.searchParams.get('relationshipId')) as string;
    const relationship = relationships.get(relationshipId);
    if (!relationship || await relayTokenHash(token) !== relationship.tokenHash) return json({ error: 'pairing_rejected' }, 403);

    if (body?.operation === 'join') {
      relationship.devices.add(body.deviceId as string);
      return json({ ok: true });
    }

    if (body?.operation === 'send') {
      relationship.messages.push({ relayId: ++relayId, envelope: envelope as EncryptedEnvelope });
      return json({ ok: true }, 202);
    }

    if (request.method === 'GET') {
      const deviceId = url.searchParams.get('deviceId');
      const after = Number(url.searchParams.get('after') ?? '0');
      const messages = relationship.messages.filter(message => message.relayId > after && message.envelope.recipientDeviceId === deviceId);
      return json({
        cursor: messages.at(-1)?.relayId ?? after,
        devices: [...relationship.devices].filter(device => device !== deviceId),
        messages,
      });
    }

    return json({ error: 'invalid_request' }, 400);
  };

  return { fetcher, bodies };
}

function interaction(relationshipId: string, senderDeviceId: string, action: 'hug' | 'water'): PlainEvent {
  return {
    id: crypto.randomUUID(),
    version: 1,
    relationshipId,
    senderDeviceId,
    createdAt: new Date().toISOString(),
    senderUtcOffsetMinutes: -420,
    kind: 'interaction',
    payload: action === 'water' ? { action, cupStyle: 'tumbler' } : { action },
  };
}

function statistics(relationshipId: string, senderDeviceId: string): PlainEvent {
  const snapshot = (bars: number) => ({
    input: { keyboard: 140, pointer: 36 },
    workVisual: { code: 2_000, document: 1_000, web: 500 },
    activity: { work: 3_500, meeting: 600, idle: 300 },
    bars: Array.from({ length: bars }, (_, index) => ({ label: String(index), keyboard: index + 2, pointer: index + 1 }))
  });
  const generatedAt = new Date().toISOString();
  return {
    id: crypto.randomUUID(), version: 1, relationshipId, senderDeviceId, createdAt: generatedAt,
    kind: 'statistics.snapshot',
    payload: { visibility: 'partner', generatedAt, snapshots: { day: snapshot(6), week: snapshot(7), month: snapshot(5) } }
  };
}

describe('two macOS encrypted relay', () => {
  it('delivers opaque interactions in both directions without duplicates', async () => {
    const relay = fakeRelay();
    let first = await createPairingState();
    let second = joinPairingState(pairingInviteCode(first));
    await registerPairCreator(first, relay.fetcher);
    await registerPairJoiner(second, relay.fetcher);

    first = (await syncEncryptedEvents(first, relay.fetcher)).state;
    expect(first.partnerDeviceId).toBe(second.deviceId);

    const hug = interaction(first.relationshipId, first.deviceId, 'hug');
    const sentHug = await sendEncryptedEvent(first, hug, relay.fetcher);
    first = sentHug.state;
    const serializedHug = JSON.stringify(sentHug.envelope);
    expect(serializedHug).not.toContain('hug');
    expect(serializedHug).not.toContain(hug.id);

    const receivedHug = await syncEncryptedEvents(second, relay.fetcher);
    second = receivedHug.state;
    expect(receivedHug.received).toHaveLength(1);
    expect(receivedHug.received[0].event).toEqual(hug);
    expect(receivedHug.received[0].direction).toBe('in');
    expect((await syncEncryptedEvents(second, relay.fetcher)).received).toHaveLength(0);

    const water = interaction(second.relationshipId, second.deviceId, 'water');
    const sentWater = await sendEncryptedEvent(second, water, relay.fetcher);
    second = sentWater.state;
    expect(JSON.stringify(sentWater.envelope)).not.toContain('water');

    const receivedWater = await syncEncryptedEvents(first, relay.fetcher);
    first = receivedWater.state;
    expect(receivedWater.received).toHaveLength(1);
    expect(receivedWater.received[0].event).toEqual(water);
    expect(first.receivedSequences[second.deviceId]).toBe(1);

    const sharedStatistics = statistics(first.relationshipId, first.deviceId);
    const sentStatistics = await sendEncryptedEvent(first, sharedStatistics, relay.fetcher);
    first = sentStatistics.state;
    expect(JSON.stringify(sentStatistics.envelope)).not.toContain('keyboard');
    const receivedStatistics = await syncEncryptedEvents(second, relay.fetcher);
    second = receivedStatistics.state;
    expect(receivedStatistics.received[0].event).toEqual(sharedStatistics);
    expect(relay.bodies.join('\n')).not.toContain(hug.id);
    expect(relay.bodies.join('\n')).not.toContain(water.id);
    expect(relay.bodies.join('\n')).not.toContain(sharedStatistics.id);
    expect(second.receivedSequences[first.deviceId]).toBe(2);
  });

  it('catches up interactions sent while the recipient is offline', async () => {
    const relay = fakeRelay();
    let first = await createPairingState();
    let second = joinPairingState(pairingInviteCode(first));
    await registerPairCreator(first, relay.fetcher);
    await registerPairJoiner(second, relay.fetcher);
    first = (await syncEncryptedEvents(first, relay.fetcher)).state;

    for (const action of ['hug', 'water'] as const) {
      const sent = await sendEncryptedEvent(first, interaction(first.relationshipId, first.deviceId, action), relay.fetcher);
      first = sent.state;
    }

    const caughtUp = await syncEncryptedEvents(second, relay.fetcher);
    second = caughtUp.state;
    expect(caughtUp.received.map(item => item.event.payload)).toEqual([
      { action: 'hug' },
      { action: 'water', cupStyle: 'tumbler' },
    ]);
    expect((await syncEncryptedEvents(second, relay.fetcher)).received).toHaveLength(0);
  });

  it('does not reveal an interaction to a device with the wrong relationship key', async () => {
    const relay = fakeRelay();
    let first = await createPairingState();
    const second = joinPairingState(pairingInviteCode(first));
    await registerPairCreator(first, relay.fetcher);
    await registerPairJoiner(second, relay.fetcher);
    first = (await syncEncryptedEvents(first, relay.fetcher)).state;

    const hug = interaction(first.relationshipId, first.deviceId, 'hug');
    await sendEncryptedEvent(first, hug, relay.fetcher);
    const unrelated = await createPairingState();
    const wrongKeyDevice = { ...second, relationshipKey: unrelated.relationshipKey };
    expect((await syncEncryptedEvents(wrongKeyDevice, relay.fetcher)).received).toHaveLength(0);

    const validRecipient = await syncEncryptedEvents(second, relay.fetcher);
    expect(validRecipient.received).toHaveLength(1);
    expect(validRecipient.received[0].event).toEqual(hug);
  });
});
