// End-to-end tests for mewlink-live against a local `wrangler dev`, plus the
// playout simulation. Run: node test/run.mjs (WRANGLER=<path to wrangler.js>).

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate, WINDOW_MS } from './playout.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
import { createServer } from 'node:net';
const PORT = await new Promise(done => { const server = createServer(); server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => done(port)); }); });
// LIVE_URL=https://mewlink-live.<subdomain>.workers.dev runs the suite against a
// deployed Worker, signing tickets with SIGNING_KEY_FILE (its public key must be
// the Worker's TICKET_PUBLIC_KEY). Otherwise a local wrangler dev is started.
const REMOTE = process.env.LIVE_URL ? new URL(process.env.LIVE_URL) : undefined;
const BASE = REMOTE ? REMOTE.host : `127.0.0.1:${PORT}`;
const WS = REMOTE ? 'wss' : 'ws', HTTP = REMOTE ? 'https' : 'http';
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(['pass', name]); }
  catch (error) { results.push(['FAIL', name, error.message]); }
};

// --- ticket signing (stands in for the relay's live_ticket endpoint) --------
const { publicKey, privateKey } = REMOTE
  ? (() => { const key = createPrivateKey(readFileSync(process.env.SIGNING_KEY_FILE)); return { privateKey: key, publicKey: createPublicKey(key) }; })()
  : generateKeyPairSync('ed25519');
const rawPublic = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
const b64 = bytes => Buffer.from(bytes).toString('base64url');
if (!REMOTE) writeFileSync(resolve(root, '.dev.vars'), `TICKET_PUBLIC_KEY=${b64(rawPublic)}\n`);
const signed = (payload, key = privateKey) => {
  const body = b64(Buffer.from(JSON.stringify(payload)));
  return `${body}.${b64(sign(null, Buffer.from(body), key))}`;
};
const ticket = (r, d, ttl = 300, key) => signed({ r, d, exp: Math.floor(Date.now() / 1000) + ttl }, key);
const id = () => b64(randomBytes(18));

// --- XChaCha20-Poly1305 pulses, as the app would send them ------------------
let sodium;
try {
  sodium = (await import(resolve(root, '../../../node_modules/libsodium-wrappers-sumo/dist/modules-sumo-esm/libsodium-wrappers.mjs'))).default;
  await sodium.ready;
} catch { sodium = undefined; }
const PLAINTEXT_BYTES = 32;
function sealPulse(key, { relationshipId, deviceId, epoch, seq, window, keyboard, pointer, clicks }) {
  const plain = new Uint8Array(PLAINTEXT_BYTES); // fixed size: counts never change the length
  const view = new DataView(plain.buffer);
  view.setUint8(0, 1); view.setUint32(1, window); view.setUint16(5, keyboard); view.setUint16(7, pointer); view.setUint16(9, clicks);
  const nonce = sodium.randombytes_buf(24);
  const ad = new TextEncoder().encode(`${relationshipId}|${deviceId}|${epoch}|${seq}`);
  const box = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plain, ad, null, nonce, key);
  return JSON.stringify({ t: 'pulse', e: epoch, s: seq, c: b64(Buffer.concat([nonce, box])) });
}

// --- websocket client ---------------------------------------------------------
function connect(relationshipId, deviceId, token, { epoch = 1, ready = true } = {}) {
  const protocols = token === undefined ? ['mewlink.v1'] : ['mewlink.v1', `ticket.${token}`];
  const ws = new WebSocket(`${WS}://${BASE}/live?relationshipId=${relationshipId}&deviceId=${deviceId}`, protocols);
  if (ready) ws.addEventListener('open', () => ws.send(JSON.stringify({ t: 'ready', e: epoch })));
  const client = { ws, messages: [], waiters: [] };
  client.closed = new Promise(done => ws.addEventListener('close', event => done({ code: event.code, reason: event.reason })));
  // Resolves 'open' or 'refused' (the upgrade was rejected before any socket existed).
  client.outcome = new Promise(done => { ws.addEventListener('open', () => done('open')); ws.addEventListener('error', event => { client.error = event.error?.cause?.message ?? event.error?.message ?? event.message; done('refused'); }); });
  client.open = client.outcome.then(value => { if (value !== 'open') throw new Error(`connection refused: ${client.error}`); });
  client.open.catch(() => undefined); // refusal is asserted through client.outcome
  ws.addEventListener('message', event => {
    const at = performance.now();
    client.messages.push({ data: event.data, at });
    client.waiters = client.waiters.filter(waiter => !waiter(event.data, at));
  });
  client.send = value => ws.send(typeof value === 'string' ? value : JSON.stringify(value));
  client.next = (match = () => true, timeout = 3000) => new Promise((done, fail) => {
    const seen = client.messages.find(m => match(m.data));
    if (seen) { client.messages.splice(client.messages.indexOf(seen), 1); return done(seen); }
    const timer = setTimeout(() => fail(new Error('timed out waiting for a message')), timeout);
    client.waiters.push((data, at) => {
      if (!match(data)) return false;
      clearTimeout(timer); done({ data, at }); return true;
    });
  });
  return client;
}
const closedWithin = (client, ms = 3000) => Promise.race([client.closed, new Promise((_, fail) => setTimeout(() => fail(new Error('socket stayed open')), ms))]);
async function pair() {
  const relationshipId = id(), a = id(), b = id();
  const A = connect(relationshipId, a, ticket(relationshipId, a));
  await A.open;
  await A.next(data => data.includes('"online":false'));
  const B = connect(relationshipId, b, ticket(relationshipId, b));
  await B.open;
  await Promise.all([A.next(data => data.includes('"online":true')), B.next(data => data.includes('"online":true'))]);
  return { relationshipId, a, b, A, B };
}
const refused = async client => assert.equal(await client.outcome, 'refused');

// --- start the worker -----------------------------------------------------------
let stopWorker = () => undefined;
if (!REMOTE) {
const wranglerPath = process.env.WRANGLER ?? resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const worker = spawn(process.execPath, [wranglerPath, 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--log-level', 'warn'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
// wrangler starts workerd outside its own process group, so walk the process
// tree and kill every descendant, even if this script crashes.
const descendants = pid => {
  const table = execFileSync('ps', ['-A', '-o', 'pid=,ppid=']).toString().trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
  const found = [];
  const walk = parent => { for (const [child, ppid] of table) if (ppid === parent) { found.push(child); walk(child); } };
  walk(pid);
  return found;
};
let stopped = false;
stopWorker = () => {
  if (stopped) return;
  stopped = true;
  for (const pid of [...descendants(worker.pid), worker.pid]) { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } }
};
process.on('exit', stopWorker);
process.on('uncaughtException', error => { console.error(error); stopWorker(); process.exit(1); });
let workerLog = '';
worker.stdout.on('data', chunk => { workerLog += chunk; });
worker.stderr.on('data', chunk => { workerLog += chunk; });
for (let attempt = 0; ; attempt++) {
  try { const response = await fetch(`http://${BASE}/`); if (response.status === 404) break; } catch { /* starting */ }
  if (attempt > 120) { console.error(workerLog); throw new Error('wrangler dev did not start'); }
  await new Promise(done => setTimeout(done, 500));
}

}

try {
  await check('connecting without a ticket is refused before any socket exists', async () => {
    await refused(connect(id(), id()));
  });
  await check('a ticket signed by another key is refused', async () => {
    const r = id(), d = id();
    await refused(connect(r, d, ticket(r, d, 300, generateKeyPairSync('ed25519').privateKey)));
  });
  await check('a ticket for another device or relationship is refused', async () => {
    const r = id(), d = id();
    await refused(connect(r, d, ticket(r, id())));
    await refused(connect(r, d, ticket(id(), d)));
  });
  await check('an expired or over-long ticket is refused', async () => {
    const r = id(), d = id();
    await refused(connect(r, d, ticket(r, d, -5)));
    await refused(connect(r, d, ticket(r, d, 3600)));
  });
  await check('a pulse before ready closes the socket', async () => {
    const r = id(), d = id(), C = connect(r, d, ticket(r, d), { ready: false }); await C.open;
    C.send({ t: 'pulse', e: 1, s: 1, c: 'x' });
    assert.equal((await closedWithin(C)).reason, 'ready_required');
  });
  await check('a socket closes when its ticket expires without renewal', async () => {
    const r = id(), d = id(), C = connect(r, d, ticket(r, d, 3)); await C.open;
    assert.equal((await closedWithin(C, 12000)).reason, 'ticket_expired');
  });
  await check('renewing the ticket keeps the socket open', async () => {
    // Expiry is in whole seconds, so a 5 s ticket lasts 4-5 s; renew well inside that.
    const r = id(), d = id(), C = connect(r, d, ticket(r, d, 5)); await C.open;
    await new Promise(done => setTimeout(done, 1000));
    C.send({ t: 'renew', ticket: ticket(r, d, 300) });
    const outcome = await Promise.race([C.closed.then(() => 'closed'), new Promise(done => setTimeout(() => done('open'), 7000))]);
    assert.equal(outcome, 'open');
    C.ws.close();
  });
  await check('a renewal with a bad ticket closes the socket', async () => {
    const r = id(), d = id(), C = connect(r, d, ticket(r, d, 300)); await C.open;
    C.send({ t: 'renew', ticket: ticket(r, id()) });
    assert.equal((await closedWithin(C)).reason, 'ticket_rejected');
  });
  await check('peers learn each other is online and pulses arrive byte-identical', async () => {
    const { A, B } = await pair();
    const frame = JSON.stringify({ t: 'pulse', e: 1, s: 7, c: 'abc' });
    const arrival = B.next(data => data.includes('"pulse"'));
    A.send(frame);
    assert.equal((await arrival).data, frame);
    A.ws.close(); B.ws.close();
  });
  await check('only pulse and rekey are forwarded', async () => {
    const { A, B } = await pair();
    A.send({ t: 'chat', text: 'hi' });
    A.send({ t: 'rekey', e: 2 });
    assert.match((await B.next(data => !data.includes('"peer"'))).data, /"rekey"/);
    A.ws.close(); B.ws.close();
  });
  await check('a third device is turned away', async () => {
    const { relationshipId, A, B } = await pair();
    const third = id();
    await refused(connect(relationshipId, third, ticket(relationshipId, third)));
    A.ws.close(); B.ws.close();
  });
  await check('frames over 512 bytes close the socket', async () => {
    const { A, B } = await pair();
    A.send({ t: 'pulse', c: 'x'.repeat(600) });
    assert.equal((await closedWithin(A)).reason, 'frame_too_large');
    B.ws.close();
  });
  await check('frames beyond 8/s (burst 16) are dropped', async () => {
    const { A, B } = await pair();
    for (let n = 0; n < 60; n++) A.send({ t: 'pulse', e: 1, s: n, c: 'x' });
    await new Promise(done => setTimeout(done, 800));
    const forwarded = B.messages.filter(m => m.data.includes('"pulse"')).length;
    // The ready frame already spent one of the 16 burst tokens.
    assert.ok(forwarded >= 15 && forwarded <= 23, `forwarded ${forwarded}`);
    A.ws.close(); B.ws.close();
  });
  await check('a signed revocation closes both sockets and refuses new connections', async () => {
    const { relationshipId, a, A, B } = await pair();
    const forged = await fetch(`${HTTP}://${BASE}/revoke`, { method: 'POST', body: signed({ r: relationshipId, revoked: true }, generateKeyPairSync('ed25519').privateKey) });
    assert.equal(forged.status, 403);
    const response = await fetch(`${HTTP}://${BASE}/revoke`, { method: 'POST', body: signed({ r: relationshipId, revoked: true }) });
    assert.equal(response.status, 204);
    assert.equal((await closedWithin(A)).reason, 'revoked');
    assert.equal((await closedWithin(B)).reason, 'revoked');
    await refused(connect(relationshipId, a, ticket(relationshipId, a)));
  });
  await check('disconnecting tells the peer it went offline', async () => {
    const { A, B } = await pair();
    const offline = B.next(data => data.includes('"online":false'));
    A.ws.close();
    await offline;
    B.ws.close();
  });
  let frameBytes;
  await check('an encrypted pulse is a fixed-size frame of about 130 bytes', async () => {
    assert.ok(sodium, 'libsodium-wrappers-sumo not found next to the app');
    const key = sodium.randombytes_buf(32);
    const sizes = new Set();
    for (const keyboard of [0, 3, 18, 999]) {
      sizes.add(sealPulse(key, { relationshipId: id(), deviceId: id(), epoch: 1, seq: 12345, window: 99, keyboard, pointer: 4, clicks: 1 }).length);
    }
    assert.equal(sizes.size, 1, `sizes ${[...sizes]}`);
    frameBytes = [...sizes][0];
  });
  let local;
  await check('local round trip through the Durable Object', async () => {
    const { relationshipId, a, A, B } = await pair();
    const key = sodium.randombytes_buf(32);
    const timings = [];
    for (let seq = 1; seq <= 60; seq++) {
      const frame = sealPulse(key, { relationshipId, deviceId: a, epoch: 1, seq, window: seq, keyboard: 3, pointer: 0, clicks: 0 });
      const started = performance.now();
      const arrival = B.next(data => data === frame);
      A.send(frame);
      timings.push((await arrival).at - started);
      await new Promise(done => setTimeout(done, WINDOW_MS / 2));
    }
    timings.sort((x, y) => x - y);
    local = { p50: timings[30].toFixed(1), p95: timings[57].toFixed(1) };
    A.ws.close(); B.ws.close();
  });

  console.log('\nWorker tests');
  for (const [status, name, detail] of results) console.log(`  ${status}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (frameBytes) console.log(`\nEncrypted pulse frame: ${frameBytes} bytes (JSON over WebSocket, fixed size)`);
  if (local) console.log(`${REMOTE ? `This machine -> ${REMOTE.host} -> this machine` : 'Local one-way forward through wrangler dev'}: p50 ${local.p50} ms, p95 ${local.p95} ms`);

  console.log('\nPlayout simulation (10 minutes of bursty typing each, keystroke to animation)');
  console.log('  network                         one-way          loss     on time   p50     p95');
  const profiles = [
    ['same city', { baseMs: 15, jitterMs: 20, loss: 0.002 }],
    ['cross-continent', { baseMs: 130, jitterMs: 60, loss: 0.01 }],
    ['busy Wi-Fi', { baseMs: 40, jitterMs: 180, loss: 0.03 }],
    ['poor mobile hotspot', { baseMs: 220, jitterMs: 300, loss: 0.05, burstLoss: 0.01 }],
  ];
  for (const [name, profile] of profiles) {
    const outcome = simulate(profile);
    console.log(`  ${name.padEnd(30)}  ${`${profile.baseMs} + 0-${profile.jitterMs} ms`.padEnd(15)}  ${`${(profile.loss * 100).toFixed(1)}%${profile.burstLoss ? '+burst' : ''}`.padEnd(7)}  ${`${(outcome.onTime * 100).toFixed(1)}%`.padEnd(8)}  ${`${outcome.p50} ms`.padEnd(6)}  ${outcome.p95} ms`);
  }
} finally {
  stopWorker();
}
process.exitCode = results.some(([status]) => status === 'FAIL') ? 1 : 0;
