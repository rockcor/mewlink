import type { StatisticsData } from './statistics';

// A companion grows through the day with how busy its person is, measured
// against their own usual day, and starts at its normal size again at local
// midnight. Only the coarse level (0..1 in GROWTH_STEP steps) leaves the
// device, with the presence heartbeat, so the partner sees today's busyness
// without any of the statistics behind it.
export const MAX_GROWTH = 0.25;
export const GROWTH_STEP = 0.05;
/** A day this many times busier than usual is the largest size. */
const FULL_GROWTH_RATIO = 1.5;
/** Cold start: a usual day is about this much work and meetings. */
const DEFAULT_ACTIVE_MS = 6 * 3_600_000;
/** How many days of history weigh as much as the default. */
const PRIOR_DAYS = 3;
/** Keystrokes and clicks count once there are this many usual days to compare with. */
const INPUT_HISTORY_DAYS = 3;
/** Days with less work than this (days off) do not shape the usual day. */
const USUAL_DAY_MIN_ACTIVE_MS = 30 * 60_000;
const HISTORY_DAYS = 28;
const hourMs = 3_600_000;

export interface DayTotals { activeMs: number; input: number }

function startOfLocalDay(now: number, daysAgo = 0) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.getTime();
}

/** Work and meeting time plus keystrokes and clicks between two instants. */
function totals(data: StatisticsData, from: number, to: number): DayTotals {
  const sum = { activeMs: 0, input: 0 };
  for (const bucket of data.buckets) {
    const at = bucket.hour * hourMs;
    if (at < from || at >= to) continue;
    sum.activeMs += bucket.activityMs.work + bucket.activityMs.meeting;
    sum.input += bucket.keyboard + bucket.pointer;
  }
  return sum;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** The person's usual day: the default at first, then more and more their own median day. */
export function usualDay(data: StatisticsData, now = Date.now()): { activeMs: number; input?: number; days: number } {
  const days: DayTotals[] = [];
  for (let back = 1; back <= HISTORY_DAYS; back++) {
    const day = totals(data, startOfLocalDay(now, back), startOfLocalDay(now, back - 1));
    if (day.activeMs >= USUAL_DAY_MIN_ACTIVE_MS) days.push(day);
  }
  const n = days.length;
  const activeMs = n ? (PRIOR_DAYS * DEFAULT_ACTIVE_MS + n * median(days.map(day => day.activeMs))) / (PRIOR_DAYS + n) : DEFAULT_ACTIVE_MS;
  const input = n >= INPUT_HISTORY_DAYS ? median(days.map(day => day.input)) : undefined;
  return { activeMs, input: input && input > 0 ? input : undefined, days: n };
}

/** Today's busyness, 0..1 in GROWTH_STEP steps: a usual day ends near two thirds. */
export function growthLevel(data: StatisticsData, now = Date.now()): number {
  const today = totals(data, startOfLocalDay(now), now + 1);
  const usual = usualDay(data, now);
  const timeRatio = today.activeMs / usual.activeMs;
  const ratio = usual.input ? 0.6 * timeRatio + 0.4 * today.input / usual.input : timeRatio;
  return quantizeGrowth(ratio / FULL_GROWTH_RATIO);
}

export function quantizeGrowth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const steps = Math.round(1 / GROWTH_STEP);
  return Math.round(Math.min(1, Math.max(0, value)) * steps) / steps;
}

/** The size factor for a growth level, on top of the size chosen in settings. */
export const growthScale = (level: number) => 1 + MAX_GROWTH * quantizeGrowth(level);

/**
 * The partner's level from their latest heartbeat, if it is from their today:
 * after their midnight their companion is back to its normal size.
 */
export function partnerGrowthLevel(growth: unknown, sentAt: string, offsetMinutes: number | undefined, now = Date.now()): number {
  const sent = Date.parse(sentAt);
  if (!Number.isFinite(sent) || offsetMinutes === undefined) return 0;
  const day = (at: number) => Math.floor((at + offsetMinutes * 60_000) / 86_400_000);
  return day(sent) === day(now) ? quantizeGrowth(growth) : 0;
}
