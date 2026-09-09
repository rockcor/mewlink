import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { drizzle } from '../website/node_modules/drizzle-orm/d1';
import { GET, POST } from '../website/app/api/relay/route';
import { createPairingJoinRequest, createPairingState, openPairingInvite, sealPairingInvite } from '../src/pairing/pairing';
import { claimPairingJoin, registerPairCreator, registerPairJoiner, requestPairingJoin, sendEncryptedEvent, syncEncryptedEvents } from '../src/services/relayTransport';

const context = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('../website/db', () => ({ getDb: () => context.db }));
let sqlite: DatabaseSync;
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
  // Execute production Drizzle queries against SQLite; only the D1 driver is replaced.
  context.db = drizzle({
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      return { bind(...params: never[]) {
        return {
          async run() { return statement.run(...params); },
          async all() { return { results: statement.all(...params) }; },
          async raw() { statement.setReturnArrays(true); return statement.all(...params); },
        };
      } };
    },
  } as never);
});
afterEach(() => { sqlite.close(); vi.restoreAllMocks(); });

describe('production relay invitation expiry (requires the website checkout)', () => {
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
