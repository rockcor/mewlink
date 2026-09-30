import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { expect, it } from 'vitest';

it('upgrades an existing v1 event database without losing interactions', async () => {
  const original = await openDB('mewlink', 1, { upgrade(db) {
    db.createObjectStore('events', { keyPath: 'event.id' }).createIndex('createdAt', 'event.createdAt');
  } });
  const stored = { event: { id: 'before-upgrade', kind: 'interaction', createdAt: '2026-09-23T00:00:00Z',
    relationshipId: 'pair', senderDeviceId: 'sender', version: 1, payload: { action: 'hug' } },
    direction: 'in', status: 'delivered', receivedAt: '2026-09-23T00:00:00Z' };
  await original.put('events', stored);
  original.close();
  const { listEvents } = await import('../storage/events');
  expect(await listEvents()).toEqual([stored]);
  const upgraded = await openDB('mewlink', 2);
  expect([...upgraded.objectStoreNames]).toEqual(['events', 'history', 'historyMeta', 'outbox']);
  upgraded.close();
});
