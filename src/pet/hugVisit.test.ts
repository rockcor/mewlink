import { describe, expect, it } from 'vitest';
import layout from './hugVisit.json';
import { deskAsset, framePoint, HUG_HOLD_MS, hugPhase, hugPhaseMarks, hugRoom, hugScene, hugSkins, pairWidth, planHug, seatOf,
  visitAsset, visitSpotOf, WALK_FRAME_MS, WALKER, walkerKeyframes, type HugScene, type HugWalk } from './hugVisit';

const geometry = { selfScale: 1, partnerScale: 1, distance: 212 };
const way = (sender: 'self' | 'partner', senderScene: HugScene = 'work', receiverScene: HugScene = 'work'): HugWalk => ({
  sender, senderScene, receiverScene, seat: seatOf(senderScene, 'code'), spot: visitSpotOf(receiverScene), geometry,
});

describe('a hug in place', () => {
  it('keeps each pup in its own colours, whoever hugs whom', () => {
    expect(hugSkins('self', 'shell', 'sky')).toEqual({ receiver: 'shell', sender: 'sky' });
    expect(hugSkins('partner', 'shell', 'sky')).toEqual({ receiver: 'sky', sender: 'shell' });
  });

  it('hugs at the desk the receiver shows: at work, in a meeting, or tucked in asleep', () => {
    expect(hugScene('work')).toBe('work');
    expect(hugScene('leisure')).toBe('work');
    expect(hugScene('meeting')).toBe('meeting');
    expect(hugScene('idle')).toBe('rest');
    expect(hugScene('rest')).toBe('rest');
    expect(deskAsset('work', 'ai')).toBe('desk-work-ai');
    expect(deskAsset('meeting', 'ai')).toBe('desk-meeting');
    expect(visitAsset('work', 'mint')).toBe('hug-visit-work');
    expect(visitAsset('rest', 'mint')).toBe('hug-visit-rest-mint');
  });

  it('places frame points where the avatars draw them', () => {
    expect(pairWidth(geometry)).toBe(440);
    // My frame starts 2px left of my avatar; TA's ends 2px past the pair's right edge.
    expect(framePoint('self', [0, 256], geometry)).toEqual({ x: -2, y: 6, scale: 1 });
    expect(framePoint('partner', [384, 256], geometry).x).toBeCloseTo(440 - 228 - 2 + 230);
    // The middle of TA's frame is 1px left of the middle of TA's avatar, at TA's size.
    const grown = { ...geometry, partnerScale: 1.25 };
    expect(framePoint('partner', [192, 256], grown).x).toBeCloseTo(pairWidth(grown) - 114 * 1.25 - 1.25);
  });

  it('gets up, trots over step by step, hugs, and trots back to sit down again', () => {
    const plan = planHug(way('self'));
    const frames = plan.frames;
    // From the first frame to the last the sender is away; the receiver hosts the hug in between.
    expect(plan.away).toEqual([0, plan.duration]);
    expect(plan.host[1] - plan.host[0]).toBe(HUG_HOLD_MS);
    // Every frame is one walker frame long, but the hug itself.
    for (let k = 1; k < frames.length; k++) {
      const gap = frames[k].at - frames[k - 1].at;
      expect(gap === WALK_FRAME_MS || (gap === HUG_HOLD_MS && frames[k - 1].at === plan.host[0]) || gap === 0).toBe(true);
    }
    // It starts and ends as the pup at its desk, exactly where the desk shows it.
    const seat = framePoint('self', seatOf('work', 'code'), geometry);
    expect(frames[0]).toMatchObject({ frame: layout.walker.leave.work, x: seat.x, y: seat.y, shown: true });
    expect(frames.at(-2)).toMatchObject({ frame: layout.walker.leave.work, x: seat.x, y: seat.y });
    expect(frames.at(-1)).toMatchObject({ shown: false, at: plan.duration });
    // It walks: the trot frames go round, it never leaves the floor (it only rises from behind its desk).
    const trot = frames.filter(frame => frame.frame < layout.walker.walk && frame.shown);
    expect(new Set(trot.map(frame => frame.frame)).size).toBe(layout.walker.walk);
    // (Both pups are the same size here, so the floor is level.)
    for (const frame of trot) expect(frame.y).toBeLessThanOrEqual(seat.y + 1e-6);
    // Out of sight while it hugs.
    expect(frames.find(frame => frame.at === plan.host[0])!.shown).toBe(false);
  });

  it('faces the receiver to hug it, from the receiver’s right, whichever way it came', () => {
    for (const sender of ['self', 'partner'] as const) {
      const plan = planHug(way(sender));
      const before = plan.frames.filter(frame => frame.at < plan.host[0] && frame.shown).at(-1)!;
      expect(before.facing).toBe(-1);
      const spot = framePoint(sender === 'self' ? 'partner' : 'self', visitSpotOf('work'), geometry);
      expect(before.x).toBeCloseTo(spot.x);
      expect(before.scale).toBeCloseTo(1);
    }
    // To TA it goes right and turns round there; from TA it comes left and turns round only to go home.
    const toTa = planHug(way('self')).frames;
    expect(toTa.find(frame => frame.frame < layout.walker.walk)!.facing).toBe(1);
    const fromTa = planHug(way('partner')).frames;
    expect(fromTa.find(frame => frame.frame < layout.walker.walk)!.facing).toBe(-1);
  });

  it('takes longer the further it has to go, a stride at a time', () => {
    const near = planHug({ ...way('self'), geometry: { ...geometry, distance: 170 } });
    const far = planHug({ ...way('self'), geometry: { ...geometry, distance: 339 } });
    expect(far.duration).toBeGreaterThan(near.duration);
  });

  it('stays in front over a sleeping pup and behind a desk', () => {
    const plan = planHug(way('partner', 'work', 'rest'));
    expect(plan.frames[0].z).toBe(0);
    expect(plan.frames.filter(frame => frame.at < plan.host[0]).at(-1)!.z).toBe(3);
  });

  it('tells the avatars when the sender is away and when the receiver hosts the hug', () => {
    const plan = planHug(way('self'));
    expect(hugPhase(plan, 0)).toEqual({ senderAway: true, hosting: false, tuckedIn: false, done: false });
    expect(hugPhase(plan, plan.host[0] + 1)).toEqual({ senderAway: true, hosting: true, tuckedIn: false, done: false });
    // As the hug ends, a sleeping receiver is tucked in.
    expect(hugPhase(plan, plan.host[1] + 1)).toEqual({ senderAway: true, hosting: false, tuckedIn: true, done: false });
    expect(hugPhase(plan, plan.duration)).toEqual({ senderAway: false, hosting: false, tuckedIn: true, done: true });
    // At half speed everything takes twice as long.
    expect(hugPhase(plan, plan.host[0] + 1, 2).hosting).toBe(false);
    expect(hugPhaseMarks(plan, 2)).toEqual([0, plan.duration * 2, plan.host[0] * 2, plan.host[1] * 2]);
    // Reduced motion: no walk, the hug shows at once.
    expect(planHug(way('self'), true)).toMatchObject({ duration: HUG_HOLD_MS, host: [0, HUG_HOLD_MS], frames: [] });
  });

  it('turns each frame into a held keyframe on its walker frame', () => {
    const plan = planHug(way('partner'));
    const keyframes = walkerKeyframes(plan);
    expect(keyframes).toHaveLength(plan.frames.length);
    expect(keyframes.every(frame => frame.easing === 'steps(1, end)')).toBe(true);
    const offsets = keyframes.map(frame => frame.offset as number);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
    expect(keyframes[0].backgroundPosition).toBe(`${(layout.walker.leave.work / (WALKER.frames - 1) * 100).toFixed(4)}% 0`);
    // Facing left is the same frame mirrored.
    const left = plan.frames.findIndex(frame => frame.facing === -1);
    expect(keyframes[left].transform).toMatch(/scale\(-/);
  });

  it('keeps room right of TA, so my pup hugging TA from the right is never cut off', () => {
    expect(layout.overhang).toBeGreaterThan(0);
    expect(hugRoom(1)).toBe(Math.ceil(layout.overhang * 230 / 384));
    expect(hugRoom(1.25)).toBeGreaterThan(hugRoom(1));
  });
});
