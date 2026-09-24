import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { v4 as uuid } from 'uuid';
import { SettingsPanel, type UpdateViewState } from './components/SettingsPanel';
import { StatisticsPanel } from './components/StatisticsPanel';
import { PetActions } from './components/PetActions';
import { consumeCup, restorePendingCups, waterClickAction, type PendingCups, type PetTarget } from './pet/pendingCups';
import { hugSkins } from './pet/hugOwnership';
import type { ActivityKind, BlanketStyle, CupStyle, InteractionKind, InteractionPayload, PetSkin, PlainEvent, StatisticsPayload, StatisticsVisibility, StoredEvent, WorkVisual } from './domain/types';
import { cupStyles } from './domain/types';
import {
  clearPairing,
  createPairingState,
  loadPairing,
  pairingInviteCode,
  pairingSafetyCode,
  savePairing,
  type PairingState,
} from './pairing/pairing';
import { activityProbe, nextActivity, demoInitialActivity, demoInitialWorkVisual, inputBurstReached, inputBurstSampleForSequence, inputChangesForSequence, INPUT_STRESS_HOLD_MS, keyboardEventsForSequence, nextSampleDelay, POINTER_ANIMATION_HOLD_MS, POINTER_EVENTS_PER_ANIMATION, pointerClicksForSequence, pointerEventsForSequence, shouldAnimatePointer, trimInputBurst, visualInputForActivity, workVisualFor, type InputBurstSample, type InputSignal } from './platform/activity';
import { ACTIVITY_TRANSITION_MS, gestureFor, waterDrinkDelay, type GestureVariant } from './pet/interaction';
import { transitionAssetName, useActivityPlayback } from './pet/activityPlayback';
import { petSkinFilters } from './pet/skins';
import { SpriteCanvas } from './pet/SpriteCanvas';
import { preloadSprite } from './pet/spriteAssets';
import { watchInput } from './platform/inputStream';
import { useRenderBudget } from './platform/resources';
import { localUtcOffsetMinutes } from './platform/clock';
import { languageTags, watchSystemLanguage } from './platform/language';
import { joinWithPairingCode, registerPairCreator, syncEncryptedEvents } from './services/relayTransport';
import { checkForUpdate, installUpdate } from './services/update';
import { submitFeedback } from './services/feedback';
import type { Update } from '@tauri-apps/plugin-updater';
import { discardRelationshipHistory, pruneEventsOlderThan, putEvent } from './storage/events';
import { queueEncryptedEvent, flushEncryptedOutbox } from './history/outbox';
import { useOperationHistory } from './history/useOperationHistory';
import { companionStates, partnerEventsFor, PRESENCE_HEARTBEAT_MS } from './services/companionState';
import { createSessionQueue } from './pairing/sessionQueue';
import { copyPairingInvite } from './pairing/copyInvite';
import { animationDurationScale, effectiveUtcOffsetMinutes, loadPreferences, savePreferences, scalePetWithPinch } from './settings/preferences';
import { currentStatisticsBundle, flushStatistics, recordActivityStatistics, recordInputStatistics } from './statistics/statistics';
import { appCopy } from './i18n';
import { queueDesktopWindow, setDesktopPanel } from './platform/desktopPanel';
import './styles.css';
import './pet.css';
import './settings-panel.css';

const windowPositionKey = 'mewlink.windowPosition.v1';
const pendingCupKey = 'mewlink.pendingCup.v1';
const feedbackNicknameKey = 'mewlink.feedbackNickname.v1';
const isTauriWindow = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function loadPendingCups(): PendingCups {
  try {
    return restorePendingCups(JSON.parse(window.localStorage.getItem(pendingCupKey) ?? 'null'));
  } catch {
    return {};
  }
}

export default function App() {
  const [locked, setLocked] = useState(false);
  const renderPaused = useRenderBudget(locked);
  const [activity, setActivity] = useState<ActivityKind>(demoInitialActivity ?? 'work');
  const [workVisual, setWorkVisual] = useState<WorkVisual>(demoInitialWorkVisual);
  const [keyboardPressed, setKeyboardPressed] = useState(false);
  const [pointerPressed, setPointerPressed] = useState(false);
  const [inputStressed, setInputStressed] = useState(false);
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [historyRevision, setHistoryRevision] = useState(0);
  const historyInput = useRef<(previous: InputSignal, current: InputSignal) => void>(() => undefined);
  const historyScreenChange = useRef<() => void>(() => undefined);
  const historyStart = useRef<(unseenOnly?: boolean) => Promise<void>>(async () => undefined);
  const historyStop = useRef<() => void>(() => undefined);
  const replayingRef = useRef(false);
  const syncStartedAt = useRef(Date.now());
  const outboxFlushAt = useRef(0);
  const autoReplayPending = useRef(true);
  const autoReplayRunning = useRef(false);
  const [gesture, setGesture] = useState<{ id: string; variant: GestureVariant; target: PetTarget; cupStyle?: CupStyle; blanketStyle?: BlanketStyle }>();
  const [pendingCups, setPendingCups] = useState(loadPendingCups);
  const pendingCupsRef = useRef(pendingCups);
  const drinkInProgress = useRef(false);
  const drinkLockTimer = useRef<number | undefined>(undefined);
  const [petMenuOpen, setPetMenuOpen] = useState(false);
  const [petMenuPinned, setPetMenuPinned] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [preferences, setPreferences] = useState(loadPreferences);
  const text = appCopy[preferences.language];
  const [updateState, setUpdateState] = useState<UpdateViewState>({ kind: 'idle', message: text.updateUnchecked });
  const [feedback, setFeedback] = useState('');
  const [feedbackNickname, setFeedbackNickname] = useState(() => window.localStorage.getItem(feedbackNicknameKey) ?? '');
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState('');
  const [pairing, setPairing] = useState<PairingState | undefined>(() => loadPairing());
  const connected = Boolean(pairing?.partnerDeviceId);
  const [pairingStatus, setPairingStatus] = useState('');
  const [pairingBusy, setPairingBusy] = useState(false);
  const pairingBusyRef = useRef(false);
  const [joinCode, setJoinCode] = useState('');
  const [safetyCode, setSafetyCode] = useState('');
  const [cupStyle, setCupStyle] = useState<CupStyle>(() => {
    const saved = window.localStorage.getItem('mewlink.cupStyle');
    return cupStyles.includes(saved as CupStyle) ? saved as CupStyle : 'ceramic';
  });
  const [notice, setNotice] = useState('');
  const gestureTimer = useRef<number | undefined>(undefined);
  const noticeTimer = useRef<number | undefined>(undefined);
  const menuCloseTimer = useRef<number | undefined>(undefined);
  const lastScaleGestureAt = useRef({ self: Number.NEGATIVE_INFINITY, partner: Number.NEGATIVE_INFINITY });
  const petDragStart = useRef<{ pointerId: number; x: number; y: number } | undefined>(undefined);
  const suppressPetClick = useRef(false);
  const pendingUpdateRef = useRef<Update | undefined>(undefined);
  const updateBusyRef = useRef(false);
  const statisticsActivityRef = useRef<ActivityKind>('work');
  const statisticsWorkVisualRef = useRef<WorkVisual>('web');
  const pairingRef = useRef<PairingState | undefined>(pairing);
  const sessionQueue = useRef(createSessionQueue()).current;
  const panelBusy = useRef(false);
  const [presenceNow, setPresenceNow] = useState(Date.now);
  const incomingInteractionRef = useRef<(action: InteractionKind, cup?: CupStyle, blanket?: BlanketStyle, cupId?: string) => void>(() => undefined);
  const receiverUtcOffsetMinutes = effectiveUtcOffsetMinutes(preferences);
  const partnerEvents = useMemo(() => partnerEventsFor(events, pairing), [events, pairing]);
  const partnerUtcOffsetMinutes = useMemo(() => [...partnerEvents].reverse().find(({ event }) => event.senderUtcOffsetMinutes !== undefined)?.event.senderUtcOffsetMinutes, [partnerEvents]);
  const inviteCode = pairing && !pairing.partnerDeviceId ? pairingInviteCode(pairing) : '';
  const durationScale = demoInitialActivity ? 0.2 : animationDurationScale(preferences.animationSpeed);
  const partnerStatisticsSnapshots = useMemo(() => {
    const latest = [...partnerEvents].reverse().find(({ event }) => event.kind === 'statistics.snapshot');
    if (!latest) return undefined;
    const payload = latest.event.payload as StatisticsPayload;
    return payload.visibility === 'partner' ? payload.snapshots : undefined;
  }, [partnerEvents]);
  const companions = useMemo(() => companionStates(
    { activity, workVisual, skin: preferences.selfPetSkin }, partnerEvents, pairing,
    undefined, presenceNow,
  ), [activity, workVisual, preferences.selfPetSkin, partnerEvents, pairing, presenceNow]);
  const partnerSkin = companions.partner.skin;
  const [historyDisplay, setHistoryDisplay] = useState<{ activity: ActivityKind; workVisual: WorkVisual }>();
  const partnerActivity = historyDisplay?.activity ?? companions.partner.activity;
  const visualInputKind = visualInputForActivity(activity, keyboardPressed, pointerPressed);
  const selfPlayback = useActivityPlayback({
    paused: renderPaused,
    desiredActivity: activity,
    desiredWorkVisual: workVisual,
    initialActivity: demoInitialActivity ?? 'work',
    initialWorkVisual: demoInitialWorkVisual,
    workHandsSettled: visualInputKind === 'none',
    transitionDurationMs: Math.round(ACTIVITY_TRANSITION_MS * durationScale),
  });
  const partnerPlayback = useActivityPlayback({
    paused: renderPaused || !connected,
    desiredActivity: historyDisplay?.activity ?? (companions.partnerLive ? partnerActivity : 'work'),
    desiredWorkVisual: historyDisplay?.workVisual ?? companions.partner.workVisual,
    initialActivity: 'work',
    initialWorkVisual: 'web',
    workHandsSettled: true,
    transitionDurationMs: Math.round(ACTIVITY_TRANSITION_MS * durationScale),
  });
  useEffect(() => {
    if (!renderPaused) void preloadSprite(`work-${workVisual}-stress`).catch(() => undefined);
  }, [renderPaused, workVisual]);
  const motionStyle = useMemo(() => ({
    '--self-pet-scale': String(preferences.selfPetScalePercent / 100),
    '--partner-pet-scale': String(preferences.partnerPetScalePercent / 100),
    '--self-pet-skin-filter': petSkinFilters[preferences.selfPetSkin],
    '--partner-pet-skin-filter': petSkinFilters[partnerSkin],
    '--pet-breathe-duration': `${Math.round(3_600 * durationScale)}ms`,
    '--pet-read-duration': `${Math.round(3_100 * durationScale)}ms`,
    '--pet-meeting-duration': `${Math.round(2_500 * durationScale)}ms`,
    '--pet-video-duration': `${Math.round(2_900 * durationScale)}ms`,
    '--pet-browse-duration': `${Math.round(3_200 * durationScale)}ms`,
    '--pet-rest-duration': `${Math.round(4_300 * durationScale)}ms`,
    '--pet-idle-duration': `${Math.round(3_800 * durationScale)}ms`,
    '--interaction-duration': `${Math.round(3_200 * durationScale)}ms`,
    '--activity-transition-duration': `${Math.round(ACTIVITY_TRANSITION_MS * durationScale)}ms`
  }) as CSSProperties, [durationScale, partnerSkin, preferences.partnerPetScalePercent, preferences.selfPetScalePercent, preferences.selfPetSkin]);

  const installAvailableUpdate = useCallback(async (update: Update) => {
    setUpdateState({ kind: 'downloading', message: text.updateDownloading(), canInstall: true });
    await installUpdate(update, progress => {
      setUpdateState(progress.phase === 'installing'
        ? { kind: 'installing', message: text.updateInstalling, canInstall: true }
        : { kind: 'downloading', message: text.updateDownloading(progress.percent), canInstall: true });
    });
  }, [text]);

  const runUpdateCheck = useCallback(async (installWhenAvailable = false) => {
    if (updateBusyRef.current) return;
    updateBusyRef.current = true;
    let installing = false;
    setUpdateState({ kind: 'checking', message: text.updateChecking });
    try {
      await pendingUpdateRef.current?.close();
      pendingUpdateRef.current = undefined;
      const result = await checkForUpdate();
      pendingUpdateRef.current = result.installable;
      if (result.available && result.installable && installWhenAvailable) {
        installing = true;
        await installAvailableUpdate(result.installable);
        return;
      }
      setUpdateState(result.available
        ? { kind: 'available', message: text.updateAvailable(result.manifest.version), downloadUrl: result.manifest.downloadUrl, canInstall: Boolean(result.installable) }
        : { kind: 'current', message: text.updateCurrent(result.currentVersion) });
    } catch {
      setUpdateState({ kind: 'error', message: installing ? text.updateInstallError : text.updateError });
    } finally {
      updateBusyRef.current = false;
    }
  }, [installAvailableUpdate, text]);

  const installPendingUpdate = useCallback(async () => {
    if (updateBusyRef.current) return;
    const update = pendingUpdateRef.current;
    if (!update) {
      await runUpdateCheck(true);
      return;
    }
    updateBusyRef.current = true;
    try {
      await installAvailableUpdate(update);
    } catch {
      await update.close().catch(() => undefined);
      pendingUpdateRef.current = undefined;
      setUpdateState({ kind: 'error', message: text.updateInstallError });
    } finally {
      updateBusyRef.current = false;
    }
  }, [installAvailableUpdate, runUpdateCheck, text]);

  const persistPairing = useCallback((next: PairingState) => {
    pairingRef.current = next;
    savePairing(next);
    setPairing(next);
  }, []);

  const enqueueEncryptedEvent = useCallback((createEvent: (active: PairingState) => PlainEvent) => {
    const relationshipId = pairingRef.current?.relationshipId;
    return sessionQueue(async () => {
      const active = pairingRef.current;
      if (!active?.partnerDeviceId || active.relationshipId !== relationshipId) throw new Error('pairing_required');
      const result = await queueEncryptedEvent(active, createEvent(active));
      if (pairingRef.current?.relationshipId !== relationshipId) throw new Error('pairing_changed');
      persistPairing(result.state);
      if (result.stored.event.kind !== 'operation.batch') {
        setEvents(currentEvents => currentEvents.some(item => item.event.id === result.stored.event.id)
          ? currentEvents : [...currentEvents, result.stored]);
      }
      return result.stored;
    });
  }, [persistPairing, sessionQueue]);

  const history = useOperationHistory({
    pairing, enabled: preferences.replayEnabled, activity, workVisual, paused: renderPaused,
    retentionHours: preferences.replayRetentionHours, receiverOffset: receiverUtcOffsetMinutes,
    showTimezone: preferences.timezoneMode !== 'off', language: preferences.language,
    revision: historyRevision, onRecord: enqueueEncryptedEvent, durationScale,
    displayReady: (target, visual) => !partnerPlayback.transition && partnerPlayback.displayedActivity === target
      && (target !== 'work' || partnerPlayback.displayedWorkVisual === visual),
  });
  historyInput.current = history.recordInput;
  historyScreenChange.current = history.recordScreenChange;
  historyStart.current = history.start;
  historyStop.current = history.stop;
  replayingRef.current = history.playing;
  const playing = history.playing;
  const current = history.current;
  const partnerLabel = current?.label ?? (companions.partnerLive ? text.status[partnerActivity] : text.partnerWaiting);
  useEffect(() => { setHistoryDisplay(history.playing ? history.display : undefined); }, [history.playing, history.display]);

  const publishStatistics = useCallback((visibility: StatisticsVisibility) => enqueueEncryptedEvent(active => {
    const generatedAt = new Date().toISOString();
    const payload: StatisticsPayload = visibility === 'partner'
      ? { visibility, generatedAt, snapshots: currentStatisticsBundle() }
      : { visibility, generatedAt };
    return {
      id: uuid(),
      version: 1,
      relationshipId: active.relationshipId,
      senderDeviceId: active.deviceId,
      createdAt: generatedAt,
      senderUtcOffsetMinutes: localUtcOffsetMinutes(),
      kind: 'statistics.snapshot',
      payload
    };
  }), [enqueueEncryptedEvent]);

  const drinkCup = useCallback((target: PetTarget, cupId: string, confirmedByPartner = false) => {
    const cup = pendingCupsRef.current[target];
    if (!cup || cup.id !== cupId || (drinkInProgress.current && !confirmedByPartner)) return false;
    pendingCupsRef.current = consumeCup(pendingCupsRef.current, target, cupId);
    setPendingCups(pendingCupsRef.current);
    if (drinkInProgress.current) return true;
    window.clearTimeout(gestureTimer.current);
    setGesture({ id: uuid(), variant: 'water-drink', target, cupStyle: cup.style });
    drinkInProgress.current = true;
    const duration = Math.round(3_200 * durationScale);
    drinkLockTimer.current = window.setTimeout(() => { drinkInProgress.current = false; }, duration);
    gestureTimer.current = window.setTimeout(() => setGesture(undefined), duration);
    if (target === 'self' && pairingRef.current?.partnerDeviceId) {
      void enqueueEncryptedEvent(active => ({ id: uuid(), version: 1,
        relationshipId: active.relationshipId, senderDeviceId: active.deviceId,
        createdAt: new Date().toISOString(), kind: 'cup.consumed', payload: { cupEventId: cupId },
      })).catch(() => undefined);
    }
    return true;
  }, [durationScale, enqueueEncryptedEvent]);

  const publishPetSkin = useCallback((skin: PetSkin) => enqueueEncryptedEvent(active => {
    const createdAt = new Date().toISOString();
    return {
      id: uuid(),
      version: 1,
      relationshipId: active.relationshipId,
      senderDeviceId: active.deviceId,
      createdAt,
      kind: 'profile.skin',
      payload: { skin }
    };
  }), [enqueueEncryptedEvent]);

  useEffect(() => {
    const prune = () => { void pruneEventsOlderThan(preferences.replayRetentionHours).then(saved => {
      const cutoff = Date.now() - preferences.replayRetentionHours * 3_600_000;
      setEvents(currentEvents => [...new Map([...saved, ...currentEvents]
        .filter(item => Date.parse(item.event.createdAt) >= cutoff)
        .map(item => [item.event.id, item])).values()]);
      setHistoryRevision(revision => revision + 1);
    }).catch(() => undefined); };
    prune();
    const timer = window.setInterval(prune, 60_000);
    return () => window.clearInterval(timer);
  }, [preferences.replayRetentionHours]);
  useEffect(() => {
    if (!connected) return;
    const timer = window.setInterval(() => setPresenceNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, [connected]);
  useEffect(() => {
    if (!pairing?.partnerDeviceId) return;
    let stopped = false;
    let pending = false;
    let startedAt = new Date().toISOString();
    const publish = async () => {
      if (stopped || pending) return;
      pending = true;
      try {
        await enqueueEncryptedEvent(active => {
          const endedAt = new Date().toISOString();
          return { id: uuid(), version: 1, relationshipId: active.relationshipId,
            senderDeviceId: active.deviceId, createdAt: endedAt,
            senderUtcOffsetMinutes: receiverUtcOffsetMinutes, kind: 'activity.segment',
            payload: { category: activity, workVisual, startedAt, endedAt } };
        });
        startedAt = new Date().toISOString();
      } catch {
        // The next heartbeat retries; only coarse activity leaves the device.
      } finally { pending = false; }
    };
    void publish();
    const timer = window.setInterval(() => { void publish(); }, PRESENCE_HEARTBEAT_MS);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [activity, workVisual, pairing?.partnerDeviceId, pairing?.relationshipId, receiverUtcOffsetMinutes, enqueueEncryptedEvent]);
  useEffect(() => {
    if (!pairing?.partnerDeviceId) return;
    let delivered = false;
    const publish = () => {
      void publishStatistics(preferences.statisticsVisibility).then(() => { delivered = true; }, () => undefined);
    };
    publish();
    if (preferences.statisticsVisibility === 'private') {
      const retryTimer = window.setInterval(() => { if (!delivered) publish(); }, 30_000);
      return () => window.clearInterval(retryTimer);
    }
    const timer = window.setInterval(() => {
      void publishStatistics('partner').catch(() => undefined);
    }, 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [pairing?.partnerDeviceId, pairing?.relationshipId, preferences.statisticsVisibility, publishStatistics]);
  useEffect(() => {
    if (!pairing?.partnerDeviceId) return;
    let delivered = false;
    const publish = () => {
      void publishPetSkin(preferences.selfPetSkin).then(() => { delivered = true; }, () => undefined);
    };
    publish();
    const retryTimer = window.setInterval(() => { if (!delivered) publish(); }, 30_000);
    return () => window.clearInterval(retryTimer);
  }, [pairing?.partnerDeviceId, pairing?.relationshipId, preferences.selfPetSkin, publishPetSkin]);
  useEffect(() => {
    if (!isTauriWindow) return;
    const appWindow = getCurrentWindow();
    let active = true;
    let unlisten: (() => void) | undefined;
    const setup = async () => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(windowPositionKey) ?? 'null') as { x?: unknown; y?: unknown } | null;
        if (saved && typeof saved.x === 'number' && Number.isFinite(saved.x) && typeof saved.y === 'number' && Number.isFinite(saved.y)) {
          await queueDesktopWindow(() => invoke('restore_pet_position', { x: Math.round(saved.x as number), y: Math.round(saved.y as number) }));
        }
        const stopListening = await appWindow.onMoved(() => {
          void invoke<{ x: number; y: number }>('pet_window_position').then(position => {
            window.localStorage.setItem(windowPositionKey, JSON.stringify(position));
          }).catch(() => undefined);
        });
        if (active) unlisten = stopListening;
        else stopListening();
      } catch {
        // The native window can still be dragged if restoring its last position fails.
      }
    };
    void setup();
    return () => { active = false; unlisten?.(); };
  }, []);
  useEffect(() => {
    if (!isTauriWindow) return;
    void setDesktopPanel(settingsOpen || statisticsOpen).catch(error => {
      console.error('Could not adjust settings window', error);
    });
  }, [settingsOpen, statisticsOpen]);
  useEffect(() => {
    if (!pairing) {
      setSafetyCode('');
      return;
    }
    let current = true;
    void pairingSafetyCode(pairing).then(code => { if (current) setSafetyCode(code); });
    return () => { current = false; };
  }, [pairing]);
  useEffect(() => {
    if (!pairing?.relationshipId || !pairing.deviceId) return;
    let stopped = false;
    let running = false;
    const sync = async () => {
      if (running || stopped) return;
      running = true;
      try {
        await sessionQueue(async () => {
          const active = pairingRef.current;
          if (stopped || !active) return;
          if (active.partnerDeviceId && Date.now() - outboxFlushAt.current >= 3000) {
            outboxFlushAt.current = Date.now();
            try { await flushEncryptedOutbox(active); } catch { /* Persisted ciphertext retries on the next sync. */ }
          }
          const result = await syncEncryptedEvents(active);
          if (stopped || pairingRef.current?.relationshipId !== active.relationshipId) return;
          setPairingStatus(result.state.partnerDeviceId ? text.connected : text.waitingForInvite);
          for (const stored of result.received) {
            await putEvent(stored);
            if (stopped || pairingRef.current?.relationshipId !== active.relationshipId) return;
            if (stored.event.kind === 'operation.batch') {
              setHistoryRevision(revision => revision + 1);
            } else {
              setEvents(currentEvents => currentEvents.some(item => item.event.id === stored.event.id) ? currentEvents : [...currentEvents, stored]);
            }
            // Historical interactions belong in replay, never fire a pile of
            // old animations immediately after reconnecting.
            if (stored.event.kind === 'interaction' && !replayingRef.current
              && Date.now() - Date.parse(stored.event.createdAt) < 15_000
              && Date.parse(stored.event.createdAt) >= syncStartedAt.current) {
              const payload = stored.event.payload as InteractionPayload;
              incomingInteractionRef.current(payload.action, payload.cupStyle, payload.blanketStyle, stored.event.id);
            } else if (stored.event.kind === 'cup.consumed') {
              const payload = stored.event.payload as { cupEventId: string };
              drinkCup('partner', payload.cupEventId, true);
            }
          }
          if (result.state.partnerDeviceId !== active.partnerDeviceId || result.state.relayCursor !== active.relayCursor
            || result.state.inviteExpiresAt !== active.inviteExpiresAt || result.received.length) {
            persistPairing(result.state);
          }
          setPresenceNow(Date.now());
          if (result.partnerOnline && autoReplayRunning.current) historyStop.current();
          if (autoReplayPending.current && result.caughtUp) {
            autoReplayPending.current = false;
            if (!result.partnerOnline) {
              autoReplayRunning.current = true;
              void historyStart.current(true).finally(() => { autoReplayRunning.current = false; });
            }
          }
        });
      } catch {
        if (!stopped) setPairingStatus(text.connectionRetry);
      } finally {
        running = false;
      }
    };
    void sync();
    const reconnect = () => { autoReplayPending.current = true; syncStartedAt.current = Date.now(); void sync(); };
    window.addEventListener('online', reconnect);
    const timer = window.setInterval(() => { void sync(); }, 2_500);
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener('online', reconnect); };
  }, [pairing?.relationshipId, pairing?.deviceId, persistPairing, sessionQueue, text, drinkCup]);
  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;
    let foregroundSequence: number | undefined;
    const sample = async () => {
      let delay = 1_000;
      try {
        const signal = await activityProbe.sample();
        if (stopped) return;
        if (signal.foregroundSequence !== undefined && foregroundSequence !== undefined && signal.foregroundSequence !== foregroundSequence) {
          historyScreenChange.current();
        }
        foregroundSequence = signal.foregroundSequence;
        setLocked(current => current === signal.locked ? current : signal.locked);
        if (!signal.locked && signal.idleSeconds < 120 && signal.appClass !== 'unknown') setWorkVisual(workVisualFor(signal));
        setActivity(currentActivity => nextActivity(currentActivity, signal));
        delay = nextSampleDelay(signal);
      } catch {
        // A transient native sampling error must not leave the pet asleep forever.
      } finally {
        if (!stopped) timer = window.setTimeout(() => { void sample(); }, delay);
      }
    };
    void sample();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, []);
  useEffect(() => {
    let keyboardReleaseTimer: number | undefined;
    let pointerReleaseTimer: number | undefined;
    let stressReleaseTimer: number | undefined;
    let lastPointerAnimationAt = Number.NEGATIVE_INFINITY;
    let pendingPointerEvents = 0;
    let lastPointerEventAt = Number.NEGATIVE_INFINITY;
    let stopped = false;
    let previous: InputSignal | undefined;
    let burstSamples: InputBurstSample[] = [];
    const sample = (signal: InputSignal) => {
      if (stopped) return;
      if (previous) {
        historyInput.current(previous, signal);
        const changes = inputChangesForSequence(previous, signal);
        const keyboardEvents = keyboardEventsForSequence(previous, signal);
        const pointerEvents = pointerEventsForSequence(previous, signal);
        recordInputStatistics(
          keyboardEvents,
          pointerClicksForSequence(previous, signal)
        );
        if (changes.keyboard) {
          setKeyboardPressed(current => !current);
          window.clearTimeout(keyboardReleaseTimer);
          keyboardReleaseTimer = window.setTimeout(() => setKeyboardPressed(false), 110);
        }
        const now = performance.now();
        burstSamples = trimInputBurst(burstSamples, now);
        const burstSample = inputBurstSampleForSequence(previous, signal, now);
        if (burstSample) {
          burstSamples.push(burstSample);
          if (inputBurstReached(burstSamples)) {
            setInputStressed(true);
            window.clearTimeout(stressReleaseTimer);
            stressReleaseTimer = window.setTimeout(() => setInputStressed(false), INPUT_STRESS_HOLD_MS);
          }
        }
        if (changes.pointer) {
          if (now - lastPointerEventAt > 260) pendingPointerEvents = 0;
          pendingPointerEvents += pointerEvents;
          lastPointerEventAt = now;
        }
        if (pendingPointerEvents >= POINTER_EVENTS_PER_ANIMATION && shouldAnimatePointer(lastPointerAnimationAt, now)) {
          pendingPointerEvents = 0;
          lastPointerAnimationAt = now;
          setPointerPressed(true);
          window.clearTimeout(pointerReleaseTimer);
          pointerReleaseTimer = window.setTimeout(() => setPointerPressed(false), POINTER_ANIMATION_HOLD_MS);
        }
      }
      previous = signal;
    };
    const unwatch = watchInput(sample);
    return () => {
      stopped = true;
      unwatch();
      window.clearTimeout(keyboardReleaseTimer);
      window.clearTimeout(pointerReleaseTimer);
      window.clearTimeout(stressReleaseTimer);
    };
  }, []);
  useEffect(() => {
    statisticsActivityRef.current = activity;
    statisticsWorkVisualRef.current = workVisual;
  }, [activity, workVisual]);
  useEffect(() => {
    let previousTick = Date.now();
    const timer = window.setInterval(() => {
      const now = Date.now();
      recordActivityStatistics(statisticsActivityRef.current, statisticsWorkVisualRef.current, now - previousTick, now);
      previousTick = now;
    }, 1_000);
    const flush = () => flushStatistics();
    window.addEventListener('beforeunload', flush);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('beforeunload', flush);
      flushStatistics();
    };
  }, []);
  useEffect(() => { window.localStorage.setItem('mewlink.cupStyle', cupStyle); }, [cupStyle]);
  useEffect(() => {
    if (pendingCups.self || pendingCups.partner) window.localStorage.setItem(pendingCupKey, JSON.stringify(pendingCups));
    else window.localStorage.removeItem(pendingCupKey);
  }, [pendingCups]);
  useEffect(() => { savePreferences(preferences); }, [preferences]);
  useEffect(() => {
    if (preferences.languageMode !== 'system') return;
    return watchSystemLanguage(language => setPreferences(current =>
      current.languageMode === 'system' && current.language !== language ? { ...current, language } : current
    ));
  }, [preferences.languageMode]);
  useEffect(() => { document.documentElement.lang = languageTags[preferences.language]; }, [preferences.language]);
  useEffect(() => {
    setUpdateState(currentState => currentState.kind === 'idle' ? { ...currentState, message: text.updateUnchecked } : currentState);
    setPairingStatus(currentStatus => currentStatus ? (pairingRef.current?.partnerDeviceId ? text.connected : pairingRef.current ? text.waitingForInvite : '') : currentStatus);
  }, [text]);
  useEffect(() => {
    if (connected) return;
    historyStop.current();
    setGesture(undefined);
    pendingCupsRef.current = {};
    setPendingCups({});
  }, [connected]);
  useEffect(() => { if (preferences.autoUpdate) void runUpdateCheck(); }, [preferences.autoUpdate, runUpdateCheck]);
  useEffect(() => {
    if (renderPaused || gesture) return;
    const timers = (['self', 'partner'] as const).flatMap(target => {
      const cup = pendingCups[target];
      return cup ? [window.setTimeout(() => drinkCup(target, cup.id), waterDrinkDelay(cup.placedAt))] : [];
    });
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [drinkCup, gesture, pendingCups, renderPaused]);
  useEffect(() => () => {
    window.clearTimeout(gestureTimer.current);
    window.clearTimeout(noticeTimer.current);
    window.clearTimeout(menuCloseTimer.current);
    window.clearTimeout(drinkLockTimer.current);
  }, []);

  function showGesture(action: InteractionKind, message: string, target: PetTarget, options?: { cupStyle?: CupStyle; blanketStyle?: BlanketStyle; receiverActivity?: ActivityKind; replaying?: boolean; cupId?: string }) {
    window.clearTimeout(gestureTimer.current);
    window.clearTimeout(noticeTimer.current);
    const receiverActivity = options?.receiverActivity ?? (target === 'self' ? activity : partnerActivity);
    setGesture({
      id: uuid(),
      variant: gestureFor(action, receiverActivity, options?.replaying),
      target,
      cupStyle: options?.cupStyle,
      blanketStyle: options?.blanketStyle
    });
    if (action === 'water') {
      pendingCupsRef.current = { ...pendingCupsRef.current, [target]: { id: options?.cupId ?? uuid(), style: options?.cupStyle ?? 'ceramic', placedAt: Date.now() } };
      setPendingCups(pendingCupsRef.current);
    }
    setNotice(message);
    gestureTimer.current = window.setTimeout(() => setGesture(undefined), Math.round(3_200 * durationScale));
    noticeTimer.current = window.setTimeout(() => setNotice(''), Math.round(2_800 * durationScale));
  }

  incomingInteractionRef.current = (action, incomingCup, incomingBlanket, cupId) => {
    showGesture(action, action === 'hug' ? text.incomingHug : text.incomingWater, 'self', {
      cupStyle: incomingCup,
      blanketStyle: incomingBlanket,
      receiverActivity: activity,
      cupId
    });
  };

  async function createPairing() {
    if (pairingBusyRef.current || pairingRef.current?.partnerDeviceId) return;
    pairingBusyRef.current = true;
    setPairingBusy(true);
    setPairingStatus(text.creatingInvite);
    try {
      const next = await registerPairCreator(await createPairingState());
      persistPairing(next);
      setPairingStatus(text.waitingForInvite);
    } catch {
      setPairingStatus(text.createInviteError);
    } finally {
      pairingBusyRef.current = false;
      setPairingBusy(false);
    }
  }

  async function joinPairing() {
    if (pairingBusyRef.current) return;
    pairingBusyRef.current = true;
    setPairingBusy(true);
    setPairingStatus(text.connecting);
    try {
      const next = await joinWithPairingCode(joinCode);
      persistPairing(next);
      setJoinCode('');
      setPairingStatus(text.connected);
    } catch {
      setPairingStatus(text.connectError);
    } finally {
      pairingBusyRef.current = false;
      setPairingBusy(false);
    }
  }

  async function copyInvite() {
    await copyPairingInvite(pairingRef.current);
  }

  function disconnectPairing() {
    const oldRelationship = pairingRef.current?.relationshipId;
    if (oldRelationship) void sessionQueue(() => discardRelationshipHistory(oldRelationship));
    clearPairing();
    pairingRef.current = undefined;
    setPairing(undefined);
    setPairingStatus(text.disconnected);
    setJoinCode('');
    setNotice('');
  }

  async function send(action: InteractionKind) {
    if (action === 'water') {
      if (drinkInProgress.current) return;
      if (waterClickAction(pendingCupsRef.current) === 'drink-self') {
        dismissPetMenu();
        drinkCup('self', pendingCupsRef.current.self!.id);
        return;
      }
    }
    const active = pairingRef.current;
    if (!active?.partnerDeviceId) {
      await openPanel('settings');
      setPairingStatus(text.pairFirst);
      return;
    }
    setPetMenuOpen(false);
    setPetMenuPinned(false);
    try {
      const sent = await enqueueEncryptedEvent(currentPairing => ({
        id: uuid(),
        version: 1,
        relationshipId: currentPairing.relationshipId,
        senderDeviceId: currentPairing.deviceId,
        createdAt: new Date().toISOString(),
        senderUtcOffsetMinutes: localUtcOffsetMinutes(),
        kind: 'interaction',
        payload: { action, ...(action === 'water' ? { cupStyle } : { blanketStyle: preferences.blanketStyle }) }
      }));
      showGesture(action, sent.status === 'queued' ? text.interactionQueued : action === 'hug' ? text.hugSent : text.cupSent(text.cups[cupStyle].label), 'partner', {
        cupStyle,
        blanketStyle: preferences.blanketStyle,
        receiverActivity: partnerActivity,
        cupId: sent.event.id
      });
    } catch {
      setNotice(text.sendError);
    }
  }

  function revealPetMenu() {
    window.clearTimeout(menuCloseTimer.current);
    setPetMenuOpen(true);
  }

  function hidePetMenuSoon() {
    window.clearTimeout(menuCloseTimer.current);
    if (petMenuPinned) return;
    menuCloseTimer.current = window.setTimeout(() => setPetMenuOpen(false), 180);
  }

  function pinPetMenu() {
    if (suppressPetClick.current) return;
    window.clearTimeout(menuCloseTimer.current);
    setPetMenuOpen(true);
    setPetMenuPinned(current => !current);
  }

  function dismissPetMenu() {
    window.clearTimeout(menuCloseTimer.current);
    setPetMenuOpen(false);
    setPetMenuPinned(false);
  }

  async function openPanel(panel: 'settings' | 'statistics') {
    if (panelBusy.current) return;
    panelBusy.current = true;
    dismissPetMenu();
    try {
      // Expand and clamp the native window before painting the panel.
      if (isTauriWindow) await setDesktopPanel(true);
      setSettingsOpen(panel === 'settings');
      setStatisticsOpen(panel === 'statistics');
    } catch {
      setNotice(text.panelError);
    } finally { panelBusy.current = false; }
  }

  function beginPetDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !isTauriWindow) return;
    petDragStart.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function continuePetDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = petDragStart.current;
    if (!start || start.pointerId !== event.pointerId || suppressPetClick.current) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) return;
    suppressPetClick.current = true;
    petDragStart.current = undefined;
    event.preventDefault();
    void getCurrentWindow().startDragging().finally(() => {
      window.setTimeout(() => { suppressPetClick.current = false; }, 80);
    });
  }

  function endPetDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (petDragStart.current?.pointerId === event.pointerId) petDragStart.current = undefined;
  }

  function handlePetPinch(event: ReactWheelEvent, target: 'self' | 'partner') {
    if (!event.ctrlKey || event.deltaY === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const now = performance.now();
    if (now - lastScaleGestureAt.current[target] < 55) return;
    lastScaleGestureAt.current[target] = now;
    const key = target === 'self' ? 'selfPetScalePercent' : 'partnerPetScalePercent';
    setPreferences(currentPreferences => ({
      ...currentPreferences,
      [key]: scalePetWithPinch(currentPreferences[key], event.deltaY)
    }));
    revealPetMenu();
  }

  async function shareFeedback() {
    const nickname = feedbackNickname.trim();
    const message = feedback.trim();
    if (!nickname || !message || feedbackSending) return;
    setFeedbackSending(true);
    setFeedbackStatus(text.feedbackSending);
    try {
      await submitFeedback({ nickname, message, language: preferences.language });
      window.localStorage.setItem(feedbackNicknameKey, nickname);
      setFeedback('');
      setFeedbackStatus(text.feedbackShared);
    } catch {
      setFeedbackStatus(text.feedbackError);
    } finally {
      setFeedbackSending(false);
    }
  }

  const replayGesture = current?.interaction ? {
    id: current.id,
    variant: gestureFor(current.interaction, partnerActivity, true),
    target: 'self' as const,
    cupStyle: current.cupStyle,
    blanketStyle: current.blanketStyle
  } : undefined;
  const displayedGesture = connected ? (gesture ?? replayGesture) : undefined;
  const gestureSkins = hugSkins(displayedGesture?.target ?? 'self', preferences.selfPetSkin, partnerSkin);

  return (
    <main className="desktop-pet" style={motionStyle} data-render-paused={renderPaused}>
      <section className={`pet-zone ${settingsOpen || statisticsOpen ? 'settings-open' : ''}`} aria-label={connected ? text.petZone : text.soloPetZone} lang={languageTags[preferences.language]}>
        <div
          id="pet-menu"
          className={`hover-ui ${connected ? 'paired' : 'solo'} ${petMenuOpen ? 'menu-visible' : ''}`}
          onPointerEnter={revealPetMenu}
          onPointerLeave={hidePetMenuSoon}
        >
          <div className="status-row" aria-live="polite">
            <div className="status-pill self-status">
              <span>●</span>
              <span className="status-copy"><b>{text.status[activity]}</b></span>
            </div>
            {connected && <div className="status-pill partner-status">
              <span>{current?.icon ?? '○'}</span>
              <span className="status-copy">
                <b>{partnerLabel}</b>
                {current?.clockLabel && <small>{current.clockLabel}</small>}
              </span>
            </div>}
          </div>
          <PetActions language={preferences.language} connected={connected} canReplay={history.available} replaying={playing}
            cupStyle={pendingCups.self?.style ?? cupStyle}
            onSettings={() => { void openPanel('settings'); }}
            onStatistics={() => { void openPanel('statistics'); }}
            onHug={() => { void send('hug'); }}
            onWater={() => { void send('water'); }}
            onReplay={() => { dismissPetMenu(); void history.start(); }} />
        </div>

        <div className={`pet-pair ${connected ? 'paired' : 'solo'} ${displayedGesture ? `interacting target-${displayedGesture.target} interaction-${displayedGesture.variant.startsWith('hug') ? 'hug' : 'water'}` : ''}`}>
          <button
            className="pet-avatar self-pet"
            type="button"
            aria-label={text.myPet(text.status[activity])}
            aria-expanded={petMenuOpen}
            aria-controls="pet-menu"
            onPointerDown={beginPetDrag}
            onPointerMove={continuePetDrag}
            onPointerUp={endPetDrag}
            onPointerCancel={endPetDrag}
            onPointerEnter={revealPetMenu}
            onPointerLeave={hidePetMenuSoon}
            onClick={pinPetMenu}
            onFocus={revealPetMenu}
            onBlur={hidePetMenuSoon}
            onWheel={event => handlePetPinch(event, 'self')}
          >
            <SpriteCanvas skin={companions.self.skin} paused={renderPaused}
              className={`pet-sprite ${selfPlayback.displayedActivity} ${selfPlayback.displayedActivity === 'work' ? `work-${selfPlayback.displayedWorkVisual}` : ''} input-${selfPlayback.transition ? 'none' : visualInputKind} ${inputStressed && !selfPlayback.transition ? 'input-stressed' : ''} ${selfPlayback.transition ? 'transition-source-frame' : ''}`}
              aria-hidden="true"
              onLoopBoundary={selfPlayback.handleLoopBoundary}
            />
            {selfPlayback.transition && <SpriteCanvas skin={companions.self.skin} paused={renderPaused}
              key={selfPlayback.transition.key}
              className={`pet-sprite activity-transition ${transitionAssetName(selfPlayback.transition)}`}
              aria-hidden="true"
              onPlaybackEnd={() => selfPlayback.completeTransition(selfPlayback.transition!.key)}
            />}
          </button>
          {connected && <button
            className="pet-avatar partner-pet"
            type="button"
            aria-label={text.partnerPet(partnerLabel)}
            aria-expanded={petMenuOpen}
            aria-controls="pet-menu"
            onPointerEnter={revealPetMenu}
            onPointerLeave={hidePetMenuSoon}
            onClick={pinPetMenu}
            onFocus={revealPetMenu}
            onBlur={hidePetMenuSoon}
            onWheel={event => handlePetPinch(event, 'partner')}
          >
            <SpriteCanvas skin={partnerSkin} paused={renderPaused}
              className={`pet-sprite partner-sprite ${partnerPlayback.displayedActivity} ${partnerPlayback.displayedActivity === 'work' ? `work-${partnerPlayback.displayedWorkVisual}` : ''} input-${playing && !partnerPlayback.transition ? visualInputForActivity(partnerActivity, history.hands.keyboard, history.hands.pointer) : 'none'} ${history.hands.stressed && !partnerPlayback.transition ? 'input-stressed' : ''} ${playing ? 'replaying' : ''} ${partnerPlayback.transition ? 'transition-source-frame' : ''}`}
              aria-hidden="true"
              onLoopBoundary={partnerPlayback.handleLoopBoundary}
            />
            {partnerPlayback.transition && <SpriteCanvas skin={partnerSkin} paused={renderPaused}
              key={partnerPlayback.transition.key}
              className={`pet-sprite partner-sprite activity-transition ${transitionAssetName(partnerPlayback.transition)}`}
              aria-hidden="true"
              onPlaybackEnd={() => partnerPlayback.completeTransition(partnerPlayback.transition!.key)}
            />}
          </button>}
          {displayedGesture && <SpriteCanvas key={displayedGesture.id} skin={gestureSkins.receiver} senderSkin={displayedGesture.variant.startsWith('hug') ? gestureSkins.sender : undefined} paused={renderPaused} className={`interaction-sprite ${displayedGesture.variant} target-${displayedGesture.target} cup-${displayedGesture.cupStyle ?? 'ceramic'} blanket-${displayedGesture.blanketStyle ?? preferences.blanketStyle}`} aria-hidden="true" />}
          {(['self', 'partner'] as const).map(target => pendingCups[target] && !(displayedGesture?.target === target && displayedGesture.variant.startsWith('water')) && <span key={target} className={`waiting-cup target-${target} ${pendingCups[target]!.style}`} aria-label={text.water}><i /><i /></span>)}
        </div>
        {(notice || history.error) && <div className="pet-toast" aria-live="polite">{notice || text.historyError}</div>}
        {settingsOpen && <SettingsPanel
          preferences={preferences}
          localUtcOffsetMinutes={receiverUtcOffsetMinutes}
          partnerUtcOffsetMinutes={partnerUtcOffsetMinutes}
          updateState={updateState}
          feedback={feedback}
          feedbackNickname={feedbackNickname}
          feedbackSending={feedbackSending}
          feedbackStatus={feedbackStatus}
          pairing={pairing}
          pairingStatus={pairingStatus}
          pairingBusy={pairingBusy}
          inviteCode={inviteCode}
          joinCode={joinCode}
          safetyCode={safetyCode}
          cupStyle={cupStyle}
          onChange={setPreferences}
          onCheckUpdate={() => { void runUpdateCheck(true); }}
          onInstallUpdate={() => { void installPendingUpdate(); }}
          onFeedbackChange={value => { setFeedback(value); setFeedbackStatus(''); }}
          onFeedbackNicknameChange={value => { setFeedbackNickname(value); setFeedbackStatus(''); }}
          onShareFeedback={() => { void shareFeedback(); }}
          onCreatePairing={() => { void createPairing(); }}
          onCopyInvite={copyInvite}
          onJoinCodeChange={setJoinCode}
          onJoinPairing={() => { void joinPairing(); }}
          onDisconnect={disconnectPairing}
          onCupStyleChange={setCupStyle}
          onClose={() => setSettingsOpen(false)}
        />}
        {statisticsOpen && <StatisticsPanel
          language={preferences.language}
          connected={connected}
          visibility={preferences.statisticsVisibility}
          partnerSnapshots={partnerStatisticsSnapshots}
          onVisibilityChange={statisticsVisibility => setPreferences(currentPreferences => ({ ...currentPreferences, statisticsVisibility }))}
          onClose={() => setStatisticsOpen(false)}
        />}
      </section>
    </main>
  );
}
