import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { v4 as uuid } from 'uuid';
import { SettingsPanel, type UpdateViewState } from './components/SettingsPanel';
import { StatisticsPanel } from './components/StatisticsPanel';
import type { ActivityKind, BlanketStyle, CupStyle, InteractionKind, InteractionPayload, PetSkin, PlainEvent, StatisticsPayload, StatisticsVisibility, StoredEvent, WorkVisual } from './domain/types';
import { cupStyles } from './domain/types';
import {
  createPairingState,
  pairingInviteCode,
  pairingInviteSecondsLeft,
  pairingSafetyCode,
  type PairingState,
} from './pairing/pairing';
import { securePairing, SecureStorageError, SerialTasks } from './pairing/secureStore';
import { initializeRatchet, nativeRatchet, RatchetError, type RatchetStatus } from './crypto/ratchet';
import { activityProbe, classify, demoInitialActivity, demoInitialWorkVisual, inputBurstReached, inputChangesForSequence, inputProbe, INPUT_STRESS_HOLD_MS, keyboardEventsForSequence, nextSampleDelay, POINTER_ANIMATION_HOLD_MS, POINTER_EVENTS_PER_ANIMATION, pointerClicksForSequence, pointerEventsForSequence, shouldAnimatePointer, trimInputBurst, visualInputForActivity, workVisualFor, type InputBurstSample, type InputSignal } from './platform/activity';
import { ACTIVITY_TRANSITION_MS, gestureFor, waterDrinkDelay, type GestureVariant } from './pet/interaction';
import { transitionAssetName, useActivityPlayback } from './pet/activityPlayback';
import { petSkinFilters } from './pet/skins';
import { localUtcOffsetMinutes } from './platform/clock';
import { languageTags, watchSystemLanguage } from './platform/language';
import { joinWithPairingCode, registerPairCreator, RelayError, resumePairingRegistration, revokeRelationship, sendEncryptedEvent, syncEncryptedEvents } from './services/relayTransport';
import { checkForUpdate, installUpdate } from './services/update';
import { submitFeedback } from './services/feedback';
import type { Update } from '@tauri-apps/plugin-updater';
import { pruneEventsOlderThan, putEvent } from './storage/events';
import { buildReplay } from './services/replay';
import { latestPartnerSkin } from './services/profile';
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

function loadPendingCup(): { target: 'self' | 'partner'; style: CupStyle; placedAt: number } | undefined {
  try {
    const value = JSON.parse(window.localStorage.getItem(pendingCupKey) ?? 'null') as Record<string, unknown> | null;
    if (!value || (value.target !== 'self' && value.target !== 'partner') || !cupStyles.includes(value.style as CupStyle) || typeof value.placedAt !== 'number') return undefined;
    return { target: value.target, style: value.style as CupStyle, placedAt: value.placedAt };
  } catch {
    return undefined;
  }
}

export default function App() {
  const [activity, setActivity] = useState<ActivityKind>(demoInitialActivity ?? 'work');
  const [workVisual, setWorkVisual] = useState<WorkVisual>(demoInitialWorkVisual);
  const [keyboardPressed, setKeyboardPressed] = useState(false);
  const [pointerPressed, setPointerPressed] = useState(false);
  const [inputStressed, setInputStressed] = useState(false);
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  const [gesture, setGesture] = useState<{ variant: GestureVariant; target: 'self' | 'partner'; cupStyle?: CupStyle; blanketStyle?: BlanketStyle }>();
  const [pendingCup, setPendingCup] = useState(loadPendingCup);
  const [petMenuOpen, setPetMenuOpen] = useState(false);
  const [petMenuPinned, setPetMenuPinned] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [preferences, setPreferences] = useState(loadPreferences);
  const text = appCopy[preferences.language];
  const textRef = useRef(text);
  textRef.current = text;
  const [updateState, setUpdateState] = useState<UpdateViewState>({ kind: 'idle', message: text.updateUnchecked });
  const [feedback, setFeedback] = useState('');
  const [feedbackNickname, setFeedbackNickname] = useState(() => window.localStorage.getItem(feedbackNicknameKey) ?? '');
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState('');
  const [pairing, setPairing] = useState<PairingState>();
  const [pairingReady, setPairingReady] = useState(false);
  const [revocationPending, setRevocationPending] = useState(false);
  const pairingBlockedRef = useRef(true);
  const connected = Boolean(pairing?.partnerDeviceId && pairing.ratchet?.verified);
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
  const statisticsActivityRef = useRef<ActivityKind>('work');
  const statisticsWorkVisualRef = useRef<WorkVisual>('web');
  const pairingRef = useRef<PairingState | undefined>(pairing);
  const pairingTasks = useRef(new SerialTasks());
  const incomingInteractionRef = useRef<(action: InteractionKind, cup?: CupStyle, blanket?: BlanketStyle) => void>(() => undefined);
  const receiverUtcOffsetMinutes = effectiveUtcOffsetMinutes(preferences);
  const partnerUtcOffsetMinutes = useMemo(() => [...events].reverse().find(({ direction, event }) => direction === 'in' && event.senderUtcOffsetMinutes !== undefined)?.event.senderUtcOffsetMinutes, [events]);
  const inviteCode = pairing && !pairing.partnerDeviceId ? pairingInviteCode(pairing) : '';
  const durationScale = demoInitialActivity ? 0.2 : animationDurationScale(preferences.animationSpeed);
  const replay = useMemo(
    () => preferences.replayEnabled ? buildReplay(events, receiverUtcOffsetMinutes, preferences.timezoneMode !== 'off', preferences.language) : [],
    [events, preferences.language, preferences.replayEnabled, preferences.timezoneMode, receiverUtcOffsetMinutes]
  );
  const partnerStatisticsSnapshots = useMemo(() => {
    const latest = [...events].reverse().find(({ direction, event }) => direction === 'in' && event.kind === 'statistics.snapshot');
    if (!latest) return undefined;
    const payload = latest.event.payload as StatisticsPayload;
    return payload.visibility === 'partner' ? payload.snapshots : undefined;
  }, [events]);
  const partnerSkin = useMemo(() => latestPartnerSkin(events, pairing?.relationshipId), [events, pairing?.relationshipId]);
  const current = playing ? replay[frame] : undefined;
  const partnerActivity = current?.activity ?? 'rest';
  const visualInputKind = visualInputForActivity(activity, keyboardPressed, pointerPressed);
  const selfPlayback = useActivityPlayback({
    desiredActivity: activity,
    desiredWorkVisual: workVisual,
    initialActivity: demoInitialActivity ?? 'work',
    initialWorkVisual: demoInitialWorkVisual,
    workHandsSettled: visualInputKind === 'none',
    transitionDurationMs: Math.round(ACTIVITY_TRANSITION_MS * durationScale),
  });
  const partnerPlayback = useActivityPlayback({
    desiredActivity: partnerActivity,
    desiredWorkVisual: 'web',
    initialActivity: 'rest',
    initialWorkVisual: 'web',
    workHandsSettled: true,
    transitionDurationMs: Math.round(ACTIVITY_TRANSITION_MS * durationScale),
  });
  useEffect(() => {
    const image = new Image();
    image.decoding = 'async';
    image.src = `/pets/animations/work-${workVisual}-stress.png`;
    return () => { image.src = ''; };
  }, [workVisual]);
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

  const runUpdateCheck = useCallback(async () => {
    setUpdateState({ kind: 'checking', message: text.updateChecking });
    try {
      const result = await checkForUpdate();
      pendingUpdateRef.current = result.installable;
      setUpdateState(result.available
        ? { kind: 'available', message: text.updateAvailable(result.manifest.version), downloadUrl: result.manifest.downloadUrl, canInstall: Boolean(result.installable) }
        : { kind: 'current', message: text.updateCurrent(result.currentVersion) });
    } catch {
      setUpdateState({ kind: 'error', message: text.updateError });
    }
  }, [text]);

  const installPendingUpdate = useCallback(async () => {
    const update = pendingUpdateRef.current;
    if (!update) {
      await runUpdateCheck();
      return;
    }
    try {
      await installUpdate(update, progress => {
        setUpdateState(progress.phase === 'installing'
          ? { kind: 'installing', message: text.updateInstalling, canInstall: true }
          : { kind: 'downloading', message: text.updateDownloading(progress.percent), canInstall: true });
      });
    } catch {
      pendingUpdateRef.current = undefined;
      setUpdateState({ kind: 'error', message: text.updateInstallError });
    }
  }, [runUpdateCheck, text]);

  const persistPairing = useCallback(async (next: PairingState) => {
    try {
      await securePairing.save(next);
    } catch {
      pairingBlockedRef.current = true;
      setPairingReady(false);
      setPairingStatus(textRef.current.secureStorageError);
      throw new SecureStorageError();
    }
    pairingRef.current = next;
    setPairing(next);
  }, []);

  const finishRevocation = useCallback(async () => {
    const pending = securePairing.pending();
    if (!pending) return;
    let erasureError: unknown;
    try { await nativeRatchet('forget', pending.relationshipId); } catch (error) { erasureError = error; }
    await revokeRelationship(pending);
    if (erasureError) throw erasureError; // Server cancellation still runs if local storage is damaged.
    await securePairing.completeRevocation(pending.relationshipId);
    setRevocationPending(false);
    setPairingStatus(textRef.current.disconnected);
  }, []);

  // Call inside the shared session queue when the relay confirms a revoked pair.
  const forgetRevokedPair = useCallback(async (active: PairingState) => {
    pairingBlockedRef.current = true;
    try { await securePairing.beginRevocation(active); } catch {
      setPairingReady(false);
      setPairingStatus(textRef.current.secureStorageError);
      throw new SecureStorageError();
    }
    pairingRef.current = undefined;
    setPairing(undefined);
    setEvents([]);
    setRevocationPending(true);
    await nativeRatchet('forget', active.relationshipId);
    await securePairing.completeRevocation(active.relationshipId);
    setRevocationPending(false);
    setPairingStatus(textRef.current.disconnected);
  }, []);

  useEffect(() => {
    let stopped = false;
    void pairingTasks.current.run(async () => {
      const restored = await securePairing.load();
      if (stopped) return;
      pairingRef.current = restored;
      pairingBlockedRef.current = !restored?.ratchet;
      setPairing(restored);
      setRevocationPending(Boolean(securePairing.pending()));
      setPairingReady(true);
      if (securePairing.pending()) setPairingStatus(textRef.current.revocationPending);
      else if (restored && !restored.ratchet) setPairingStatus(textRef.current.ratchetUpgrade);
    }).catch(() => { if (!stopped) setPairingStatus(textRef.current.secureStorageError); });
    return () => { stopped = true; };
  }, []);

  useEffect(() => {
    if (!pairingReady || !revocationPending) return;
    let stopped = false;
    const retry = () => {
      void pairingTasks.current.run(async () => { if (!stopped) await finishRevocation(); })
        .catch(() => { if (!stopped) setPairingStatus(textRef.current.revocationPending); });
    };
    retry();
    const timer = window.setInterval(retry, 15_000);
    window.addEventListener('online', retry);
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener('online', retry); };
  }, [finishRevocation, pairingReady, revocationPending]);

  const enqueueEncryptedEvent = useCallback((createEvent: (active: PairingState) => PlainEvent) => {
    const expectedRelationship = pairingRef.current?.relationshipId;
    return pairingTasks.current.run(async () => {
      let active = pairingRef.current;
      if (pairingBlockedRef.current || !active?.partnerDeviceId || !active.ratchet?.verified || active.relationshipId !== expectedRelationship) throw new Error('pairing_required');
      if (active.registration) {
        active = await resumePairingRegistration(active).catch(async error => {
          if (error instanceof RelayError && error.code === 'relationship_revoked') await forgetRevokedPair(active!);
          throw error;
        });
        await persistPairing(active);
      }
      const result = await sendEncryptedEvent(active, createEvent(active)).catch(async error => {
        if (error instanceof RelayError && error.code === 'relationship_revoked') await forgetRevokedPair(active);
        throw error;
      });
      if (pairingBlockedRef.current) throw new Error('pairing_changed');
      await persistPairing(result.state);
      await putEvent(result.stored);
      setEvents(currentEvents => currentEvents.some(item => item.event.id === result.stored.event.id)
        ? currentEvents
        : [...currentEvents, result.stored]);
      return result.stored;
    });
  }, [forgetRevokedPair, persistPairing]);

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
    let current = true;
    void pruneEventsOlderThan(preferences.replayRetentionHours).then(items => {
      if (current) setEvents(items.filter(item => item.event.relationshipId === pairing?.relationshipId));
    });
    return () => { current = false; };
  }, [preferences.replayRetentionHours, pairing?.relationshipId]);
  useEffect(() => {
    if (!connected) return;
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
  }, [connected, pairing?.relationshipId, preferences.statisticsVisibility, publishStatistics]);
  useEffect(() => {
    if (!connected) return;
    let delivered = false;
    const publish = () => {
      void publishPetSkin(preferences.selfPetSkin).then(() => { delivered = true; }, () => undefined);
    };
    publish();
    const retryTimer = window.setInterval(() => { if (!delivered) publish(); }, 30_000);
    return () => window.clearInterval(retryTimer);
  }, [connected, pairing?.relationshipId, preferences.selfPetSkin, publishPetSkin]);
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
        await pairingTasks.current.run(async () => {
        let active = pairingRef.current;
        if (stopped || pairingBlockedRef.current || !active) return;
        if (active.registration) {
          active = await resumePairingRegistration(active).catch(async error => {
            if (error instanceof RelayError && error.code === 'relationship_revoked') await forgetRevokedPair(active!);
            throw error;
          });
          await persistPairing(active);
        }
        const result = await syncEncryptedEvents(active).catch(async error => {
          if (error instanceof RelayError && error.code === 'relationship_revoked') await forgetRevokedPair(active);
          throw error;
        });
        if (stopped || pairingBlockedRef.current || pairingRef.current?.relationshipId !== active.relationshipId) return;
        if (result.state.partnerDeviceId !== active.partnerDeviceId || result.state.relayCursor !== active.relayCursor
          || result.state.inviteExpiresAt !== active.inviteExpiresAt || result.received.length
          || JSON.stringify(result.state.ratchet) !== JSON.stringify(active.ratchet)
          || result.state.relationshipKey !== active.relationshipKey) {
          await persistPairing(result.state);
        }
        setPairingStatus(result.state.ratchet?.verified ? text.connected
          : result.state.ratchet?.established ? text.ratchetVerify : text.waitingForInvite);
        for (const stored of result.received) {
          if (stopped || pairingBlockedRef.current) break;
          await putEvent(stored);
          if (stored.ratchetReceipt) await nativeRatchet('ack_incoming', active.relationshipId, stored.ratchetReceipt);
          setEvents(currentEvents => currentEvents.some(item => item.event.id === stored.event.id) ? currentEvents : [...currentEvents, stored]);
          if (stored.event.kind === 'interaction') {
            const payload = stored.event.payload as InteractionPayload;
            incomingInteractionRef.current(payload.action, payload.cupStyle, payload.blanketStyle);
          }
        }
        });
      } catch (error) {
        if (!stopped && !pairingBlockedRef.current) setPairingStatus(error instanceof RatchetError ? text.ratchetStorageError : text.connectionRetry);
      } finally {
        running = false;
      }
    };
    void sync();
    const timer = window.setInterval(() => { void sync(); }, 2_500);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [pairing?.relationshipId, pairing?.deviceId, persistPairing, forgetRevokedPair, text]);
  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;
    const sample = async () => {
      const signal = await activityProbe.sample();
      if (stopped) return;
      if (!signal.locked && signal.idleSeconds < 120) setWorkVisual(workVisualFor(signal));
      setActivity(currentActivity => {
        if (!signal.locked && signal.idleSeconds < 120 && signal.appClass === 'unknown') return currentActivity;
        const next = classify(signal);
        return currentActivity === next ? currentActivity : next;
      });
      timer = window.setTimeout(() => { void sample(); }, nextSampleDelay(signal));
    };
    void sample();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, []);
  useEffect(() => {
    let timer: number | undefined;
    let keyboardReleaseTimer: number | undefined;
    let pointerReleaseTimer: number | undefined;
    let stressReleaseTimer: number | undefined;
    let lastPointerAnimationAt = Number.NEGATIVE_INFINITY;
    let pendingPointerEvents = 0;
    let lastPointerEventAt = Number.NEGATIVE_INFINITY;
    let stopped = false;
    let previous: InputSignal | undefined;
    let burstSamples: InputBurstSample[] = [];
    const sample = async () => {
      const signal = await inputProbe.sample();
      if (stopped) return;
      if (previous) {
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
        if (keyboardEvents > 0 || pointerEvents > 0) {
          burstSamples.push({ at: now, keyboard: keyboardEvents, pointer: pointerEvents });
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
      timer = window.setTimeout(() => { void sample(); }, 16);
    };
    void sample();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
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
    if (pendingCup) window.localStorage.setItem(pendingCupKey, JSON.stringify(pendingCup));
    else window.localStorage.removeItem(pendingCupKey);
  }, [pendingCup]);
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
  }, [text]);
  useEffect(() => {
    if (connected) return;
    setPlaying(false);
    setFrame(0);
    setGesture(undefined);
    setPendingCup(undefined);
  }, [connected]);
  useEffect(() => { if (preferences.autoUpdate) void runUpdateCheck(); }, [preferences.autoUpdate, runUpdateCheck]);
  useEffect(() => { if (!preferences.replayEnabled) { setPlaying(false); setFrame(0); } }, [preferences.replayEnabled]);
  useEffect(() => {
    if (!playing || !replay.length) return;
    const timer = window.setInterval(() => {
      setFrame(current => current + 1 >= replay.length ? (setPlaying(false), 0) : current + 1);
    }, Math.round(1_700 * durationScale));
    return () => clearInterval(timer);
  }, [durationScale, playing, replay.length]);
  useEffect(() => {
    if (!pendingCup) return;
    const timer = window.setTimeout(() => {
      setGesture({ variant: 'water-drink', target: pendingCup.target, cupStyle: pendingCup.style });
      setPendingCup(undefined);
      gestureTimer.current = window.setTimeout(() => setGesture(undefined), Math.round(3_200 * durationScale));
    }, waterDrinkDelay(pendingCup.placedAt));
    return () => window.clearTimeout(timer);
  }, [durationScale, pendingCup]);
  useEffect(() => () => {
    window.clearTimeout(gestureTimer.current);
    window.clearTimeout(noticeTimer.current);
    window.clearTimeout(menuCloseTimer.current);
  }, []);

  function showGesture(action: InteractionKind, message: string, target: 'self' | 'partner', options?: { cupStyle?: CupStyle; blanketStyle?: BlanketStyle; receiverActivity?: ActivityKind; replaying?: boolean }) {
    window.clearTimeout(gestureTimer.current);
    window.clearTimeout(noticeTimer.current);
    const receiverActivity = options?.receiverActivity ?? (target === 'self' ? activity : partnerActivity);
    setGesture({
      variant: gestureFor(action, receiverActivity, options?.replaying),
      target,
      cupStyle: options?.cupStyle,
      blanketStyle: options?.blanketStyle
    });
    if (action === 'water') setPendingCup({ target, style: options?.cupStyle ?? 'ceramic', placedAt: Date.now() });
    setNotice(message);
    gestureTimer.current = window.setTimeout(() => setGesture(undefined), Math.round(3_200 * durationScale));
    noticeTimer.current = window.setTimeout(() => setNotice(''), Math.round(2_800 * durationScale));
  }

  incomingInteractionRef.current = (action, incomingCup, incomingBlanket) => {
    showGesture(action, action === 'hug' ? text.incomingHug : text.incomingWater, 'self', {
      cupStyle: incomingCup,
      blanketStyle: incomingBlanket,
      receiverActivity: activity
    });
  };

  async function createPairing() {
    if (!pairingReady || revocationPending || pairingBusyRef.current || pairingRef.current?.partnerDeviceId) return;
    pairingBusyRef.current = true;
    setPairingBusy(true);
    setPairingStatus(text.creatingInvite);
    pairingBlockedRef.current = true;
    try {
      await pairingTasks.current.run(async () => {
        const previous = pairingRef.current;
        if (previous) {
          await securePairing.beginRevocation(previous);
          pairingRef.current = undefined;
          setPairing(undefined);
          setRevocationPending(true);
          await finishRevocation();
        }
        // Save before registration so failures/restarts still have credentials
        // to cancel the invite. No plaintext fallback on storage failure.
        let next = await createPairingState();
        await persistPairing(next);
        next = await initializeRatchet(next);
        await persistPairing(next);
        await persistPairing(await registerPairCreator(next));
        pairingBlockedRef.current = false;
      });
      setPairingStatus(text.waitingForInvite);
    } catch (error) {
      if (!(error instanceof SecureStorageError)) pairingBlockedRef.current = !pairingRef.current;
      setPairingStatus(error instanceof SecureStorageError ? text.secureStorageError
        : securePairing.pending() ? text.revocationPending : text.createInviteError);
    } finally {
      pairingBusyRef.current = false;
      setPairingBusy(false);
    }
  }

  async function joinPairing() {
    if (!pairingReady || revocationPending || pairingBusyRef.current || pairingRef.current) return;
    pairingBusyRef.current = true;
    setPairingBusy(true);
    setPairingStatus(text.connecting);
    try {
      await pairingTasks.current.run(async () => {
        const next = await joinWithPairingCode(joinCode, fetch, persistPairing);
        await persistPairing(next);
        pairingBlockedRef.current = false;
      });
      setJoinCode('');
      setPairingStatus(text.ratchetVerify);
    } catch (error) {
      if (!(error instanceof SecureStorageError)) pairingBlockedRef.current = !pairingRef.current;
      setPairingStatus(error instanceof RatchetError && error.code === 'upgrade_required' ? text.ratchetUpgrade
        : error instanceof SecureStorageError ? text.secureStorageError : text.connectError);
    } finally {
      pairingBusyRef.current = false;
      setPairingBusy(false);
    }
  }

  async function copyInvite() {
    if (!pairingRef.current || pairingInviteSecondsLeft(pairingRef.current) === 0) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setPairingStatus(text.inviteCopied);
    } catch {
      setPairingStatus(text.inviteCopyError);
    }
  }

  async function confirmPairing() {
    if (pairingBusyRef.current) return;
    const expected = pairingRef.current;
    if (!expected?.ratchet?.established || !safetyCode) return;
    pairingBusyRef.current = true;
    setPairingBusy(true);
    try {
      await pairingTasks.current.run(async () => {
        const active = pairingRef.current;
        if (pairingBlockedRef.current || active?.relationshipId !== expected.relationshipId || !active.ratchet) return;
        await nativeRatchet('confirm', active.relationshipId, { safetyNumber: safetyCode });
        const status = await nativeRatchet<RatchetStatus>('status', active.relationshipId);
        await persistPairing({ ...active, ratchet: { ...active.ratchet, established: status.established,
          verified: status.verified, safetyNumber: status.safetyNumber } });
        setPairingStatus(text.connected);
      });
    } catch { setPairingStatus(text.ratchetStorageError); }
    finally { pairingBusyRef.current = false; setPairingBusy(false); }
  }

  async function disconnectPairing() {
    if (pairingBusyRef.current || !pairingReady) return;
    pairingBusyRef.current = true;
    pairingBlockedRef.current = true;
    setPairingBusy(true);
    try {
      await pairingTasks.current.run(async () => {
        const active = pairingRef.current;
        if (!active) return;
        await securePairing.beginRevocation(active);
        pairingRef.current = undefined;
        setPairing(undefined);
        setEvents([]);
        setJoinCode('');
        setNotice('');
        setRevocationPending(true);
        setPairingStatus(text.revocationPending);
        try { await finishRevocation(); } catch { /* Durable retry on reconnect. */ }
      });
    } catch {
      setPairingReady(false);
      setPairingStatus(text.secureStorageError);
    } finally {
      pairingBusyRef.current = false;
      setPairingBusy(false);
    }
  }

  async function send(action: InteractionKind) {
    const active = pairingRef.current;
    if (!active?.partnerDeviceId || !active.ratchet?.verified) {
      dismissPetMenu();
      setStatisticsOpen(false);
      setSettingsOpen(true);
      setPairingStatus(active?.ratchet?.established ? text.ratchetVerify : active && !active.ratchet ? text.ratchetUpgrade : text.pairFirst);
      return;
    }
    setPetMenuOpen(false);
    setPetMenuPinned(false);
    try {
      await enqueueEncryptedEvent(currentPairing => ({
        id: uuid(),
        version: 1,
        relationshipId: currentPairing.relationshipId,
        senderDeviceId: currentPairing.deviceId,
        createdAt: new Date().toISOString(),
        senderUtcOffsetMinutes: localUtcOffsetMinutes(),
        kind: 'interaction',
        payload: { action, ...(action === 'water' ? { cupStyle } : { blanketStyle: preferences.blanketStyle }) }
      }));
      showGesture(action, action === 'hug' ? text.hugSent : text.cupSent(text.cups[cupStyle].label), 'partner', {
        cupStyle,
        blanketStyle: preferences.blanketStyle,
        receiverActivity: partnerActivity
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

  function cycleCup() {
    const next = cupStyles[(cupStyles.indexOf(cupStyle) + 1) % cupStyles.length];
    setCupStyle(next);
    window.clearTimeout(noticeTimer.current);
    setNotice(text.cupChanged(text.cups[next].label));
    noticeTimer.current = window.setTimeout(() => setNotice(''), Math.round(2_800 * durationScale));
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
    variant: gestureFor(current.interaction, partnerActivity, true),
    target: 'self' as const,
    cupStyle: current.cupStyle,
    blanketStyle: current.blanketStyle
  } : undefined;
  const displayedGesture = connected ? (gesture ?? replayGesture) : undefined;

  return (
    <main className="desktop-pet" style={motionStyle}>
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
                <b>{current?.label ?? text.partnerWaiting}</b>
                {current?.clockLabel && <small>{current.clockLabel}</small>}
              </span>
            </div>}
          </div>
          <div className="quick-actions" aria-label={text.actionsAria}>
            {connected && <>
              <button type="button" onClick={() => { void send('hug'); }}><span aria-hidden="true">🫂</span>{text.hug}</button>
              <button type="button" onClick={() => { void send('water'); }}><span className={`cup-symbol ${cupStyle}`} aria-hidden="true" />{text.water}</button>
              <button className="cup-switch" type="button" onClick={cycleCup} title={text.cups[cupStyle].label}><span className={`cup-symbol ${cupStyle}`} aria-hidden="true" />{text.changeCup}<small>{text.cups[cupStyle].shortLabel}</small></button>
            </>}
            {connected && replay.length > 0 && (
              <button className="replay-action" type="button" onClick={() => { dismissPetMenu(); setFrame(0); setPlaying(true); }}>
                <span aria-hidden="true">▶</span>
                {text.replay}
              </button>
            )}
            <button className="statistics-action" type="button" onClick={() => { dismissPetMenu(); setSettingsOpen(false); setStatisticsOpen(true); }}>
              <span aria-hidden="true">▥</span>
              {text.statistics}
            </button>
            <button className="settings-action" type="button" onClick={() => { dismissPetMenu(); setStatisticsOpen(false); setSettingsOpen(true); }}>
              <span aria-hidden="true">⚙</span>
              {text.settings}
            </button>
          </div>
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
            <span
              className={`pet-sprite ${selfPlayback.displayedActivity} ${selfPlayback.displayedActivity === 'work' ? `work-${selfPlayback.displayedWorkVisual}` : ''} input-${selfPlayback.transition ? 'none' : visualInputKind} ${inputStressed && !selfPlayback.transition ? 'input-stressed' : ''} ${selfPlayback.transition ? 'transition-source-frame' : ''}`}
              aria-hidden="true"
              onAnimationIteration={selfPlayback.handleLoopBoundary}
            />
            {selfPlayback.transition && <span
              key={selfPlayback.transition.key}
              className={`pet-sprite activity-transition ${transitionAssetName(selfPlayback.transition)}`}
              aria-hidden="true"
              onAnimationEnd={() => selfPlayback.completeTransition(selfPlayback.transition!.key)}
            />}
          </button>
          {connected && <button
            className="pet-avatar partner-pet"
            type="button"
            aria-label={text.partnerPet(current?.label ?? text.partnerWaiting)}
            aria-expanded={petMenuOpen}
            aria-controls="pet-menu"
            onPointerEnter={revealPetMenu}
            onPointerLeave={hidePetMenuSoon}
            onClick={pinPetMenu}
            onFocus={revealPetMenu}
            onBlur={hidePetMenuSoon}
            onWheel={event => handlePetPinch(event, 'partner')}
          >
            <span
              className={`pet-sprite partner-sprite ${partnerPlayback.displayedActivity} ${partnerPlayback.displayedActivity === 'work' ? `work-${partnerPlayback.displayedWorkVisual}` : ''} input-none ${playing ? 'replaying' : ''} ${partnerPlayback.transition ? 'transition-source-frame' : ''}`}
              aria-hidden="true"
              onAnimationIteration={partnerPlayback.handleLoopBoundary}
            />
            {partnerPlayback.transition && <span
              key={partnerPlayback.transition.key}
              className={`pet-sprite partner-sprite activity-transition ${transitionAssetName(partnerPlayback.transition)}`}
              aria-hidden="true"
              onAnimationEnd={() => partnerPlayback.completeTransition(partnerPlayback.transition!.key)}
            />}
          </button>}
          {displayedGesture && <span className={`interaction-sprite ${displayedGesture.variant} target-${displayedGesture.target} cup-${displayedGesture.cupStyle ?? 'ceramic'} blanket-${displayedGesture.blanketStyle ?? preferences.blanketStyle}`} aria-hidden="true" />}
          {pendingCup && <span className={`waiting-cup target-${pendingCup.target} ${pendingCup.style}`} aria-label={text.water}><i /><i /></span>}
        </div>
        {notice && <div className="pet-toast" aria-live="polite">{notice}</div>}
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
          pairingBusy={pairingBusy || !pairingReady || revocationPending}
          inviteCode={inviteCode}
          joinCode={joinCode}
          safetyCode={safetyCode}
          onConfirmPairing={() => { void confirmPairing(); }}
          cupStyle={cupStyle}
          onChange={setPreferences}
          onCheckUpdate={() => { void runUpdateCheck(); }}
          onInstallUpdate={() => { void installPendingUpdate(); }}
          onFeedbackChange={value => { setFeedback(value); setFeedbackStatus(''); }}
          onFeedbackNicknameChange={value => { setFeedbackNickname(value); setFeedbackStatus(''); }}
          onShareFeedback={() => { void shareFeedback(); }}
          onCreatePairing={() => { void createPairing(); }}
          onCopyInvite={() => { void copyInvite(); }}
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
