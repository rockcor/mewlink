import { decryptEvent, encryptEvent, newDemoKey } from '../crypto/events';
import { putEvent } from '../storage/events';
import type { PlainEvent, StoredEvent } from '../domain/types';

export interface DeliveryPolicy { muted: boolean; focusMode: boolean; minIntervalMs: number }
export class LoopbackTransport {
  private key?: Uint8Array; private sequence = 0; private lastDelivered = 0;
  private async getKey() { return this.key ??= await newDemoKey(); }
  async send(event: PlainEvent, policy: DeliveryPolicy): Promise<StoredEvent> {
    const envelope = await encryptEvent(event, 'partner-device', ++this.sequence, await this.getKey());
    const received = await decryptEvent(envelope, await this.getKey());
    const limited = Date.now() - this.lastDelivered < policy.minIntervalMs;
    const status: StoredEvent['status'] = policy.focusMode || policy.muted || limited ? 'cached' : 'delivered';
    if (status === 'delivered') this.lastDelivered = Date.now();
    const stored = { event: received, direction: 'in' as const, status, receivedAt: new Date().toISOString() };
    await putEvent(stored); return stored;
  }
}
