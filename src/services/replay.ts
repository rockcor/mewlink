import type { ActivityKind, ActivitySegment, BlanketStyle, CupStyle, InteractionKind, InteractionPayload, StoredEvent } from '../domain/types';
import { replayClock } from '../platform/clock';
import type { Language } from '../settings/preferences';
export interface ReplayItem { id: string; at: string; label: string; icon: string; clockLabel: string; activity?: ActivityKind; interaction?: InteractionKind; cupStyle?: CupStyle; blanketStyle?: BlanketStyle }
const labels = {
  zh: { work: '专注工作', meeting: '正在开会', leisure: '休闲娱乐', idle: '离开了一会儿', rest: '休息中', water: '提醒你喝水', hug: '送来一个拥抱' },
  en: { work: 'Focused on work', meeting: 'In a meeting', leisure: 'Taking a break', idle: 'Away for a moment', rest: 'Resting', water: 'Reminded you to drink water', hug: 'Sent you a hug' }
} as const;
const icons = { work: '⌨️', meeting: '🎧', leisure: '▶️', idle: '🐾', rest: '💤', water: '☕', hug: '🫂' } as const;
const normalizeActivity = (category: string): ActivityKind => {
  if (category === 'coding' || category === 'reading' || category === 'browsing') return 'work';
  if (category === 'video') return 'leisure';
  return category as ActivityKind;
};
export function buildReplay(events: StoredEvent[], receiverUtcOffsetMinutes?: number, showTimezone = true, language: Language = 'zh'): ReplayItem[] {
  const localizedLabels = labels[language];
  return events.filter(stored => stored.direction === 'in').sort((left, right) => Date.parse(left.event.createdAt) - Date.parse(right.event.createdAt)).flatMap(({ event }) => {
    const payload = event.payload as InteractionPayload | ActivitySegment;
    const key = event.kind === 'interaction' ? (payload as InteractionPayload).action : normalizeActivity((payload as ActivitySegment).category);
    if (!(key in localizedLabels)) return [];
    return [{
      id: event.id,
      at: event.createdAt,
      label: localizedLabels[key as keyof typeof localizedLabels],
      icon: icons[key as keyof typeof icons],
      clockLabel: showTimezone ? replayClock(event.createdAt, event.senderUtcOffsetMinutes, receiverUtcOffsetMinutes, language).label : '',
      ...(event.kind === 'interaction' ? { interaction: key as InteractionKind, cupStyle: (payload as InteractionPayload).cupStyle, blanketStyle: (payload as InteractionPayload).blanketStyle } : { activity: key as ActivityKind })
    }];
  }).slice(-12);
}
