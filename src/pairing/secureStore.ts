import { invoke, isTauri } from '@tauri-apps/api/core';
import { isPairingState, LEGACY_PAIRING_STORAGE_KEY, type PairingState } from './pairing';

export type Revocation = Pick<PairingState, 'relationshipId' | 'relayToken' | 'deviceId'>;
type RecordV2 = { version: 2 } & (
  | { kind: 'active'; state: PairingState }
  | { kind: 'revoking'; pending: Revocation }
  | { kind: 'empty' }
);
export interface SecretBackend { read(): Promise<string | null>; write(value: string): Promise<void> }
type LegacyStorage = Pick<Storage, 'getItem' | 'removeItem'>;
export class SecureStorageError extends Error {
  constructor() { super('secure_storage_unavailable'); }
}

// All commands share one queue, including sync, send and unpair. A request from
// the old session cannot commit after unpair or a newly created relationship.
export class SerialTasks {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

export class SecurePairingStore {
  private record?: RecordV2;
  private queue = new SerialTasks();
  constructor(private backend: SecretBackend, private legacy: LegacyStorage) {}

  private async write(record: RecordV2) {
    const value = JSON.stringify(record);
    if (value === JSON.stringify(this.record)) return;
    await this.backend.write(value);
    if (await this.backend.read() !== value) throw new Error('secure_storage_verification_failed');
    this.record = record;
  }

  async load(): Promise<PairingState | undefined> {
    return this.queue.run(async () => {
      const value = await this.backend.read();
      if (value !== null) {
        const record = JSON.parse(value) as RecordV2;
        const validPending = record?.kind === 'revoking' && record.pending
          && [record.pending.relationshipId, record.pending.deviceId, record.pending.relayToken]
            .every(id => typeof id === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(id));
        if (record?.version !== 2 || !(record.kind === 'empty' || validPending || (record.kind === 'active' && isPairingState(record.state)))) {
          throw new Error('secure_storage_invalid_record');
        }
        this.record = record;
      } else {
        const old = this.legacy.getItem(LEGACY_PAIRING_STORAGE_KEY);
        const state: unknown = old ? JSON.parse(old) : undefined;
        if (old && !isPairingState(state)) throw new Error('legacy_pairing_invalid');
        await this.write(isPairingState(state) ? { version: 2, kind: 'active', state } : { version: 2, kind: 'empty' });
      }
      // Only after a verified durable write. Never silently fall back to plaintext.
      // Keep the empty tombstone so a leftover old copy can never resurrect a pair.
      this.legacy.removeItem(LEGACY_PAIRING_STORAGE_KEY);
      return this.record?.kind === 'active' ? structuredClone(this.record.state) : undefined;
    });
  }

  save(state: PairingState): Promise<void> {
    return this.queue.run(async () => {
      if (!this.record) throw new Error('secure_storage_not_ready');
      if (this.record.kind === 'revoking') throw new Error('revocation_pending');
      if (!isPairingState(state)) throw new Error('invalid_pairing_state');
      await this.write({ version: 2, kind: 'active', state: structuredClone(state) });
    });
  }

  beginRevocation(state: PairingState): Promise<void> {
    return this.queue.run(async () => {
      if (this.record?.kind !== 'active' || this.record.state.relationshipId !== state.relationshipId) throw new Error('pairing_changed');
      const { relationshipId, relayToken, deviceId } = state;
      // Erase the relationship decryption key, retaining only credentials needed
      // to finish server revocation across network failures and app restarts.
      await this.write({ version: 2, kind: 'revoking', pending: { relationshipId, relayToken, deviceId } });
      this.legacy.removeItem(LEGACY_PAIRING_STORAGE_KEY);
    });
  }

  pending(): Revocation | undefined {
    return this.record?.kind === 'revoking' ? { ...this.record.pending } : undefined;
  }

  completeRevocation(relationshipId: string): Promise<void> {
    return this.queue.run(async () => {
      if (this.record?.kind === 'revoking' && this.record.pending.relationshipId === relationshipId) {
        await this.write({ version: 2, kind: 'empty' });
      }
    });
  }
}

const nativeBackend: SecretBackend = {
  read: () => {
    if (!isTauri()) return Promise.reject(new Error('desktop_pairing_required'));
    return invoke<string | null>('read_pairing_secure');
  },
  write: value => invoke('write_pairing_secure', { value }),
};
export const securePairing = new SecurePairingStore(nativeBackend, {
  getItem: key => localStorage.getItem(key),
  removeItem: key => localStorage.removeItem(key),
});
