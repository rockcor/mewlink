import { describe, expect, it } from 'vitest';
import type { EncryptedEnvelope, PlainEvent } from '../domain/types';
import { createPairingJoinRequest, createPairingState, openPairingInvite, pairingInviteCode, relayTokenHash } from '../pairing/pairing';
import { claimPairingJoin, registerPairCreator, registerPairJoiner, requestPairingJoin, sendEncryptedEvent, syncEncryptedEvents } from './relayTransport';

interface Relationship {
  tokenHash: string;
  pairingCodeHash: string;
  devices: Set<string>;
  messages: Array<{ relayId: number; envelope: EncryptedEnvelope }>;
  pairingRequest?: { deviceId: string; publicKey: string; sealedInvite?: string };
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
        pairingCodeHash: body.pairingCodeHash as string,
        devices: new Set([body.deviceId as string]),
        messages: [],
      });
      return json({ ok: true });
    }

    if (body?.operation === 'request_join') {
      const relationship = [...relationships.values()].find(item => item.pairingCodeHash === body.pairingCodeHash);
      if (!relationship) return json({ error: 'pairing_rejected' }, 403);
      relationship.pairingRequest = { deviceId: body.deviceId as string, publicKey: body.publicKey as string };
      return json({ ok: true });
    }

    if (body?.operation === 'claim_join') {
      const relationship = [...relationships.values()].find(item => item.pairingCodeHash === body.pairingCodeHash);
      const pairingRequest = relationship?.pairingRequest;
      if (!pairingRequest || pairingRequest.deviceId !== body.deviceId) return json({ error: 'pairing_rejected' }, 403);
      return json(pairingRequest.sealedInvite ? { sealedInvite: pairingRequest.sealedInvite } : { pending: true });
    }

    const envelope = body?.envelope as EncryptedEnvelope | undefined;
    const relationshipId = (body?.relationshipId ?? envelope?.relationshipId ?? url.searchParams.get('relationshipId')) as string;
    const relationship = relationships.get(relationshipId);
    if (!relationship || await relayTokenHash(token) !== relationship.tokenHash) return json({ error: 'pairing_rejected' }, 403);

    if (body?.operation === 'join') {
      relationship.devices.add(body.deviceId as string);
      return json({ ok: true });
    }

    if (body?.operation === 'approve_join') {
      if (!relationship.pairingRequest || relationship.pairingRequest.deviceId !== body.deviceId) return json({ error: 'pairing_rejected' }, 403);
      relationship.pairingRequest.sealedInvite = body.sealedInvite as string;
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
        ...(![...relationship.devices].some(device => device !== deviceId) && relationship.pairingRequest ? {
          pairingRequest: { deviceId: relationship.pairingRequest.deviceId, publicKey: relationship.pairingRequest.publicKey },
        } : {}),
      });
    }

    return json({ error: 'invalid_request' }, 400);
  };

  return { fetcher, bodies };
}

async function pairThroughCode(relay: ReturnType<typeof fakeRelay>) {
  let first = await createPairingState();
  await registerPairCreator(first, relay.fetcher);
  const request = await createPairingJoinRequest(pairingInviteCode(first));
  await requestPairingJoin(request, relay.fetcher);
  first = (await syncEncryptedEvents(first, relay.fetcher)).state;
  const sealedInvite = await claimPairingJoin(request, relay.fetcher);
  expect(sealedInvite).toBeTypeOf('string');
  const second = await openPairingInvite(request, sealedInvite as string);
  await registerPairJoiner(second, relay.fetcher);
  first = (await syncEncryptedEvents(first, relay.fetcher)).state;
  return { first, second };
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
    workVisual: { code: 2_000, document: 1_000, web: 500, ai: 400, mewlink: 300 },
    activity: { work: 3_900, meeting: 600, idle: 300 },
    bars: Array.from({ length: bars }, (_, index) => ({ label: String(index), keyboard: index + 2, pointer: index + 1 }))
  });
  const generatedAt = new Date().toISOString();
  return {
    id: crypto.randomUUID(), version: 1, relationshipId, senderDeviceId, createdAt: generatedAt,
    kind: 'statistics.snapshot',
    payload: { visibility: 'partner', generatedAt, snapshots: { day: snapshot(6), week: snapshot(7), month: snapshot(5) } }
  };
}

function skin(relationshipId: string, senderDeviceId: string): PlainEvent {
  return {
    id: crypto.randomUUID(), version: 1, relationshipId, senderDeviceId, createdAt: new Date().toISOString(),
    kind: 'profile.skin', payload: { skin: 'sky' }
  };
}

describe('two macOS encrypted relay', () => {
  it('delivers opaque interactions in both directions without duplicates', async () => {
    const relay = fakeRelay();
    let { first, second } = await pairThroughCode(relay);
    expect(first.partnerDeviceId).toBe(second.deviceId);
    expect(relay.bodies.join('\n')).not.toContain(first.relationshipKey);
    expect(relay.bodies.join('\n')).not.toContain(first.relayToken);

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

    const sharedSkin = skin(first.relationshipId, first.deviceId);
    const sentSkin = await sendEncryptedEvent(first, sharedSkin, relay.fetcher);
    first = sentSkin.state;
    expect(JSON.stringify(sentSkin.envelope)).not.toContain('sky');
    const receivedSkin = await syncEncryptedEvents(second, relay.fetcher);
    second = receivedSkin.state;
    expect(receivedSkin.received[0].event).toEqual(sharedSkin);
    expect(relay.bodies.join('\n')).not.toContain(hug.id);
    expect(relay.bodies.join('\n')).not.toContain(water.id);
    expect(relay.bodies.join('\n')).not.toContain(sharedStatistics.id);
    expect(relay.bodies.join('\n')).not.toContain(sharedSkin.id);
    expect(second.receivedSequences[first.deviceId]).toBe(3);
  });

  it('catches up interactions sent while the recipient is offline', async () => {
    const relay = fakeRelay();
    let { first, second } = await pairThroughCode(relay);

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
    const { first, second } = await pairThroughCode(relay);

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
