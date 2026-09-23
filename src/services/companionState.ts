import type { ActivityKind, ActivitySegment, PetSkin, StoredEvent, WorkVisual } from '../domain/types';
import type { PairingState } from '../pairing/pairing';
import type { ReplayItem } from './replay';

type Identity = Pick<PairingState, 'relationshipId' | 'deviceId' | 'partnerDeviceId'>;
export const PRESENCE_HEARTBEAT_MS = 30_000;
export const PRESENCE_STALE_MS = 90_000;

// Direction alone is not an identity: ignore old pairings and our own echoes.
export function partnerEventsFor(events: StoredEvent[], identity?: Identity): StoredEvent[] {
  if (!identity?.partnerDeviceId || identity.partnerDeviceId === identity.deviceId) return [];
  return events.filter(({ direction, event }) => direction === 'in'
    && event.relationshipId === identity.relationshipId
    && event.senderDeviceId === identity.partnerDeviceId)
    .sort((a, b) => Date.parse(a.event.createdAt) - Date.parse(b.event.createdAt));
}

export interface CompanionState { activity: ActivityKind; workVisual: WorkVisual; skin: PetSkin }

export function companionStates(
  self: CompanionState,
  events: StoredEvent[],
  identity?: Identity,
  replay?: { items: ReplayItem[]; frame: number },
  now = Date.now(),
) {
  const incoming = partnerEventsFor(events, identity);
  const latestSkin = [...incoming].reverse().find(({ event }) => event.kind === 'profile.skin');
  const skin: PetSkin = latestSkin ? (latestSkin.event.payload as { skin: PetSkin }).skin : 'cream';
  const latestActivity = [...incoming].reverse().find(({ event }) => event.kind === 'activity.segment');
  const age = latestActivity ? now - Date.parse(latestActivity.event.createdAt) : Infinity;
  const live = age >= -60_000 && age <= PRESENCE_STALE_MS;
  const payload = live ? latestActivity?.event.payload as ActivitySegment | undefined : undefined;
  // Missing/stale data means unknown, not asleep. Time zones never decide activity.
  let activity: ActivityKind = payload?.category ?? 'idle';
  let workVisual: WorkVisual = payload?.workVisual ?? 'web';
  if (replay) {
    const lastActivity = replay.items.slice(0, replay.frame + 1).reverse().find(item => item.activity);
    activity = lastActivity?.activity ?? activity;
    workVisual = lastActivity?.workVisual ?? workVisual;
  }
  return { self: { ...self }, partner: { activity, workVisual, skin }, partnerLive: live };
}
