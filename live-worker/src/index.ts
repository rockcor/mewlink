// mewlink-live: forwards encrypted live-typing pulses between the two devices
// of one relationship. It stores no content and cannot decrypt anything: the
// relay signs short-lived tickets, this Worker only holds the public key.
//
// A client connects with two WebSocket subprotocols, `mewlink.v1` and
// `ticket.<ticket>`, so the ticket is checked before the upgrade is accepted
// (and stays out of URLs and request logs). Unauthenticated sockets never exist.
// Its first frame must be `{"t":"ready","e":<key epoch>}`; nothing is forwarded
// to or from a socket before that. (Server-initiated closes from an alarm or a
// revocation were seen not to complete locally on sockets that had never sent
// a frame, so a silent socket is never left half-open waiting for one.)

import { DurableObject } from 'cloudflare:workers';

export interface Env {
  LIVE: DurableObjectNamespace<LiveRoom>;
  /** Base64url raw Ed25519 public key of the relay's ticket signer. */
  TICKET_PUBLIC_KEY: string;
}

const PROTOCOL = 'mewlink.v1';
const ID = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_FRAME_BYTES = 512;
const RATE_PER_SECOND = 8;
const RATE_BURST = 16;
const OVER_LIMIT_CLOSE_MS = 10_000;
const MAX_TICKET_LIFETIME_MS = 10 * 60_000;
const SWEEP_MS = 30_000;
const READY_TIMEOUT_MS = 5_000;
// The runtime clock only advances on I/O, so an alarm can observe a time just
// before the deadline it was set for.
const ALARM_GRACE_MS = 250;

interface Ticket { r: string; d: string; exp: number }
interface Attachment {
  relationshipId: string;
  deviceId: string;
  exp: number;
  ready: boolean;
  readyBy: number;
  epoch: number | null;
  tokens: number;
  refilledAt: number;
  overSince?: number;
}

/** A peer may be mid-close; a failed send or close must not abort the handler. */
function send(socket: WebSocket | undefined, data: string) {
  try { socket?.send(data); } catch { /* closing */ }
}
function close(socket: WebSocket, code: number, reason: string) {
  try { socket.close(code, reason); } catch { /* already closing */ }
}

const fromBase64Url = (value: string) => {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  return Uint8Array.from(atob(base64 + '='.repeat((4 - base64.length % 4) % 4)), c => c.charCodeAt(0));
};

let keyPromise: Promise<CryptoKey> | undefined;
function publicKey(env: Env) {
  keyPromise ??= crypto.subtle.importKey('raw', fromBase64Url(env.TICKET_PUBLIC_KEY), { name: 'Ed25519' }, false, ['verify']);
  return keyPromise;
}

/** `<base64url payload>.<base64url signature>`; payload = {r, d, exp} for tickets, {r, revoked} for revocations. */
async function verifySigned<T>(env: Env, token: unknown): Promise<T | undefined> {
  if (typeof token !== 'string' || token.length > 600) return undefined;
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) return undefined;
  try {
    const ok = await crypto.subtle.verify({ name: 'Ed25519' }, await publicKey(env), fromBase64Url(signature), new TextEncoder().encode(body));
    return ok ? JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as T : undefined;
  } catch {
    return undefined;
  }
}

async function validTicket(env: Env, token: unknown, relationshipId: string, deviceId: string, now: number) {
  const ticket = await verifySigned<Ticket>(env, token);
  return ticket && ticket.r === relationshipId && ticket.d === deviceId && Number.isSafeInteger(ticket.exp)
    && ticket.exp * 1000 > now && ticket.exp * 1000 <= now + MAX_TICKET_LIFETIME_MS ? ticket : undefined;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/live') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      const relationshipId = url.searchParams.get('relationshipId') ?? '';
      const deviceId = url.searchParams.get('deviceId') ?? '';
      if (!ID.test(relationshipId) || !ID.test(deviceId)) return new Response('bad request', { status: 400 });
      const protocols = (request.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map(value => value.trim());
      const token = protocols.find(value => value.startsWith('ticket.'))?.slice(7);
      const ticket = protocols.includes(PROTOCOL) ? await validTicket(env, token, relationshipId, deviceId, Date.now()) : undefined;
      if (!ticket) return new Response('ticket rejected', { status: 401 });
      const forwarded = new Request(request);
      forwarded.headers.set('X-Ticket-Expires', String(ticket.exp * 1000));
      return env.LIVE.get(env.LIVE.idFromName(relationshipId)).fetch(forwarded);
    }
    if (url.pathname === '/revoke' && request.method === 'POST') {
      // A revocation notice signed by the relay closes the room at once; ticket
      // expiry (5 minutes) is the fallback when a notice is lost.
      const notice = await verifySigned<{ r: string; revoked: true }>(env, await request.text());
      if (!notice || notice.revoked !== true || !ID.test(notice.r)) return new Response('forbidden', { status: 403 });
      await env.LIVE.get(env.LIVE.idFromName(notice.r)).revoke();
      return new Response(null, { status: 204 });
    }
    return new Response('not found', { status: 404 });
  },
};

export class LiveRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keepalive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }

  /** Reached only with a ticket the Worker has already verified. */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const relationshipId = url.searchParams.get('relationshipId')!;
    const deviceId = url.searchParams.get('deviceId')!;
    const exp = Number(request.headers.get('X-Ticket-Expires'));
    if (await this.ctx.storage.get('revoked')) return new Response('revoked', { status: 410 });
    // Two devices per room; a reconnecting device replaces its own old socket.
    const others = new Set(this.entries().map(entry => entry.deviceId).filter(id => id !== deviceId));
    if (others.size >= 2) return new Response('room full', { status: 409 });
    for (const old of this.ctx.getWebSockets(deviceId)) close(old, 1000, 'replaced');

    const pair = new WebSocketPair();
    const now = Date.now();
    const state: Attachment = { relationshipId, deviceId, exp, ready: false, readyBy: now + READY_TIMEOUT_MS, epoch: null,
      tokens: RATE_BURST, refilledAt: now };
    this.ctx.acceptWebSocket(pair[1], [deviceId]);
    pair[1].serializeAttachment(state);
    await this.schedule(Math.min(exp, state.readyBy));
    return new Response(null, { status: 101, webSocket: pair[0], headers: { 'Sec-WebSocket-Protocol': PROTOCOL } });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const state = ws.deserializeAttachment() as Attachment;
    if (typeof message !== 'string' || new TextEncoder().encode(message).byteLength > MAX_FRAME_BYTES) {
      return close(ws, 1009, 'frame_too_large');
    }
    const now = Date.now();
    if (state.exp <= now) return close(ws, 1008, 'ticket_expired');
    // Token bucket: drop frames beyond the rate; close a socket that stays over it.
    state.tokens = Math.min(RATE_BURST, state.tokens + (now - state.refilledAt) / 1000 * RATE_PER_SECOND);
    state.refilledAt = now;
    if (state.tokens < 1) {
      state.overSince ??= now;
      ws.serializeAttachment(state);
      if (now - state.overSince > OVER_LIMIT_CLOSE_MS) close(ws, 1008, 'rate_limited');
      return;
    }
    state.tokens -= 1;
    state.overSince = undefined;
    ws.serializeAttachment(state);

    let frame: { t?: unknown; ticket?: unknown; e?: unknown };
    try { frame = JSON.parse(message); } catch { return close(ws, 1003, 'invalid_frame'); }
    if (frame.t === 'ready') {
      if (state.ready || !Number.isSafeInteger(frame.e)) return close(ws, 1008, 'invalid_ready');
      state.ready = true;
      state.epoch = frame.e as number;
      ws.serializeAttachment(state);
      const peer = this.peerOf(state.deviceId);
      send(ws, JSON.stringify({ t: 'peer', online: Boolean(peer), epoch: peer?.epoch ?? null }));
      send(peer?.socket, JSON.stringify({ t: 'peer', online: true, epoch: state.epoch }));
      return;
    }
    if (!state.ready) return close(ws, 1008, 'ready_required');
    if (frame.t === 'renew') {
      const ticket = await validTicket(this.env, frame.ticket, state.relationshipId, state.deviceId, now);
      if (!ticket || await this.ctx.storage.get('revoked')) return close(ws, 1008, 'ticket_rejected');
      state.exp = ticket.exp * 1000;
      ws.serializeAttachment(state);
      await this.schedule(Math.min(state.exp, now + SWEEP_MS));
      return;
    }
    if (frame.t === 'pulse' || frame.t === 'rekey') {
      if (frame.t === 'rekey' && Number.isSafeInteger(frame.e)) {
        state.epoch = frame.e as number;
        ws.serializeAttachment(state);
      }
      // Forward the exact bytes; the content is end-to-end encrypted. Nothing is
      // buffered for an offline peer.
      send(this.peerOf(state.deviceId)?.socket, message);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    // Answer the close so the handshake completes on every compatibility date.
    close(ws, code === 1005 || code === 1006 ? 1000 : code, reason);
    const state = ws.deserializeAttachment() as Attachment;
    const stillHere = this.ctx.getWebSockets(state.deviceId).some(socket => socket !== ws);
    if (state.ready && !stillHere) send(this.peerOf(state.deviceId)?.socket, JSON.stringify({ t: 'peer', online: false, epoch: null }));
  }

  async webSocketError(ws: WebSocket) { await this.webSocketClose(ws, 1011, 'error'); }

  /** Closes sockets whose ticket expired without renewal, or that never sent ready. */
  async alarm() {
    const now = Date.now();
    let next = Infinity;
    for (const socket of this.ctx.getWebSockets()) {
      const state = socket.deserializeAttachment() as Attachment;
      if (state.exp <= now + ALARM_GRACE_MS) close(socket, 1008, 'ticket_expired');
      else if (!state.ready && state.readyBy <= now + ALARM_GRACE_MS) close(socket, 1008, 'ready_timeout');
      else next = Math.min(next, state.exp, state.ready ? Infinity : state.readyBy, now + SWEEP_MS);
    }
    if (Number.isFinite(next)) await this.ctx.storage.setAlarm(next);
  }

  async revoke() {
    await this.ctx.storage.put('revoked', true);
    for (const socket of this.ctx.getWebSockets()) close(socket, 1008, 'revoked');
  }

  private async schedule(at: number) {
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > at) await this.ctx.storage.setAlarm(at);
  }

  private entries() {
    return this.ctx.getWebSockets().map(socket => ({ socket, ...(socket.deserializeAttachment() as Attachment) }));
  }

  private peerOf(deviceId: string) {
    return this.entries().find(entry => entry.deviceId !== deviceId && entry.ready);
  }
}
