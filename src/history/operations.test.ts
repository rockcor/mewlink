import { describe, expect, it } from 'vitest';
import { OperationRecorder, MAX_OPERATION_POINTS, validOperationBatch } from './operations';
import type { OperationBatch, PlainEvent, StoredEvent } from '../domain/types';
import { decryptEvent, encryptEvent, newDemoKey } from '../crypto/events';
import { condensedReplay, framesForEvent, replayDelay, replayFrames, replaySpeed } from './playback';
const at = Date.parse('2026-09-23T01:00:00Z');
const batch = (): OperationBatch => ({ format: 1, startedAt: new Date(at).toISOString(),
  points: [[0, 2, 0, 0, 0, 0], [120, 0, 8, 0, 0, 0], [900, 1, 1, 1, 0, 1]] });
const stored = (): StoredEvent => ({ direction: 'in', status: 'delivered', receivedAt: new Date(at).toISOString(),
  event: { id: 'history', version: 1, createdAt: new Date(at).toISOString(), relationshipId: 'relationship',
    senderDeviceId: 'sender', senderUtcOffsetMinutes: 480, kind: 'operation.batch', payload: batch() } });
describe('operation recording', () => {
  it('retains simultaneous input counts, clicks separately, and app switches without content', () => {
    const batches: OperationBatch[] = [];
    const recorder = new OperationRecorder(value => batches.push(value));
    recorder.push(at, 'work', 'code');
    recorder.input({ keyboardSequence: 10, pointerSequence: 10, pointerClickSequence: 1, recentKind: 'none' },
      { keyboardSequence: 12, pointerSequence: 18, pointerClickSequence: 2, recentKind: 'pointer' }, at + 30, 'work', 'code');
    recorder.push(at + 400, 'work', 'document');
    recorder.push(at + 600, 'work', 'document');
    recorder.flush();
    expect(batches[0].points.map(p => p.slice(0, 4))).toEqual([[0, 0, 0, 0], [30, 2, 8, 1], [400, 0, 0, 0], [600, 0, 0, 0]]);
    expect(Object.keys(batches[0]).sort()).toEqual(['format', 'points', 'startedAt']);
  });
  it('bounds each batch and flushes on duration or backwards wall clock', () => {
    const batches: OperationBatch[] = [];
    const recorder = new OperationRecorder(value => batches.push(value));
    for (let i = 0; i <= MAX_OPERATION_POINTS; i++) recorder.push(at + i, 'work', 'code');
    recorder.push(at + 20_000, 'rest', 'code');
    recorder.push(at - 100, 'work', 'web');
    recorder.flush();
    expect(batches.map(value => value.points.length)).toEqual([MAX_OPERATION_POINTS, 1, 1, 1]);
    expect(batches.every(validOperationBatch)).toBe(true);
  });
  it('snapshots are independent and reset counters do not create enormous deltas', () => {
    const recorder = new OperationRecorder(() => undefined);
    const before = { keyboardSequence: 100, pointerSequence: 100, pointerClickSequence: 20, recentKind: 'none' as const };
    recorder.input(before, { ...before, keyboardSequence: 1, pointerSequence: 1, pointerClickSequence: 0 }, at, 'work', 'code');
    expect(recorder.snapshot()).toBeUndefined();
    recorder.push(at, 'idle', 'web');
    const snapshot = recorder.snapshot()!;
    snapshot.points[0][1] = 900;
    expect(recorder.snapshot()!.points[0][1]).toBe(0);
  });
  it.each([
    { ...batch(), format: 2 }, { ...batch(), startedAt: 'bad' }, { ...batch(), points: [] },
    { ...batch(), points: Array(257).fill([0, 0, 0, 0, 0, 0]) },
    { ...batch(), points: [[0, 0, 0, 1, 0, 0]] },
    { ...batch(), points: [[0, -1, 0, 0, 0, 0]] },
    { ...batch(), points: [[0, 0, 0, 0, 999, 0]] },
    { ...batch(), points: [[100, 0, 0, 0, 0, 0], [20, 0, 0, 0, 0, 0]] },
  ])('rejects malformed or unbounded batches %#', value => expect(validOperationBatch(value)).toBe(false));
  it('encrypts operation batches and rejects wrong keys or tampered routing', async () => {
    const key = await newDemoKey();
    const envelope = await encryptEvent(stored().event, 'receiver', 1, key);
    expect(JSON.stringify(envelope)).not.toContain('"points":');
    expect(await decryptEvent(envelope, key)).toEqual(stored().event);
    await expect(decryptEvent(envelope, await newDemoKey())).rejects.toThrow();
    await expect(decryptEvent({ ...envelope, recipientDeviceId: 'intruder' }, key)).rejects.toThrow();
  });
  it('does not accept malformed authenticated history', async () => {
    const key = await newDemoKey();
    const event: PlainEvent = { ...stored().event, payload: { ...batch(), points: [[0, 0, 0, 1, 0, 0]] } };
    await expect(decryptEvent(await encryptEvent(event, 'receiver', 2, key), key)).rejects.toThrow();
  });
});
describe('streaming replay', () => {
  it('condenses a dense six-hour track without losing input counts or gestures', async () => {
    const first = framesForEvent(stored(), 0, false, 'en')[0];
    async function* track() {
      for (let index = 0; index < 21_600; index++) {
        yield { ...first, id: String(index), at: new Date(at + index * 1000).toISOString(), keyboard: 2, pointer: 6, clicks: 1 };
        if (index === 5000) yield { ...first, id: 'hug', at: new Date(at + index * 1000 + 1).toISOString(),
          interaction: 'hug' as const, keyboard: 0, pointer: 0, clicks: 0 };
      }
    }
    const speed = replaySpeed([{ id: 'first', at: new Date(at).toISOString(), kind: 'operation.batch' },
      { id: 'last', at: new Date(at + 21_600_000).toISOString(), kind: 'operation.batch' }]);
    const frames = [];
    for await (const frame of condensedReplay(track(), speed)) frames.push(frame);
    expect(speed).toBe(1080);
    expect(frames.length).toBeLessThan(205);
    expect(frames.reduce((sum, frame) => sum + frame.keyboard, 0)).toBe(43_200);
    expect(frames.reduce((sum, frame) => sum + frame.clicks, 0)).toBe(21_600);
    expect(frames.filter(frame => frame.interaction).map(frame => frame.id)).toEqual(['hug']);
  });
  it('time zones change labels, never event order or input counts', () => {
    const asia = framesForEvent(stored(), 480, true, 'zh');
    const us = framesForEvent(stored(), -420, true, 'en');
    expect(asia.map(({ at, keyboard, pointer, clicks }) => [at, keyboard, pointer, clicks]))
      .toEqual(us.map(({ at, keyboard, pointer, clicks }) => [at, keyboard, pointer, clicks]));
    expect(asia[0].clockLabel).not.toBe(us[0].clockLabel);
  });
  it('merges interactions inside batches, not after their last point', async () => {
    const recording = stored();
    const interaction: StoredEvent = { ...recording, event: { ...recording.event, id: 'hug', kind: 'interaction',
      createdAt: new Date(at + 500).toISOString(), payload: { action: 'hug' } } };
    const records = [recording, interaction];
    const refs = records.map(({ event }) => ({ id: event.id, at: event.createdAt, kind: event.kind as 'operation.batch' | 'interaction' }));
    const frames = [];
    for await (const frame of replayFrames(refs, async ref => records.find(item => item.event.id === ref.id), 0, false, 'en')) frames.push(frame);
    expect(frames.map(frame => frame.id)).toEqual(['history:0', 'history:1', 'hug', 'history:2']);
    expect(frames.reduce((sum, frame) => sum + frame.keyboard, 0)).toBe(3);
    expect(frames[1].clicks).toBe(0);
    expect(replayDelay(frames[0], frames[1])).toBe(30);
  });
  it('reads one bounded batch ahead, not the entire history', async () => {
    const refs = Array.from({ length: 1000 }, (_, index) => ({ id: String(index),
      at: new Date(at + index * 10_000).toISOString(), kind: 'operation.batch' as const }));
    let reads = 0;
    const iterator = replayFrames(refs, async ref => {
      reads++;
      return { ...stored(), event: { ...stored().event, id: ref.id, createdAt: ref.at,
        payload: { ...batch(), startedAt: ref.at } } };
    }, 0, false, 'en');
    await iterator.next();
    expect(reads).toBeLessThanOrEqual(2);
    await iterator.return(undefined);
  });
});
