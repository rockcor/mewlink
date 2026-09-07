import { classify, inputChangesForSequence, keyboardEventsForSequence, nextSampleDelay, POINTER_ANIMATION_INTERVAL_MS, POINTER_EVENTS_PER_ANIMATION, pointerClicksForSequence, pointerEventsForSequence, shouldAnimatePointer, visualInputForActivity, workVisualFor } from './activity';
import { describe, expect, it } from 'vitest';
describe('privacy-first activity classification', () => {
  it('treats lock as rest regardless of app', () => expect(classify({ locked: true, idleSeconds: 0, appClass: 'editor' })).toBe('rest'));
  it('uses idle thresholds before app class', () => expect(classify({ locked: false, idleSeconds: 200, appClass: 'meeting' })).toBe('idle'));
  it('merges AI tools, editors, documents, and browsers into work', () => {
    expect(classify({ locked: false, idleSeconds: 1, appClass: 'ai' })).toBe('work');
    expect(classify({ locked: false, idleSeconds: 1, appClass: 'reader' })).toBe('work');
    expect(classify({ locked: false, idleSeconds: 1, appClass: 'editor' })).toBe('work');
    expect(classify({ locked: false, idleSeconds: 1, appClass: 'browser' })).toBe('work');
  });
  it('maps local media activity to leisure', () => expect(classify({ locked: false, idleSeconds: 1, appClass: 'media' })).toBe('leisure'));
  it('uses the private local class only to change the work screen', () => {
    expect(workVisualFor({ locked: false, idleSeconds: 1, appClass: 'ai' })).toBe('ai');
    expect(workVisualFor({ locked: false, idleSeconds: 1, appClass: 'editor' })).toBe('code');
    expect(workVisualFor({ locked: false, idleSeconds: 1, appClass: 'reader' })).toBe('document');
    expect(workVisualFor({ locked: false, idleSeconds: 1, appClass: 'browser' })).toBe('web');
  });
  it('keeps keyboard and pointer hands active throughout work', () => {
    expect(visualInputForActivity('meeting', true, false)).toBe('none');
    expect(visualInputForActivity('work', true, false)).toBe('keyboard');
    expect(visualInputForActivity('work', false, true)).toBe('pointer');
  });
  it('polls active input quickly and rests slowly', () => {
    expect(nextSampleDelay({ locked: false, idleSeconds: 1, appClass: 'editor' })).toBe(500);
    expect(nextSampleDelay({ locked: false, idleSeconds: 0, appClass: 'editor', inputKind: 'keyboard' })).toBe(260);
    expect(nextSampleDelay({ locked: false, idleSeconds: 200, appClass: 'editor' })).toBe(900);
    expect(nextSampleDelay({ locked: true, idleSeconds: 0, appClass: 'editor' })).toBe(5_000);
  });
  it('advances a hand only when a real input sequence changes', () => {
    const baseline = { keyboardSequence: 41, pointerSequence: 12, pointerClickSequence: 3, recentKind: 'none' as const };
    expect(inputChangesForSequence(baseline, { ...baseline })).toEqual({ keyboard: false, pointer: false });
    expect(inputChangesForSequence(baseline, { ...baseline, keyboardSequence: 42, recentKind: 'keyboard' })).toEqual({ keyboard: true, pointer: false });
    expect(inputChangesForSequence(baseline, { ...baseline, pointerSequence: 13, recentKind: 'pointer' })).toEqual({ keyboard: false, pointer: true });
  });
  it('keeps keyboard and pointer changes independent when both advance', () => {
    const baseline = { keyboardSequence: 2, pointerSequence: 8, pointerClickSequence: 2, recentKind: 'none' as const };
    expect(inputChangesForSequence(baseline, { keyboardSequence: 3, pointerSequence: 9, pointerClickSequence: 2, recentKind: 'pointer' })).toEqual({ keyboard: true, pointer: true });
    expect(visualInputForActivity('work', true, true)).toBe('both');
  });
  it('counts keyboard and click deltas for statistics without counting pointer movement', () => {
    const previous = { keyboardSequence: 20, pointerSequence: 100, pointerClickSequence: 7, recentKind: 'none' as const };
    const current = { keyboardSequence: 25, pointerSequence: 112, pointerClickSequence: 9, recentKind: 'pointer' as const };
    expect(keyboardEventsForSequence(previous, current)).toBe(5);
    expect(pointerEventsForSequence(previous, current)).toBe(12);
    expect(pointerClicksForSequence(previous, current)).toBe(2);
    expect(pointerClicksForSequence(previous, { ...current, pointerClickSequence: 7 })).toBe(0);
  });
  it('coalesces dense pointer movement into a calmer hand rhythm', () => {
    const baseline = { keyboardSequence: 2, pointerSequence: 8, pointerClickSequence: 2, recentKind: 'none' as const };
    expect(pointerEventsForSequence(baseline, { ...baseline, pointerSequence: 8 + POINTER_EVENTS_PER_ANIMATION })).toBe(POINTER_EVENTS_PER_ANIMATION);
    expect(shouldAnimatePointer(Number.NEGATIVE_INFINITY, 1)).toBe(true);
    expect(shouldAnimatePointer(1_000, 1_000 + POINTER_ANIMATION_INTERVAL_MS - 1)).toBe(false);
    expect(shouldAnimatePointer(1_000, 1_000 + POINTER_ANIMATION_INTERVAL_MS)).toBe(true);
  });
});
