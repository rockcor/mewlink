import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import { createPairingState } from '../pairing/pairing';
import { queueEncryptedEvent, flushEncryptedOutbox } from './outbox';
import { historySeen, markHistorySeen, pendingOutgoing, putEvent, replayReferences, listEvents, pruneEventsOlderThan,
  saveHistoryDraft, loadHistoryDraft, discardRelationshipHistory } from '../storage/events';
import type { PlainEvent } from '../domain/types';

const state = async () => ({ ...await createPairingState(), partnerDeviceId: 'partner-device-12345' });
const event = (identity: Awaited<ReturnType<typeof state>>, id = crypto.randomUUID()): PlainEvent => ({
  id, version: 1, relationshipId: identity.relationshipId, senderDeviceId: identity.deviceId,
  createdAt: new Date().toISOString(), kind: 'operation.batch', payload: {
    format: 1, startedAt: new Date().toISOString(), points: [[0, 1, 1, 0, 0, 0]],
  },
});
beforeEach(async () => {
  const db = await openDB('mewlink', 2);
  for (const name of db.objectStoreNames) await db.clear(name);
  db.close();
});
describe('durable history and encrypted outbox', () => {
  it('persists before sending, survives a failed/lost response and retries identical ciphertext', async () => {
    const identity = await state();
    const queued = await queueEncryptedEvent(identity, event(identity));
    const before = await pendingOutgoing(identity);
    await expect(flushEncryptedOutbox(queued.state, async () => { throw new Error('offline'); })).rejects.toThrow();
    expect(await pendingOutgoing(identity)).toEqual(before);
    let body = '';
    await flushEncryptedOutbox(queued.state, async (_url, init) => {
      body = String(init?.body);
      return new Response('{}', { status: 202 });
    });
    expect(JSON.parse(body).envelopes[0]).toEqual(before[0].envelope);
    expect(await pendingOutgoing(identity)).toEqual([]);
    expect(await listEvents()).toEqual([]);
  });
  it('reserves sequences across a crash before pairing state was saved', async () => {
    const identity = await state();
    await queueEncryptedEvent(identity, event(identity));
    await queueEncryptedEvent(identity, event(identity));
    expect((await pendingOutgoing(identity)).map(item => item.envelope.sequence)).toEqual([1, 2]);
  });
  it('recovered draft id is idempotent both before and after delivery', async () => {
    const identity = await state(), recording = event(identity);
    const queued = await queueEncryptedEvent(identity, recording);
    await queueEncryptedEvent(queued.state, recording);
    expect((await pendingOutgoing(identity)).length).toBe(1);
    await flushEncryptedOutbox(queued.state, async () => new Response('{}', { status: 202 }));
    await queueEncryptedEvent(queued.state, recording);
    expect(await pendingOutgoing(identity)).toEqual([]);
  });
  it('filters other identities, preserves independent history and clears only the unbound relationship', async () => {
    const one = await state(), two = await state();
    await queueEncryptedEvent(one, event(one));
    await queueEncryptedEvent(two, event(two));
    await saveHistoryDraft(one.relationshipId, event(one).payload as never);
    expect(await loadHistoryDraft(one.relationshipId)).toBeDefined();
    await markHistorySeen(one.relationshipId, 100);
    await markHistorySeen(one.relationshipId, 20);
    expect(await historySeen(one.relationshipId)).toBe(100);
    await discardRelationshipHistory(one.relationshipId);
    expect(await pendingOutgoing(one)).toEqual([]);
    expect(await loadHistoryDraft(one.relationshipId)).toBeUndefined();
    expect((await pendingOutgoing(two)).length).toBe(1);
  });
  it('returns metadata only and prunes expired queued history with its ciphertext', async () => {
    const identity = await state();
    const recent = { ...event(identity), senderDeviceId: identity.partnerDeviceId };
    await putEvent({ event: recent, direction: 'in', status: 'delivered', receivedAt: new Date().toISOString() });
    const old = { ...event(identity), createdAt: new Date(Date.now() - 49 * 3600_000).toISOString() };
    await queueEncryptedEvent(identity, old);
    await pruneEventsOlderThan(48);
    expect(await pendingOutgoing(identity)).toEqual([]);
    const refs = await replayReferences(identity, Date.now() - 12 * 3600_000);
    expect(refs).toEqual([{ id: recent.id, at: recent.createdAt, kind: 'operation.batch' }]);
    expect(await replayReferences(identity, Date.now() + 1000)).toEqual([]);
    expect(await listEvents()).toEqual([]);
  });
});
