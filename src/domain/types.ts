export const activityKinds = ['work', 'meeting', 'leisure', 'idle', 'rest'] as const;
export type ActivityKind = (typeof activityKinds)[number];
export const workVisuals = ['code', 'document', 'web', 'ai'] as const;
export type WorkVisual = (typeof workVisuals)[number];
export const interactionKinds = ['water', 'hug'] as const;
export type InteractionKind = (typeof interactionKinds)[number];
export const cupStyles = ['ceramic', 'tumbler', 'bottle'] as const;
export type CupStyle = (typeof cupStyles)[number];
export const blanketStyles = ['blush', 'night', 'mint'] as const;
export type BlanketStyle = (typeof blanketStyles)[number];
export const petSkins = ['cream', 'peach', 'mint', 'sky', 'lavender', 'luka', 'sixtySix'] as const;
export type PetSkin = (typeof petSkins)[number];
export const statisticsVisibilities = ['private', 'partner'] as const;
export type StatisticsVisibility = (typeof statisticsVisibilities)[number];

export interface ActivitySegment { category: ActivityKind; startedAt: string; endedAt: string }
export interface InteractionPayload { action: InteractionKind; cupStyle?: CupStyle; blanketStyle?: BlanketStyle; phraseId?: string }
export interface PetSkinPayload { skin: PetSkin }
export interface StatisticsSnapshot {
  input: { keyboard: number; pointer: number };
  workVisual: Record<WorkVisual, number>;
  activity: { work: number; meeting: number; idle: number };
  bars: Array<{ label: string; keyboard: number; pointer: number }>;
}
export interface StatisticsPayload {
  visibility: StatisticsVisibility;
  generatedAt: string;
  snapshots?: { day: StatisticsSnapshot; week: StatisticsSnapshot; month: StatisticsSnapshot };
}
export interface PlainEvent {
  id: string; version: 1; relationshipId: string; senderDeviceId: string; createdAt: string;
  senderUtcOffsetMinutes?: number;
  kind: 'activity.segment' | 'interaction' | 'profile.skin' | 'statistics.snapshot';
  payload: ActivitySegment | InteractionPayload | PetSkinPayload | StatisticsPayload;
}
export interface EncryptedEnvelope {
  protocolVersion: 1; relationshipId: string; senderDeviceId: string; recipientDeviceId: string;
  keyId: string; sequence: number; nonce: string; ciphertext: string;
}
export interface StoredEvent { event: PlainEvent; direction: 'in' | 'out'; status: 'queued' | 'cached' | 'delivered'; receivedAt: string }
