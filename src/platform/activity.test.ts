import { classify, inputBurstReached, inputBurstSampleForSequence, inputChangesForSequence, keyboardEventsForSequence, KEYBOARD_STRESS_THRESHOLD, nextSampleDelay, POINTER_ANIMATION_INTERVAL_MS, POINTER_EVENTS_PER_ANIMATION, POINTER_CLICK_STRESS_THRESHOLD, pointerClicksForSequence, pointerEventsForSequence, shouldAnimatePointer, trimInputBurst, visualInputForActivity, workVisualFor, type InputBurstSample } from './activity';
import { describe, expect, it } from 'vitest';
import { nextActivity } from './activity';
describe('privacy-first activity classification', () => {
  it('wakes up after idle or lock even when the foreground app is unknown', () => {
    const active = { locked: false, idleSeconds: 0, appClass: 'unknown' as const };
    expect(nextActivity('rest', active)).toBe('work');
    expect(nextActivity('idle', active)).toBe('work');
    expect(nextActivity('meeting', active)).toBe('meeting');
    expect(nextActivity('rest', { ...active, locked: true })).toBe('rest');
    expect(nextActivity('work', { ...active, idleSeconds: 600 })).toBe('rest');
  });
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
    expect(workVisualFor({ locked: false, idleSeconds: 1, appClass: 'mewlink' })).toBe('mewlink');
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
  it('shows the tense face only after a real input burst', () => {
    expect(inputBurstReached([{ at: 1_000, keyboard: KEYBOARD_STRESS_THRESHOLD - 1, pointerClicks: 0 }])).toBe(false);
    expect(inputBurstReached([{ at: 1_000, keyboard: KEYBOARD_STRESS_THRESHOLD, pointerClicks: 0 }])).toBe(true);
    expect(inputBurstReached([{ at: 1_000, keyboard: 0, pointerClicks: POINTER_CLICK_STRESS_THRESHOLD - 1 }])).toBe(false);
    expect(inputBurstReached([{ at: 1_000, keyboard: 0, pointerClicks: POINTER_CLICK_STRESS_THRESHOLD }])).toBe(true);
    expect(trimInputBurst([{ at: 100, keyboard: 10, pointerClicks: 0 }, { at: 1_900, keyboard: 1, pointerClicks: 0 }], 2_000))
      .toEqual([{ at: 1_900, keyboard: 1, pointerClicks: 0 }]);
  });
});

describe('tense eyes respond to presses, not pointer movement', () => {
  const baseline = { keyboardSequence: 20, pointerSequence: 100, pointerClickSequence: 7, recentKind: 'pointer' as const };

  it('ignores dense movement, dragging and scrolling while still moving the pointer hand', () => {
    const moving = { ...baseline, pointerSequence: 50_000 };
    expect(inputChangesForSequence(baseline, moving).pointer).toBe(true);
    expect(pointerEventsForSequence(baseline, moving)).toBeGreaterThan(POINTER_EVENTS_PER_ANIMATION);
    expect(inputBurstSampleForSequence(baseline, moving, 1000)).toBeUndefined();
  });
  it('does not let movement turn a single or double click into a click burst', () => {
    for (const clicks of [1, 2]) {
      const sample = inputBurstSampleForSequence(baseline, { ...baseline, pointerSequence: 50_000, pointerClickSequence: 7 + clicks }, 1000)!;
      expect(sample.pointerClicks).toBe(clicks);
      expect(inputBurstReached([sample])).toBe(false);
    }
  });
  it('allows a real rapid click burst to trigger the face', () => {
    const sample = inputBurstSampleForSequence(baseline, { ...baseline, pointerSequence: 100 + POINTER_CLICK_STRESS_THRESHOLD, pointerClickSequence: 7 + POINTER_CLICK_STRESS_THRESHOLD }, 1000)!;
    expect(inputBurstReached([sample])).toBe(true);
  });
  it('allows typing to trigger the face independently of mouse movement', () => {
    const sample = inputBurstSampleForSequence(baseline, { ...baseline, keyboardSequence: 20 + KEYBOARD_STRESS_THRESHOLD, pointerSequence: 50_000 }, 1000)!;
    expect(sample).toEqual({ at: 1000, keyboard: KEYBOARD_STRESS_THRESHOLD, pointerClicks: 0 });
    expect(inputBurstReached([sample])).toBe(true);
  });
  it('does not retrigger or extend a previous burst when only the pointer continues moving', () => {
    let previous = { ...baseline, keyboardSequence: 20 + KEYBOARD_STRESS_THRESHOLD };
    let samples: InputBurstSample[] = [inputBurstSampleForSequence(baseline, previous, 0)!];
    expect(inputBurstReached(samples)).toBe(true);
    for (let at = 100; at <= 2000; at += 100) {
      const moving = { ...previous, pointerSequence: previous.pointerSequence + 1000 };
      samples = trimInputBurst(samples, at);
      // The caller only restarts the eye timer when this returns a new sample.
      expect(inputBurstSampleForSequence(previous, moving, at)).toBeUndefined();
      previous = moving;
    }
    expect(inputBurstReached(samples)).toBe(false);
  });
  it('does not accumulate spaced-out clicks into a burst', () => {
    let previous = baseline;
    let samples: InputBurstSample[] = [];
    for (let click = 1; click <= POINTER_CLICK_STRESS_THRESHOLD * 2; click++) {
      const at = click * 1000;
      const current = { ...previous, pointerClickSequence: previous.pointerClickSequence + 1, pointerSequence: previous.pointerSequence + 1 };
      samples = [...trimInputBurst(samples, at), inputBurstSampleForSequence(previous, current, at)!];
      expect(inputBurstReached(samples)).toBe(false);
      previous = current;
    }
  });
});
