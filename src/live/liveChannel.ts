// One live typing connection: a WebSocket to the Worker room of this
// relationship, carrying sealed pulses both ways. Keys travel separately over
// the ratchet (`live.key`), so the Worker only ever sees ciphertext.

import type { LiveTicket } from '../services/relayTransport';
import { LiveError, type LivePort, type PulseFrame } from './native';
import { Playout, WINDOW_MS, type Pulse } from './protocol';

export type LivePhase = 'off' | 'connecting' | 'waiting' | 'live' | 'paused' | 'unavailable';

export interface LiveChannelOptions {
  relationshipId: string;
  deviceId: string;
  partnerDeviceId: string;
  native: LivePort;
  /** Sends a fresh own key over the ratchet and returns its epoch. */
  sendKey(): Promise<number>;
  ticket(): Promise<LiveTicket>;
  /** Fetches ratchet deliveries now (a key or event the peer just sent). */
  syncNow(): void;
  onPulse(pulse: Pulse, playAt: number, epoch: number): void;
  onPhase(phase: LivePhase): void;
  socket?: (url: string, protocols: string[]) => WebSocket;
  now?: () => number;
}

const PROTOCOL = 'mewlink.v1';
const RENEW_BEFORE_MS = 60_000;
const PING_MS = 30_000;
const KEY_WAIT_MS = 4_000;
const NEED_THROTTLE_MS = 10_000;
const MAX_BACKOFF_MS = 60_000;
/** Closes that a reconnect cannot fix. */
const FINAL_REASONS = new Set(['revoked', 'room full']);

export function liveSocketUrl(base: string, relationshipId: string, deviceId: string) {
  const url = new URL('/live', base);
  url.protocol = url.protocol === 'http:' || url.protocol === 'ws:' ? 'ws:' : 'wss:';
  url.searchParams.set('relationshipId', relationshipId);
  url.searchParams.set('deviceId', deviceId);
  return url.toString();
}

export class LiveChannel {
  private socket: WebSocket | undefined;
  private stopped = true;
  private epoch: number | undefined;
  private keyBornAt = 0;
  private peerOnline = false;
  private peerEpoch: number | null = null;
  private playout = new Playout();
  private playoutEpoch: number | undefined;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private backoffMs = 1_000;
  private lastNeedAt = Number.NEGATIVE_INFINITY;
  private lastRotateAt = Number.NEGATIVE_INFINITY;
  private sealing = false;
  private keyCheck = false;
  private phase: LivePhase = 'off';
  private readonly now: () => number;

  constructor(private readonly options: LiveChannelOptions) {
    this.now = options.now ?? Date.now;
  }

  get state() { return this.phase; }
  /** Whether a pulse sent now can reach a listening peer. */
  get canSend() { return this.phase === 'live' && this.peerOnline && this.epoch !== undefined; }

  async start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.setPhase('connecting');
    await this.connect();
  }

  stop() {
    this.stopped = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.keyCheck = false;
    clearInterval(this.pingTimer);
    const socket = this.socket;
    this.socket = undefined;
    try { socket?.close(1000, 'bye'); } catch { /* already closed */ }
    this.peerOnline = false;
    this.setPhase('off');
  }

  /** The sender's window index: 250 ms steps since its current key was made. */
  windowAt(at = this.now()) {
    return Math.max(1, Math.floor((at - this.keyBornAt) / WINDOW_MS));
  }

  /** Seals and sends one pulse. Silently skipped while a password field has focus. */
  async send(pulse: Omit<Pulse, 'window'>, window = this.windowAt()) {
    if (!this.canSend || this.sealing) return false;
    this.sealing = true;
    try {
      const frame = await this.options.native.seal(this.options.relationshipId, this.options.deviceId, { ...pulse, window });
      this.socket?.send(frame);
      return true;
    } catch (error) {
      const code = error instanceof LiveError ? error.code : '';
      if (code === 'rekey_required' || code === 'no_live_key') void this.rotate();
      return false;
    } finally {
      this.sealing = false;
    }
  }

  private setPhase(phase: LivePhase) {
    if (this.phase === phase) return;
    this.phase = phase;
    this.options.onPhase(phase);
  }

  private later(ms: number, run: () => void) {
    const timer = setTimeout(() => { this.timers.delete(timer); if (!this.stopped) run(); }, ms);
    this.timers.add(timer);
  }

  private async connect() {
    let ticket: LiveTicket;
    try {
      if (this.epoch === undefined) {
        this.epoch = await this.options.sendKey();
        this.keyBornAt = this.now();
      }
      ticket = await this.options.ticket();
    } catch (error) {
      if (this.stopped) return;
      const unavailable = (error as { code?: string })?.code === 'live_unavailable';
      this.setPhase(unavailable ? 'unavailable' : 'connecting');
      return this.retry(unavailable ? 10 * 60_000 : undefined);
    }
    if (this.stopped) return;
    const url = liveSocketUrl(ticket.url, this.options.relationshipId, this.options.deviceId);
    let socket: WebSocket;
    try {
      socket = (this.options.socket ?? ((target, protocols) => new WebSocket(target, protocols)))(url, [PROTOCOL, `ticket.${ticket.ticket}`]);
    } catch {
      return this.retry();
    }
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      socket.send(JSON.stringify({ t: 'ready', e: this.epoch }));
      this.backoffMs = 1_000;
      this.setPhase('waiting');
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => { try { socket.send('{"t":"ping"}'); } catch { /* closing */ } }, PING_MS);
      this.scheduleRenewal(ticket.expiresAt);
    };
    socket.onmessage = event => { if (this.socket === socket) void this.receive(String(event.data)); };
    socket.onclose = event => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      clearInterval(this.pingTimer);
      this.peerOnline = false;
      if (this.stopped) return;
      if (FINAL_REASONS.has(event.reason)) { this.setPhase('unavailable'); return; }
      this.setPhase('connecting');
      this.retry();
    };
  }

  private retry(delay?: number) {
    const wait = delay ?? this.backoffMs * (0.75 + Math.random() * 0.5);
    this.backoffMs = Math.min(MAX_BACKOFF_MS, this.backoffMs * 2);
    this.later(wait, () => { void this.connect(); });
  }

  private scheduleRenewal(expiresAtSeconds: number) {
    const wait = Math.max(5_000, expiresAtSeconds * 1000 - this.now() - RENEW_BEFORE_MS);
    this.later(wait, () => {
      void this.options.ticket().then(next => {
        if (this.stopped || !this.socket) return;
        this.socket.send(JSON.stringify({ t: 'renew', ticket: next.ticket }));
        this.scheduleRenewal(next.expiresAt);
      }, () => this.later(10_000, () => this.scheduleRenewal(this.now() / 1000 + RENEW_BEFORE_MS / 1000)));
    });
  }

  /** A new own key: after 24 h, 100k pulses, or when the peer lost ours (it restarted). */
  private async rotate() {
    const now = this.now();
    if (now - this.lastRotateAt < NEED_THROTTLE_MS) return;
    this.lastRotateAt = now;
    try {
      this.epoch = await this.options.sendKey();
      this.keyBornAt = this.now();
      this.socket?.send(JSON.stringify({ t: 'rekey', e: this.epoch }));
    } catch { /* the next need or rekey_required retries */ }
  }

  /** Asks the peer for its key when ours is missing, e.g. after this app restarted. */
  private async requestKeyIfMissing(epoch: number | null) {
    if (epoch === null || this.keyCheck) return;
    this.keyCheck = true;
    const known = await this.options.native.status(this.options.relationshipId).catch(() => undefined);
    if (known?.peerEpoch === epoch) { this.keyCheck = false; return; }
    // The key may still be in the ratchet inbox; ask the peer only if it is not.
    this.options.syncNow();
    this.later(KEY_WAIT_MS, () => {
      void this.options.native.status(this.options.relationshipId).then(status => {
        const now = this.now();
        if (status.peerEpoch === epoch || !this.peerOnline || now - this.lastNeedAt < NEED_THROTTLE_MS) return;
        this.lastNeedAt = now;
        this.socket?.send(JSON.stringify({ t: 'rekey', need: true }));
      }, () => undefined).finally(() => { this.keyCheck = false; });
    });
  }

  private async receive(data: string) {
    let frame: { t?: unknown; online?: unknown; epoch?: unknown; e?: unknown; need?: unknown };
    try { frame = JSON.parse(data); } catch { return; }
    if (frame.t === 'peer') {
      this.peerOnline = frame.online === true;
      this.peerEpoch = typeof frame.epoch === 'number' ? frame.epoch : null;
      this.setPhase(this.peerOnline ? 'live' : 'waiting');
      if (this.peerOnline) void this.requestKeyIfMissing(this.peerEpoch);
      return;
    }
    if (frame.t === 'rekey') {
      if (frame.need === true) void this.rotate();
      if (typeof frame.e === 'number') {
        this.peerEpoch = frame.e;
        void this.requestKeyIfMissing(frame.e);
      }
      return;
    }
    if (frame.t !== 'pulse') return;
    const arrival = this.now();
    try {
      const pulseFrame = frame as PulseFrame;
      const pulse = await this.options.native.open(this.options.relationshipId, this.options.partnerDeviceId, pulseFrame);
      if (this.playoutEpoch !== pulseFrame.e) {
        // A new sender key restarts its window count.
        this.playout.reset();
        this.playoutEpoch = pulseFrame.e;
      }
      if (pulse.nudge) this.options.syncNow();
      const playAt = this.playout.accept(pulse.window, arrival);
      if (playAt !== undefined) this.options.onPulse(pulse, playAt, pulseFrame.e);
    } catch (error) {
      const code = error instanceof LiveError ? error.code : '';
      if (code === 'unknown_epoch' || code === 'no_peer_key') void this.requestKeyIfMissing(typeof frame.e === 'number' ? frame.e : this.peerEpoch);
    }
  }
}
