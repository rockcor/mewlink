// Production smoke check (not part of CI): pairs two throwaway ratchet peers
// through the deployed relay, gets real tickets, talks through the deployed
// mewlink-live Worker, then unpairs. Run: vitest run --config tests/live-production.config.ts

import { afterAll, describe, expect, it } from 'vitest';
import { createPairingJoinRequest, createPairingState, openPairingInvite, type PairingState } from '../src/pairing/pairing';
import { claimPairingJoin, registerPairCreator, registerPairJoiner, requestLiveTicket, requestPairingJoin, revokeRelationship, sendEncryptedEvent, syncEncryptedEvents } from '../src/services/relayTransport';
import { initializeRatchet, RatchetError, type RatchetPort } from '../src/crypto/ratchet';
import { LiveChannel, type LivePhase } from '../src/live/liveChannel';
import { LiveError, type LivePort } from '../src/live/native';
import type { Pulse } from '../src/live/protocol';
import type { PlainEvent } from '../src/domain/types';
import { ratchetPeer } from './ratchetPeer';

const fetcher: typeof fetch = (input, init) => fetch(input, init);
const peers: ReturnType<typeof ratchetPeer>[] = [];
const channels: LiveChannel[] = [];
const wait = (ms: number) => new Promise(done => setTimeout(done, ms));
async function until(check: () => boolean | Promise<boolean>, ms = 15_000) {
  const deadline = Date.now() + ms;
  while (!await check()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await wait(50);
  }
}
afterAll(() => { for (const channel of channels) channel.stop(); for (const peer of peers) peer.stop(); });
function peer() { const value = ratchetPeer(); peers.push(value); return value.port; }

async function paired() {
  const a = peer(); const b = peer();
  let first = await registerPairCreator(await initializeRatchet(await createPairingState(), a), fetcher);
  const request = await createPairingJoinRequest(first.inviteCode!);
  await requestPairingJoin(request, fetcher);
  await syncEncryptedEvents(first, fetcher, a);
  let second = await initializeRatchet(await openPairingInvite(request, (await claimPairingJoin(request, fetcher))!), b);
  await registerPairJoiner(second, fetcher);
  second = (await syncEncryptedEvents(second, fetcher, b)).state;
  first = (await syncEncryptedEvents(first, fetcher, a)).state;
  second = (await syncEncryptedEvents(second, fetcher, b)).state;
  await a('confirm', first.relationshipId, { safetyNumber: first.ratchet!.safetyNumber });
  await b('confirm', second.relationshipId, { safetyNumber: second.ratchet!.safetyNumber });
  first = (await syncEncryptedEvents(first, fetcher, a)).state;
  second = (await syncEncryptedEvents(second, fetcher, b)).state;
  return [side(first, a), side(second, b)] as const;
}

/** One app: its pairing state, a serialized sync like the App's, and a live channel. */
function side(initial: PairingState, port: RatchetPort) {
  let state = initial;
  let queue = Promise.resolve();
  const received: PlainEvent[] = [];
  const pulses: Array<{ pulse: Pulse; playAt: number }> = [];
  const phases: LivePhase[] = [];
  let syncs = 0;
  const sync = () => (queue = queue.then(async () => {
    syncs++;
    const result = await syncEncryptedEvents(state, fetcher, port);
    state = result.state;
    for (const stored of result.received) {
      received.push(stored.event);
      if (stored.ratchetReceipt) await port('ack_incoming', state.relationshipId, stored.ratchetReceipt);
    }
  }));
  const wrap = <T>(operation: string, input: unknown) => port<T>(operation, state.relationshipId, input)
    .catch(error => { throw error instanceof RatchetError ? new LiveError(error.code) : error; });
  const native: LivePort = {
    status: () => wrap('live_status', null),
    seal: (_relationshipId, deviceId, pulse) => wrap('live_seal', { deviceId, pulse }),
    open: (_relationshipId, senderDeviceId, frame) => wrap('live_open', { senderDeviceId, frame }),
  };
  const channel = new LiveChannel({
    relationshipId: state.relationshipId, deviceId: state.deviceId, partnerDeviceId: state.partnerDeviceId!, native,
    sendKey: async () => { const { epoch } = await port<{ epoch: number }>('send_live_key', state.relationshipId); await sync(); return epoch; },
    ticket: () => requestLiveTicket(state, fetcher),
    syncNow: () => { void sync(); },
    onPulse: (pulse, playAt) => pulses.push({ pulse, playAt }),
    onPhase: phase => phases.push(phase),
  });
  channels.push(channel);
  return { get state() { return state; }, port, channel, received, pulses, phases, sync, get syncs() { return syncs; } };
}

const typing = { keyboard: 3, pointer: 5, clicks: 1, activity: 0, visual: 1, nudge: false };

describe('production live typing', () => {
  it('pairs, exchanges pulses through the deployed Worker, and unpairing closes the room', async () => {
    const [alice, bob] = await paired();
    const ticket = await requestLiveTicket(alice.state, fetcher);
    console.log('ticket url', ticket.url, 'expires in', ticket.expiresAt - Math.floor(Date.now() / 1000), 's');
    await alice.channel.start();
    await bob.channel.start();
    await until(() => alice.channel.state === 'live' && bob.channel.state === 'live');
    await until(async () => (await alice.port<{ peerEpoch: number | null }>('live_status', alice.state.relationshipId)).peerEpoch !== null
      && (await bob.port<{ peerEpoch: number | null }>('live_status', bob.state.relationshipId)).peerEpoch !== null);
    const sentAt = Date.now();
    expect(await alice.channel.send(typing)).toBe(true);
    await until(() => bob.pulses.length === 1);
    console.log('pulse alice -> bob plays', Math.round(bob.pulses[0].playAt - sentAt), 'ms after sending');
    expect(bob.pulses[0].pulse).toMatchObject({ keyboard: 3, pointer: 5, clicks: 1 });
    expect(await bob.channel.send({ ...typing, keyboard: 7 })).toBe(true);
    await until(() => alice.pulses.length === 1);
    expect(alice.pulses[0].pulse.keyboard).toBe(7);

    const hug: PlainEvent = { id: crypto.randomUUID(), version: 1, relationshipId: alice.state.relationshipId,
      senderDeviceId: alice.state.deviceId, createdAt: new Date().toISOString(), kind: 'interaction', payload: { action: 'hug' } };
    await sendEncryptedEvent(alice.state, hug, fetcher, alice.port);
    const nudgedAt = Date.now();
    expect(await alice.channel.send({ ...typing, keyboard: 0, pointer: 0, clicks: 0, nudge: true })).toBe(true);
    await until(() => bob.received.some(event => event.id === hug.id), 5_000);
    console.log('hug arrived', Date.now() - nudgedAt, 'ms after the nudge');

    await revokeRelationship(alice.state, fetcher);
    await until(() => bob.channel.state === 'unavailable');
    await expect(requestLiveTicket(bob.state, fetcher)).rejects.toThrow();
  }, 90_000);
});
