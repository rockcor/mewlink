import { useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import type { ActivityKind, InteractionKind, PlainEvent, StoredEvent } from './domain/types';
import { activityProbe, classify } from './platform/activity';
import { listEvents, putEvent } from './storage/events';
import { LoopbackTransport } from './services/mockTransport';
import { buildReplay } from './services/replay';
import './styles.css';
import './pet.css';

const transport = new LoopbackTransport();
const interactions: { kind: InteractionKind; icon: string; label: string }[] = [
  { kind: 'water', icon: '💧', label: '提醒喝水' },
  { kind: 'hug', icon: '🫂', label: '拥抱' }
];
const statusText: Record<ActivityKind, string> = { coding: '在写代码', reading: '在阅读', meeting: '在开会', browsing: '在浏览', idle: '暂时离开', rest: '休息中' };

export default function App() {
  const [activity, setActivity] = useState<ActivityKind>('coding'); const [events, setEvents] = useState<StoredEvent[]>([]);
  const [muted, setMuted] = useState(false); const [focusMode, setFocusMode] = useState(false); const [playing, setPlaying] = useState(false); const [frame, setFrame] = useState(0);
  const replay = useMemo(() => buildReplay(events), [events]);
  useEffect(() => { void listEvents().then(setEvents); }, []);
  useEffect(() => { const timer = window.setInterval(() => { void activityProbe.sample().then(signal => setActivity(classify(signal))); }, 3000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!playing || !replay.length) return; const timer = window.setInterval(() => setFrame(current => current + 1 >= replay.length ? (setPlaying(false), 0) : current + 1), 1000); return () => clearInterval(timer); }, [playing, replay.length]);
  async function send(action: InteractionKind) {
    const event: PlainEvent = { id: uuid(), version: 1, relationshipId: 'demo-couple', senderDeviceId: 'my-device', createdAt: new Date().toISOString(), kind: 'interaction', payload: { action } };
    const received = await transport.send(event, { muted, focusMode, minIntervalMs: 10_000 }); setEvents(current => [...current, received]);
  }
  async function addStatusSnapshot() {
    const now = new Date(); const start = new Date(now.getTime() - 15 * 60_000);
    const event: PlainEvent = { id: uuid(), version: 1, relationshipId: 'demo-couple', senderDeviceId: 'partner-device', createdAt: start.toISOString(), kind: 'activity.segment', payload: { category: activity, startedAt: start.toISOString(), endedAt: now.toISOString() } };
    const stored: StoredEvent = { event, direction: 'in', status: 'delivered', receivedAt: now.toISOString() }; await putEvent(stored); setEvents(current => [...current, stored]);
  }
  const current = playing ? replay[frame] : undefined;
  return <main className="shell">
    <header data-tauri-drag-region><span className="brand">MEWLINK</span><span className="secure">◉ 本地隐私模式</span></header>
    <section className="stage"><div className={`pet ${activity} ${current ? 'performing' : ''}`} aria-label={`桌面宠物，${statusText[activity]}`}><img src="/mewlink-pet.png" alt="MewLink 原创卡通桌宠"/><span className="pet-prop" aria-hidden="true">{activity === 'meeting' ? '♫' : activity === 'rest' ? '💤' : '⌨'}</span></div><div className="bubble">{current ? `${current.icon} ${current.label}` : statusText[activity]}<small>{current ? new Date(current.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '只分享粗粒度状态'}</small></div></section>
    <section className="card"><div className="section-title"><span>给 TA 一个小动作</span><small>端到端加密 mock</small></div><div className="actions">{interactions.map(item => <button key={item.kind} onClick={() => void send(item.kind)}><span>{item.icon}</span>{item.label}</button>)}</div></section>
    <section className="card timeline"><div className="section-title"><span>今天的足迹</span><button className="text-button" onClick={() => void addStatusSnapshot()}>+ 状态片段</button></div>{replay.length ? <div className="event-list">{replay.slice(-4).map(item => <div key={item.id}><span>{item.icon}</span><p>{item.label}<small>{new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></p></div>)}</div> : <p className="empty">互动会安静地留在这里，稍后快速回放。</p>}<button className="replay" disabled={!replay.length} onClick={() => { setFrame(0); setPlaying(true); }}>▶ {playing ? '正在回放…' : `快速回放 ${replay.length} 个片段`}</button></section>
    <footer><label><input type="checkbox" checked={focusMode} onChange={e => setFocusMode(e.target.checked)}/> 专注时缓存</label><label><input type="checkbox" checked={muted} onChange={e => setMuted(e.target.checked)}/> 静音</label><span>{events.filter(e => e.status === 'cached').length} 条待回放</span></footer>
  </main>;
}
