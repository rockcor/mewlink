import type { PetSkin, PetSkinPayload, StoredEvent } from '../domain/types';

export function latestPartnerSkin(events: StoredEvent[], relationshipId?: string): PetSkin {
  if (!relationshipId) return 'cream';
  const latest = [...events].reverse().find(({ direction, event }) =>
    direction === 'in' && event.relationshipId === relationshipId && event.kind === 'profile.skin'
  );
  return latest ? (latest.event.payload as PetSkinPayload).skin : 'cream';
}
