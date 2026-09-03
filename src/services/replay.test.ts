import { describe, expect, it } from 'vitest';
import type { PlainEvent, StoredEvent } from '../domain/types';
import { buildReplay } from './replay';

function stored(event: PlainEvent): StoredEvent {
  return { event, direction: 'in', status: 'delivered', receivedAt: event.createdAt };
}

describe('time-zone aware replay', () => {
  it('orders by the shared instant and renders sender and receiver clocks', () => {
    const later: PlainEvent = {
      id: 'later', version: 1, relationshipId: 'pair', senderDeviceId: 'partner',
      createdAt: '2026-09-03T07:30:00.000Z', senderUtcOffsetMinutes: -420,
      kind: 'interaction', payload: { action: 'water', cupStyle: 'tumbler' }
    };
    const earlier: PlainEvent = {
      id: 'earlier', version: 1, relationshipId: 'pair', senderDeviceId: 'partner',
      createdAt: '2026-09-03T06:30:00.000Z', senderUtcOffsetMinutes: -420,
      kind: 'interaction', payload: { action: 'hug' }
    };

    const replay = buildReplay([stored(later), stored(earlier)], 480);

    expect(replay.map(item => item.id)).toEqual(['earlier', 'later']);
    expect(replay[0].clockLabel).toBe('TA 09/02 23:30 → 你 09/03 14:30');
    expect(replay[1].cupStyle).toBe('tumbler');
  });

  it('can hide timezone labels without disabling replay', () => {
    const event: PlainEvent = {
      id: 'hidden-clock', version: 1, relationshipId: 'pair', senderDeviceId: 'partner',
      createdAt: '2026-09-03T07:30:00.000Z', senderUtcOffsetMinutes: -420,
      kind: 'activity.segment', payload: { category: 'coding', startedAt: '2026-09-03T07:00:00.000Z', endedAt: '2026-09-03T07:30:00.000Z' }
    };

    expect(buildReplay([stored(event)], 480, false)[0].clockLabel).toBe('');
  });
});
