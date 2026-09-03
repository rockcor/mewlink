import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import type { ActivityKind, CupStyle, InteractionKind, PlainEvent, StoredEvent } from './domain/types';
import { cupStyles } from './domain/types';
import { activityProbe, classify, nextSampleDelay, type InputKind } from './platform/activity';
import { localUtcOffsetMinutes } from './platform/clock';
import { listEvents } from './storage/events';
import { LoopbackTransport } from './services/mockTransport';
import { buildReplay } from './services/replay';
import './styles.css';
import './pet.css';

const transport = new LoopbackTransport();
const cupOptions: Record<CupStyle, { label: string; shortLabel: string }> = {
  ceramic: { label: '樱粉陶瓷杯', shortLabel: '陶瓷杯' },
  tumbler: { label: '天空随行杯', shortLabel: '随行杯' },
  bottle: { label: '薄荷运动瓶', shortLabel: '运动瓶' }
};
const inputText: Record<InputKind, string> = { keyboard: '键盘同步', pointer: '鼠标/触控板同步', none: '' };
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
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  const [gesture, setGesture] = useState<InteractionKind>();
  const [gestureCup, setGestureCup] = useState<CupStyle>('ceramic');
  const [cupStyle, setCupStyle] = useState<CupStyle>(() => {
    const saved = window.localStorage.getItem('mewlink.cupStyle');
    return cupStyles.includes(saved as CupStyle) ? saved as CupStyle : 'ceramic';
  });
  const [notice, setNotice] = useState('单击拥抱 · 双击喝水');
  const clickTimer = useRef<number | undefined>(undefined);
  const gestureTimer = useRef<number | undefined>(undefined);
  const noticeTimer = useRef<number | undefined>(undefined);
  const replay = useMemo(() => buildReplay(events), [events]);

  useEffect(() => { void listEvents().then(setEvents); }, []);
  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;
    const sample = async () => {
      const signal = await activityProbe.sample();
      if (stopped) return;
      setInputKind(currentInput => currentInput === (signal.inputKind ?? 'none') ? currentInput : (signal.inputKind ?? 'none'));
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
  useEffect(() => {
    if (!playing || !replay.length) return;
    const timer = window.setInterval(() => {
      setFrame(current => current + 1 >= replay.length ? (setPlaying(false), 0) : current + 1);
    }, 1_200);
    return () => clearInterval(timer);
  }, [playing, replay.length]);
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
    gestureTimer.current = window.setTimeout(() => setGesture(undefined), 1_400);
    noticeTimer.current = window.setTimeout(() => setNotice('单击拥抱 · 双击喝水'), 2_200);
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
    noticeTimer.current = window.setTimeout(() => setNotice('单击拥抱 · 双击喝水'), 2_200);
  }

  const current = playing ? replay[frame] : undefined;
  const partnerActivity = current?.activity ?? 'rest';
  const displayedGesture = gesture ?? current?.interaction;
  const displayedCup = gesture ? gestureCup : (current?.cupStyle ?? cupStyle);

  return (
    <main className="desktop-pet">
      <section className="pet-zone" aria-label="MewLink 双人桌面宠物">
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
          </div>
        </div>

        <div className="drag-handle" data-tauri-drag-region aria-label="拖动桌宠">•••</div>
        <div className={`pet-pair ${displayedGesture ? 'interacting' : ''}`}>
          <div className="pet-avatar self-pet" aria-label={`我的宠物：${statusText[activity]}`}>
            <span className="identity-badge">我</span>
            <span className={`pet-sprite ${activity} input-${inputKind}`} aria-hidden="true" />
          </div>
          <button
            className="pet-avatar partner-pet"
            type="button"
            aria-label={`TA 的宠物：${current?.label ?? '等待同步'}。单击发送拥抱，双击提醒喝水`}
            onClick={handlePetClick}
            onDoubleClick={handlePetDoubleClick}
          >
            <span className="identity-badge">TA</span>
            <span className={`pet-sprite partner-sprite ${partnerActivity} ${playing ? 'replaying' : ''}`} aria-hidden="true" />
          </button>
          {displayedGesture && <span className={`interaction-sprite ${displayedGesture} ${displayedCup}`} aria-hidden="true" />}
        </div>
        <div className="shortcut-hint" aria-live="polite">{notice}</div>
      </section>
    </main>
  );
}
