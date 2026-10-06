// Live typing end to end: two real Rust ratchet peers pair through the
// production relay route (on in-memory SQLite), exchange live keys over the
// ratchet, get signed tickets from the relay and talk through a local
// `wrangler dev` of mewlink-live. Nothing here mocks cryptography.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { GET, POST } from '../website/app/api/relay/route';
import { createPairingJoinRequest, createPairingState, openPairingInvite, type PairingState } from '../src/pairing/pairing';
import { claimPairingJoin, registerPairCreator, registerPairJoiner, requestLiveTicket, requestPairingJoin, revokeRelationship, sendEncryptedEvent, syncEncryptedEvents } from '../src/services/relayTransport';
import { initializeRatchet, RatchetError, type RatchetPort } from '../src/crypto/ratchet';
import { LiveChannel, type LivePhase } from '../src/live/liveChannel';
import { LiveError, type LivePort } from '../src/live/native';
import type { Pulse } from '../src/live/protocol';
import type { PlainEvent } from '../src/domain/types';
import { ratchetPeer } from './ratchetPeer';

const context = vi.hoisted(() => ({ db: undefined as unknown, live: {} as { privateKey?: string; workerUrl?: string } }));
vi.mock('../website/db', () => ({ getRelayDb: () => context.db, liveTicketConfig: () => context.live }));

const workerRoot = resolve('live-worker');
const wrangler = process.env.WRANGLER ?? resolve('website/node_modules/wrangler/bin/wrangler.js');
let worker: ChildProcess | undefined;
let sqlite: DatabaseSync;
const peers: ReturnType<typeof ratchetPeer>[] = [];
const channels: LiveChannel[] = [];
const fetcher: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  return request.method === 'GET' ? GET(request) : POST(request);
};
const wait = (ms: number) => new Promise(done => setTimeout(done, ms));
async function until(check: () => boolean | Promise<boolean>, ms = 8_000) {
  const deadline = Date.now() + ms;
  while (!await check()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await wait(25);
  }
}

function killTree(pid: number) {
  const table = execFileSync('ps', ['-A', '-o', 'pid=,ppid=']).toString().trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
  const found: number[] = [];
  const walk = (parent: number) => { for (const [child, ppid] of table) if (ppid === parent) { found.push(child); walk(child); } };
  walk(pid);
  for (const target of [...found, pid]) { try { process.kill(target, 'SIGKILL'); } catch { /* gone */ } }
}

beforeAll(async () => {
  const port = await new Promise<number>(done => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => { const address = server.address() as { port: number }; server.close(() => done(address.port)); });
  });
  // A throwaway signer: the relay holds the private half, the Worker the public one.
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  writeFileSync(resolve(workerRoot, '.dev.vars'), `TICKET_PUBLIC_KEY=${publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url')}\n`);
  context.live = { privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url'), workerUrl: `http://127.0.0.1:${port}` };
  worker = spawn(process.execPath, [wrangler, 'dev', '--port', String(port), '--ip', '127.0.0.1', '--log-level', 'warn'], { cwd: workerRoot, stdio: 'ignore', detached: true });
  await until(async () => {
    try { return (await fetch(`http://127.0.0.1:${port}/`)).status === 404; } catch { return false; }
  }, 60_000);
}, 70_000);
afterAll(() => {
  for (const channel of channels) channel.stop();
  for (const peer of peers) peer.stop();
  if (worker?.pid) killTree(worker.pid);
});

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('website/drizzle').filter(file => file.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(`website/drizzle/${file}`, 'utf8'));
  }
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

describe('live typing through the relay, the ratchet and mewlink-live', () => {
  it('delivers sealed pulses both ways once both sides turn it on', async () => {
    const [alice, bob] = await paired();
    await alice.channel.start();
    await until(() => alice.channel.state === 'waiting');
    await bob.channel.start();
    await until(() => alice.channel.state === 'live' && bob.channel.state === 'live');
    // Keys came over the ratchet: wait until each side can open the other's pulses.
    await until(async () => (await alice.port<{ peerEpoch: number | null }>('live_status', alice.state.relationshipId)).peerEpoch !== null
      && (await bob.port<{ peerEpoch: number | null }>('live_status', bob.state.relationshipId)).peerEpoch !== null);

    const sentAt = Date.now();
    expect(await alice.channel.send(typing)).toBe(true);
    await until(() => bob.pulses.length === 1);
    expect(bob.pulses[0].pulse).toMatchObject({ keyboard: 3, pointer: 5, clicks: 1, activity: 0, visual: 1, nudge: false });
    expect(bob.pulses[0].playAt - sentAt).toBeGreaterThanOrEqual(250);
    expect(await bob.channel.send({ ...typing, keyboard: 7 })).toBe(true);
    await until(() => alice.pulses.length === 1);
    expect(alice.pulses[0].pulse.keyboard).toBe(7);

    // The relay stored only ratchet ciphertext: no live key, no counts.
    for (const row of sqlite.prepare('SELECT envelope_json FROM mailbox_envelopes').all()) {
      expect(String(row.envelope_json)).not.toContain('live.key');
      expect(String(row.envelope_json)).not.toContain('"epoch"');
    }
    alice.channel.stop();
    bob.channel.stop();
  }, 30_000);

  it('a nudge makes the partner fetch a hug at once', async () => {
    const [alice, bob] = await paired();
    await alice.channel.start();
    await bob.channel.start();
    await until(() => alice.channel.state === 'live' && bob.channel.state === 'live');
    await until(async () => (await bob.port<{ peerEpoch: number | null }>('live_status', bob.state.relationshipId)).peerEpoch !== null);
    await bob.sync();
    const hug: PlainEvent = { id: crypto.randomUUID(), version: 1, relationshipId: alice.state.relationshipId,
      senderDeviceId: alice.state.deviceId, createdAt: new Date().toISOString(), kind: 'interaction', payload: { action: 'hug' } };
    await sendEncryptedEvent(alice.state, hug, fetcher, alice.port);
    const before = bob.syncs;
    expect(await alice.channel.send({ ...typing, keyboard: 0, pointer: 0, clicks: 0, nudge: true })).toBe(true);
    await until(() => bob.received.some(event => event.id === hug.id), 3_000);
    expect(bob.syncs).toBeGreaterThan(before);
    alice.channel.stop();
    bob.channel.stop();
  }, 30_000);

  it('unpairing closes the live room for the partner at once', async () => {
    const [alice, bob] = await paired();
    await alice.channel.start();
    await bob.channel.start();
    await until(() => alice.channel.state === 'live' && bob.channel.state === 'live');
    await revokeRelationship(alice.state, fetcher);
    await until(() => bob.channel.state === 'unavailable');
    await expect(requestLiveTicket(bob.state, fetcher)).rejects.toThrow();
    alice.channel.stop();
    bob.channel.stop();
  }, 30_000);
});
