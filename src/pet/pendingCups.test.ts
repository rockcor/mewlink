import { describe, expect, it } from 'vitest';
import { consumeCup, restorePendingCups, waterClickAction } from './pendingCups';

describe('drink own cup before sending another', () => {
  const self = { id: 'received-water', style: 'tumbler' as const, placedAt: 100 };
  const partner = { id: 'sent-water', style: 'bottle' as const, placedAt: 200 };
  it('keeps independent cups and prioritizes the local one', () => {
    const cups = { self, partner };
    expect(waterClickAction(cups)).toBe('drink-self');
    const next = consumeCup(cups, 'self', self.id);
    expect(next).toEqual({ partner });
    expect(waterClickAction(next)).toBe('send-water');
    expect(cups).toEqual({ self, partner });
  });
  it('does not consume a replacement cup on an old acknowledgement', () => {
    expect(consumeCup({ self, partner }, 'partner', 'old-cup')).toEqual({ self, partner });
    expect(consumeCup({ self, partner }, 'partner', partner.id)).toEqual({ self });
  });
  it('restores both cups and migrates an existing single cup', () => {
    expect(restorePendingCups({ self, partner })).toEqual({ self, partner });
    expect(restorePendingCups({ target: 'self', style: 'tumbler', placedAt: 100 })).toEqual({ self: { ...self, id: 'legacy-100' } });
    expect(restorePendingCups({ target: 'self', style: 'invalid', placedAt: NaN })).toEqual({});
  });
});
