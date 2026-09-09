import type { Language } from './language';

const MAX_UTC_OFFSET_MINUTES = 14 * 60;

export interface ReplayClock {
  senderUtcOffsetMinutes?: number;
  receiverUtcOffsetMinutes: number;
  offsetDeltaMinutes?: number;
  label: string;
}

export function normalizeUtcOffsetMinutes(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value / 15) * 15;
  return Math.max(-MAX_UTC_OFFSET_MINUTES, Math.min(MAX_UTC_OFFSET_MINUTES, rounded));
}

export function localUtcOffsetMinutes(at = new Date()): number {
  return normalizeUtcOffsetMinutes(-at.getTimezoneOffset());
}

function offsetDateParts(iso: string, offsetMinutes: number) {
  const instant = Date.parse(iso);
  if (!Number.isFinite(instant)) return { date: '--/--', time: '--:--' };
  const shifted = new Date(instant + normalizeUtcOffsetMinutes(offsetMinutes) * 60_000);
  const [date, time] = shifted.toISOString().split('T');
  return { date: date.slice(5).replace('-', '/'), time: time.slice(0, 5) };
}

export function replayClock(
  createdAt: string,
  senderUtcOffsetMinutes?: number,
  receiverUtcOffsetMinutes = localUtcOffsetMinutes(new Date(createdAt)),
  language: Language = 'zh'
): ReplayClock {
  const receiverOffset = normalizeUtcOffsetMinutes(receiverUtcOffsetMinutes);
  const receiver = offsetDateParts(createdAt, receiverOffset);
  if (senderUtcOffsetMinutes === undefined) {
    return { receiverUtcOffsetMinutes: receiverOffset, label: `${({ zh: '你这里', 'zh-Hant': '你這裡', en: 'Your time' })[language]} ${receiver.time}` };
  }

  const senderOffset = normalizeUtcOffsetMinutes(senderUtcOffsetMinutes);
  const sender = offsetDateParts(createdAt, senderOffset);
  const sameDate = sender.date === receiver.date;
  return {
    senderUtcOffsetMinutes: senderOffset,
    receiverUtcOffsetMinutes: receiverOffset,
    offsetDeltaMinutes: receiverOffset - senderOffset,
    label: language !== 'en'
      ? (sameDate ? `TA ${sender.time} → 你 ${receiver.time}` : `TA ${sender.date} ${sender.time} → 你 ${receiver.date} ${receiver.time}`)
      : (sameDate ? `Partner ${sender.time} → You ${receiver.time}` : `Partner ${sender.date} ${sender.time} → You ${receiver.date} ${receiver.time}`)
  };
}
