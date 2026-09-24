// Local-only fixture with a dedicated synthetic identity; never contacts the relay.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { useOperationHistory } from '../../src/history/useOperationHistory';
import { putEvent, discardRelationshipHistory, historySeen, pendingOutgoing } from '../../src/storage/events';
import type { PairingState } from '../../src/pairing/pairing';
import type { ActivityKind, PlainEvent, StoredEvent, WorkVisual } from '../../src/domain/types';
import { SpriteCanvas } from '../../src/pet/SpriteCanvas';
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
    retentionHours: 12, receiverOffset: -420, showTimezone: true, language: 'en', revision, durationScale: 0.2, onRecord,
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
    const time = Date.now() - 3600_000;
    const activities: ActivityKind[] = ['work', 'meeting', 'rest'];
    for (let index = 0; index < 3; index++) {
      const at = new Date(time + index * 10_000).toISOString();
      const category = ['work', 'meeting', 'leisure', 'idle', 'rest'].indexOf(activities[index]);
      await putEvent({ direction: 'in', status: 'delivered', receivedAt: new Date().toISOString(),
        event: { id: 'qa-history-' + index, version: 1, relationshipId: identity.relationshipId,
          senderDeviceId: identity.partnerDeviceId!, senderUtcOffsetMinutes: 480, createdAt: at, kind: 'operation.batch',
          payload: { format: 1, startedAt: at, points: [[0, 0, 0, 0, category, 0],
            [200, 1, 0, 0, category, 0], [520, 1, 4, 1, category, 1]] } } });
    }
    setProgress([]);
    setRevision(value => value + 1);
    setReport('Seeded 9 recorded frames');
  };
  return <main style={{ background: '#eee0da', minHeight: '100vh', padding: 24, color: '#362530',
    '--activity-transition-duration': '960ms', '--pet-rest-duration': '860ms', '--pet-meeting-duration': '500ms',
    '--pet-idle-duration': '760ms' } as CSSProperties}>
    <h1>Operation replay checks</h1>
    <button onClick={() => void seed()}>Seed history</button>
    <button disabled={!replay.available} onClick={() => void replay.start()}>Replay / stop</button>
    <button onClick={() => void replay.start(true)}>Unseen only</button>
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
    <p>Frames: {progress.join(', ')}</p>
  </main>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<Checks />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
