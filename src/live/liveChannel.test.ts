import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveChannel, liveSocketUrl, type LivePhase } from './liveChannel';
import { LiveError, type LivePort, type PulseFrame } from './native';
import type { Pulse } from './protocol';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
afterEach(() => { vi.useRealTimers(); });

const REL = 'relationship-0000001';

/** Stands in for the Worker room: two ready sockets, frames forwarded verbatim. */
class Room {
  sockets: FakeSocket[] = [];
  open(socket: FakeSocket) { this.sockets.push(socket); queueMicrotask(() => socket.onopen?.()); }
  ready(socket: FakeSocket) { return socket.readyEpoch !== undefined && this.sockets.includes(socket); }
  peerOf(socket: FakeSocket) { return this.sockets.find(other => other !== socket && this.ready(other)); }
  handle(socket: FakeSocket, data: string) {
    const frame = JSON.parse(data);
    if (frame.t === 'ping') return;
    if (frame.t === 'ready') {
      socket.readyEpoch = frame.e;
      const peer = this.peerOf(socket);
      socket.deliver({ t: 'peer', online: Boolean(peer), epoch: peer?.readyEpoch ?? null });
      peer?.deliver({ t: 'peer', online: true, epoch: frame.e });
      return;
    }
    if (frame.t === 'rekey' && typeof frame.e === 'number') socket.readyEpoch = frame.e;
    if (frame.t === 'pulse' || frame.t === 'rekey') this.peerOf(socket)?.deliver(frame);
  }
  drop(socket: FakeSocket) {
    this.sockets = this.sockets.filter(other => other !== socket);
    this.peerOf(socket)?.deliver({ t: 'peer', online: false, epoch: null });
  }
}

class FakeSocket {
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: (event: { code: number; reason: string }) => void;
  readyEpoch?: number;
  sent: string[] = [];
  constructor(private readonly room: Room, readonly url: string, readonly protocols: string[]) { room.open(this); }
  send(data: string) { this.sent.push(data); queueMicrotask(() => this.room.handle(this, data)); }
  deliver(frame: unknown) { queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(frame) })); }
  close() { this.room.drop(this); }
  serverClose(reason: string) { this.room.drop(this); this.onclose?.({ code: 1008, reason }); }
}

/** Each device's native state; keys reach the peer only when it syncs (as over the ratchet). */
class Device {
  ownEpoch: number | null = null;
  sequence = 0;
  inbox: number[] = [];
  peerEpochs: number[] = [];
  peer?: Device;
  syncs = 0;
  nextEpoch = 1_000;
  port: LivePort = {
    status: async () => ({ ownEpoch: this.ownEpoch, peerEpoch: this.peerEpochs.at(-1) ?? null, peerEnabled: this.peerEpochs.length > 0 }),
    seal: async (_relationshipId, _deviceId, pulse) => {
      if (this.ownEpoch === null) throw new LiveError('no_live_key');
      return JSON.stringify({ t: 'pulse', e: this.ownEpoch, s: ++this.sequence, c: btoa(JSON.stringify(pulse)) });
    },
    open: async (_relationshipId, _sender, frame: PulseFrame) => {
      if (!this.peerEpochs.includes(frame.e)) throw new LiveError('unknown_epoch');
      return JSON.parse(atob(frame.c)) as Pulse;
    },
  };
  sendKey = async () => {
    this.ownEpoch = this.nextEpoch++;
    this.sequence = 0;
    this.peer!.inbox.push(this.ownEpoch);
    return this.ownEpoch;
  };
  syncNow = () => {
    this.syncs++;
    this.peerEpochs.push(...this.inbox.splice(0));
  };
  restart() { this.ownEpoch = null; this.peerEpochs = []; this.inbox = []; }
}

function pair() {
  const room = new Room();
  const a = new Device();
  const b = new Device();
  a.peer = b; b.peer = a;
  b.nextEpoch = 5_000;
  const sockets: FakeSocket[] = [];
  const make = (device: Device, deviceId: string, partnerDeviceId: string) => {
    const pulses: Array<{ pulse: Pulse; playAt: number }> = [];
    const phases: LivePhase[] = [];
    const tickets = vi.fn(async () => ({ ticket: `ticket-${deviceId}`, expiresAt: Math.floor(Date.now() / 1000) + 300, url: 'https://live.example' }));
    const channel = new LiveChannel({
      relationshipId: REL, deviceId, partnerDeviceId, native: device.port,
      sendKey: device.sendKey, ticket: tickets, syncNow: device.syncNow,
      onPulse: (pulse, playAt) => pulses.push({ pulse, playAt }),
      onPhase: phase => phases.push(phase),
      socket: (url, protocols) => { const socket = new FakeSocket(room, url, protocols); sockets.push(socket); return socket as unknown as WebSocket; },
    });
    return { channel, pulses, phases, tickets };
  };
  return { room, a, b, sockets, alice: make(a, 'device-alice-000001', 'device-bob-00000001'), bob: make(b, 'device-bob-00000001', 'device-alice-000001') };
}

const pulse = { keyboard: 3, pointer: 0, clicks: 0, activity: 0, visual: 0, nudge: false };

describe('live channel', () => {
  it('builds the socket URL with the ticket only in the subprotocol', () => {
    expect(liveSocketUrl('https://live.example', REL, 'device-alice-000001'))
      .toBe(`wss://live.example/live?relationshipId=${REL}&deviceId=device-alice-000001`);
    expect(liveSocketUrl('http://127.0.0.1:8799', REL, 'd'.repeat(16))).toMatch(/^ws:\/\/127\.0\.0\.1:8799\/live\?/);
  });

  it('connects both sides, exchanges keys and plays pulses after a jitter buffer', async () => {
    vi.useFakeTimers();
    const { a, b, alice, bob, sockets } = pair();
    await alice.channel.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(alice.channel.state).toBe('waiting');
    expect(sockets[0].protocols).toEqual(['mewlink.v1', 'ticket.ticket-device-alice-000001']);
    expect(sockets[0].url).not.toContain('ticket');

    await bob.channel.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(alice.channel.state).toBe('live');
    expect(bob.channel.state).toBe('live');
    // Each side saw an epoch it had no key for and synced the ratchet to fetch it.
    expect(a.peerEpochs).toEqual([5_000]);
    expect(b.peerEpochs).toEqual([1_000]);

    await vi.advanceTimersByTimeAsync(1_000);
    const sentAt = Date.now();
    expect(await alice.channel.send(pulse)).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(bob.pulses).toHaveLength(1);
    expect(bob.pulses[0].pulse.keyboard).toBe(3);
    expect(bob.pulses[0].playAt - sentAt).toBeGreaterThanOrEqual(400);
    alice.channel.stop();
    bob.channel.stop();
  });

  it('fetches ratchet events at once when a pulse carries a nudge', async () => {
    vi.useFakeTimers();
    const { b, alice, bob } = pair();
    await alice.channel.start();
    await bob.channel.start();
    await vi.advanceTimersByTimeAsync(1_000);
    const before = b.syncs;
    await alice.channel.send({ ...pulse, keyboard: 0, nudge: true });
    await vi.advanceTimersByTimeAsync(10);
    expect(b.syncs).toBe(before + 1);
    alice.channel.stop();
    bob.channel.stop();
  });

  it('recovers when one side restarts and lost the partner key', async () => {
    vi.useFakeTimers();
    const { a, alice, bob, room } = pair();
    await alice.channel.start();
    await bob.channel.start();
    await vi.advanceTimersByTimeAsync(1_000);
    // Alice's app restarts: native memory is empty and Bob's old key is gone for good.
    alice.channel.stop();
    a.restart();
    expect(room.sockets).toHaveLength(1);
    await alice.channel.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(a.peerEpochs).toEqual([]);
    // After the key wait, Alice asks Bob for a new key; Bob rotates and announces it.
    await vi.advanceTimersByTimeAsync(4_100);
    expect(a.peerEpochs).toEqual([5_001]);
    expect(await bob.channel.send(pulse)).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(alice.pulses).toHaveLength(1);
    alice.channel.stop();
    bob.channel.stop();
  });

  it('reconnects with backoff, but not after the relationship was revoked', async () => {
    vi.useFakeTimers();
    const { alice, sockets } = pair();
    await alice.channel.start();
    await vi.advanceTimersByTimeAsync(10);
    sockets[0].serverClose('ticket_expired');
    expect(alice.channel.state).toBe('connecting');
    await vi.advanceTimersByTimeAsync(1_300);
    expect(sockets).toHaveLength(2);
    expect(alice.channel.state).toBe('waiting');
    sockets[1].serverClose('revoked');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sockets).toHaveLength(2);
    expect(alice.channel.state).toBe('unavailable');
    alice.channel.stop();
  });

  it('renews the ticket over the open socket a minute before it expires', async () => {
    vi.useFakeTimers();
    const { alice, sockets } = pair();
    await alice.channel.start();
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(241_000);
    expect(alice.tickets).toHaveBeenCalledTimes(2);
    expect(sockets[0].sent.some(frame => JSON.parse(frame).t === 'renew')).toBe(true);
    alice.channel.stop();
  });

  it('skips a pulse while a password field has focus', async () => {
    vi.useFakeTimers();
    const { a, alice, bob } = pair();
    await alice.channel.start();
    await bob.channel.start();
    await vi.advanceTimersByTimeAsync(1_000);
    a.port.seal = async () => { throw new LiveError('secure_input'); };
    expect(await alice.channel.send(pulse)).toBe(false);
    await vi.advanceTimersByTimeAsync(10);
    expect(bob.pulses).toHaveLength(0);
    alice.channel.stop();
    bob.channel.stop();
  });

  it('waits ten minutes before retrying when the relay has no live channel configured', async () => {
    vi.useFakeTimers();
    const { alice, sockets } = pair();
    alice.tickets.mockRejectedValue(Object.assign(new Error('live_unavailable'), { code: 'live_unavailable' }));
    await alice.channel.start();
    expect(alice.channel.state).toBe('unavailable');
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    expect(alice.tickets).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(0);
    alice.channel.stop();
  });
});
