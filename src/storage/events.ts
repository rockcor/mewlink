import { openDB } from 'idb';
import type { EncryptedEnvelope, OperationBatch, StoredEvent } from '../domain/types';
import type { PairingState } from '../pairing/pairing';
export interface OutboxItem { id: string; envelope: EncryptedEnvelope; stored: StoredEvent }
export interface HistoryRef { id: string; at: string; kind: 'operation.batch' | 'interaction' | 'activity.segment' }
const db = openDB('mewlink', 2, { upgrade(database, oldVersion) {
  if (oldVersion < 1) {
    const events = database.createObjectStore('events', { keyPath: 'event.id' });
    events.createIndex('createdAt', 'event.createdAt');
  }
  if (oldVersion < 2) {
    const history = database.createObjectStore('history', { keyPath: 'event.id' });
    history.createIndex('createdAt', 'event.createdAt');
    const outbox = database.createObjectStore('outbox', { keyPath: 'id' });
    outbox.createIndex('sequence', 'envelope.sequence');
    database.createObjectStore('historyMeta');
  }
} });
const storeFor = (item: StoredEvent) => item.event.kind === 'operation.batch' ? 'history' : 'events';
export async function storedOutgoing(event: StoredEvent['event']): Promise<StoredEvent | undefined> {
  return (await db).get(event.kind === 'operation.batch' ? 'history' : 'events', event.id);
}
export async function putEvent(item: StoredEvent) { return (await db).put(storeFor(item), item); }
export async function listEvents(): Promise<StoredEvent[]> { return (await db).getAllFromIndex('events', 'createdAt'); }
export async function saveOutgoing(item: OutboxItem) {
  const tx = (await db).transaction(['outbox', storeFor(item.stored)], 'readwrite');
  await tx.objectStore('outbox').put(item);
  await tx.objectStore(storeFor(item.stored)).put(item.stored);
  await tx.done;
}
export async function pendingOutgoing(state: PairingState, limit = 12): Promise<OutboxItem[]> {
  const result: OutboxItem[] = [];
  let cursor = await (await db).transaction('outbox').store.index('sequence').openCursor();
  while (cursor && result.length < limit) {
    const item = cursor.value as OutboxItem;
    if (item.envelope.relationshipId === state.relationshipId && item.envelope.senderDeviceId === state.deviceId
      && item.envelope.recipientDeviceId === state.partnerDeviceId && item.envelope.keyId === state.keyId) result.push(item);
    cursor = await cursor.continue();
  }
  return result;
}
export async function nextOutgoingSequence(state: PairingState) {
  let sequence = state.nextSequence;
  let cursor = await (await db).transaction('outbox').store.index('sequence').openCursor(null, 'prev');
  while (cursor) {
    const item = cursor.value as OutboxItem;
    if (item.envelope.relationshipId === state.relationshipId && item.envelope.senderDeviceId === state.deviceId) {
      sequence = Math.max(sequence, item.envelope.sequence);
      break;
    }
    cursor = await cursor.continue();
  }
  return sequence + 1;
}
export async function acknowledgeOutgoing(items: OutboxItem[]) {
  const tx = (await db).transaction(['outbox', 'events', 'history'], 'readwrite');
  for (const item of items) {
    await tx.objectStore(storeFor(item.stored)).put({ ...item.stored, status: 'delivered' });
    await tx.objectStore('outbox').delete(item.id);
  }
  await tx.done;
}
export async function discardRelationshipHistory(relationshipId: string) {
  const tx = (await db).transaction(['history', 'outbox', 'historyMeta'], 'readwrite');
  for (const name of ['history', 'outbox']) {
    let cursor = await tx.objectStore(name).openCursor();
    while (cursor) {
      if ((cursor.value.event ?? cursor.value.envelope).relationshipId === relationshipId) await cursor.delete();
      cursor = await cursor.continue();
    }
  }
  await tx.objectStore('historyMeta').delete(`draft:${relationshipId}`);
  await tx.objectStore('historyMeta').delete(`seen:${relationshipId}`);
  await tx.done;
}
export async function saveHistoryDraft(relationshipId: string, batch?: OperationBatch) {
  const database = await db;
  if (batch) await database.put('historyMeta', batch, `draft:${relationshipId}`);
  else await database.delete('historyMeta', `draft:${relationshipId}`);
}
export async function loadHistoryDraft(relationshipId: string): Promise<OperationBatch | undefined> {
  return (await db).get('historyMeta', `draft:${relationshipId}`);
}
export async function historySeen(relationshipId: string): Promise<number> {
  return (await db).get('historyMeta', `seen:${relationshipId}`).then(value => typeof value === 'number' ? value : 0);
}
export async function markHistorySeen(relationshipId: string, at: number) {
  const tx = (await db).transaction('historyMeta', 'readwrite');
  const key = `seen:${relationshipId}`;
  const previous = await tx.store.get(key);
  await tx.store.put(Math.max(typeof previous === 'number' ? previous : 0, at), key);
  await tx.done;
}
export async function replayReferences(state: PairingState, since: number, until = Date.now()): Promise<HistoryRef[]> {
  if (!Number.isFinite(since) || !Number.isFinite(until) || since > until) return [];
  const refs: HistoryRef[] = [];
  const tx = (await db).transaction(['history', 'events']);
  const range = IDBKeyRange.bound(new Date(since).toISOString(), new Date(until).toISOString());
  for (const name of ['history', 'events']) {
    let cursor = await tx.objectStore(name).index('createdAt').openCursor(range);
    while (cursor) {
      const { event, direction } = cursor.value as StoredEvent;
      if (direction === 'in' && event.relationshipId === state.relationshipId && event.senderDeviceId === state.partnerDeviceId
        && (event.kind === 'operation.batch' || event.kind === 'interaction' || event.kind === 'activity.segment')) {
        refs.push({ id: event.id, at: event.createdAt, kind: event.kind });
      }
      cursor = await cursor.continue();
    }
  }
  await tx.done;
  const firstRecording = refs.find(ref => ref.kind === 'operation.batch')?.at;
  return refs.filter(ref => ref.kind !== 'activity.segment' || !firstRecording || ref.at < firstRecording)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
export async function hasReplayHistory(state: PairingState, since: number): Promise<boolean> {
  const tx = (await db).transaction(['history', 'events']);
  const range = IDBKeyRange.lowerBound(new Date(since).toISOString());
  for (const name of ['history', 'events']) {
    let cursor = await tx.objectStore(name).index('createdAt').openCursor(range, 'prev');
    while (cursor) {
      const { event, direction } = cursor.value as StoredEvent;
      if (direction === 'in' && event.relationshipId === state.relationshipId && event.senderDeviceId === state.partnerDeviceId
        && ['operation.batch', 'interaction', 'activity.segment'].includes(event.kind)) return true;
      cursor = await cursor.continue();
    }
  }
  return false;
}
export async function readReplayEvent(ref: HistoryRef): Promise<StoredEvent | undefined> {
  return (await db).get(ref.kind === 'operation.batch' ? 'history' : 'events', ref.id);
}
export async function pruneEventsOlderThan(retentionHours: number, now = Date.now()): Promise<StoredEvent[]> {
  const database = await db;
  const cutoff = new Date(now - retentionHours * 3_600_000).toISOString();
  const tx = database.transaction(['events', 'history', 'outbox'], 'readwrite');
  for (const name of ['events', 'history']) {
    let cursor = await tx.objectStore(name).index('createdAt').openCursor(IDBKeyRange.upperBound(cutoff, true));
    while (cursor) {
      await tx.objectStore('outbox').delete(cursor.value.event.id);
      await cursor.delete();
      cursor = await cursor.continue();
    }
  }
  await tx.done;
  return listEvents();
}
