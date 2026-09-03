import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import type { ActivityKind, InteractionKind, PlainEvent, StoredEvent } from './domain/types';
import { activityProbe, classify } from './platform/activity';
import { listEvents } from './storage/events';
import { LoopbackTransport } from './services/mockTransport';
import { buildReplay } from './services/replay';
import './styles.css';
import './pet.css';

const transport = new LoopbackTransport();
const interactions: { kind: InteractionKind; icon: string; label: string }[] = [
  { kind: 'hug', icon: '🫂', label: '拥抱' },
  { kind: 'water', icon: '💧', label: '喝水' }
];
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
  const [activity, setActivity] = useState<ActivityKind>('coding');
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  const [gesture, setGesture] = useState<InteractionKind>();
  const [notice, setNotice] = useState('单击拥抱 · 双击喝水');
  const clickTimer = useRef<number | undefined>(undefined);
  const gestureTimer = useRef<number | undefined>(undefined);
  const noticeTimer = useRef<number | undefined>(undefined);
  const replay = useMemo(() => buildReplay(events), [events]);

  useEffect(() => { void listEvents().then(setEvents); }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      void activityProbe.sample().then(signal => setActivity(classify(signal)));
    }, 3_000);
    return () => clearInterval(timer);
  }, []);
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

  function showGesture(action: InteractionKind, message: string) {
    window.clearTimeout(gestureTimer.current);
    window.clearTimeout(noticeTimer.current);
    setGesture(action);
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
      kind: 'interaction',
      payload: { action }
    };
    try {
      const received = await transport.send(event, { muted: false, focusMode: false, minIntervalMs: 800 });
      setEvents(currentEvents => [...currentEvents, received]);
      showGesture(action, action === 'hug' ? '拥抱已送出' : '喝水提醒已送出');
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

  const current = playing ? replay[frame] : undefined;
  const displayedActivity = current?.activity ?? activity;
  const displayedGesture = gesture ?? current?.interaction;

  return (
    <main className="desktop-pet">
      <section className="pet-zone" aria-label="MewLink 桌面宠物">
        <div className="hover-ui">
          <div className="status-pill" aria-live="polite">
            <span>{current?.icon ?? '●'}</span>
            <b>{current?.label ?? statusText[displayedActivity]}</b>
          </div>
          <div className="quick-actions" aria-label="给 TA 一个小动作">
            {interactions.map(item => (
              <button key={item.kind} type="button" onClick={() => { void send(item.kind); }}>
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </button>
            ))}
            {replay.length > 0 && (
              <button className="replay-action" type="button" onClick={() => { setFrame(0); setPlaying(true); }}>
                <span aria-hidden="true">▶</span>
                回放
              </button>
            )}
          </div>
        </div>

        <div className="drag-handle" data-tauri-drag-region aria-label="拖动桌宠">•••</div>
        <button
          className="pet-hitbox"
          type="button"
          aria-label={`${statusText[displayedActivity]}。单击发送拥抱，双击提醒喝水`}
          onClick={handlePetClick}
          onDoubleClick={handlePetDoubleClick}
        >
          <span className={`pet-sprite ${displayedActivity} ${playing ? 'replaying' : ''}`} aria-hidden="true" />
          {displayedGesture && (
            <span className={`gesture-burst ${displayedGesture}`} aria-hidden="true">
              {displayedGesture === 'hug' ? '♥' : '💧'}
            </span>
          )}
        </button>
        <div className="shortcut-hint" aria-live="polite">{notice}</div>
      </section>
    </main>
  );
}
