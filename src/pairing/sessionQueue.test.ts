import { describe, expect, it } from 'vitest';
import { createSessionQueue } from './sessionQueue';

describe('pairing state serialization', () => {
  it('serializes concurrent send/sync so neither overwrites the other progress', async () => {
    const queue = createSessionQueue();
    let state = { nextSequence: 0, relayCursor: 0 };
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const receive = queue(async () => {
      const snapshot = state;
      await gate;
      state = { ...snapshot, relayCursor: 5 };
    });
    const send = queue(async () => {
      const snapshot = state;
      state = { ...snapshot, nextSequence: snapshot.nextSequence + 1 };
      return state.nextSequence;
    });
    release();
    await receive;
    expect(await send).toBe(1);
    expect(state).toEqual({ nextSequence: 1, relayCursor: 5 });
  });
  it('continues after a network error', async () => {
    const queue = createSessionQueue();
    await expect(queue(async () => { throw Error('offline'); })).rejects.toThrow('offline');
    expect(await queue(async () => 2)).toBe(2);
  });
});
