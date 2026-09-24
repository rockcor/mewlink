import { describe, expect, it } from 'vitest';
import type { EncryptedEnvelope, PlainEvent } from '../domain/types';
import { createPairingJoinRequest, createPairingState, openPairingInvite, pairingInviteCode, relayTokenHash } from '../pairing/pairing';
import { claimPairingJoin, registerPairCreator, registerPairJoiner, requestPairingJoin, sendEncryptedEvent, syncEncryptedEvents } from './relayTransport';
import { companionStates } from './companionState';
import { encryptEvent } from '../crypto/events';
import { pairingKey } from '../pairing/pairing';
import { consumeCup, waterClickAction, type PendingCups } from '../pet/pendingCups';

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
  it('syncs Shell to the partner without replacing the partner own skin', async () => {
    const relay = fakeRelay();
    const { first, second } = await pairThroughCode(relay);
    const update: PlainEvent = { id: crypto.randomUUID(), version: 1, relationshipId: first.relationshipId,
      senderDeviceId: first.deviceId, createdAt: new Date().toISOString(), kind: 'profile.skin', payload: { skin: 'shell' } };
    const sent = await sendEncryptedEvent(first, update, relay.fetcher);
    const received = await syncEncryptedEvents(second, relay.fetcher);
    const own = { activity: 'work', workVisual: 'code', skin: 'luka' } as const;
    const view = companionStates(own, received.received, received.state);
    expect(received.received[0].event).toEqual(update);
    expect(view.partner.skin).toBe('shell');
    expect(view.self).toEqual(own);
    expect(JSON.stringify(sent.envelope)).not.toContain('"skin":"shell"');
  });

  it('drinks the received cup first and removes only that cup at its sender', async () => {
    const relay = fakeRelay();
    let { first, second } = await pairThroughCode(relay);
    const water = interaction(first.relationshipId, first.deviceId, 'water');
    first = (await sendEncryptedEvent(first, water, relay.fetcher)).state;
    const delivery = await syncEncryptedEvents(second, relay.fetcher);
    second = delivery.state;
    expect(delivery.received[0].event).toEqual(water);
    const cup = { id: water.id, style: 'tumbler' as const, placedAt: Date.now() };
    const senderCups: PendingCups = { self: { ...cup, id: 'separate-cup' }, partner: cup };
    const receiverCups: PendingCups = { self: cup };
    expect(waterClickAction(receiverCups)).toBe('drink-self');
    expect(consumeCup(receiverCups, 'self', water.id)).toEqual({});
    const ack: PlainEvent = { id: crypto.randomUUID(), version: 1, relationshipId: second.relationshipId,
      senderDeviceId: second.deviceId, createdAt: new Date().toISOString(), kind: 'cup.consumed', payload: { cupEventId: water.id } };
    second = (await sendEncryptedEvent(second, ack, relay.fetcher)).state;
    const confirmation = await syncEncryptedEvents(first, relay.fetcher);
    expect(confirmation.received.map(item => item.event)).toEqual([ack]);
    expect(consumeCup(senderCups, 'partner', water.id)).toEqual({ self: senderCups.self });
    expect((await syncEncryptedEvents(confirmation.state, relay.fetcher)).received).toHaveLength(0);
    expect(relay.bodies.join('')).not.toContain(water.id);
    expect(relay.bodies.join('')).not.toContain('cup.consumed');
    expect(second.nextSequence).toBe(1); // One acknowledgement, not a second water gesture.
  });

  it('keeps live activity and skin assigned to the sender on both paired clients', async () => {
    const relay = fakeRelay();
    let { first, second } = await pairThroughCode(relay);
    const now = new Date().toISOString();
    const aSelf = { activity: 'work', workVisual: 'code', skin: 'mint' } as const;
    const bSelf = { activity: 'meeting', workVisual: 'web', skin: 'sky' } as const;
    const status = (state: typeof first, category: 'work' | 'meeting'): PlainEvent => ({
      id: crypto.randomUUID(), version: 1, relationshipId: state.relationshipId,
      senderDeviceId: state.deviceId, senderUtcOffsetMinutes: -420, createdAt: now,
      kind: 'activity.segment', payload: { category, workVisual: 'code', startedAt: now, endedAt: now },
    });
    first = (await sendEncryptedEvent(first, status(first, 'work'), relay.fetcher)).state;
    second = (await sendEncryptedEvent(second, status(second, 'meeting'), relay.fetcher)).state;
    second = (await sendEncryptedEvent(second, skin(second.relationshipId, second.deviceId), relay.fetcher)).state;
    const aReceived = await syncEncryptedEvents(first, relay.fetcher);
    const bReceived = await syncEncryptedEvents(second, relay.fetcher);
    const aView = companionStates(aSelf, aReceived.received, aReceived.state);
    const bView = companionStates(bSelf, bReceived.received, bReceived.state);
    expect(aView.self).toEqual(aSelf);
    expect(aView.partner.activity).toBe('meeting');
    expect(aView.partner.skin).toBe('sky');
    expect(bView.self).toEqual(bSelf);
    expect(bView.partner.activity).toBe('work');
    expect(relay.bodies.filter(body => body.includes('"operation":"send"')).join('')).not.toContain('activity.segment');
    expect(relay.bodies.filter(body => body.includes('"operation":"send"')).join('')).not.toContain('profile.skin');
  });

  it('does not reassign an established partner from a relay device list', async () => {
    const relay = fakeRelay();
    const { first, second } = await pairThroughCode(relay);
    const forged = interaction(first.relationshipId, 'unexpectedDevice123', 'hug');
    const envelope = await encryptEvent(forged, first.deviceId, 1, await pairingKey(first), first.keyId);
    const fetched: typeof fetch = async () => json({ cursor: 1, devices: ['unexpectedDevice123', second.deviceId], messages: [{ relayId: 1, envelope }] });
    const result = await syncEncryptedEvents(first, fetched);
    expect(result.state.partnerDeviceId).toBe(second.deviceId);
    expect(result.received).toEqual([]);
    await expect(sendEncryptedEvent(first, interaction(first.relationshipId, second.deviceId, 'hug'), relay.fetcher))
      .rejects.toThrow('outgoing event identity mismatch');
  });
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
    expect(serializedHug).not.toContain('"action":"hug"');
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
    expect(JSON.stringify(sentWater.envelope)).not.toContain('"action":"water"');

    const receivedWater = await syncEncryptedEvents(first, relay.fetcher);
    first = receivedWater.state;
    expect(receivedWater.received).toHaveLength(1);
    expect(receivedWater.received[0].event).toEqual(water);
    expect(first.receivedSequences[second.deviceId]).toBe(1);

    const sharedStatistics = statistics(first.relationshipId, first.deviceId);
    const sentStatistics = await sendEncryptedEvent(first, sharedStatistics, relay.fetcher);
    first = sentStatistics.state;
    expect(JSON.stringify(sentStatistics.envelope)).not.toContain('"keyboard":');
    const receivedStatistics = await syncEncryptedEvents(second, relay.fetcher);
    second = receivedStatistics.state;
    expect(receivedStatistics.received[0].event).toEqual(sharedStatistics);

    const sharedSkin = skin(first.relationshipId, first.deviceId);
    const sentSkin = await sendEncryptedEvent(first, sharedSkin, relay.fetcher);
    first = sentSkin.state;
    // Random base64 ciphertext can legitimately contain the substring "sky".
    expect(JSON.stringify(sentSkin.envelope)).not.toContain('"skin":"sky"');
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
