// Isolated fixture: no pairing, relay, preferences writes or real interactions.
import { StrictMode, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { PetActions } from '../../src/components/PetActions';
import { SettingsPanel } from '../../src/components/SettingsPanel';
import { StatisticsPanel } from '../../src/components/StatisticsPanel';
import { defaultPreferences, type Preferences } from '../../src/settings/preferences';
import { SpriteCanvas } from '../../src/pet/SpriteCanvas';
import { transitionAssetName, useActivityPlayback } from '../../src/pet/activityPlayback';
import { spriteSheets } from '../../src/pet/spriteAssets';
import type { ActivityKind, CupStyle } from '../../src/domain/types';
import '../../src/styles.css';
import '../../src/pet.css';
import '../../src/settings-panel.css';

const noop = () => undefined;
const kinds: ActivityKind[] = ['work', 'meeting', 'leisure', 'rest', 'idle'];
export function Checks() {
  const [preferences, setPreferences] = useState<Preferences>(() => ({ ...defaultPreferences(), language: 'en' }));
  const [panel, setPanel] = useState('');
  const [cup, setCup] = useState<CupStyle>('ceramic');
  const [activity, setActivity] = useState<ActivityKind>('idle');
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [remount, setRemount] = useState(0);
  return <><main className="desktop-pet" style={{ background: '#f2e6db' }}>
    <section className="pet-zone">
      <div className="hover-ui menu-visible">
        <div className="status-row"><div className="status-pill">Working</div><div className="status-pill">Working</div></div>
        <PetActions language={preferences.language} connected canReplay cupStyle={cup}
          onSettings={() => setPanel('settings')} onStatistics={() => setPanel('statistics')}
          onHug={noop} onWater={noop} onReplay={noop} />
      </div>
      <div className="pet-pair paired">
        <button className="pet-avatar self-pet" aria-label="Self working"><SpriteCanvas skin="cream" paused={false} className="pet-sprite work work-code input-none" /></button>
        <Playback key={remount} desired={activity} paused={paused} reduced={reduced} />
      </div>
    </section>
  </main>
  <details style={{ position: 'fixed', top: 0, left: 0, zIndex: 9, background: '#fff8e9', fontSize: 12 }}>
    <summary>Test controls</summary>
    <label>Remote activity <select value={activity} onChange={event => setActivity(event.target.value as ActivityKind)}>{kinds.map(kind => <option key={kind}>{kind}</option>)}</select></label>
    <label><input type="checkbox" checked={paused} onChange={event => setPaused(event.target.checked)} />Pause render</label>
    <label><input type="checkbox" checked={reduced} onChange={event => setReduced(event.target.checked)} />Disable CSS animation</label>
    <button onClick={() => spriteSheets.clearUnused()}>Evict unused sheets</button>
    <button onClick={() => setRemount(current => current + 1)}>Reset partner to idle</button>
  </details>
  {panel === 'settings' && <SettingsPanel preferences={preferences} onChange={next => setPreferences(next)}
    localUtcOffsetMinutes={0} partnerUtcOffsetMinutes={0} cupStyle={cup} onCupStyleChange={setCup}
    updateState={{ kind: 'current', message: 'UI fixture · no network' }}
    feedback="" feedbackNickname="" feedbackSending={false} feedbackStatus="" pairingStatus="" pairingBusy={false}
    inviteCode="" joinCode="" safetyCode="" onCheckUpdate={noop} onInstallUpdate={noop} onFeedbackChange={noop}
    onFeedbackNicknameChange={noop} onShareFeedback={noop} onCreatePairing={noop} onCopyInvite={async () => undefined}
    onJoinCodeChange={noop} onJoinPairing={noop} onDisconnect={noop} onClose={() => setPanel('')} />}
  {panel === 'statistics' && <StatisticsPanel language={preferences.language} connected visibility="private" onVisibilityChange={noop} onClose={() => setPanel('')} />}
  </>;
}
export function Playback({ desired, paused, reduced }: { desired: ActivityKind; paused: boolean; reduced: boolean }) {
  const playback = useActivityPlayback({ desiredActivity: desired, desiredWorkVisual: 'web',
    initialActivity: 'idle', initialWorkVisual: 'web', workHandsSettled: true, transitionDurationMs: 480, paused });
  const style = { '--pet-idle-duration': '400ms', '--pet-meeting-duration': '400ms', '--pet-video-duration': '400ms', '--pet-rest-duration': '400ms',
    '--activity-transition-duration': '480ms' } as CSSProperties;
  const noCss = reduced ? { animation: 'none' } : undefined;
  return <button className="pet-avatar partner-pet" style={style} aria-label={`Rendered partner ${playback.displayedActivity}${playback.transition ? ' transitioning' : ''}`}>
    <SpriteCanvas skin="mint" paused={paused} onLoopBoundary={playback.handleLoopBoundary} style={noCss}
      className={`pet-sprite partner-sprite ${playback.displayedActivity} ${playback.displayedActivity === 'work' ? 'work-web' : ''} input-none ${playback.transition ? 'transition-source-frame' : ''}`} />
    {playback.transition && <SpriteCanvas skin="mint" paused={paused} key={playback.transition.key} style={noCss}
      className={`pet-sprite partner-sprite activity-transition ${transitionAssetName(playback.transition)}`}
      onPlaybackEnd={() => playback.completeTransition(playback.transition!.key)} />}
  </button>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<StrictMode><Checks /></StrictMode>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
