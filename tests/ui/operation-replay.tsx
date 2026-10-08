// Local-only fixture with a dedicated synthetic identity; never contacts the relay.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { useOperationHistory } from '../../src/history/useOperationHistory';
import { putEvent, discardRelationshipHistory, historySeen, pendingOutgoing } from '../../src/storage/events';
import type { PairingState } from '../../src/pairing/pairing';
import type { ActivityKind, PlainEvent, StoredEvent, WorkVisual } from '../../src/domain/types';
import { SpriteCanvas } from '../../src/pet/SpriteCanvas';
import { ReplayNotice, ReplayScrubber } from '../../src/components/ReplayControls';
import { dayInstant, daySpanMs, formatDuration, partnerClock } from '../../src/history/days';
import '../../src/settings-panel.css';
import { transitionAssetName, useActivityPlayback } from '../../src/pet/activityPlayback';
import { visualInputForActivity } from '../../src/platform/activity';
import '../../src/styles.css';
import '../../src/pet.css';
const identity: PairingState = { version: 1, relationshipId: 'qa-history-20260923', deviceId: 'qa-self-20260923',
  partnerDeviceId: 'qa-other-20260923', keyId: 'qa-key-20260923', relationshipKey: '', relayToken: '',
  nextSequence: 0, relayCursor: 0, receivedSequences: {}, inviteExpiresAt: 0 };
export function Checks() {
  const [revision, setRevision] = useState(0), [enabled, setEnabled] = useState(true), [paused, setPaused] = useState(false);
  const [report, setReport] = useState('Ready');
  const [progress, setProgress] = useState<string[]>([]);
  const ready = useRef<(activity: ActivityKind, visual: WorkVisual) => boolean>(() => true);
  const onRecord = useCallback(async (create: (state: PairingState) => PlainEvent): Promise<StoredEvent> => {
    const stored: StoredEvent = { event: create(identity), direction: 'out', status: 'queued', receivedAt: new Date().toISOString() };
    await putEvent(stored);
    return stored;
  }, []);
  const replay = useOperationHistory({ pairing: identity, enabled, paused, activity: 'work', workVisual: 'code',
    retentionHours: 48, receiverOffset: -420, partnerOffset: 480, showTimezone: true, language: 'zh', revision, durationScale: 0.2, onRecord,
    displayReady: (activity, visual) => ready.current(activity, visual) });
  const playback = useActivityPlayback({ desiredActivity: replay.playing ? replay.display.activity : 'work',
    desiredWorkVisual: replay.playing ? replay.display.workVisual : 'web', initialActivity: 'work', initialWorkVisual: 'web',
    workHandsSettled: !replay.hands.keyboard && !replay.hands.pointer, paused, transitionDurationMs: 960 });
  ready.current = (activity, visual) => !playback.transition && playback.displayedActivity === activity
    && (activity !== 'work' || playback.displayedWorkVisual === visual);
  const frame = replay.current;
  useEffect(() => {
    if (frame) setProgress(values => [...values.slice(-24), frame.id]);
  }, [frame]);
  const seed = async () => {
    replay.stop();
    await discardRelationshipHistory(identity.relationshipId);
    // A partner day: 40 min of work, a long lunch, then 30 min more with a hug.
    // From 09:00 on the partner's (UTC+8) latest day that has already reached 13:00.
    let base = Math.floor((Date.now() + 480 * 60_000) / 86_400_000) * 86_400_000 - 480 * 60_000 + 9 * 3600_000;
    if (base + 4 * 3600_000 > Date.now()) base -= 86_400_000;
    const sessions = [[base, 40], [base + 3 * 3600_000, 30]] as const;
    const visuals = [0, 1, 2, 3];
    let index = 0;
    for (const [start, minutes] of sessions) {
      for (let i = 0; i < minutes * 6; i++) {
        const at = new Date(start + i * 10_000).toISOString();
        const visual = visuals[Math.floor(i / 60) % visuals.length];
        await putEvent({ direction: 'in', status: 'delivered', receivedAt: new Date().toISOString(),
          event: { id: 'qa-history-' + index++, version: 1, relationshipId: identity.relationshipId,
            senderDeviceId: identity.partnerDeviceId!, senderUtcOffsetMinutes: 480, createdAt: at, kind: 'operation.batch',
            payload: { format: 1, startedAt: at, points: [[0, 2, 1, 0, 0, visual], [4000, 3, 0, i % 7 === 0 ? 1 : 0, 0, visual]] } } });
      }
    }
    await putEvent({ direction: 'in', status: 'delivered', receivedAt: new Date().toISOString(),
      event: { id: 'qa-hug', version: 1, relationshipId: identity.relationshipId, senderDeviceId: identity.partnerDeviceId!,
        senderUtcOffsetMinutes: 480, createdAt: new Date(sessions[1][0] + 10 * 60_000).toISOString(), kind: 'interaction',
        payload: { action: 'hug', blanketStyle: 'blush' } } });
    setProgress([]);
    setRevision(value => value + 1);
    setReport(`Seeded ${index} batches in two sessions`);
  };
  return <main style={{ background: '#eee0da', minHeight: '100vh', padding: 24, color: '#362530',
    '--activity-transition-duration': '960ms', '--pet-rest-duration': '860ms', '--pet-meeting-duration': '500ms',
    '--pet-idle-duration': '760ms' } as CSSProperties}>
    <h1>Operation replay checks</h1>
    <button onClick={() => void seed()}>Seed history</button>
    <button disabled={!replay.available} onClick={() => void replay.start()}>Replay / stop</button>
    <button onClick={() => void replay.start({ unseen: true })}>Unseen only</button>
    <button onClick={() => setPaused(value => !value)}>Pause / resume</button>
    <button onClick={() => setEnabled(value => !value)}>Enable / disable</button>
    <button onClick={async () => setReport('Seen: ' + await historySeen(identity.relationshipId) + '; queued: ' + (await pendingOutgoing(identity)).length)}>Check watermark</button>
    <p role="status">{replay.playing ? 'Playing' : 'Stopped'} · {paused ? 'Paused' : 'Running'} · {enabled ? 'Enabled' : 'Disabled'} · {replay.error ? 'ERROR' : 'No errors'}</p>
    <p>{report}</p><p>Current: {replay.current?.id ?? 'none'} · {replay.current?.clockLabel}</p>
    <p>Rendered: {playback.displayedActivity} / {playback.displayedWorkVisual} / {playback.transition ? 'transition' : 'settled'}</p>
    <div className="pet-avatar partner-pet" style={{ position: 'relative', height: 300, width: 340 }}>
      <SpriteCanvas skin="mint" paused={paused} onLoopBoundary={playback.handleLoopBoundary}
        className={`pet-sprite partner-sprite ${playback.displayedActivity} ${playback.displayedActivity === 'work' ? 'work-' + playback.displayedWorkVisual : ''} input-${playback.transition ? 'none' : visualInputForActivity(playback.displayedActivity, replay.hands.keyboard, replay.hands.pointer)} ${playback.transition ? 'transition-source-frame' : ''}`} />
      {playback.transition && <SpriteCanvas key={playback.transition.key} skin="mint" paused={paused}
        className={`pet-sprite partner-sprite activity-transition ${transitionAssetName(playback.transition)}`}
        onPlaybackEnd={() => playback.completeTransition(playback.transition!.key)} />}
    </div>
    <p>Days: {replay.days.map(day => `${day.key} ${formatDuration(daySpanMs(day), 'zh')}, work ${formatDuration(day.activeMs, 'zh')} (${day.sessions.length} sessions)`).join('; ') || 'none'} · progress {replay.progress.toFixed(3)}</p>
    <div className="pet-zone" data-testid="window" style={{ width: 440, height: 120, position: 'relative', background: '#f6ece6', borderRadius: 12 }}>
      <div className="replay-dock">
        {replay.playing && replay.playingDay
          ? <ReplayScrubber day={replay.playingDay} progress={replay.progress} timeLabel={partnerClock(dayInstant(replay.playingDay, replay.progress), 480)}
            positionLabel="回放进度" closeLabel="结束回放" onSeek={replay.seek} onClose={replay.stop} />
          : replay.unseen && <ReplayNotice label={`TA 的回放 · ${formatDuration(replay.unseen.ms, 'zh')}`}
            detail={`工作 ${formatDuration(replay.unseen.workMs, 'zh')} · 休息 ${formatDuration(replay.unseen.ms - replay.unseen.workMs, 'zh')}`} onPlay={() => { void replay.start({ unseen: true }); }} />}
      </div>
    </div>
    <p>Frames: {progress.slice(-6).join(', ')}</p>
  </main>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<Checks />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
