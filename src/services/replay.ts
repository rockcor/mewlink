import type { ActivityKind, ActivitySegment, InteractionKind, InteractionPayload, StoredEvent } from '../domain/types';
import { replayClock } from '../platform/clock';
export interface ReplayItem { id: string; at: string; label: string; icon: string; clockLabel: string; activity?: ActivityKind; interaction?: InteractionKind }
const labels = { coding: '认真写代码', reading: '安静阅读', meeting: '正在开会', video: '看了一会儿视频', browsing: '浏览资料', idle: '离开了一会儿', rest: '休息中', water: '提醒你喝水', hug: '送来一个拥抱' } as const;
const icons = { coding: '⌨️', reading: '📖', meeting: '🎧', video: '▶️', browsing: '🔎', idle: '🐾', rest: '💤', water: '💧', hug: '🫂' } as const;
export function buildReplay(events: StoredEvent[], receiverUtcOffsetMinutes?: number): ReplayItem[] {
  return [...events].sort((left, right) => Date.parse(left.event.createdAt) - Date.parse(right.event.createdAt)).flatMap(({ event }) => {
    const key = event.kind === 'interaction' ? (event.payload as InteractionPayload).action : (event.payload as ActivitySegment).category;
    if (!(key in labels)) return [];
    return [{
      id: event.id,
      at: event.createdAt,
      label: labels[key as keyof typeof labels],
      icon: icons[key as keyof typeof icons],
      clockLabel: replayClock(event.createdAt, event.senderUtcOffsetMinutes, receiverUtcOffsetMinutes).label,
      ...(event.kind === 'interaction' ? { interaction: key as InteractionKind } : { activity: key as ActivityKind })
    }];
  }).slice(-12);
}
