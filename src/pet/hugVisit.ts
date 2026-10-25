import type { ActivityKind, BlanketStyle, PetSkin } from '../domain/types';
import { sceneFor } from './interaction';
import layout from './hugVisit.json';

// A hug happens in place, like the pomodoro and the cups: the sender's pup
// gets up from its own desk, walks over, hugs the receiver at the receiver's
// desk and walks back. Desks, keyboards and screens never move and stay in
// front: while its pup is away a desk shows desk-<scene>.png, and during the
// hug the receiver's desk is drawn over hug-visit-<kind>.png. The pup on its
// way is hug-walker.png: a trot, and each scene's pup getting up (the
// Aseprite master art/aseprite/mewlink-hug-master.aseprite; rig/visit.py).

export type HugScene = 'work' | 'meeting' | 'rest';
export type HugRole = 'sender' | 'receiver';

export const WALK_FRAME_MS = 100;
export const HUG_FRAME_MS = 125;
/** The hug itself, at the receiver's desk. */
export const HUG_HOLD_MS = layout.hugFrames * HUG_FRAME_MS;

/** The scene a pup shows for an activity: away from the computer it sleeps. */
export function hugScene(activity: ActivityKind): HugScene {
  const scene = sceneFor(activity);
  return scene === 'idle' || scene === 'rest' ? 'rest' : scene;
}

export const deskAsset = (scene: HugScene, visual: string) => scene === 'work' ? `desk-work-${visual}` : `desk-${scene}`;
export const visitAsset = (scene: HugScene, blanket: BlanketStyle) => scene === 'rest' ? `hug-visit-rest-${blanket}` : `hug-visit-${scene}`;

export function hugSkins(target: 'self' | 'partner', self: PetSkin, partner: PetSkin) {
  return target === 'self' ? { receiver: self, sender: partner } : { receiver: partner, sender: self };
}

/** Where a hug is: the sender away from its desk, the receiver hosting the hug. */
export interface HugMoment { id: string; senderAway: boolean; hosting: boolean; done?: boolean;
  /** The hug itself is over: a sleeping receiver keeps the blanket (pet/tucked.ts). */
  tuckedIn?: boolean }

/** The class of a pup's avatar while its own sprite gives way to the hug. */
export const hugAvatarClass = (role: HugRole | undefined, moment: HugMoment | undefined) =>
  !role || !moment ? '' : role === 'sender' && moment.senderAway ? 'hug-away' : role === 'receiver' && moment.hosting ? 'hug-hosting' : '';

// ---------------------------------------------------------------- geometry

/** How the pair is laid out (styles.css .pet-pair, .pet-avatar, pet.css .pet-sprite). */
export interface PairGeometry { selfScale: number; partnerScale: number; distance: number }
const FRAME_W = 384, FRAME_H = 256, SPRITE_W = 230, SPRITE_H = 153, SPRITE_LEFT = -2, SPRITE_BOTTOM = 6, AVATAR_W = 228;
export const FRAME_TO_CSS = SPRITE_W / FRAME_W;

export const pairWidth = ({ selfScale, partnerScale, distance }: PairGeometry) =>
  AVATAR_W / 2 * (selfScale + partnerScale) + distance * (selfScale + partnerScale) / 2;

/**
 * A point of a pup's 384x256 frame, as (x from the pair's left, y from its
 * bottom) in CSS pixels: each avatar is scaled about its bottom centre and
 * ends at its side of the pair.
 */
export function framePoint(side: 'self' | 'partner', [fx, fy]: readonly [number, number], geometry: PairGeometry) {
  const scale = side === 'self' ? geometry.selfScale : geometry.partnerScale;
  const left = side === 'self' ? 0 : pairWidth(geometry) - AVATAR_W * scale;
  const x = SPRITE_LEFT + fx * FRAME_TO_CSS;
  const y = SPRITE_BOTTOM + (FRAME_H - fy) * SPRITE_H / FRAME_H;
  return { x: left + x * scale, y: y * scale, scale };
}

/** Room the window keeps right of the pair, so a pup hugging TA from TA's right is not cut off. */
export const hugRoom = (partnerScale: number) => Math.ceil(layout.overhang * FRAME_TO_CSS * partnerScale);

export const seatOf = (scene: HugScene, visual: string) =>
  layout.seats[(scene === 'work' ? `work-${visual}` : scene) as keyof typeof layout.seats] as [number, number];
export const visitSpotOf = (scene: HugScene) =>
  layout.visit[(scene === 'rest' ? 'rest-blush' : scene) as keyof typeof layout.visit] as [number, number];

const FRAMES = layout.walker.frames;
const [ANCHOR_X, ANCHOR_Y] = layout.walker.anchor;
/** The walker is drawn in everyday frames: its feet are at the frame's anchor. */
export const WALKER = {
  frames: FRAMES,
  anchorX: ANCHOR_X * FRAME_TO_CSS,
  anchorY: ANCHOR_Y * SPRITE_H / FRAME_H,
  anchorBottom: (FRAME_H - ANCHOR_Y) * SPRITE_H / FRAME_H,
};
/** How far the walker gets each frame at its everyday size (frame pixels): a trot. */
const STRIDE = 15;
/** It comes out from behind its desk (laptop), rising over these frames (frame pixels below the floor). */
const EMERGE: Record<HugScene, readonly number[]> = { work: [92, 64, 36, 14, 4], meeting: [100, 70, 40, 16, 4], rest: [] };
const TURN = [{ facing: 0, squash: 0.62 }, { facing: 1, squash: 0.62 }, { facing: 1, squash: 1 }];
// Over a pup sleeping on its cushion the walker is in front; at a desk, behind it.
const zFor = (scene: HugScene) => scene === 'rest' ? 3 : 0;

export interface HugWalk {
  sender: 'self' | 'partner';
  senderScene: HugScene;
  receiverScene: HugScene;
  seat: [number, number];
  spot: [number, number];
  geometry: PairGeometry;
}

interface WalkerFrame { at: number; x: number; y: number; scale: number; facing: 1 | -1; frame: number; z: number; shown: boolean; squash: number;
  /** Frame pixels it is sunk below the floor (behind its desk): what is below the floor is cut off. */
  sink: number }
export interface HugPlan {
  /** Milliseconds, before the animation speed setting. */
  duration: number;
  /** When the sender's own sprite gives way to the walker, and comes back. */
  away: [number, number];
  /** When the receiver hosts the hug. */
  host: [number, number];
  frames: WalkerFrame[];
}

/**
 * The whole hug, frame by frame: the sender's pup ducks behind its desk (or
 * stretches on its cushion) and comes out trotting, its size changing to the
 * receiver's on the way; at the receiver's right it turns to face it; the
 * hug; then it turns back if it has to and trots home, and sits down again.
 * Each step is a fixed stride, so a longer way takes longer.
 */
export function planHug(walk: HugWalk, reducedMotion = false): HugPlan {
  if (reducedMotion) return { duration: HUG_HOLD_MS, away: [0, 0], host: [0, HUG_HOLD_MS], frames: [] };
  const receiver = walk.sender === 'self' ? 'partner' : 'self';
  const from = framePoint(walk.sender, walk.seat, walk.geometry);
  const to = framePoint(receiver, walk.spot, walk.geometry);
  const out: 1 | -1 = to.x >= from.x ? 1 : -1;
  const stride = STRIDE * FRAME_TO_CSS * (from.scale + to.scale) / 2;
  const steps = Math.max(6, Math.round(Math.abs(to.x - from.x) / stride));
  const leave = layout.walker.leave[walk.senderScene];
  const leaveFrames = layout.walker.leaveFrames;
  const emerge = EMERGE[walk.senderScene];
  const frames: WalkerFrame[] = [];
  let at = 0;
  const push = (u: number, frame: number, facing: 1 | -1, { sink = 0, squash = 1, shown = true, z = 0 } = {}) => {
    const scale = from.scale + (to.scale - from.scale) * u;
    frames.push({ at, x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u - sink * SPRITE_H / FRAME_H * scale,
      scale, facing, frame, z, shown, squash, sink });
    at += WALK_FRAME_MS;
  };
  const z = (u: number) => u < 0.5 ? zFor(walk.senderScene) : zFor(walk.receiverScene);
  const trot = (going: boolean) => {
    const facing = going ? out : (-out as 1 | -1);
    for (let k = 0; k < steps; k++) {
      const u = going ? (k + 1) / steps : 1 - (k + 1) / steps;
      const rising = going ? emerge[k] : emerge[steps - 1 - k];
      push(u, k % layout.walker.walk, facing, { sink: rising ?? 0, z: z(u) });
    }
  };
  const turn = (fromFacing: 1 | -1) => {
    for (const { facing, squash } of TURN) push(1, 0, (facing ? -fromFacing : fromFacing) as 1 | -1, { squash, z: zFor(walk.receiverScene) });
  };
  for (let k = 0; k < leaveFrames; k++) push(0, leave + k, 1, { z: zFor(walk.senderScene) });
  trot(true);
  // It hugs facing left (it is at the receiver's right).
  if (out === 1) turn(1);
  const host: [number, number] = [at, at + HUG_HOLD_MS];
  frames.push({ ...frames[frames.length - 1], at, shown: false });
  at += HUG_HOLD_MS;
  if (out === -1) turn(-1);
  trot(false);
  for (let k = leaveFrames - 1; k >= 0; k--) push(0, leave + k, 1, { z: zFor(walk.senderScene) });
  frames.push({ ...frames[frames.length - 1], at, shown: false });
  return { duration: at, away: [0, at], host, frames };
}

/** What each pup shows `elapsed` ms into a hug (already scaled to the animation speed). */
export function hugPhase(plan: HugPlan, elapsed: number, scale = 1) {
  const within = ([start, end]: [number, number]) => elapsed >= start * scale && elapsed < end * scale;
  return { senderAway: within(plan.away), hosting: within(plan.host), tuckedIn: elapsed >= plan.host[1] * scale,
    done: elapsed >= plan.duration * scale };
}

/** When the phase changes, for timers that re-render only then. */
export const hugPhaseMarks = (plan: HugPlan, scale = 1) =>
  [...new Set([...plan.away, ...plan.host, plan.duration])].map(mark => mark * scale);

/** Web Animations keyframes for the walker: one per frame, each held until the next (pixel-art steps). */
export function walkerKeyframes(plan: HugPlan): Keyframe[] {
  return plan.frames.map(({ at, x, y, scale, facing, frame, z, shown, squash, sink }) => ({
    offset: Math.min(1, at / plan.duration),
    easing: 'steps(1, end)',
    opacity: shown ? 1 : 0,
    zIndex: z,
    clipPath: sink ? `inset(0 0 ${((FRAME_H - ANCHOR_Y + sink) / FRAME_H * 100).toFixed(3)}% 0)` : 'none',
    backgroundPosition: `${(frame / (FRAMES - 1) * 100).toFixed(4)}% 0`,
    transform: `translate(${(x - WALKER.anchorX).toFixed(2)}px, ${(-(y - WALKER.anchorBottom)).toFixed(2)}px) scale(${(scale * squash * facing).toFixed(4)}, ${scale.toFixed(4)})`,
  }));
}
