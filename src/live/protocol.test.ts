import { describe, expect, it } from 'vitest';
import { decodeActivity, decodeVisual, encodeActivity, encodeVisual, HandsPlayer, Playout, WINDOW_MS, WindowCounter } from './protocol';

const signal = (keyboard: number, pointer: number, clicks: number) =>
  ({ keyboardSequence: keyboard, pointerSequence: pointer, pointerClickSequence: clicks, recentKind: 'none' as const });

describe('live typing protocol', () => {
  it('counts input per window and ignores counter resets', () => {
    const counter = new WindowCounter();
    counter.add(signal(10, 5, 1), signal(13, 9, 2));
    counter.add(signal(13, 9, 2), signal(14, 9, 2));
    expect(counter.take()).toEqual({ keyboard: 4, pointer: 4, clicks: 1 });
    expect(counter.take()).toEqual({ keyboard: 0, pointer: 0, clicks: 0 });
    counter.add(signal(900, 900, 900), signal(2, 2, 2)); // the app restarted
    expect(counter.take()).toEqual({ keyboard: 0, pointer: 0, clicks: 0 });
  });

  it('round-trips activity and visual codes that fit the 4-bit native fields', () => {
    expect(decodeActivity(encodeActivity('meeting'))).toBe('meeting');
    expect(decodeVisual(encodeVisual('ai'))).toBe('ai');
    expect(decodeActivity(15)).toBeUndefined();
  });

  it('plays windows in order a steady buffer after arrival and drops replays', () => {
    const playout = new Playout();
    const first = playout.accept(1, WINDOW_MS + 40)!;
    expect(first - (WINDOW_MS + 40)).toBe(400);
    const second = playout.accept(2, 2 * WINDOW_MS + 45)!;
    expect(second - first).toBe(WINDOW_MS);
    expect(playout.accept(2, 2 * WINDOW_MS + 46)).toBeUndefined();
    expect(playout.accept(1, 3 * WINDOW_MS)).toBeUndefined();
  });

  it('shrinks the buffer toward the 250 ms floor on a steady network', () => {
    const playout = new Playout();
    let playAt = 0;
    for (let window = 1; window <= 60; window++) playAt = playout.accept(window, window * WINDOW_MS + 30)!;
    expect(playAt - (60 * WINDOW_MS + 30)).toBe(250);
  });

  it('spreads key presses across the window and releases the paw between them', () => {
    const player = new HandsPlayer();
    const steps = player.steps({ keyboard: 2, pointer: 0, clicks: 0 }, 1_000);
    expect(steps).toEqual([
      { atMs: 1_000, keyboard: true }, { atMs: 1_110, keyboard: false },
      { atMs: 1_125, keyboard: true }, { atMs: 1_235, keyboard: false },
    ]);
    expect(player.steps({ keyboard: 0, pointer: 0, clicks: 0 }, 1_250)).toEqual([]);
  });

  it('animates the mouse paw every four pointer events or on a click', () => {
    const player = new HandsPlayer();
    expect(player.steps({ keyboard: 0, pointer: 3, clicks: 0 }, 0)).toEqual([]);
    expect(player.steps({ keyboard: 0, pointer: 1, clicks: 0 }, 250)).toEqual([{ atMs: 250, pointer: true }, { atMs: 360, pointer: false }]);
    expect(player.steps({ keyboard: 0, pointer: 0, clicks: 1 }, 500)).toHaveLength(2);
  });

  it('shows the tense face after a burst of typing, for 1.8 s after it', () => {
    const player = new HandsPlayer();
    for (let window = 0; window < 4; window++) player.steps({ keyboard: 5, pointer: 0, clicks: 0 }, window * WINDOW_MS);
    expect(player.stressedAt(750)).toBe(true);
    expect(player.stressedUntilMs).toBe(750 + 1_800);
    expect(player.stressedAt(750 + 1_800)).toBe(false);
  });
});
