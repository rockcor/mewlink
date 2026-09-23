import { cupStyles, type CupStyle } from '../domain/types';

export type PetTarget = 'self' | 'partner';
export interface PendingCup { id: string; style: CupStyle; placedAt: number }
export type PendingCups = Partial<Record<PetTarget, PendingCup>>;

function validCup(value: unknown): value is PendingCup {
  if (!value || typeof value !== 'object') return false;
  const cup = value as Partial<PendingCup>;
  return typeof cup.id === 'string' && cupStyles.includes(cup.style as CupStyle)
    && typeof cup.placedAt === 'number' && Number.isFinite(cup.placedAt);
}

export function restorePendingCups(value: unknown): PendingCups {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  // Preserve an existing cup when upgrading from the single-cup model.
  if (record.target === 'self' || record.target === 'partner') {
    const cup = { id: `legacy-${record.placedAt}`, style: record.style, placedAt: record.placedAt };
    return validCup(cup) ? { [record.target]: cup } : {};
  }
  return { ...(validCup(record.self) ? { self: record.self } : {}), ...(validCup(record.partner) ? { partner: record.partner } : {}) };
}

export function waterClickAction(cups: PendingCups): 'drink-self' | 'send-water' {
  return cups.self ? 'drink-self' : 'send-water';
}

export function consumeCup(cups: PendingCups, target: PetTarget, id: string): PendingCups {
  if (cups[target]?.id !== id) return cups;
  const next = { ...cups };
  delete next[target];
  return next;
}
