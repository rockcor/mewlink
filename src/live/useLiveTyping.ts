import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityKind, WorkVisual } from '../domain/types';
import type { InputSignal } from '../platform/activity';
import type { LiveTicket } from '../services/relayTransport';
import { LiveChannel, type LivePhase } from './liveChannel';
import { nativeLive, type LivePort } from './native';
import { decodeActivity, decodeVisual, encodeActivity, encodeVisual, HandsPlayer, WINDOW_MS, WindowCounter, type Hands, type Pulse } from './protocol';

/** Partner pulses keep the live display for this long after the last one played. */
const LIVE_HOLD_MS = 3_000;
const restingHands: Hands = { keyboard: false, pointer: false, stressed: false };

export interface LiveTypingOptions {
  /** The preference; both partners must turn it on. */
  wanted: boolean;
  /** A verified relationship that live typing may use right now. */
  session?: { relationshipId: string; deviceId: string; partnerDeviceId: string };
  activity: ActivityKind;
  workVisual: WorkVisual;
  sendKey(): Promise<number>;
  sendOff(): Promise<void>;
  ticket(): Promise<LiveTicket>;
  syncNow(): void;
  native?: LivePort;
}

export interface LiveTyping {
  phase: LivePhase;
  /** True while partner pulses are playing. */
  active: boolean;
  hands: Hands;
  activity?: ActivityKind;
  workVisual?: WorkVisual;
  recordInput(previous: InputSignal, current: InputSignal): void;
  /** Asks the partner to fetch ratchet events now, e.g. right after sending a hug. */
  nudge(): void;
}

export function useLiveTyping(options: LiveTypingOptions): LiveTyping {
  const [phase, setPhase] = useState<LivePhase>('off');
  const [hands, setHands] = useState<Hands>(restingHands);
  const [partner, setPartner] = useState<{ activity?: ActivityKind; workVisual?: WorkVisual }>({});
  const [active, setActive] = useState(false);
  const latest = useRef(options);
  latest.current = options;
  const channel = useRef<LiveChannel | undefined>(undefined);
  const counter = useRef(new WindowCounter());
  const nudgePending = useRef(false);

  const { wanted } = options;
  const relationshipId = options.session?.relationshipId;
  const deviceId = options.session?.deviceId;
  const partnerDeviceId = options.session?.partnerDeviceId;

  // Turning the switch off tells the partner to drop our key; losing the
  // connection or unpairing does not need to.
  const wasWanted = useRef(wanted);
  useEffect(() => {
    if (wasWanted.current && !wanted && relationshipId) void latest.current.sendOff().catch(() => undefined);
    wasWanted.current = wanted;
  }, [wanted, relationshipId]);

  useEffect(() => {
    if (!wanted || !relationshipId || !deviceId || !partnerDeviceId) return;
    const player = new HandsPlayer();
    const windowCounter = counter.current;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let current = restingHands;
    let lastPlayedAt = Number.NEGATIVE_INFINITY;
    const at = (when: number, run: () => void) => {
      const timer = setTimeout(() => { timers.delete(timer); run(); }, Math.max(0, when - Date.now()));
      timers.add(timer);
    };
    const show = (next: Partial<Hands>, when: number) => {
      current = { ...current, ...next, stressed: player.stressedAt(when) };
      setHands(current);
    };
    const live = new LiveChannel({
      relationshipId, deviceId, partnerDeviceId,
      native: latest.current.native ?? nativeLive,
      sendKey: () => latest.current.sendKey(),
      ticket: () => latest.current.ticket(),
      syncNow: () => latest.current.syncNow(),
      onPhase: setPhase,
      onPulse: (pulse: Pulse, playAt: number) => {
        at(playAt, () => {
          lastPlayedAt = Date.now();
          setActive(true);
          const activity = decodeActivity(pulse.activity);
          const workVisual = decodeVisual(pulse.visual);
          setPartner(previous => previous.activity === activity && previous.workVisual === workVisual ? previous : { activity, workVisual });
        });
        for (const step of player.steps(pulse, playAt)) {
          at(step.atMs, () => show({ ...(step.keyboard !== undefined ? { keyboard: step.keyboard } : {}), ...(step.pointer !== undefined ? { pointer: step.pointer } : {}) }, step.atMs));
        }
        if (player.stressedAt(playAt)) at(player.stressedUntilMs, () => show({}, Date.now()));
      },
    });
    channel.current = live;
    void live.start();

    // One pulse per 250 ms window with input, a changed activity, or a nudge.
    let sentActivity = -1;
    let sentVisual = -1;
    let lastWindow = 0;
    const tick = setInterval(() => {
      const counts = windowCounter.take();
      if (Date.now() - lastPlayedAt > LIVE_HOLD_MS) {
        setActive(false);
        if (current !== restingHands) { current = restingHands; setHands(restingHands); }
      }
      if (!live.canSend) return;
      const activity = encodeActivity(latest.current.activity);
      const visual = encodeVisual(latest.current.workVisual);
      const nudge = nudgePending.current;
      if (!counts.keyboard && !counts.pointer && !counts.clicks && !nudge && activity === sentActivity && visual === sentVisual) return;
      const window = Math.max(lastWindow + 1, live.windowAt());
      lastWindow = window;
      nudgePending.current = false;
      void live.send({ ...counts, activity, visual, nudge }, window).then(sent => {
        if (sent) { sentActivity = activity; sentVisual = visual; }
        else if (nudge) nudgePending.current = true;
      });
    }, WINDOW_MS);

    return () => {
      clearInterval(tick);
      for (const timer of timers) clearTimeout(timer);
      live.stop();
      channel.current = undefined;
      windowCounter.take();
      setActive(false);
      setHands(restingHands);
      setPartner({});
      setPhase('off');
    };
  }, [wanted, relationshipId, deviceId, partnerDeviceId]);

  const recordInput = useCallback((previous: InputSignal, current: InputSignal) => {
    if (channel.current?.canSend) counter.current.add(previous, current);
  }, []);
  const nudge = useCallback(() => { if (channel.current?.canSend) nudgePending.current = true; }, []);

  return { phase, active, hands, ...partner, recordInput, nudge };
}
