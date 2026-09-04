import { classify, inputChangesForSequence, nextSampleDelay, visualInputForActivity } from './activity';
import { describe, expect, it } from 'vitest';
describe('privacy-first activity classification', () => {
  it('treats lock as rest regardless of app', () => expect(classify({ locked: true, idleSeconds: 0, appClass: 'editor' })).toBe('rest'));
  it('uses idle thresholds before app class', () => expect(classify({ locked: false, idleSeconds: 200, appClass: 'meeting' })).toBe('idle'));
  it('maps only coarse app classes', () => expect(classify({ locked: false, idleSeconds: 1, appClass: 'reader' })).toBe('reading'));
  it('maps local media activity to video', () => expect(classify({ locked: false, idleSeconds: 1, appClass: 'media' })).toBe('video'));
  it('keeps a foreground browser in the browsing state without input', () => expect(classify({ locked: false, idleSeconds: 1, appClass: 'browser', inputKind: 'none' })).toBe('browsing'));
  it('keeps the browsing screen visible while mouse or keyboard input is detected', () => {
    expect(visualInputForActivity('browsing', true, false)).toBe('none');
    expect(visualInputForActivity('browsing', false, true)).toBe('none');
    expect(visualInputForActivity('coding', true, false)).toBe('keyboard');
  });
  it('polls active input quickly and rests slowly', () => {
    expect(nextSampleDelay({ locked: false, idleSeconds: 1, appClass: 'editor' })).toBe(500);
    expect(nextSampleDelay({ locked: false, idleSeconds: 0, appClass: 'editor', inputKind: 'keyboard' })).toBe(260);
    expect(nextSampleDelay({ locked: false, idleSeconds: 200, appClass: 'editor' })).toBe(900);
    expect(nextSampleDelay({ locked: true, idleSeconds: 0, appClass: 'editor' })).toBe(5_000);
  });
  it('advances a hand only when a real input sequence changes', () => {
    const baseline = { keyboardSequence: 41, pointerSequence: 12, recentKind: 'none' as const };
    expect(inputChangesForSequence(baseline, { ...baseline })).toEqual({ keyboard: false, pointer: false });
    expect(inputChangesForSequence(baseline, { ...baseline, keyboardSequence: 42, recentKind: 'keyboard' })).toEqual({ keyboard: true, pointer: false });
    expect(inputChangesForSequence(baseline, { ...baseline, pointerSequence: 13, recentKind: 'pointer' })).toEqual({ keyboard: false, pointer: true });
  });
  it('keeps keyboard and pointer changes independent when both advance', () => {
    const baseline = { keyboardSequence: 2, pointerSequence: 8, recentKind: 'none' as const };
    expect(inputChangesForSequence(baseline, { keyboardSequence: 3, pointerSequence: 9, recentKind: 'pointer' })).toEqual({ keyboard: true, pointer: true });
    expect(visualInputForActivity('coding', true, true)).toBe('both');
  });
});
