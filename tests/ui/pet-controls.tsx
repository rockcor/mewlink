// Isolated fixture: no pairing, relay, preferences writes or real interactions.
import { StrictMode, useEffect, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { PetActions } from '../../src/components/PetActions';
import { SettingsPanel } from '../../src/components/SettingsPanel';
import { StatisticsPanel } from '../../src/components/StatisticsPanel';
import { defaultPreferences, petDistance, petWindowWidth, type Preferences } from '../../src/settings/preferences';
import { growthScale } from '../../src/statistics/growth';
import { PomodoroTimer } from '../../src/components/PomodoroTimer';
import { DeskSpeaker } from '../../src/components/DeskSpeaker';
import { deskShown } from '../../src/pet/interaction';
import { AwayNote } from '../../src/components/AwayNote';
import { awayNote } from '../../src/pet/away';
import { ReplayNotice, ReplayScrubber } from '../../src/components/ReplayControls';
import { WhatsNewCloud } from '../../src/components/WhatsNewCloud';
import { WHATS_NEW } from '../../src/whatsNew';
import { groupReplayDays } from '../../src/history/days';
import { clearOfMyCup } from '../../src/pomodoro/placement';
import { newPomodoro } from '../../src/pomodoro/pomodoro';
import { SpriteCanvas } from '../../src/pet/SpriteCanvas';
import { petSkinFilters } from '../../src/pet/skins';
import { transitionAssetName, useActivityPlayback } from '../../src/pet/activityPlayback';
import { spriteSheets } from '../../src/pet/spriteAssets';
import type { CupStyle, PetSkin, ShownActivity } from '../../src/domain/types';
import '../../src/styles.css';
import '../../src/pet.css';
import '../../src/settings-panel.css';

const noop = () => undefined;
const kinds: ShownActivity[] = ['work', 'meeting', 'rest', 'meal', 'idle'];
const params = new URLSearchParams(location.search);
const mySkin = (params.get('me') ?? 'cream') as PetSkin;
const taSkin = (params.get('ta') ?? 'mint') as PetSkin;
const qaDay = groupReplayDays([0, 40, 200, 230].map(minute => ({ id: String(minute), kind: 'operation.batch' as const,
  at: new Date(Date.UTC(2026, 9, 22, 1) + minute * 60_000).toISOString() })), 480)[0];
// ?pomodoro: one ten minutes in on both pups.
const pomodoro = params.has('pomodoro') ? newPomodoro('qa', Date.now() - 10 * 60_000) : undefined;
export function Checks() {
  const [preferences, setPreferences] = useState<Preferences>(() => ({ ...defaultPreferences(), language: 'en',
    petDistancePercent: Number(new URLSearchParams(location.search).get('distance') ?? 100),
    selfPetScalePercent: Number(new URLSearchParams(location.search).get('size') ?? 100),
    partnerPetScalePercent: Number(new URLSearchParams(location.search).get('size') ?? 100) }));
  // ?growth=0..1 previews today's busyness growth on both companions.
  const growth = growthScale(Number(new URLSearchParams(location.search).get('growth') ?? 0));
  const [panel, setPanel] = useState('');
  const [cup, setCup] = useState<CupStyle>('ceramic');
  const [activity, setActivity] = useState<ShownActivity>('idle');
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  // ?sound: a video or music playing at both desks (the speaker on the monitor bounces).
  const [sound, setSound] = useState(params.has('sound'));
  const [remount, setRemount] = useState(0);
  // A hug as the app shows it: at another distance the pair slides together first.
  const [hug, setHug] = useState<string>();
  const [gathered, setGathered] = useState<string>();
  const gatherMs = preferences.petDistancePercent === 100 ? 0 : 280;
  const gathering = Boolean(hug && gatherMs && gathered !== hug);
  useEffect(() => {
    if (!hug) return;
    const ready = window.setTimeout(() => setGathered(hug), gatherMs);
    const done = window.setTimeout(() => setHug(undefined), 3_200 + gatherMs);
    return () => { window.clearTimeout(ready); window.clearTimeout(done); };
  }, [hug, gatherMs]);
  return <><main className="desktop-pet" data-window-width={petWindowWidth(preferences.petDistancePercent, preferences.selfPetScalePercent / 100 * growth, preferences.partnerPetScalePercent / 100 * growth)} style={{ background: '#f2e6db',
    '--pet-distance': `${petDistance(preferences.petDistancePercent)}px`, '--gather-ms': `${gatherMs}ms`,
    '--self-pet-scale': String(preferences.selfPetScalePercent / 100 * growth), '--partner-pet-scale': String(preferences.partnerPetScalePercent / 100 * growth),
    '--self-pet-skin-filter': petSkinFilters[mySkin], '--partner-pet-skin-filter': petSkinFilters[taSkin] } as CSSProperties}>
    <section className="pet-zone">
      <div className="hover-ui menu-visible">
        <PetActions language={preferences.language} connected canReplay cupStyle={cup}
          onSettings={() => setPanel('settings')} onStatistics={() => setPanel('statistics')}
          onHug={() => setHug(String(Date.now()))} onWater={noop} onReplay={noop} onPomodoro={noop} pomodoroMinutes={18} />
      </div>
      <div className={`pet-pair paired ${hug ? 'interacting target-partner interaction-hug' : ''}`}>
        <button className="pet-avatar self-pet" aria-label="Self working"><SpriteCanvas skin={mySkin} paused={false} className="pet-sprite work work-code input-none" />
          {pomodoro && <PomodoroTimer pomodoro={pomodoro} atPaw paused={false} label="pomodoro" />}
          <DeskSpeaker playing={sound} /></button>
        <Playback key={remount} desired={activity} paused={paused} reduced={reduced} sound={sound} />
        {params.has('cup') && <span className="waiting-cup target-self ceramic"><i /><i /></span>}
        {/* ?hug=work|rest|meeting&me=<skin>&ta=<skin>: I hug TA, as the app draws it (receiver TA, sender me). */}
        {hug && !gathering && <SpriteCanvas key={hug} skin={taSkin} senderSkin={mySkin} paused={paused}
          className={`interaction-sprite hug-${params.get('hug') ?? 'work'} target-partner blanket-blush`} aria-hidden="true" />}
      </div>
      {/* ?tray=notice|bar|news|toast: the strip under the pets, as in the app. */}
      {params.has('tray') && <div className="pet-tray paired">
        <div className="tray-slot tray-self">
          {params.get('tray') === 'toast' ? <div className="pet-toast">有一段回放没能保存，会继续记录后面的</div>
            : params.get('tray') === 'news' ? <WhatsNewCloud title={`v${params.get('version') ?? '0.3.33'} 更新内容`}
              text={WHATS_NEW[params.get('version') ?? '0.3.33'][(params.get('lang') ?? 'zh') as 'zh']} label="更新内容，点击关闭" onClose={noop} /> : null}
        </div>
        <div className="tray-slot tray-partner replay-dock">
          {params.get('tray') === 'bar'
            ? <ReplayScrubber day={qaDay} progress={0.4} timeLabel="10/22 13:10" positionLabel="回放进度" closeLabel="结束回放" onSeek={noop} onClose={noop} />
            : <ReplayNotice label="TA 的回放 · 8 小时 40 分" detail="" onPlay={noop} />}
        </div>
      </div>}
    </section>
  </main>
  <details style={{ position: 'fixed', top: 0, left: 0, zIndex: 9, background: '#fff8e9', fontSize: 12 }}>
    <summary>Test controls</summary>
    <label>Remote activity <select value={activity} onChange={event => setActivity(event.target.value as ShownActivity)}>{kinds.map(kind => <option key={kind}>{kind}</option>)}</select></label>
    <label><input type="checkbox" checked={paused} onChange={event => setPaused(event.target.checked)} />Pause render</label>
    <label><input type="checkbox" checked={reduced} onChange={event => setReduced(event.target.checked)} />Disable CSS animation</label>
    <label><input type="checkbox" checked={sound} onChange={event => setSound(event.target.checked)} />Sound playing</label>
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
export function Playback({ desired, paused, reduced, sound }: { desired: ShownActivity; paused: boolean; reduced: boolean; sound: boolean }) {
  const playback = useActivityPlayback({ desiredActivity: desired, desiredWorkVisual: 'web',
    initialActivity: 'idle', initialWorkVisual: 'web', workHandsSettled: true, transitionDurationMs: 480, paused });
  const style = { '--pet-idle-duration': '400ms', '--pet-meeting-duration': '400ms', '--pet-video-duration': '400ms', '--pet-rest-duration': '400ms',
    '--activity-transition-duration': '480ms' } as CSSProperties;
  const noCss = reduced ? { animation: 'none' } : undefined;
  return <button className="pet-avatar partner-pet" style={style} aria-label={`Rendered partner ${playback.displayedActivity}${playback.transition ? ' transitioning' : ''}`}>
    <SpriteCanvas skin={taSkin} paused={paused} onLoopBoundary={playback.handleLoopBoundary} style={noCss}
      className={`pet-sprite partner-sprite ${playback.displayedActivity} ${playback.displayedActivity === 'work' ? 'work-web' : ''} input-none ${playback.transition ? 'transition-source-frame' : ''}`} />
    {pomodoro && <PomodoroTimer pomodoro={pomodoro} atPaw paused={false} label="pomodoro"
      x={params.has('cup') ? clearOfMyCup(1, 1, petDistance(Number(params.get('distance') ?? 100))) : undefined} />}
    {playback.transition && <SpriteCanvas skin={taSkin} paused={paused} key={playback.transition.key} style={noCss}
      className={`pet-sprite partner-sprite activity-transition ${transitionAssetName(playback.transition)}`}
      onPlaybackEnd={() => playback.completeTransition(playback.transition!.key)} />}
    {deskShown(playback) && <DeskSpeaker playing={sound && playback.displayedActivity === 'work'} />}
    {/* ?paw: a visitor left its paw print on TA's note. */}
    {awayNote(playback) && <AwayNote words={params.get('lang') === 'en' ? 'Back\nsoon' : '马上\n回来'} arriving={awayNote(playback) === 'arriving'} paw={params.has('paw')} />}
  </button>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<StrictMode><Checks /></StrictMode>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
