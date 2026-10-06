import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { GET, POST } from '../website/app/api/relay/route';
import { createPairingJoinRequest, createPairingState, openPairingInvite, sealPairingInvite } from '../src/pairing/pairing';
import { claimPairingJoin, registerPairCreator, registerPairJoiner, requestPairingJoin, revokeRelationship, sendEncryptedEvent, sendEncryptedBatch, syncEncryptedEvents } from '../src/services/relayTransport';
import { initializeRatchet, type RatchetPending } from '../src/crypto/ratchet';
import { encryptEvent } from '../src/crypto/events';
import { pairingKey } from '../src/pairing/pairing';
import { ratchetPeer } from './ratchetPeer';

const context = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('../website/db', () => ({ getRelayDb: () => context.db, liveTicketConfig: () => ({}) }));
let sqlite: DatabaseSync;
const peers: ReturnType<typeof ratchetPeer>[] = [];
function peer() { const value = ratchetPeer(); peers.push(value); return value.port; }
const start = 1_800_000_000_000;
const fetcher: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  return request.method === 'GET' ? GET(request) : POST(request);
};

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(start);
  sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('website/drizzle').filter(file => file.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(`website/drizzle/${file}`, 'utf8'));
  }
  // Execute production prepared SQL against real SQLite; only D1 is replaced.
  context.db = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      return { bind(...params: never[]) {
        return {
          async run() { return statement.run(...params); },
          async all() { return { results: statement.all(...params) }; },
          async first() { return statement.get(...params) ?? null; },
          async raw() { statement.setReturnArrays(true); return statement.all(...params); },
        };
      } };
    },
    async batch(statements: Array<{ run(): Promise<unknown> }>) {
      sqlite.exec('BEGIN');
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
});
afterEach(() => { for (const peer of peers.splice(0)) peer.stop(); sqlite.close(); vi.restoreAllMocks(); });

async function pairedRatchet() {
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
  expect(first.ratchet!.safetyNumber).toBe(second.ratchet!.safetyNumber);
  expect(first.relationshipKey).toBe(''); expect(second.relationshipKey).toBe('');
  await a('confirm', first.relationshipId, { safetyNumber: first.ratchet!.safetyNumber });
  await b('confirm', second.relationshipId, { safetyNumber: second.ratchet!.safetyNumber });
  first = (await syncEncryptedEvents(first, fetcher, a)).state;
  second = (await syncEncryptedEvents(second, fetcher, b)).state;
  return { first, second, a, b };
}

describe('real Rust ratchet through production relay SQL', () => {
  it('exchanges interactions, skin and activity after verification; restart keeps pending receipts', async () => {
    const { first, second, a, b } = await pairedRatchet();
    const event = hug(first);
    await sendEncryptedEvent(first, event, fetcher, a);
    const incoming = await syncEncryptedEvents(second, fetcher, b);
    expect(incoming.received[0].event).toEqual(event);
    await b('restart', second.relationshipId);
    const retry = await syncEncryptedEvents(incoming.state, fetcher, b);
    expect(retry.received[0].ratchetReceipt).toBe(incoming.received[0].ratchetReceipt);
    await b('ack_incoming', second.relationshipId, retry.received[0].ratchetReceipt);
    expect((await syncEncryptedEvents(retry.state, fetcher, b)).received).toEqual([]);
    for (const message of [hug(second), { ...hug(second), kind: 'profile.skin' as const, payload: { skin: 'mint' as const } },
      { ...hug(second), kind: 'activity.segment' as const, payload: { category: 'work' as const, startedAt: '2026-09-09T00:00:00Z', endedAt: '2026-09-09T00:05:00Z' } }]) {
      await sendEncryptedEvent(second, message, fetcher, b);
    }
    expect((await syncEncryptedEvents(first, fetcher, a)).received).toHaveLength(3);
    const rows = sqlite.prepare('SELECT envelope_json FROM mailbox_envelopes').all();
    for (const row of rows) {
      expect(row.envelope_json).not.toContain('"action"');
      expect(row.envelope_json).not.toContain('"skin"');
    }
  });

  it('lost POST response retries identical ciphertext without duplicate delivery; conflicting reuse fails', async () => {
    const { first, second, a, b } = await pairedRatchet();
    let lost = false;
    const lossy: typeof fetch = async (input, init) => {
      const response = await fetcher(input, init);
      if (!lost && JSON.parse(String(init?.body || '{}')).operation === 'send') { lost = true; throw new Error('network_lost_after_accept'); }
      return response;
    };
    await expect(sendEncryptedEvent(first, hug(first), lossy, a)).rejects.toThrow('network_lost_after_accept');
    const pending = await a<RatchetPending>('pending', first.relationshipId);
    expect(pending.outgoing).toHaveLength(1);
    await a('restart', first.relationshipId);
    await syncEncryptedEvents(first, fetcher, a);
    expect((await a<RatchetPending>('pending', first.relationshipId)).outgoing).toHaveLength(0);
    expect((await syncEncryptedEvents(second, fetcher, b)).received).toHaveLength(1);
    const envelope = pending.outgoing[0].envelope;
    const collision = await POST(new Request('https://relay.test/api/relay', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${first.relayToken}` },
      body: JSON.stringify({ operation: 'send', envelope: { ...envelope, ciphertext: `${envelope.ciphertext}A` } }) }));
    expect(collision.status).toBe(409);
    const downgrade = await POST(new Request('https://relay.test/api/relay', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${first.relayToken}` },
      body: JSON.stringify({ operation: 'send', envelope: { ...envelope, protocolVersion: 1 } }) }));
    expect(downgrade.status).toBe(400);
  });
});

describe('production relay invitation expiry (requires the website checkout)', () => {
  async function pair() {
    let creator = await registerPairCreator(await createPairingState(), fetcher);
    const request = await createPairingJoinRequest(creator.inviteCode!);
    await requestPairingJoin(request, fetcher);
    creator = (await syncEncryptedEvents(creator, fetcher)).state;
    const joiner = await openPairingInvite(request, (await claimPairingJoin(request, fetcher))!);
    await registerPairJoiner(joiner, fetcher);
    creator = (await syncEncryptedEvents(creator, fetcher)).state;
    return { creator, joiner };
  }
  it('stores encrypted input batches while the receiver is offline and deduplicates retries after a lost response', async () => {
    const { creator, joiner } = await pair();
    const event = { id: crypto.randomUUID(), version: 1 as const, relationshipId: creator.relationshipId,
      senderDeviceId: creator.deviceId, createdAt: new Date(start).toISOString(), kind: 'operation.batch' as const,
      payload: { format: 1 as const, startedAt: new Date(start).toISOString(), points: [[0, 2, 5, 1, 0, 0] as [number, number, number, number, number, number]] } };
    const encrypted = await encryptEvent(event, joiner.deviceId, 1, await pairingKey(creator), creator.keyId);
    await sendEncryptedBatch(creator, [encrypted], fetcher);
    await sendEncryptedBatch(creator, [encrypted], fetcher);
    expect(sqlite.prepare('SELECT count(*) AS total FROM mailbox_envelopes').get()?.total).toBe(1);
    const row = sqlite.prepare('SELECT envelope_json FROM mailbox_envelopes').get();
    expect(row?.envelope_json).not.toContain('points');
    expect(row?.envelope_json).not.toContain('startedAt');
    vi.mocked(Date.now).mockReturnValue(start + 3600_000);
    const received = await syncEncryptedEvents(joiner, fetcher);
    expect(received.received.map(item => item.event)).toEqual([event]);
    expect(received.partnerOnline).toBe(false);
    expect(received.caughtUp).toBe(true);
    expect((await syncEncryptedEvents(received.state, fetcher)).received).toEqual([]);
    await syncEncryptedEvents(creator, fetcher);
    expect((await syncEncryptedEvents(received.state, fetcher)).partnerOnline).toBe(true);
  });
  it('accepts full batches atomically, rejects mixed identities and paginates without skipping records', async () => {
    const { creator, joiner } = await pair();
    const key = await pairingKey(creator);
    const envelopes = [];
    for (let i = 1; i <= 105; i++) {
      envelopes.push(await encryptEvent({ id: crypto.randomUUID(), version: 1, relationshipId: creator.relationshipId,
        senderDeviceId: creator.deviceId, createdAt: new Date(start + i).toISOString(), kind: 'interaction', payload: { action: 'hug' } },
      joiner.deviceId, i, key, creator.keyId));
    }
    await expect(sendEncryptedBatch(creator, [envelopes[0], { ...envelopes[1], senderDeviceId: 'not-the-sender' }], fetcher)).rejects.toThrow();
    expect(sqlite.prepare('SELECT count(*) AS total FROM mailbox_envelopes').get()?.total).toBe(0);
    for (let i = 0; i < envelopes.length; i += 12) await sendEncryptedBatch(creator, envelopes.slice(i, i + 12), fetcher);
    const pageOne = await syncEncryptedEvents(joiner, fetcher);
    expect(pageOne.received).toHaveLength(100);
    expect(pageOne.caughtUp).toBe(false);
    const pageTwo = await syncEncryptedEvents(pageOne.state, fetcher);
    expect(pageTwo.received).toHaveLength(5);
    expect(pageTwo.caughtUp).toBe(true);
    expect(pageTwo.state.receivedSequences[creator.deviceId]).toBe(105);
  });
  it('rejects oversized bodies before parsing or storing a batch', async () => {
    const response = await POST(new Request('https://relay.test/api/relay', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'send_batch', extra: 'x'.repeat(400_000) }) }));
    expect(response.status).toBe(400);
    expect(sqlite.prepare('SELECT count(*) AS total FROM mailbox_envelopes').get()?.total).toBe(0);
  });
  it('clamps old clients to 15 minutes and retries cannot extend the deadline', async () => {
    const old = { ...await createPairingState(), inviteExpiresAt: start + 86_400_000 };
    const registered = await registerPairCreator(old, fetcher);
    expect(registered.inviteExpiresAt).toBe(start + 900_000);
    vi.mocked(Date.now).mockReturnValue(start + 30_000);
    expect((await registerPairCreator(old, fetcher)).inviteExpiresAt).toBe(start + 900_000);
    const synced = await syncEncryptedEvents(old, fetcher);
    expect(synced.state.inviteExpiresAt).toBe(start + 900_000);
  });

  it('rejects every pending handshake stage at the deadline', async () => {
    const creator = await registerPairCreator(await createPairingState(), fetcher);
    const request = await createPairingJoinRequest(creator.inviteCode!);
    await requestPairingJoin(request, fetcher);
    const sealed = await sealPairingInvite(creator, request.publicKey);
    const joiner = await openPairingInvite(request, sealed);
    vi.mocked(Date.now).mockReturnValue(start + 900_000);
    await expect(requestPairingJoin(request, fetcher)).rejects.toMatchObject({ status: 410 });
    await expect(claimPairingJoin(request, fetcher)).rejects.toMatchObject({ status: 410 });
    await expect(registerPairJoiner(joiner, fetcher)).rejects.toMatchObject({ status: 410 });
    const approval = await POST(new Request('https://relay.test/api/relay', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creator.relayToken}` },
      body: JSON.stringify({ operation: 'approve_join', relationshipId: creator.relationshipId, deviceId: request.deviceId, sealedInvite: sealed }),
    }));
    expect(approval.status).toBe(410);
    const url = new URL('https://relay.test/api/relay');
    url.searchParams.set('relationshipId', creator.relationshipId);
    url.searchParams.set('deviceId', creator.deviceId);
    const sync = await GET(new Request(url, { headers: { Authorization: `Bearer ${creator.relayToken}` } }));
    expect((await sync.json()).pairingRequest).toBeUndefined();
    const replacement = await registerPairCreator(await createPairingState(), fetcher);
    expect(replacement.relationshipId).not.toBe(creator.relationshipId);
    expect(replacement.inviteExpiresAt).toBe(start + 1_800_000);
    await requestPairingJoin(await createPairingJoinRequest(replacement.inviteCode!), fetcher);
  });

  it('pairs just before expiry, consumes the code, and keeps encrypted interaction working after expiry', async () => {
    let creator = await registerPairCreator(await createPairingState(), fetcher);
    const request = await createPairingJoinRequest(creator.inviteCode!);
    vi.mocked(Date.now).mockReturnValue(start + 899_000);
    await requestPairingJoin(request, fetcher);
    creator = (await syncEncryptedEvents(creator, fetcher)).state;
    const sealed = await claimPairingJoin(request, fetcher);
    expect(sealed).toBeTypeOf('string');
    const joiner = await openPairingInvite(request, sealed!);
    await registerPairJoiner(joiner, fetcher);
    creator = (await syncEncryptedEvents(creator, fetcher)).state;
    await expect(requestPairingJoin(request, fetcher)).rejects.toMatchObject({ status: 403 });
    vi.mocked(Date.now).mockReturnValue(start + 86_400_000);
    await registerPairJoiner(joiner, fetcher);
    const event = { id: crypto.randomUUID(), version: 1 as const, relationshipId: creator.relationshipId,
      senderDeviceId: creator.deviceId, createdAt: new Date(Date.now()).toISOString(), senderUtcOffsetMinutes: 0,
      kind: 'interaction' as const, payload: { action: 'hug' as const } };
    await sendEncryptedEvent(creator, event, fetcher);
    expect((await syncEncryptedEvents(joiner, fetcher)).received[0].event).toEqual(event);
  });

  it('caps existing day-long invites by their original creation time', async () => {
    const creator = await registerPairCreator(await createPairingState(), fetcher);
    sqlite.prepare('UPDATE relay_relationships SET invite_expires_at = ? WHERE id = ?')
      .run((start + 86_400_000) / 1000, creator.relationshipId);
    vi.mocked(Date.now).mockReturnValue(start + 900_000);
    await expect(requestPairingJoin(await createPairingJoinRequest(creator.inviteCode!), fetcher)).rejects.toMatchObject({ status: 410 });
  });
});

async function paired() {
  let first = await registerPairCreator(await createPairingState(), fetcher);
  const request = await createPairingJoinRequest(first.inviteCode!);
  await requestPairingJoin(request, fetcher);
  await syncEncryptedEvents(first, fetcher);
  const second = await openPairingInvite(request, (await claimPairingJoin(request, fetcher))!);
  await registerPairJoiner(second, fetcher);
  first = (await syncEncryptedEvents(first, fetcher)).state;
  return { first, second, request };
}
function hug(state: Awaited<ReturnType<typeof createPairingState>>) {
  return { id: crypto.randomUUID(), version: 1 as const, relationshipId: state.relationshipId,
    senderDeviceId: state.deviceId, createdAt: new Date().toISOString(),
    kind: 'interaction' as const, payload: { action: 'hug' as const } };
}

describe('production relay revocation', () => {
  it('either peer can revoke; deletes only its mailbox and rejects old sync/send/join/create', async () => {
    const { first, second, request } = await paired();
    const other = await paired();
    await sendEncryptedEvent(first, hug(first), fetcher);
    await sendEncryptedEvent(other.first, hug(other.first), fetcher);
    await revokeRelationship(second, fetcher);
    await revokeRelationship(second, fetcher); // lost response retry is safe
    for (const device of [first, second]) {
      await expect(syncEncryptedEvents(device, fetcher)).rejects.toMatchObject({ status: 410, code: 'relationship_revoked' });
      await expect(sendEncryptedEvent(device, hug(device), fetcher)).rejects.toMatchObject({ status: 410 });
      await expect(registerPairJoiner(device, fetcher)).rejects.toMatchObject({ status: 410 });
    }
    await expect(registerPairCreator(first, fetcher)).rejects.toMatchObject({ status: 410 });
    await expect(requestPairingJoin(request, fetcher)).rejects.toMatchObject({ status: 403 });
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM mailbox_envelopes WHERE relationship_id = ?').get(first.relationshipId)?.n).toBe(0);
    expect((await syncEncryptedEvents(other.second, fetcher)).received).toHaveLength(1);
  });

  it('wrong credentials cannot revoke another relationship', async () => {
    const { first, second } = await paired();
    const unrelated = await createPairingState();
    await expect(revokeRelationship({ ...first, relayToken: unrelated.relayToken }, fetcher)).rejects.toMatchObject({ status: 403 });
    await sendEncryptedEvent(first, hug(first), fetcher);
    expect((await syncEncryptedEvents(second, fetcher)).received).toHaveLength(1);
  });

  it('cancels an invite including its pending handshake and sealed secret', async () => {
    const creator = await registerPairCreator(await createPairingState(), fetcher);
    const request = await createPairingJoinRequest(creator.inviteCode!);
    await requestPairingJoin(request, fetcher);
    await syncEncryptedEvents(creator, fetcher);
    expect(await claimPairingJoin(request, fetcher)).toBeTypeOf('string');
    await revokeRelationship(creator, fetcher);
    await expect(claimPairingJoin(request, fetcher)).rejects.toMatchObject({ status: 403 });
    const row = sqlite.prepare('SELECT pairing_code_hash, pairing_sealed_invite FROM relay_relationships WHERE id = ?').get(creator.relationshipId);
    expect(row?.pairing_code_hash).toBeNull();
    expect(row?.pairing_sealed_invite).toBeNull();
  });

  it('cancels before a delayed create arrives, with no resurrection', async () => {
    const state = await createPairingState();
    await revokeRelationship(state, fetcher);
    await expect(registerPairCreator(state, fetcher)).rejects.toMatchObject({ status: 410 });
  });

  it('a fresh pair uses new credentials; old devices cannot read its ciphertext', async () => {
    const old = await paired();
    await revokeRelationship(old.first, fetcher);
    const next = await paired();
    expect(next.first.relationshipId).not.toBe(old.first.relationshipId);
    expect(next.first.relationshipKey).not.toBe(old.first.relationshipKey);
    expect(next.first.relayToken).not.toBe(old.first.relayToken);
    await sendEncryptedEvent(next.first, hug(next.first), fetcher);
    await expect(syncEncryptedEvents({ ...next.second, relayToken: old.second.relayToken }, fetcher)).rejects.toMatchObject({ status: 403 });
    expect((await syncEncryptedEvents({ ...next.second, relationshipKey: old.second.relationshipKey }, fetcher)).received).toHaveLength(0);
    expect((await syncEncryptedEvents(next.second, fetcher)).received).toHaveLength(1);
  });

  it('a competing requester cannot replace the public key or reset a sealed invite', async () => {
    const creator = await registerPairCreator(await createPairingState(), fetcher);
    const first = await createPairingJoinRequest(creator.inviteCode!);
    const other = await createPairingJoinRequest(creator.inviteCode!);
    await requestPairingJoin(first, fetcher);
    await syncEncryptedEvents(creator, fetcher);
    const sealed = await claimPairingJoin(first, fetcher);
    await expect(requestPairingJoin(other, fetcher)).rejects.toMatchObject({ status: 409 });
    await expect(requestPairingJoin({ ...first, publicKey: other.publicKey }, fetcher)).rejects.toMatchObject({ status: 409 });
    await requestPairingJoin(first, fetcher);
    expect(await claimPairingJoin(first, fetcher)).toBe(sealed);
  });

  it('revocation racing a send leaves no deliverable envelope', async () => {
    const { first, second } = await paired();
    await Promise.allSettled([sendEncryptedEvent(first, hug(first), fetcher), revokeRelationship(second, fetcher)]);
    await expect(syncEncryptedEvents(second, fetcher)).rejects.toMatchObject({ status: 410 });
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM mailbox_envelopes WHERE relationship_id = ?').get(first.relationshipId)?.n).toBe(0);
  });
});
