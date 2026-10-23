// Isolated fixture for the hug in place, laid out like the app's pet window.
// ?to=ta|me (who is hugged), ?me=/ta= scene work|meeting|rest, ?meSkin=/taSkin=,
// ?distance=, ?size=, ?speed= (animation slowness, 1 is normal), ?blanket=.
import { StrictMode, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { HugScenery, HugWalk } from '../../src/components/HugWalk';
import { SpriteCanvas } from '../../src/pet/SpriteCanvas';
import { hugAvatarClass, hugRoom, hugSkins, pairWidth, seatOf, visitSpotOf, type HugMoment, type HugScene } from '../../src/pet/hugVisit';
import { petSkinFilters } from '../../src/pet/skins';
import { petDistance } from '../../src/settings/preferences';
import type { BlanketStyle, PetSkin } from '../../src/domain/types';
import '../../src/styles.css';
import '../../src/pet.css';

const params = new URLSearchParams(location.search);
const target = params.get('to') === 'me' ? 'self' : 'partner';
const scenes = { self: (params.get('me') ?? 'work') as HugScene, partner: (params.get('ta') ?? 'work') as HugScene };
const skins = { self: (params.get('meSkin') ?? 'cream') as PetSkin, partner: (params.get('taSkin') ?? 'mint') as PetSkin };
const scale = Number(params.get('size') ?? 100) / 100;
const distance = petDistance(Number(params.get('distance') ?? 100));
const speed = Number(params.get('speed') ?? 1);
const blanket = (params.get('blanket') ?? 'blush') as BlanketStyle;
const visual = 'code';
const spriteClass = (scene: HugScene) => scene === 'work' ? `pet-sprite work work-${visual} input-none` : `pet-sprite ${scene}`;

export function Checks() {
  const [id, setId] = useState('hug-0');
  const [moment, setMoment] = useState<HugMoment>();
  const now = moment?.id === id ? moment : undefined;
  const geometry = { selfScale: scale, partnerScale: scale, distance };
  const pair = hugSkins(target, skins.self, skins.partner);
  const sender = target === 'self' ? 'partner' : 'self';
  const role = (side: 'self' | 'partner') => side === target ? 'receiver' as const : 'sender' as const;
  const width = Math.max(440, Math.ceil(pairWidth(geometry))) + hugRoom(scale);
  return <main className="desktop-pet" style={{ width, height: 320, position: 'relative', background: '#f2e6db', outline: '1px dashed #c9a',
    '--pet-distance': `${distance}px`, '--self-pet-scale': String(scale), '--partner-pet-scale': String(scale), '--hug-room': `${hugRoom(scale)}px`,
    '--self-pet-skin-filter': petSkinFilters[skins.self], '--partner-pet-skin-filter': petSkinFilters[skins.partner],
    '--hug-hold-duration': `${3000 * speed}ms` } as CSSProperties}>
    <section className="pet-zone" style={{ '--tray-height': '50px' } as CSSProperties}>
      <div className="pet-pair paired interacting interaction-hug">
        {(['self', 'partner'] as const).map(side => <button key={side} className={`pet-avatar ${side}-pet ${hugAvatarClass(role(side), now)}`}>
          <SpriteCanvas skin={skins[side]} paused={false} className={`${spriteClass(scenes[side])} ${side === 'partner' ? 'partner-sprite' : ''}`} />
          <HugScenery id={id} role={role(side)} moment={now} scene={scenes[side]} visual={visual} skins={pair} blanket={blanket} paused={false} />
        </button>)}
        <HugWalk key={id} id={id} skin={pair.sender} scale={speed} paused={false} reducedMotion={false} onMoment={setMoment}
          walk={{ sender, senderScene: scenes[sender], receiverScene: scenes[target], seat: seatOf(scenes[sender], visual),
            spot: visitSpotOf(scenes[target]), geometry }} />
      </div>
    </section>
    <button style={{ position: 'absolute', top: 4, left: 4 }} onClick={() => setId(`hug-${Date.now()}`)}>Hug again</button>
  </main>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<StrictMode><Checks /></StrictMode>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
