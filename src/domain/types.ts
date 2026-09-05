export const activityKinds = ['work', 'meeting', 'leisure', 'idle', 'rest'] as const;
export type ActivityKind = (typeof activityKinds)[number];
export const workVisuals = ['code', 'document', 'web'] as const;
export type WorkVisual = (typeof workVisuals)[number];
export const interactionKinds = ['water', 'hug'] as const;
export type InteractionKind = (typeof interactionKinds)[number];
export const cupStyles = ['ceramic', 'tumbler', 'bottle'] as const;
export type CupStyle = (typeof cupStyles)[number];
export const blanketStyles = ['blush', 'night', 'mint'] as const;
export type BlanketStyle = (typeof blanketStyles)[number];

export interface ActivitySegment { category: ActivityKind; startedAt: string; endedAt: string }
export interface InteractionPayload { action: InteractionKind; cupStyle?: CupStyle; blanketStyle?: BlanketStyle; phraseId?: string }
export interface PlainEvent {
  id: string; version: 1; relationshipId: string; senderDeviceId: string; createdAt: string;
  senderUtcOffsetMinutes?: number;
  kind: 'activity.segment' | 'interaction'; payload: ActivitySegment | InteractionPayload;
}
export interface EncryptedEnvelope {
  protocolVersion: 1; relationshipId: string; senderDeviceId: string; recipientDeviceId: string;
  keyId: string; sequence: number; nonce: string; ciphertext: string;
}
export interface StoredEvent { event: PlainEvent; direction: 'in' | 'out'; status: 'queued' | 'cached' | 'delivered'; receivedAt: string }
