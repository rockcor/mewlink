import { openDB } from 'idb';
import type { StoredEvent } from '../domain/types';
const db = openDB('mewlink', 1, { upgrade(database) { const store = database.createObjectStore('events', { keyPath: 'event.id' }); store.createIndex('createdAt', 'event.createdAt'); } });
export async function putEvent(event: StoredEvent) { return (await db).put('events', event); }
export async function listEvents(): Promise<StoredEvent[]> { return (await db).getAllFromIndex('events', 'createdAt'); }
