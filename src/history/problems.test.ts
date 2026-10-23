import { describe, expect, it } from 'vitest';
import { saveProblem } from './problems';

describe('replay save problems', () => {
  it('is quiet while the pairing is not usable, and names a full disk', () => {
    expect(saveProblem(new Error('pairing_required'))).toBeUndefined();
    expect(saveProblem(new Error('pairing_changed'))).toBeUndefined();
    expect(saveProblem(new Error('pairing changed'))).toBeUndefined();
    expect(saveProblem(new Error('relationship_revoked'))).toBeUndefined();
    expect(saveProblem(new DOMException('full', 'QuotaExceededError'))).toBe('space');
    expect(saveProblem(new Error('ratchet failed'))).toBe('save');
    expect(saveProblem('odd')).toBe('save');
  });
});
