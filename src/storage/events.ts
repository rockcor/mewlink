import { openDB } from 'idb';
import type { StoredEvent } from '../domain/types';
const db = openDB('mewlink', 1, { upgrade(database) { const store = database.createObjectStore('events', { keyPath: 'event.id' }); store.createIndex('createdAt', 'event.createdAt'); } });
export async function putEvent(event: StoredEvent) { return (await db).put('events', event); }
export async function listEvents(): Promise<StoredEvent[]> { return (await db).getAllFromIndex('events', 'createdAt'); }
export async function pruneEventsOlderThan(retentionHours: number, now = Date.now()): Promise<StoredEvent[]> {
  const database = await db;
  const events = await database.getAllFromIndex('events', 'createdAt');
  const cutoff = now - retentionHours * 60 * 60 * 1_000;
  const expired = events.filter(({ event }) => {
    const createdAt = Date.parse(event.createdAt);
    return !Number.isFinite(createdAt) || createdAt < cutoff;
  });
  if (expired.length) {
    const transaction = database.transaction('events', 'readwrite');
    await Promise.all(expired.map(({ event }) => transaction.store.delete(event.id)));
    await transaction.done;
  }
  return events.filter(item => !expired.includes(item));
}
