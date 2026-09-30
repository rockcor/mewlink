import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityKind, OperationBatch, PlainEvent, StoredEvent, WorkVisual } from '../domain/types';
import type { PairingState } from '../pairing/pairing';
import type { InputSignal } from '../platform/activity';
import { inputBurstReached, INPUT_STRESS_HOLD_MS, trimInputBurst, type InputBurstSample } from '../platform/activity';
import { hasReplayHistory, historySeen, loadHistoryDraft, markHistorySeen, readReplayEvent, replayReferences, saveHistoryDraft } from '../storage/events';
import { OperationRecorder } from './operations';
import { condensedReplay, replayDelay, replayFrames, replaySpeed, type OperationFrame } from './playback';
import { ACTIVITY_TRANSITION_MS } from '../pet/interaction';
import type { Language } from '../platform/language';

interface Options {
  pairing?: PairingState; enabled: boolean; activity: ActivityKind; workVisual: WorkVisual;
  paused: boolean; retentionHours: number; receiverOffset: number; showTimezone: boolean; language: Language;
  revision: number;
  durationScale: number;
  displayReady?: (activity: ActivityKind, visual: WorkVisual) => boolean;
  onRecord: (create: (state: PairingState) => PlainEvent) => Promise<StoredEvent>;
}
export function useOperationHistory(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const recorder = useRef<OperationRecorder | undefined>(undefined);
  const [available, setAvailable] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState<OperationFrame>();
  const [display, setDisplay] = useState({ activity: 'idle' as ActivityKind, workVisual: 'web' as WorkVisual });
  const [hands, setHands] = useState({ keyboard: false, pointer: false, stressed: false });
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const session = useRef(false);
  const identityKey = `${options.pairing?.relationshipId}:${options.pairing?.partnerDeviceId}`;

  useEffect(() => {
    const identity = options.pairing;
    if (!identity?.partnerDeviceId || !options.enabled) return;
    let stopped = false;
    let failed = false;
    let writes = Promise.resolve();
    const persist = (job: () => Promise<unknown>) => {
      writes = writes.then(() => { if (!failed) return job(); }).then(() => undefined).catch(() => {
        failed = true;
        recorder.current = undefined;
        setError(true);
      });
    };
    const emit = (batch: OperationBatch) => persist(async () => {
      if (latest.current.pairing?.relationshipId !== identity.relationshipId) return;
      // Keep a recovery copy until ciphertext has been committed locally.
      await saveHistoryDraft(identity.relationshipId, batch);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(batch)));
      const id = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      await latest.current.onRecord(state => {
        if (state.relationshipId !== identity.relationshipId) throw new Error('pairing changed');
        return {
        id, version: 1, relationshipId: state.relationshipId, senderDeviceId: state.deviceId,
        createdAt: batch.startedAt, senderUtcOffsetMinutes: latest.current.receiverOffset,
        kind: 'operation.batch', payload: batch,
      }; });
      await saveHistoryDraft(identity.relationshipId);
    });
    const start = async () => {
      const recovered = await loadHistoryDraft(identity.relationshipId);
      if (stopped) return;
      if (recovered && Date.parse(recovered.startedAt) >= Date.now() - latest.current.retentionHours * 3_600_000) emit(recovered);
      const next = new OperationRecorder(emit);
      recorder.current = next;
      next.push(Date.now(), latest.current.activity, latest.current.workVisual);
    };
    void start().catch(() => setError(true));
    const checkpoint = () => {
      const snapshot = recorder.current?.snapshot();
      if (snapshot) persist(() => saveHistoryDraft(identity.relationshipId, snapshot));
    };
    const timer = window.setInterval(checkpoint, 1000);
    const flush = () => recorder.current?.flush();
    const flushTimer = window.setInterval(flush, 10_000);
    window.addEventListener('pagehide', flush);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.clearInterval(flushTimer);
      window.removeEventListener('pagehide', flush);
      flush();
      recorder.current = undefined;
    };
  // Identity and recording preference own the recorder; live values are read via latest.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityKey, options.enabled]);

  useEffect(() => { recorder.current?.push(Date.now(), options.activity, options.workVisual); }, [options.activity, options.workVisual]);
  const recordInput = useCallback((previous: InputSignal, next: InputSignal) => {
    recorder.current?.input(previous, next, Date.now(), latest.current.activity, latest.current.workVisual);
  }, []);
  const recordScreenChange = useCallback(() => {
    recorder.current?.push(Date.now(), latest.current.activity, latest.current.workVisual);
  }, []);

  useEffect(() => {
    let active = true;
    if (!options.enabled || !options.pairing?.partnerDeviceId) { setAvailable(false); return; }
    void hasReplayHistory(options.pairing, Date.now() - options.retentionHours * 3_600_000).then(found => {
      if (active) setAvailable(found);
    }).catch(() => setError(true));
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityKey, options.enabled, options.retentionHours, options.revision]);

  const stop = useCallback(() => {
    generation.current++;
    session.current = false;
    setPlaying(false);
    setCurrent(undefined);
    setHands({ keyboard: false, pointer: false, stressed: false });
  }, []);
  useEffect(() => { stop(); return stop; }, [identityKey, options.enabled, stop]);

  const start = useCallback(async (unseenOnly = false) => {
    if (session.current) { if (!unseenOnly) stop(); return; }
    const config = latest.current;
    if (!config.enabled || !config.pairing?.partnerDeviceId) return;
    session.current = true;
    const token = ++generation.current;
    const valid = () => generation.current === token;
    const identity = config.pairing;
    let releaseTimer: ReturnType<typeof setTimeout> | undefined;
    let stressUntil = 0;
    let samples: InputBurstSample[] = [];
    // Freeze references at the start. Incoming sync never replaces this queue.
    try {
      const seen = unseenOnly ? await historySeen(identity.relationshipId) : 0;
      const refs = await replayReferences(identity, Math.max(Date.now() - config.retentionHours * 3_600_000, seen + 1));
      if (!valid()) return;
      if (!refs.length) { session.current = false; return; }
      const wait = async (ms: number) => {
        let remaining = ms;
        while (valid() && (remaining > 0 || latest.current.paused)) {
          const step = Math.min(Math.max(remaining, 16), 50);
          await new Promise(resolve => setTimeout(resolve, step));
          if (!latest.current.paused) remaining -= step;
        }
      };
      let previous: OperationFrame | undefined;
      let activity: ActivityKind | undefined;
      let visual: WorkVisual = 'web';
      const speed = replaySpeed(refs);
      const frames = replayFrames(refs, readReplayEvent, config.receiverOffset, config.showTimezone, config.language);
      for await (const frame of condensedReplay(frames, speed)) {
        await wait(replayDelay(previous, frame, speed));
        if (!valid()) break;
        setPlaying(true);
        setCurrent(frame);
        if (frame.activity) {
          const changed = activity !== frame.activity || (frame.workVisual !== undefined && visual !== frame.workVisual);
          activity = frame.activity;
          visual = frame.workVisual ?? visual;
          setDisplay({ activity, workVisual: visual });
          if (changed) {
            if (latest.current.displayReady) {
              // The visual player waits for its current loop's final frame.
              // Follow its actual completion, not a guessed fixed timer.
              await wait(50);
              let elapsed = 0;
              while (valid() && !latest.current.displayReady(activity, visual)) {
                await wait(50);
                elapsed += 50;
                if (elapsed > ACTIVITY_TRANSITION_MS * config.durationScale + 15_000) throw new Error('replay transition stalled');
              }
            } else await wait(ACTIVITY_TRANSITION_MS * config.durationScale + 500);
          }
          if (!valid()) break;
        }
        const at = Date.parse(frame.at);
        samples = trimInputBurst(samples, at);
        if (frame.keyboard || frame.clicks) {
          const factor = Math.min(1, 1200 / (frame.sourceSpanMs ?? 1));
          samples.push({ at, keyboard: Math.floor(frame.keyboard * factor), pointerClicks: Math.floor(frame.clicks * factor) });
          if (inputBurstReached(samples)) stressUntil = at + INPUT_STRESS_HOLD_MS;
        }
        if (frame.keyboard || frame.pointer) {
          setHands(value => ({ keyboard: frame.keyboard ? !value.keyboard : value.keyboard,
            pointer: frame.pointer ? !value.pointer : value.pointer, stressed: at < stressUntil }));
          clearTimeout(releaseTimer);
          releaseTimer = setTimeout(() => { if (valid()) setHands({ keyboard: false, pointer: false, stressed: false }); }, 110);
        }
        if (frame.interaction) await wait(3300 * config.durationScale);
        previous = frame;
      }
      if (valid()) await markHistorySeen(identity.relationshipId, Date.parse(refs.at(-1)!.at));
    } catch { if (valid()) setError(true); }
    finally {
      clearTimeout(releaseTimer);
      if (valid()) stop();
    }
  }, [stop]);
  return { recordInput, recordScreenChange, available, playing, current, display, hands, error, start, stop };
}
