import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActivityKind, OperationBatch, PlainEvent, StoredEvent, WorkVisual } from '../domain/types';
import type { PairingState } from '../pairing/pairing';
import type { InputSignal } from '../platform/activity';
import { inputBurstReached, INPUT_STRESS_HOLD_MS, trimInputBurst, type InputBurstSample } from '../platform/activity';
import { historySeen, loadHistoryDraft, markHistorySeen, readReplayEvent, replayReferences, saveHistoryDraft } from '../storage/events';
import { OPERATION_BATCH_MS, OperationRecorder } from './operations';
import { dayInstant, dayProgress, daySpeed, groupReplayDays, REST_GAP_MS, restingAt, unseenMs, unseenWorkMs, type ReplayDay } from './days';
import { condensedReplay, replayFrames, type OperationFrame } from './playback';
import { ACTIVITY_TRANSITION_MS } from '../pet/interaction';
import type { Language } from '../platform/language';

interface Options {
  pairing?: PairingState; enabled: boolean; activity: ActivityKind; workVisual: WorkVisual;
  paused: boolean; retentionHours: number; receiverOffset: number; showTimezone: boolean; language: Language;
  revision: number;
  /** The partner's UTC offset in minutes: a replay day ends at their midnight. */
  partnerOffset?: number;
  durationScale: number;
  displayReady?: (activity: ActivityKind, visual: WorkVisual) => boolean;
  onRecord: (create: (state: PairingState) => PlainEvent) => Promise<StoredEvent>;
}
const DAY_SCAN_INTERVAL_MS = 5_000;
/** Less than this not yet watched is not worth a notice. */
const MIN_UNSEEN_MS = 60_000;
export interface ReplayRequest { day?: string; fraction?: number; unseen?: boolean }

export function useOperationHistory(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const recorder = useRef<OperationRecorder | undefined>(undefined);
  const [days, setDays] = useState<ReplayDay[]>([]);
  const [seen, setSeen] = useState(0);
  const [playingDay, setPlayingDay] = useState<ReplayDay>();
  const [progress, setProgress] = useState(0);
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

  // The replayable days, re-read when history changes (at most every few
  // seconds). Recordings that arrive late carry their original times, so the
  // whole retention window is read each time rather than only new entries.
  const lastScan = useRef(0);
  useEffect(() => {
    let active = true;
    const identity = options.pairing;
    if (!options.enabled || !identity?.partnerDeviceId) { setDays([]); return; }
    const wait = Math.max(250, lastScan.current + DAY_SCAN_INTERVAL_MS - Date.now());
    const timer = window.setTimeout(() => {
      lastScan.current = Date.now();
      const since = Date.now() - latest.current.retentionHours * 3_600_000;
      void Promise.all([replayReferences(identity, since), historySeen(identity.relationshipId)]).then(([refs, seenAt]) => {
        if (!active) return;
        setSeen(seenAt);
        setDays(groupReplayDays(refs, latest.current.partnerOffset ?? latest.current.receiverOffset));
      }).catch(() => { if (active) setError(true); });
    }, wait);
    return () => { active = false; window.clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityKey, options.enabled, options.retentionHours, options.revision, options.partnerOffset]);
  const daysRef = useRef(days);
  daysRef.current = days;
  const playingDayRef = useRef(playingDay);
  playingDayRef.current = playingDay;

  // What the notice offers: the not yet watched part of each day, rest included.
  const unseen = useMemo(() => {
    const open = days.map(day => ({ day, ms: unseenMs(day, seen), workMs: unseenWorkMs(day, seen) }))
      .filter(entry => entry.ms >= MIN_UNSEEN_MS);
    return open.length ? { first: open[0].day, days: open.length, ms: open.reduce((sum, entry) => sum + entry.ms, 0),
      workMs: open.reduce((sum, entry) => sum + entry.workMs, 0) } : undefined;
  }, [days, seen]);

  const stop = useCallback(() => {
    generation.current++;
    session.current = false;
    setPlaying(false);
    setPlayingDay(undefined);
    setProgress(0);
    setCurrent(undefined);
    setHands({ keyboard: false, pointer: false, stressed: false });
  }, []);
  useEffect(() => { stop(); return stop; }, [identityKey, options.enabled, stop]);

  /**
   * Plays one day. Without arguments it toggles: stops a running replay, or
   * plays the newest day from its start. `unseen` starts at the first moment
   * not watched yet; `fraction` (0..1 of the day) seeks, also
   * while a replay is running.
   */
  const start = useCallback(async (request: ReplayRequest = {}) => {
    const seeking = request.fraction !== undefined && session.current;
    if (session.current && !seeking) { stop(); return; }
    const config = latest.current;
    const identity = config.pairing;
    if (!config.enabled || !identity?.partnerDeviceId) return;
    const all = daysRef.current;
    if (!all.length) return;
    session.current = true;
    const token = ++generation.current;
    const valid = () => generation.current === token;
    let releaseTimer: ReturnType<typeof setTimeout> | undefined;
    let stressUntil = 0;
    let samples: InputBurstSample[] = [];
    try {
      const seenAt = await historySeen(identity.relationshipId);
      if (!valid()) return;
      const day = request.day ? all.find(item => item.key === request.day)
        : request.unseen ? all.find(item => unseenMs(item, seenAt) >= MIN_UNSEEN_MS) ?? all.at(-1)
        : all.at(-1);
      if (!day) { session.current = false; return; }
      const fraction = request.fraction ?? (request.unseen ? dayProgress(day, Math.max(day.start, seenAt + 1)) : 0);
      const from = dayInstant(day, fraction >= 0.999 ? 0 : fraction);
      setPlayingDay(day);
      setProgress(dayProgress(day, from));
      setPlaying(true);
      // Include the batch that contains `from`; frames before it are skipped below.
      const refs = day.refs.filter(ref => Date.parse(ref.at) + OPERATION_BATCH_MS > from);
      const wait = async (ms: number) => {
        let remaining = ms;
        while (valid() && (remaining > 0 || latest.current.paused)) {
          const step = Math.min(Math.max(remaining, 16), 50);
          await new Promise(resolve => setTimeout(resolve, step));
          if (!latest.current.paused) remaining -= step;
        }
      };
      // The partner's time shown so far. It runs at the day's speed, rest
      // included, and the bar follows it.
      const speed = daySpeed(day);
      let clock = from;
      const advanceTo = async (to: number, minimumMs = 0) => {
        const begin = clock, total = Math.max(minimumMs, (to - begin) / speed);
        let elapsed = 0;
        while (valid() && (elapsed < total || latest.current.paused)) {
          const step = Math.min(Math.max(total - elapsed, 16), 50);
          await new Promise(resolve => setTimeout(resolve, step));
          if (latest.current.paused) continue;
          elapsed += step;
          setProgress(dayProgress(day, Math.min(to, begin + elapsed * speed)));
        }
        clock = Math.max(clock, to);
      };
      let shown: ActivityKind | undefined;
      let shownVisual: WorkVisual = 'web';
      const present = async (next: ActivityKind, nextVisual: WorkVisual) => {
        if (shown === next && shownVisual === nextVisual) return;
        shown = next;
        shownVisual = nextVisual;
        setDisplay({ activity: next, workVisual: nextVisual });
        if (latest.current.displayReady) {
          // The visual player waits for its current loop's final frame.
          // Follow its actual completion, not a guessed fixed timer.
          await wait(50);
          let elapsed = 0;
          while (valid() && !latest.current.displayReady(next, nextVisual)) {
            await wait(50);
            elapsed += 50;
            if (elapsed > ACTIVITY_TRANSITION_MS * config.durationScale + 15_000) throw new Error('replay transition stalled');
          }
        } else await wait(ACTIVITY_TRANSITION_MS * config.durationScale + 500);
      };
      let previous: OperationFrame | undefined;
      let activity: ActivityKind | undefined;
      let visual: WorkVisual = 'web';
      const frames = replayFrames(refs, readReplayEvent, config.receiverOffset, config.showTimezone, config.language);
      for await (const frame of condensedReplay(frames, speed)) {
        const at = Date.parse(frame.at);
        if (frame.activity) { activity = frame.activity; visual = frame.workVisual ?? visual; }
        // Before the chosen start: only the pup's state is carried forward.
        if (at < from) continue;
        // Nothing recorded for a while: the partner was away or offline, and
        // the pup sleeps through it until the next record.
        if ((at - clock > REST_GAP_MS || restingAt(day, clock)) && shown !== 'idle' && shown !== 'rest') {
          await present('rest', shownVisual);
          if (!valid()) break;
        }
        await advanceTo(at, previous ? 16 : 0);
        if (!valid()) break;
        setCurrent(frame);
        if (activity && (frame.activity || !shown || shown === 'rest')) await present(activity, visual);
        if (!valid()) break;
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
      // Watched to the end of the day: its notice goes away.
      if (valid()) {
        const last = Date.parse(day.refs.at(-1)!.at);
        await markHistorySeen(identity.relationshipId, last);
        if (valid()) setSeen(value => Math.max(value, last));
      }
    } catch { if (valid()) setError(true); }
    finally {
      clearTimeout(releaseTimer);
      if (valid()) stop();
    }
  }, [stop]);
  const seek = useCallback((fraction: number) => {
    const day = playingDayRef.current;
    if (day) void start({ day: day.key, fraction });
  }, [start]);
  return { recordInput, recordScreenChange, available: days.length > 0, days, unseen, playing, playingDay, progress,
    current, display, hands, error, start, seek, stop };
}
