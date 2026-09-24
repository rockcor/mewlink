import { activityKinds, workVisuals, type ActivityKind, type ActivitySegment, type OperationBatch, type StoredEvent, type WorkVisual } from '../domain/types';
import { buildReplay, type ReplayItem } from '../services/replay';
import type { HistoryRef } from '../storage/events';
import type { Language } from '../platform/language';
import { replayClock } from '../platform/clock';

export interface OperationFrame extends ReplayItem { keyboard: number; pointer: number; clicks: number; sourceSpanMs?: number }
export function framesForEvent(stored: StoredEvent, receiverOffset: number, showTimezone: boolean, language: Language): OperationFrame[] {
  const { event } = stored;
  if (event.kind !== 'operation.batch') return buildReplay([stored], receiverOffset, showTimezone, language)
    .map(item => ({ ...item, keyboard: 0, pointer: 0, clicks: 0 }));
  const batch = event.payload as OperationBatch;
  const labels = new Map<string, ReplayItem>();
  return batch.points.map(([ms, keyboard, pointer, clicks, activity, visual], index) => {
    const at = new Date(Date.parse(batch.startedAt) + ms).toISOString();
    const category = activityKinds[activity];
    const labelKey = `${activity}:${visual}:${Math.floor(Date.parse(at) / 60_000)}`;
    let item = labels.get(labelKey);
    if (!item) {
      item = buildReplay([{ ...stored, event: { ...event, createdAt: at, kind: 'activity.segment',
        payload: { category, workVisual: workVisuals[visual], startedAt: at, endedAt: at } as ActivitySegment } }], receiverOffset, showTimezone, language)[0];
      labels.set(labelKey, item);
    }
    return { ...item, at, id: `${event.id}:${index}`, keyboard, pointer, clicks };
  });
}

// Merge an interaction inside a recorded batch at its actual timestamp.
// Only one small batch plus overlapping events is expanded at a time.
export async function* replayFrames(refs: readonly HistoryRef[], read: (ref: HistoryRef) => Promise<StoredEvent | undefined>,
  receiverOffset: number, showTimezone: boolean, language: Language) {
  const pending: OperationFrame[] = [];
  for (const ref of refs) {
    while (pending.length && pending[0].at < ref.at) yield pending.shift()!;
    const stored = await read(ref);
    if (stored) pending.push(...framesForEvent(stored, receiverOffset, showTimezone, language));
    pending.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  }
  for (const frame of pending) yield frame;
}

export function replayDelay(previous: OperationFrame | undefined, next: OperationFrame, speed = 4) {
  if (!previous) return 0;
  // Preserve relative input rhythm; only uninteresting long gaps are shortened.
  return Math.max(16, Math.min(1500, (Date.parse(next.at) - Date.parse(previous.at)) / speed));
}

export function replaySpeed(refs: readonly HistoryRef[]) {
  if (refs.length < 2) return 4;
  return Math.max(4, (Date.parse(refs.at(-1)!.at) - Date.parse(refs[0].at)) / 20_000);
}

// Keep the original stored track intact. A recap paints at most ten input
// samples per accelerated second; gestures are always kept individually.
export async function* condensedReplay(frames: AsyncIterable<OperationFrame>, speed: number) {
  let pending: OperationFrame | undefined;
  let start = 0;
  for await (const frame of frames) {
    const at = Date.parse(frame.at);
    if (frame.interaction || (pending && at - start >= speed * 100)) {
      if (pending) { yield pending; pending = undefined; }
      if (frame.interaction) { yield frame; continue; }
    }
    if (!pending) { pending = { ...frame, sourceSpanMs: 1 }; start = at; }
    else pending = { ...frame, keyboard: pending.keyboard + frame.keyboard,
      pointer: pending.pointer + frame.pointer, clicks: pending.clicks + frame.clicks,
      sourceSpanMs: at - start + 1 };
  }
  if (pending) yield pending;
}
export const replayFrameClock = (frame: OperationFrame, offset: number, show: boolean, language: Language) =>
  show ? frame.clockLabel || replayClock(frame.at, undefined, offset, language).label : '';
export interface ReplayDisplay { activity: ActivityKind; workVisual: WorkVisual }
