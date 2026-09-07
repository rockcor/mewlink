import { describe, expect, it } from 'vitest';
import type { PetSkin, StoredEvent } from '../domain/types';
import { latestPartnerSkin } from './profile';

function skinEvent(relationshipId: string, skin: PetSkin): StoredEvent {
  return {
    direction: 'in', status: 'delivered', receivedAt: '2026-09-06T00:00:00.000Z',
    event: {
      id: crypto.randomUUID(), version: 1, relationshipId, senderDeviceId: 'partnerDevice0001',
      createdAt: '2026-09-06T00:00:00.000Z', kind: 'profile.skin', payload: { skin }
    }
  };
}

describe('partner companion profile', () => {
  it('uses the latest skin received for the current relationship', () => {
    const events = [skinEvent('oldRelationship01', 'mint'), skinEvent('currentRelation01', 'peach'), skinEvent('currentRelation01', 'luka')];
    expect(latestPartnerSkin(events, 'currentRelation01')).toBe('luka');
  });

  it('does not reuse a skin from an old or disconnected relationship', () => {
    expect(latestPartnerSkin([skinEvent('oldRelationship01', 'lavender')], 'currentRelation01')).toBe('cream');
    expect(latestPartnerSkin([], undefined)).toBe('cream');
  });
});
