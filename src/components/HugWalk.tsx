import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BlanketStyle, PetSkin } from '../domain/types';
import { deskAsset, hugAvatarClass, hugPhase, hugPhaseMarks, planHug, visitAsset, WALKER, walkerKeyframes,
  type HugMoment, type HugRole, type HugScene, type HugWalk as Walk } from '../pet/hugVisit';
import { petSkinFilters } from '../pet/skins';
import { SpriteCanvas } from '../pet/SpriteCanvas';

interface SceneryProps {
  id: string;
  role: HugRole;
  moment?: HugMoment;
  scene: HugScene;
  visual: string;
  skins: { receiver: PetSkin; sender: PetSkin };
  blanket: BlanketStyle;
  paused: boolean;
}

/**
 * Inside a pup's avatar: its empty desk while it is away, or, receiving, the
 * hug at its desk with the desk in front (the cushion behind).
 */
export function HugScenery({ id, role, moment, scene, visual, skins, blanket, paused }: SceneryProps) {
  const shown = hugAvatarClass(role, moment);
  if (!shown) return null;
  const desk = <span className={`hug-desk ${deskAsset(scene, visual)}`} aria-hidden="true" />;
  if (shown === 'hug-away') return desk;
  return <>
    {scene === 'rest' && desk}
    <SpriteCanvas key={id} skin={skins.receiver} senderSkin={skins.sender} paused={paused}
      className={`hug-visit ${visitAsset(scene, blanket)}`} aria-hidden="true" />
    {scene !== 'rest' && desk}
  </>;
}

interface Props {
  id: string;
  walk: Walk;
  skin: PetSkin;
  /** The animation speed setting (1 is normal). */
  scale: number;
  paused: boolean;
  reducedMotion: boolean;
  onMoment: (moment: HugMoment) => void;
}

/**
 * The sender's pup on its way (pet/hugVisit.ts planHug), and the clock that
 * tells the two avatars when the sender is away from its desk, when the
 * receiver hosts the hug, and when it is all over. Mounted once per hug
 * (keyed by its id); the way is planned when it starts.
 */
export function HugWalk({ id, walk, skin, scale, paused, reducedMotion, onMoment }: Props) {
  const [startedAt] = useState(() => performance.now());
  const [plan] = useState(() => planHug(walk, reducedMotion));
  const walker = useRef<HTMLSpanElement>(null);
  const report = useRef(onMoment);
  useLayoutEffect(() => { report.current = onMoment; });

  useEffect(() => {
    const elapsed = () => performance.now() - startedAt;
    const tell = () => report.current({ id, ...hugPhase(plan, elapsed(), scale) });
    const timers = [0, ...hugPhaseMarks(plan, scale)].map(mark => window.setTimeout(tell, Math.max(0, mark - elapsed())));
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [id, plan, scale, startedAt]);

  useLayoutEffect(() => {
    const node = walker.current;
    if (!node || !plan.frames.length || typeof node.animate !== 'function') return;
    const animation = node.animate(walkerKeyframes(plan), { duration: plan.duration * scale, fill: 'both' });
    animation.currentTime = performance.now() - startedAt;
    if (paused) animation.pause();
    return () => animation.cancel();
  }, [plan, scale, paused, startedAt]);

  if (!plan.frames.length) return null;
  return <span ref={walker} className="hug-walker" aria-hidden="true" style={{
    transformOrigin: `${WALKER.anchorX}px ${WALKER.anchorY}px`, backgroundSize: `${WALKER.frames * 100}% 100%`,
    filter: `${petSkinFilters[skin]} drop-shadow(0 13px 10px rgba(86, 45, 67, .16))`,
  }} />;
}
