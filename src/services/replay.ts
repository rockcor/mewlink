import type { ActivitySegment, InteractionPayload, StoredEvent } from '../domain/types';
export interface ReplayItem { id: string; at: string; label: string; icon: string }
const labels = { coding: '认真写代码', reading: '安静阅读', meeting: '正在开会', browsing: '浏览资料', idle: '离开了一会儿', rest: '休息中', water: '送来一杯水', break: '拉你休息一下', meal: '端来一碗饭', cheer: '为你加油', hug: '留下一个抱抱', goodnight: '送来晚安' } as const;
const icons = { coding: '⌨️', reading: '📖', meeting: '🎧', browsing: '🔎', idle: '🐾', rest: '💤', water: '💧', break: '🌿', meal: '🍚', cheer: '🎉', hug: '🫂', goodnight: '🌙' } as const;
export function buildReplay(events: StoredEvent[]): ReplayItem[] {
  return events.map(({ event }) => {
    const key = event.kind === 'interaction' ? (event.payload as InteractionPayload).action : (event.payload as ActivitySegment).category;
    return { id: event.id, at: event.createdAt, label: labels[key], icon: icons[key] };
  }).slice(-12);
}
