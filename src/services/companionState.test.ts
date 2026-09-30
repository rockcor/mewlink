import { describe, expect, it } from 'vitest';
import type { ActivityKind, StoredEvent } from '../domain/types';
import { companionStates, partnerEventsFor, PRESENCE_STALE_MS } from './companionState';
import { buildReplay } from './replay';

const now = Date.parse('2026-09-21T18:00:00Z');
const identity = { relationshipId: 'current', deviceId: 'alice', partnerDeviceId: 'bob' };
const self = { activity: 'work', workVisual: 'code', skin: 'mint' } as const;
function activity(category: ActivityKind, sender = 'bob', at = now): StoredEvent {
  const timestamp = new Date(at).toISOString();
  return { direction: 'in', status: 'delivered', receivedAt: timestamp, event: {
    id: crypto.randomUUID(), version: 1, relationshipId: 'current', senderDeviceId: sender,
    createdAt: timestamp, senderUtcOffsetMinutes: -420, kind: 'activity.segment',
    payload: { category, workVisual: 'ai', startedAt: timestamp, endedAt: timestamp },
  } };
}

describe('independent local and remote companions', () => {
  it('shows current partner work without replay, regardless of equal or different time zones', () => {
    for (const offset of [-420, 0, 840]) {
      const event = activity('work');
      event.event.senderUtcOffsetMinutes = offset;
      const result = companionStates(self, [event], identity, undefined, now);
      expect(result.partner).toEqual({ activity: 'work', workVisual: 'ai', skin: 'cream' });
      expect(result.self).toEqual(self);
      expect(result.partnerLive).toBe(true);
    }
  });
  it('only sleeps for an explicit fresh rest event; missing or stale data is unknown', () => {
    expect(companionStates(self, [], identity, undefined, now).partner.activity).toBe('idle');
    expect(companionStates(self, [activity('rest')], identity, undefined, now).partner.activity).toBe('rest');
    const stale = companionStates(self, [activity('rest', 'bob', now - PRESENCE_STALE_MS - 1)], identity, undefined, now);
    expect(stale.partner.activity).toBe('idle');
    expect(stale.partnerLive).toBe(false);
  });
  it('a partner skin update never changes local skin or local activity, on either device', () => {
    const skin = activity('rest');
    skin.event = { ...skin.event, kind: 'profile.skin', payload: { skin: 'sky' } };
    const alice = companionStates(self, [activity('meeting'), skin], identity, undefined, now);
    expect(alice.self).toEqual(self);
    expect(alice.partner).toEqual({ activity: 'meeting', workVisual: 'ai', skin: 'sky' });
    const bobSelf = { activity: 'meeting', workVisual: 'web', skin: 'sky' } as const;
    const bob = companionStates(bobSelf, [activity('work', 'alice')], { ...identity, deviceId: 'bob', partnerDeviceId: 'alice' }, undefined, now);
    expect(bob.self).toEqual(bobSelf);
    expect(bob.partner.activity).toBe('work');
  });
  it('rejects local echoes, other relationships and third devices', () => {
    const old = activity('rest');
    old.event.relationshipId = 'previous';
    const own = activity('rest', 'alice');
    const third = activity('rest', 'mallory');
    const outbound = { ...activity('rest'), direction: 'out' as const };
    expect(partnerEventsFor([old, own, third, outbound], identity)).toEqual([]);
    expect(partnerEventsFor([activity('rest')], undefined)).toEqual([]);
    expect(partnerEventsFor([own], { ...identity, partnerDeviceId: 'alice' })).toEqual([]);
  });
  it('uses event order rather than asynchronous insertion order', () => {
    const result = companionStates(self, [activity('work'), activity('rest', 'bob', now - 20_000)], identity, undefined, now);
    expect(result.partner.activity).toBe('work');
  });
  it('retains the previous replay activity during interactions and returns to live after replay', () => {
    const work = activity('work', 'bob', now - 300_000);
    const hug = activity('idle', 'bob', now - 200_000);
    hug.event = { ...hug.event, kind: 'interaction', payload: { action: 'hug' } };
    const events = [work, hug, activity('meeting')];
    const items = buildReplay(events);
    expect(companionStates(self, events, identity, { items, frame: 1 }, now).partner.activity).toBe('work');
    expect(companionStates(self, events, identity, undefined, now).partner.activity).toBe('meeting');
  });
});
