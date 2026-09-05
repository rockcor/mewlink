import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { v4 as uuid } from 'uuid';
import { SettingsPanel, type UpdateViewState } from './components/SettingsPanel';
import type { ActivityKind, BlanketStyle, CupStyle, InteractionKind, InteractionPayload, PlainEvent, StoredEvent, WorkVisual } from './domain/types';
import { cupStyles } from './domain/types';
import {
  clearPairing,
  createPairingState,
  joinPairingState,
  loadPairing,
  pairingInviteCode,
  pairingSafetyCode,
  savePairing,
  type PairingState,
} from './pairing/pairing';
import { activityProbe, classify, inputChangesForSequence, inputProbe, nextSampleDelay, POINTER_ANIMATION_HOLD_MS, POINTER_EVENTS_PER_ANIMATION, pointerEventsForSequence, shouldAnimatePointer, visualInputForActivity, workVisualFor, type InputSignal } from './platform/activity';
import { ACTIVITY_TRANSITION_MS, gestureFor, waterDrinkDelay, type GestureVariant } from './pet/interaction';
import { localUtcOffsetMinutes } from './platform/clock';
import { registerPairCreator, registerPairJoiner, sendEncryptedEvent, syncEncryptedEvents } from './services/relayTransport';
import { checkForUpdate } from './services/update';
import { listEvents, putEvent } from './storage/events';
import { buildReplay } from './services/replay';
import { animationDurationScale, effectiveUtcOffsetMinutes, loadPreferences, savePreferences } from './settings/preferences';
import { appCopy } from './i18n';
import './styles.css';
import './pet.css';

const windowPositionKey = 'mewlink.windowPosition.v1';
const pendingCupKey = 'mewlink.pendingCup.v1';
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
  const [activity, setActivity] = useState<ActivityKind>('work');
  const [workVisual, setWorkVisual] = useState<WorkVisual>('web');
  const [keyboardPressed, setKeyboardPressed] = useState(false);
  const [pointerPressed, setPointerPressed] = useState(false);
  const [selfTransition, setSelfTransition] = useState<{ from: ActivityKind; to: ActivityKind }>();
  const [partnerTransition, setPartnerTransition] = useState<{ from: ActivityKind; to: ActivityKind }>();
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  const [gesture, setGesture] = useState<{ variant: GestureVariant; target: 'self' | 'partner'; cupStyle?: CupStyle; blanketStyle?: BlanketStyle }>();
  const [pendingCup, setPendingCup] = useState(loadPendingCup);
  const [sizeMenu, setSizeMenu] = useState<'self' | 'partner'>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState(loadPreferences);
  const text = appCopy[preferences.language];
  const [updateState, setUpdateState] = useState<UpdateViewState>({ kind: 'idle', message: text.updateUnchecked });
  const [feedback, setFeedback] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState('');
  const [pairing, setPairing] = useState<PairingState | undefined>(() => loadPairing());
  const connected = Boolean(pairing?.partnerDeviceId);
  const [pairingStatus, setPairingStatus] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [safetyCode, setSafetyCode] = useState('');
  const [cupStyle, setCupStyle] = useState<CupStyle>(() => {
    const saved = window.localStorage.getItem('mewlink.cupStyle');
    return cupStyles.includes(saved as CupStyle) ? saved as CupStyle : 'ceramic';
  });
  const [notice, setNotice] = useState(() => pairing?.partnerDeviceId ? text.shortcut : text.soloShortcut);
  const clickTimer = useRef<number | undefined>(undefined);
  const gestureTimer = useRef<number | undefined>(undefined);
  const noticeTimer = useRef<number | undefined>(undefined);
  const selfActivityRef = useRef<ActivityKind>('work');
  const partnerActivityRef = useRef<ActivityKind>('rest');
  const pairingRef = useRef<PairingState | undefined>(pairing);
  const incomingInteractionRef = useRef<(action: InteractionKind, cup?: CupStyle, blanket?: BlanketStyle) => void>(() => undefined);
  const receiverUtcOffsetMinutes = effectiveUtcOffsetMinutes(preferences);
  const partnerUtcOffsetMinutes = useMemo(() => [...events].reverse().find(({ direction, event }) => direction === 'in' && event.senderUtcOffsetMinutes !== undefined)?.event.senderUtcOffsetMinutes, [events]);
  const inviteCode = pairing && !pairing.partnerDeviceId ? pairingInviteCode(pairing) : '';
  const durationScale = animationDurationScale(preferences.animationSpeed);
  const replay = useMemo(
    () => preferences.replayEnabled ? buildReplay(events, receiverUtcOffsetMinutes, preferences.timezoneMode !== 'off', preferences.language) : [],
    [events, preferences.language, preferences.replayEnabled, preferences.timezoneMode, receiverUtcOffsetMinutes]
  );
  const current = playing ? replay[frame] : undefined;
  const partnerActivity = current?.activity ?? 'rest';
  const visualInputKind = visualInputForActivity(activity, keyboardPressed, pointerPressed);
  const defaultNotice = connected ? text.shortcut : text.soloShortcut;
  const motionStyle = useMemo(() => ({
    '--self-pet-scale': String(preferences.selfPetScalePercent / 100),
    '--partner-pet-scale': String(preferences.partnerPetScalePercent / 100),
    '--pet-breathe-duration': `${Math.round(3_600 * durationScale)}ms`,
    '--pet-read-duration': `${Math.round(3_100 * durationScale)}ms`,
    '--pet-meeting-duration': `${Math.round(2_500 * durationScale)}ms`,
    '--pet-video-duration': `${Math.round(2_900 * durationScale)}ms`,
    '--pet-browse-duration': `${Math.round(3_200 * durationScale)}ms`,
    '--pet-rest-duration': `${Math.round(4_300 * durationScale)}ms`,
    '--pet-idle-duration': `${Math.round(3_800 * durationScale)}ms`,
    '--interaction-duration': `${Math.round(3_200 * durationScale)}ms`,
    '--activity-transition-duration': `${Math.round(ACTIVITY_TRANSITION_MS * durationScale)}ms`
  }) as CSSProperties, [durationScale, preferences.partnerPetScalePercent, preferences.selfPetScalePercent]);

  const runUpdateCheck = useCallback(async () => {
    setUpdateState({ kind: 'checking', message: text.updateChecking });
    try {
      const result = await checkForUpdate();
      setUpdateState(result.available
        ? { kind: 'available', message: text.updateAvailable(result.manifest.version), downloadUrl: result.manifest.downloadUrl }
        : { kind: 'current', message: text.updateCurrent(result.currentVersion) });
    } catch {
      setUpdateState({ kind: 'error', message: text.updateError });
    }
  }, [text]);

  const persistPairing = useCallback((next: PairingState) => {
    pairingRef.current = next;
    savePairing(next);
    setPairing(next);
  }, []);

  useEffect(() => { void listEvents().then(setEvents); }, []);
  useEffect(() => {
    if (!isTauriWindow) return;
    const appWindow = getCurrentWindow();
    let active = true;
    let unlisten: (() => void) | undefined;
    const setup = async () => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(windowPositionKey) ?? 'null') as { x?: unknown; y?: unknown } | null;
        if (saved && typeof saved.x === 'number' && Number.isFinite(saved.x) && typeof saved.y === 'number' && Number.isFinite(saved.y)) {
          await appWindow.setPosition(new PhysicalPosition(saved.x, saved.y));
        }
        const stopListening = await appWindow.onMoved(({ payload }) => {
          window.localStorage.setItem(windowPositionKey, JSON.stringify({ x: payload.x, y: payload.y }));
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
        const active = pairingRef.current;
        if (!active) return;
        const result = await syncEncryptedEvents(active);
        if (stopped) return;
        if (result.state.partnerDeviceId !== active.partnerDeviceId || result.state.relayCursor !== active.relayCursor || result.received.length) {
          persistPairing(result.state);
        }
        setPairingStatus(result.state.partnerDeviceId ? text.connected : text.waitingForInvite);
        for (const stored of result.received) {
          await putEvent(stored);
          setEvents(currentEvents => currentEvents.some(item => item.event.id === stored.event.id) ? currentEvents : [...currentEvents, stored]);
          if (stored.event.kind === 'interaction') {
            const payload = stored.event.payload as InteractionPayload;
            incomingInteractionRef.current(payload.action, payload.cupStyle, payload.blanketStyle);
          }
        }
      } catch {
        if (!stopped) setPairingStatus(text.connectionRetry);
      } finally {
        running = false;
      }
    };
    void sync();
    const timer = window.setInterval(() => { void sync(); }, 2_500);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [pairing?.relationshipId, pairing?.deviceId, persistPairing, text]);
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
    let lastPointerAnimationAt = Number.NEGATIVE_INFINITY;
    let pendingPointerEvents = 0;
    let lastPointerEventAt = Number.NEGATIVE_INFINITY;
    let stopped = false;
    let previous: InputSignal | undefined;
    const sample = async () => {
      const signal = await inputProbe.sample();
      if (stopped) return;
      if (previous) {
        const changes = inputChangesForSequence(previous, signal);
        if (changes.keyboard) {
          setKeyboardPressed(current => !current);
          window.clearTimeout(keyboardReleaseTimer);
          keyboardReleaseTimer = window.setTimeout(() => setKeyboardPressed(false), 110);
        }
        const now = performance.now();
        if (changes.pointer) {
          if (now - lastPointerEventAt > 260) pendingPointerEvents = 0;
          pendingPointerEvents += pointerEventsForSequence(previous, signal);
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
    };
  }, []);
  useEffect(() => { window.localStorage.setItem('mewlink.cupStyle', cupStyle); }, [cupStyle]);
  useEffect(() => {
    if (pendingCup) window.localStorage.setItem(pendingCupKey, JSON.stringify(pendingCup));
    else window.localStorage.removeItem(pendingCupKey);
  }, [pendingCup]);
  useEffect(() => { savePreferences(preferences); }, [preferences]);
  useEffect(() => {
    setNotice(defaultNotice);
    setUpdateState(currentState => currentState.kind === 'idle' ? { ...currentState, message: text.updateUnchecked } : currentState);
    setPairingStatus(currentStatus => currentStatus ? (pairingRef.current?.partnerDeviceId ? text.connected : pairingRef.current ? text.waitingForInvite : '') : currentStatus);
  }, [defaultNotice, text]);
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
    const previous = selfActivityRef.current;
    if (previous === activity) return;
    selfActivityRef.current = activity;
    setSelfTransition({ from: previous, to: activity });
    const timer = window.setTimeout(() => setSelfTransition(undefined), Math.round(ACTIVITY_TRANSITION_MS * durationScale));
    return () => window.clearTimeout(timer);
  }, [activity, durationScale]);
  useEffect(() => {
    const previous = partnerActivityRef.current;
    if (previous === partnerActivity) return;
    partnerActivityRef.current = partnerActivity;
    setPartnerTransition({ from: previous, to: partnerActivity });
    const timer = window.setTimeout(() => setPartnerTransition(undefined), Math.round(ACTIVITY_TRANSITION_MS * durationScale));
    return () => window.clearTimeout(timer);
  }, [durationScale, partnerActivity]);
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
    window.clearTimeout(clickTimer.current);
    window.clearTimeout(gestureTimer.current);
    window.clearTimeout(noticeTimer.current);
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
    noticeTimer.current = window.setTimeout(() => setNotice(defaultNotice), Math.round(2_800 * durationScale));
  }

  incomingInteractionRef.current = (action, incomingCup, incomingBlanket) => {
    showGesture(action, action === 'hug' ? text.incomingHug : text.incomingWater, 'self', {
      cupStyle: incomingCup,
      blanketStyle: incomingBlanket,
      receiverActivity: activity
    });
  };

  async function createPairing() {
    setPairingStatus(text.creatingInvite);
    try {
      const next = await createPairingState();
      await registerPairCreator(next);
      persistPairing(next);
      setPairingStatus(text.waitingForInvite);
    } catch {
      setPairingStatus(text.createInviteError);
    }
  }

  async function joinPairing() {
    setPairingStatus(text.connecting);
    try {
      const next = joinPairingState(joinCode);
      await registerPairJoiner(next);
      persistPairing(next);
      setJoinCode('');
      setPairingStatus(text.connected);
    } catch {
      setPairingStatus(text.connectError);
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setPairingStatus(text.inviteCopied);
    } catch {
      setPairingStatus(text.inviteCopyError);
    }
  }

  function disconnectPairing() {
    clearPairing();
    pairingRef.current = undefined;
    setPairing(undefined);
    setPairingStatus(text.disconnected);
    setJoinCode('');
    setNotice(text.soloShortcut);
  }

  async function send(action: InteractionKind) {
    const active = pairingRef.current;
    if (!active?.partnerDeviceId) {
      setSettingsOpen(true);
      setPairingStatus(text.pairFirst);
      return;
    }
    const event: PlainEvent = {
      id: uuid(),
      version: 1,
      relationshipId: active.relationshipId,
      senderDeviceId: active.deviceId,
      createdAt: new Date().toISOString(),
      senderUtcOffsetMinutes: localUtcOffsetMinutes(),
      kind: 'interaction',
      payload: { action, ...(action === 'water' ? { cupStyle } : { blanketStyle: preferences.blanketStyle }) }
    };
    try {
      const result = await sendEncryptedEvent(active, event);
      persistPairing(result.state);
      await putEvent(result.stored);
      setEvents(currentEvents => [...currentEvents, result.stored]);
      showGesture(action, action === 'hug' ? text.hugSent : text.cupSent(text.cups[cupStyle].label), 'partner', {
        cupStyle,
        blanketStyle: preferences.blanketStyle,
        receiverActivity: partnerActivity
      });
    } catch {
      setNotice(text.sendError);
    }
  }

  function handlePetClick() {
    window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => { void send('hug'); }, 240);
  }

  function handlePetDoubleClick() {
    window.clearTimeout(clickTimer.current);
    void send('water');
  }

  function cycleCup() {
    const next = cupStyles[(cupStyles.indexOf(cupStyle) + 1) % cupStyles.length];
    setCupStyle(next);
    window.clearTimeout(noticeTimer.current);
    setNotice(text.cupChanged(text.cups[next].label));
    noticeTimer.current = window.setTimeout(() => setNotice(defaultNotice), Math.round(2_800 * durationScale));
  }

  function startPetDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !isTauriWindow) return;
    event.preventDefault();
    void getCurrentWindow().startDragging();
  }

  function openSizeMenu(event: ReactMouseEvent, target: 'self' | 'partner') {
    event.preventDefault();
    event.stopPropagation();
    setSizeMenu(target);
  }

  function adjustPetSize(target: 'self' | 'partner', delta: number) {
    const key = target === 'self' ? 'selfPetScalePercent' : 'partnerPetScalePercent';
    setPreferences(currentPreferences => ({
      ...currentPreferences,
      [key]: Math.min(110, Math.max(70, currentPreferences[key] + delta))
    }));
  }

  async function shareFeedback() {
    const message = feedback.trim();
    if (!message) return;
    const shareText = `${text.feedbackTitle}\n\n${message}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: text.feedbackTitle, text: shareText });
        setFeedbackStatus(text.feedbackShared);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        setFeedbackStatus(text.feedbackCopied);
      } else {
        setFeedbackStatus(text.feedbackCopy);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setFeedbackStatus(text.feedbackError);
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
      <section className={`pet-zone ${settingsOpen ? 'settings-open' : ''}`} aria-label={connected ? text.petZone : text.soloPetZone} lang={preferences.language === 'zh' ? 'zh-CN' : 'en'}>
        <div className="hover-ui">
          <div className="status-row" aria-live="polite">
            <div className="status-pill self-status">
              <span>●</span>
              <span className="status-copy"><b>{text.me} · {text.status[activity]}</b>{text.input[visualInputKind] && <small>{text.input[visualInputKind]}</small>}</span>
            </div>
            {connected && <div className="status-pill partner-status">
              <span>{current?.icon ?? '○'}</span>
              <span className="status-copy">
                <b>{preferences.language === 'zh' ? 'TA' : 'Partner'} · {current?.label ?? text.partnerWaiting}</b>
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
              <button className="replay-action" type="button" onClick={() => { setFrame(0); setPlaying(true); }}>
                <span aria-hidden="true">▶</span>
                {text.replay}
              </button>
            )}
            <button className="settings-action" type="button" onClick={() => setSettingsOpen(true)}>
              <span aria-hidden="true">⚙</span>
              {text.settings}
            </button>
          </div>
        </div>

        <div className="drag-handle" data-tauri-drag-region aria-label={text.drag}>•••</div>
        <div className={`pet-pair ${connected ? 'paired' : 'solo'} ${displayedGesture ? `interacting target-${displayedGesture.target} interaction-${displayedGesture.variant.startsWith('hug') ? 'hug' : 'water'}` : ''}`}>
          <div className="pet-avatar self-pet" aria-label={text.myPet(text.status[activity])} onPointerDown={startPetDrag} onContextMenu={event => openSizeMenu(event, 'self')}>
            <span className="identity-badge">{text.me}</span>
            {selfTransition
              ? <span className={`pet-sprite activity-transition transition-${selfTransition.from}-${selfTransition.to}`} aria-hidden="true" />
              : <span className={`pet-sprite ${activity} ${activity === 'work' ? `work-${workVisual}` : ''} input-${visualInputKind}`} aria-hidden="true" />}
          </div>
          {connected && <button
            className="pet-avatar partner-pet"
            type="button"
            aria-label={text.partnerPet(current?.label ?? text.partnerWaiting)}
            onClick={handlePetClick}
            onDoubleClick={handlePetDoubleClick}
            onContextMenu={event => openSizeMenu(event, 'partner')}
          >
            <span className="identity-badge">TA</span>
            {partnerTransition
              ? <span className={`pet-sprite partner-sprite activity-transition transition-${partnerTransition.from}-${partnerTransition.to}`} aria-hidden="true" />
              : <span className={`pet-sprite partner-sprite ${partnerActivity} ${partnerActivity === 'work' ? 'work-web' : ''} ${playing ? 'replaying' : ''}`} aria-hidden="true" />}
          </button>}
          {displayedGesture && <span className={`interaction-sprite ${displayedGesture.variant} target-${displayedGesture.target} cup-${displayedGesture.cupStyle ?? 'ceramic'} blanket-${displayedGesture.blanketStyle ?? preferences.blanketStyle}`} aria-hidden="true" />}
          {pendingCup && <span className={`waiting-cup target-${pendingCup.target} ${pendingCup.style}`} aria-label={text.water}><i /><i /></span>}
          {sizeMenu && <div className={`pet-size-menu target-${sizeMenu}`} role="dialog" aria-label={preferences.language === 'zh' ? '调整宠物大小' : 'Resize companion'} onPointerDown={event => event.stopPropagation()}>
            <button type="button" onClick={() => adjustPetSize(sizeMenu, -5)} aria-label="−">−</button>
            <output>{preferences[sizeMenu === 'self' ? 'selfPetScalePercent' : 'partnerPetScalePercent']}%</output>
            <button type="button" onClick={() => adjustPetSize(sizeMenu, 5)} aria-label="+">+</button>
            <button type="button" className="size-menu-close" onClick={() => setSizeMenu(undefined)} aria-label={preferences.language === 'zh' ? '关闭' : 'Close'}>×</button>
          </div>}
        </div>
        <div className="shortcut-hint" aria-live="polite">{notice}</div>
        {settingsOpen && <SettingsPanel
          preferences={preferences}
          localUtcOffsetMinutes={receiverUtcOffsetMinutes}
          partnerUtcOffsetMinutes={partnerUtcOffsetMinutes}
          updateState={updateState}
          feedback={feedback}
          feedbackStatus={feedbackStatus}
          pairing={pairing}
          pairingStatus={pairingStatus}
          inviteCode={inviteCode}
          joinCode={joinCode}
          safetyCode={safetyCode}
          cupStyle={cupStyle}
          onChange={setPreferences}
          onCheckUpdate={() => { void runUpdateCheck(); }}
          onFeedbackChange={value => { setFeedback(value); setFeedbackStatus(''); }}
          onShareFeedback={() => { void shareFeedback(); }}
          onCreatePairing={() => { void createPairing(); }}
          onCopyInvite={() => { void copyInvite(); }}
          onJoinCodeChange={setJoinCode}
          onJoinPairing={() => { void joinPairing(); }}
          onDisconnect={disconnectPairing}
          onCupStyleChange={setCupStyle}
          onClose={() => setSettingsOpen(false)}
        />}
      </section>
    </main>
  );
}
