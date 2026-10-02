// Receiver playout for live pulses, as specified in the design doc: windows of
// 250 ms are played at window * 250 ms + offset, where the offset follows the
// recent one-way transit (median + 2 x mean absolute deviation), clamped so the
// added buffer stays between 250 ms and 1 s. No clock sync is needed: only the
// sender's window index and the local arrival time are used.

export const WINDOW_MS = 250;

export class Playout {
  constructor({ initialBufferMs = 400, minBufferMs = 250, maxBufferMs = 1000, history = 40 } = {}) {
    Object.assign(this, { initialBufferMs, minBufferMs, maxBufferMs, history });
    this.samples = [];
    this.offset = undefined;
    this.lastWindow = -Infinity;
  }

  /** Returns the local time at which this window should play, or undefined if it is late or a replay. */
  accept(window, arrivalMs) {
    if (window <= this.lastWindow) return undefined;
    const transit = arrivalMs - window * WINDOW_MS;
    this.samples.push(transit);
    if (this.samples.length > this.history) this.samples.shift();
    const fastest = Math.min(...this.samples);
    let target;
    if (this.samples.length < 10) {
      target = fastest + this.initialBufferMs;
    } else {
      const sorted = [...this.samples].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const mad = sorted.reduce((sum, value) => sum + Math.abs(value - median), 0) / sorted.length;
      target = median + 2 * mad;
    }
    const buffer = Math.min(this.maxBufferMs, Math.max(this.minBufferMs, target - fastest));
    // Move the offset gently so playback never jumps backwards or stalls hard.
    const next = fastest + buffer;
    this.offset = this.offset === undefined ? next : this.offset + Math.max(-20, Math.min(40, next - this.offset));
    const playAt = window * WINDOW_MS + this.offset;
    if (playAt < arrivalMs) return undefined;
    this.lastWindow = window;
    return playAt;
  }
}

/** Seeded PRNG so every run of the simulation is identical. */
export function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simulates a typing session over a network with the given one-way delay,
 * jitter and loss. Returns latency from the end of a window to its playback,
 * and the share of windows that played on time.
 */
export function simulate({ baseMs, jitterMs, loss, burstLoss = 0, seconds = 600, seed = 1 }) {
  const rand = random(seed);
  const playout = new Playout();
  const latencies = [];
  let sent = 0, played = 0, lost = 0, late = 0, inBurst = 0;
  for (let window = 0; window < seconds * 4; window++) {
    // Typing in bursts: about 60% of windows carry input.
    if (rand() > 0.6) continue;
    sent++;
    if (inBurst > 0) { inBurst--; lost++; continue; }
    if (rand() < burstLoss) { inBurst = 3 + Math.floor(rand() * 6); lost++; continue; }
    if (rand() < loss) { lost++; continue; }
    // Log-normal-ish jitter: mostly small, sometimes a long tail.
    const spike = rand() < 0.05 ? rand() * jitterMs * 3 : 0;
    const transit = baseMs + rand() * jitterMs + spike;
    const sentAt = (window + 1) * WINDOW_MS; // a window is sent when it closes
    const playAt = playout.accept(window + 1, sentAt + transit);
    if (playAt === undefined) { late++; continue; }
    played++;
    latencies.push(playAt - (window + 1) * WINDOW_MS + 0);
  }
  latencies.sort((a, b) => a - b);
  const pick = q => latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))];
  return {
    sent, played, lost, late,
    onTime: played / Math.max(1, sent - lost),
    // + 250 ms: a keystroke waits on average half a window, up to a full one, before its window closes.
    p50: Math.round(pick(0.5) + WINDOW_MS / 2),
    p95: Math.round(pick(0.95) + WINDOW_MS),
  };
}
