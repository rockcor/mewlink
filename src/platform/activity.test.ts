import { classify } from './activity';
import { describe, expect, it } from 'vitest';
describe('privacy-first activity classification', () => {
  it('treats lock as rest regardless of app', () => expect(classify({ locked: true, idleSeconds: 0, appClass: 'editor' })).toBe('rest'));
  it('uses idle thresholds before app class', () => expect(classify({ locked: false, idleSeconds: 200, appClass: 'meeting' })).toBe('idle'));
  it('maps only coarse app classes', () => expect(classify({ locked: false, idleSeconds: 1, appClass: 'reader' })).toBe('reading'));
  it('maps local media activity to video', () => expect(classify({ locked: false, idleSeconds: 1, appClass: 'media' })).toBe('video'));
});
