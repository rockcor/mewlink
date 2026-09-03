import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { v4 as uuid } from 'uuid';
import { SettingsPanel, type UpdateViewState } from './components/SettingsPanel';
import type { ActivityKind, CupStyle, InteractionKind, PlainEvent, StoredEvent } from './domain/types';
import { cupStyles } from './domain/types';
import { activityProbe, classify, nextSampleDelay, type InputKind } from './platform/activity';
import { localUtcOffsetMinutes } from './platform/clock';
import { checkForUpdate } from './services/update';
import { listEvents } from './storage/events';
import { LoopbackTransport } from './services/mockTransport';
import { buildReplay } from './services/replay';
import { animationDurationScale, effectiveUtcOffsetMinutes, loadPreferences, savePreferences } from './settings/preferences';
import './styles.css';
import './pet.css';

const transport = new LoopbackTransport();
const cupOptions: Record<CupStyle, { label: string; shortLabel: string }> = {
  ceramic: { label: '樱粉陶瓷杯', shortLabel: '陶瓷杯' },
  tumbler: { label: '天空随行杯', shortLabel: '随行杯' },
  bottle: { label: '薄荷运动瓶', shortLabel: '运动瓶' }
};
const inputText: Record<InputKind, string> = { keyboard: '键盘输入 · 手部同步', pointer: '鼠标/触控板 · 手部同步', none: '' };
const statusText: Record<ActivityKind, string> = {
  coding: '在写代码',
  reading: '在阅读',
  meeting: '在开会',
  video: '在看视频',
  browsing: '在浏览',
  idle: '暂时离开',
  rest: '休息中'
};

export default function App() {
  const [activity, setActivity] = useState<ActivityKind>('browsing');
  const [inputKind, setInputKind] = useState<InputKind>('none');
  const [inputBeat, setInputBeat] = useState(0);
  const [previousPartnerActivity, setPreviousPartnerActivity] = useState<ActivityKind>();
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  const [gesture, setGesture] = useState<InteractionKind>();
  const [gestureCup, setGestureCup] = useState<CupStyle>('ceramic');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState(loadPreferences);
  const [updateState, setUpdateState] = useState<UpdateViewState>({ kind: 'idle', message: '尚未检查更新' });
  const [feedback, setFeedback] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState('');
  const [cupStyle, setCupStyle] = useState<CupStyle>(() => {
    const saved = window.localStorage.getItem('mewlink.cupStyle');
    return cupStyles.includes(saved as CupStyle) ? saved as CupStyle : 'ceramic';
  });
  const [notice, setNotice] = useState('单击拥抱 · 双击喝水');
  const clickTimer = useRef<number | undefined>(undefined);
  const gestureTimer = useRef<number | undefined>(undefined);
  const noticeTimer = useRef<number | undefined>(undefined);
  const partnerActivityRef = useRef<ActivityKind>('rest');
  const receiverUtcOffsetMinutes = effectiveUtcOffsetMinutes(preferences);
  const partnerUtcOffsetMinutes = useMemo(() => [...events].reverse().find(({ event }) => event.senderUtcOffsetMinutes !== undefined)?.event.senderUtcOffsetMinutes, [events]);
  const durationScale = animationDurationScale(preferences.animationSpeed);
  const replay = useMemo(
    () => preferences.replayEnabled ? buildReplay(events, receiverUtcOffsetMinutes, preferences.timezoneMode !== 'off') : [],
    [events, preferences.replayEnabled, preferences.timezoneMode, receiverUtcOffsetMinutes]
  );
  const current = playing ? replay[frame] : undefined;
  const partnerActivity = current?.activity ?? 'rest';
  const motionStyle = useMemo(() => ({
    '--pet-breathe-duration': `${Math.round(3_600 * durationScale)}ms`,
    '--pet-type-duration': `${Math.round(1_100 * durationScale)}ms`,
    '--pet-read-duration': `${Math.round(3_100 * durationScale)}ms`,
    '--pet-meeting-duration': `${Math.round(2_500 * durationScale)}ms`,
    '--pet-video-duration': `${Math.round(2_900 * durationScale)}ms`,
    '--pet-browse-duration': `${Math.round(3_200 * durationScale)}ms`,
    '--pet-rest-duration': `${Math.round(4_300 * durationScale)}ms`,
    '--pet-idle-duration': `${Math.round(3_800 * durationScale)}ms`,
    '--interaction-duration': `${Math.round(1_900 * durationScale)}ms`
  }) as CSSProperties, [durationScale]);

  const runUpdateCheck = useCallback(async () => {
    setUpdateState({ kind: 'checking', message: '正在检查…' });
    try {
      const result = await checkForUpdate();
      setUpdateState(result.available
        ? { kind: 'available', message: `发现新版本 ${result.manifest.version}`, downloadUrl: result.manifest.downloadUrl }
        : { kind: 'current', message: `已是最新版 ${result.currentVersion}` });
    } catch {
      setUpdateState({ kind: 'error', message: '暂时无法检查，请稍后再试' });
    }
  }, []);

  useEffect(() => { void listEvents().then(setEvents); }, []);
  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;
    const sample = async () => {
      const signal = await activityProbe.sample();
      if (stopped) return;
      const nextInputKind = signal.inputKind ?? 'none';
      setInputKind(currentInput => currentInput === nextInputKind ? currentInput : nextInputKind);
      if (nextInputKind !== 'none') setInputBeat(currentBeat => currentBeat + 1);
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
  useEffect(() => { window.localStorage.setItem('mewlink.cupStyle', cupStyle); }, [cupStyle]);
  useEffect(() => { savePreferences(preferences); }, [preferences]);
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
    const previous = partnerActivityRef.current;
    if (previous === partnerActivity) return;
    partnerActivityRef.current = partnerActivity;
    setPreviousPartnerActivity(previous);
    const timer = window.setTimeout(() => setPreviousPartnerActivity(undefined), 420);
    return () => window.clearTimeout(timer);
  }, [partnerActivity]);
  useEffect(() => () => {
    window.clearTimeout(clickTimer.current);
    window.clearTimeout(gestureTimer.current);
    window.clearTimeout(noticeTimer.current);
  }, []);

  function showGesture(action: InteractionKind, message: string, selectedCup: CupStyle = cupStyle) {
    window.clearTimeout(gestureTimer.current);
    window.clearTimeout(noticeTimer.current);
    setGesture(action);
    setGestureCup(selectedCup);
    setNotice(message);
    gestureTimer.current = window.setTimeout(() => setGesture(undefined), Math.round(1_900 * durationScale));
    noticeTimer.current = window.setTimeout(() => setNotice('单击拥抱 · 双击喝水'), Math.round(2_800 * durationScale));
  }

  async function send(action: InteractionKind) {
    const event: PlainEvent = {
      id: uuid(),
      version: 1,
      relationshipId: 'demo-couple',
      senderDeviceId: 'my-device',
      createdAt: new Date().toISOString(),
      senderUtcOffsetMinutes: localUtcOffsetMinutes(),
      kind: 'interaction',
      payload: { action, ...(action === 'water' ? { cupStyle } : {}) }
    };
    try {
      const received = await transport.send(event, { muted: false, focusMode: false, minIntervalMs: 800 });
      setEvents(currentEvents => [...currentEvents, received]);
      showGesture(action, action === 'hug' ? '拥抱已送出' : `${cupOptions[cupStyle].label}已送出`, cupStyle);
    } catch {
      setNotice('暂时没有送出去');
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
    setNotice(`已换成${cupOptions[next].label}`);
    noticeTimer.current = window.setTimeout(() => setNotice('单击拥抱 · 双击喝水'), Math.round(2_800 * durationScale));
  }

  async function shareFeedback() {
    const message = feedback.trim();
    if (!message) return;
    const shareText = `MewLink 反馈\n\n${message}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'MewLink 反馈', text: shareText });
        setFeedbackStatus('谢谢，反馈已分享');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        setFeedbackStatus('反馈已复制，可以粘贴发送');
      } else {
        setFeedbackStatus('请复制上面的反馈内容');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setFeedbackStatus('暂时无法打开分享，请稍后再试');
    }
  }

  const displayedGesture = gesture ?? current?.interaction;
  const displayedCup = gesture ? gestureCup : (current?.cupStyle ?? cupStyle);

  return (
    <main className="desktop-pet" style={motionStyle}>
      <section className={`pet-zone ${settingsOpen ? 'settings-open' : ''}`} aria-label="MewLink 双人桌面宠物">
        <div className="hover-ui">
          <div className="status-row" aria-live="polite">
            <div className="status-pill self-status">
              <span>●</span>
              <span className="status-copy"><b>我 · {statusText[activity]}</b>{inputText[inputKind] && <small>{inputText[inputKind]}</small>}</span>
            </div>
            <div className="status-pill partner-status">
              <span>{current?.icon ?? '○'}</span>
              <span className="status-copy">
                <b>TA · {current?.label ?? '等待同步'}</b>
                {current?.clockLabel && <small>{current.clockLabel}</small>}
              </span>
            </div>
          </div>
          <div className="quick-actions" aria-label="给 TA 一个小动作">
            <button type="button" onClick={() => { void send('hug'); }}><span aria-hidden="true">🫂</span>拥抱</button>
            <button type="button" onClick={() => { void send('water'); }}><span className={`cup-symbol ${cupStyle}`} aria-hidden="true" />喝水</button>
            <button className="cup-switch" type="button" onClick={cycleCup} title={cupOptions[cupStyle].label}><span className={`cup-symbol ${cupStyle}`} aria-hidden="true" />换杯<small>{cupOptions[cupStyle].shortLabel}</small></button>
            {replay.length > 0 && (
              <button className="replay-action" type="button" onClick={() => { setFrame(0); setPlaying(true); }}>
                <span aria-hidden="true">▶</span>
                回放
              </button>
            )}
            <button className="settings-action" type="button" onClick={() => setSettingsOpen(true)}>
              <span aria-hidden="true">⚙</span>
              设置
            </button>
          </div>
        </div>

        <div className="drag-handle" data-tauri-drag-region aria-label="拖动桌宠">•••</div>
        <div className={`pet-pair ${displayedGesture ? 'interacting' : ''}`}>
          <div className="pet-avatar self-pet" aria-label={`我的宠物：${statusText[activity]}`}>
            <span className="identity-badge">我</span>
            <span className={`pet-sprite ${activity} input-${inputKind}`} aria-hidden="true" />
            <span className={`input-action ${inputKind}`} aria-hidden="true">
              <i key={`${inputKind}-${inputBeat}`} className={`input-action-frame current ${inputKind} beat-${inputBeat % 2}`}/>
              <i key={`${inputKind}-${inputBeat - 1}`} className={`input-action-frame previous ${inputKind} beat-${(inputBeat + 1) % 2}`}/>
            </span>
          </div>
          <button
            className="pet-avatar partner-pet"
            type="button"
            aria-label={`TA 的宠物：${current?.label ?? '等待同步'}。单击发送拥抱，双击提醒喝水`}
            onClick={handlePetClick}
            onDoubleClick={handlePetDoubleClick}
          >
            <span className="identity-badge">TA</span>
            {previousPartnerActivity && <span className={`pet-sprite partner-sprite state-leaving ${previousPartnerActivity}`} aria-hidden="true" />}
            <span className={`pet-sprite partner-sprite ${previousPartnerActivity ? 'state-entering' : ''} ${partnerActivity} ${playing ? 'replaying' : ''}`} aria-hidden="true" />
          </button>
          {displayedGesture && <span className={`interaction-sprite ${displayedGesture} ${displayedCup}`} aria-hidden="true" />}
        </div>
        <div className="shortcut-hint" aria-live="polite">{notice}</div>
        {settingsOpen && <SettingsPanel
          preferences={preferences}
          localUtcOffsetMinutes={receiverUtcOffsetMinutes}
          partnerUtcOffsetMinutes={partnerUtcOffsetMinutes}
          updateState={updateState}
          feedback={feedback}
          feedbackStatus={feedbackStatus}
          onChange={setPreferences}
          onCheckUpdate={() => { void runUpdateCheck(); }}
          onFeedbackChange={value => { setFeedback(value); setFeedbackStatus(''); }}
          onShareFeedback={() => { void shareFeedback(); }}
          onClose={() => setSettingsOpen(false)}
        />}
      </section>
    </main>
  );
}
