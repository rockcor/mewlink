import type { ActivityKind, StatisticsSnapshot, WorkVisual } from '../domain/types';

export type { StatisticsSnapshot } from '../domain/types';

export const statisticsRanges = ['day', 'week', 'month'] as const;
export type StatisticsRange = (typeof statisticsRanges)[number];

export interface StatisticsBucket {
  hour: number;
  keyboard: number;
  pointer: number;
  activityMs: Record<ActivityKind, number>;
  workVisualMs: Record<WorkVisual, number>;
}

export interface StatisticsData {
  version: 2;
  buckets: StatisticsBucket[];
}

const storageKey = 'mewlink.statistics.v2';
const legacyStorageKey = 'mewlink.statistics.v1';
const hourMs = 60 * 60 * 1_000;
const dayMs = 24 * hourMs;
const maxHistoryMs = 35 * dayMs;
let liveData: StatisticsData | undefined;
let flushTimer: number | undefined;

export function emptyStatisticsData(): StatisticsData {
  return { version: 2, buckets: [] };
}

function emptyBucket(hour: number): StatisticsBucket {
  return {
    hour,
    keyboard: 0,
    pointer: 0,
    activityMs: { work: 0, meeting: 0, leisure: 0, idle: 0, rest: 0 },
    workVisualMs: { code: 0, document: 0, web: 0 }
  };
}

function isBucket(value: unknown): value is StatisticsBucket {
  if (!value || typeof value !== 'object') return false;
  const bucket = value as Partial<StatisticsBucket>;
  return typeof bucket.hour === 'number'
    && Number.isFinite(bucket.hour)
    && typeof bucket.keyboard === 'number'
    && typeof bucket.pointer === 'number'
    && Boolean(bucket.activityMs)
    && Boolean(bucket.workVisualMs);
}

function loadStatistics(): StatisticsData {
  if (liveData) return liveData;
  if (typeof localStorage === 'undefined') return liveData = emptyStatisticsData();
  try {
    const current = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<StatisticsData> | null;
    if (current?.version === 2 && Array.isArray(current.buckets)) {
      liveData = { version: 2, buckets: current.buckets.filter(isBucket) };
    } else {
      const legacy = JSON.parse(localStorage.getItem(legacyStorageKey) ?? 'null') as { version?: number; buckets?: unknown[] } | null;
      liveData = legacy?.version === 1 && Array.isArray(legacy.buckets)
        ? { version: 2, buckets: legacy.buckets.filter(isBucket).map(bucket => ({ ...bucket, pointer: 0 })) }
        : emptyStatisticsData();
    }
  } catch {
    liveData = emptyStatisticsData();
  }
  return liveData;
}

function trimStatistics(data: StatisticsData, now: number) {
  const earliestHour = Math.floor((now - maxHistoryMs) / hourMs);
  data.buckets = data.buckets.filter(bucket => bucket.hour >= earliestHour);
}

function currentBucket(data: StatisticsData, now: number): StatisticsBucket {
  trimStatistics(data, now);
  const hour = Math.floor(now / hourMs);
  let bucket = data.buckets.find(item => item.hour === hour);
  if (!bucket) {
    bucket = emptyBucket(hour);
    data.buckets.push(bucket);
    data.buckets.sort((left, right) => left.hour - right.hour);
  }
  return bucket;
}

function scheduleFlush() {
  if (typeof window === 'undefined' || flushTimer !== undefined) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = undefined;
    flushStatistics();
  }, 15_000);
}

export function recordInputStatistics(keyboard: number, pointer: number, now = Date.now()) {
  if (keyboard <= 0 && pointer <= 0) return;
  const bucket = currentBucket(loadStatistics(), now);
  bucket.keyboard += Math.max(0, Math.round(keyboard));
  bucket.pointer += Math.max(0, Math.round(pointer));
  scheduleFlush();
}

export function recordActivityStatistics(activity: ActivityKind, workVisual: WorkVisual, durationMs: number, now = Date.now()) {
  const safeDuration = Math.min(5_000, Math.max(0, durationMs));
  if (!safeDuration) return;
  const bucket = currentBucket(loadStatistics(), now);
  bucket.activityMs[activity] += safeDuration;
  if (activity === 'work') bucket.workVisualMs[workVisual] += safeDuration;
  scheduleFlush();
}

export function flushStatistics() {
  if (!liveData || typeof localStorage === 'undefined') return;
  if (flushTimer !== undefined && typeof window !== 'undefined') window.clearTimeout(flushTimer);
  flushTimer = undefined;
  localStorage.setItem(storageKey, JSON.stringify(liveData));
}

function startOfLocalDay(now: number, daysAgo = 0): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.getTime();
}

function monthDay(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function weekday(timestamp: number): string {
  return String(new Date(timestamp).getDay());
}

function addLocalDays(timestamp: number, days: number): number {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

function localDaySerial(timestamp: number): number {
  const date = new Date(timestamp);
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / dayMs);
}

export function aggregateStatistics(data: StatisticsData, range: StatisticsRange, now = Date.now()): StatisticsSnapshot {
  const start = range === 'day' ? startOfLocalDay(now) : startOfLocalDay(now, range === 'week' ? 6 : 29);
  const binCount = range === 'day' ? 6 : range === 'week' ? 7 : 5;
  const bars = Array.from({ length: binCount }, (_, index) => ({
    label: range === 'day'
      ? `${index * 4}:00`
      : range === 'week'
        ? weekday(addLocalDays(start, index))
        : monthDay(addLocalDays(start, index * 6)),
    keyboard: 0,
    pointer: 0
  }));
  const snapshot: StatisticsSnapshot = {
    input: { keyboard: 0, pointer: 0 },
    workVisual: { code: 0, document: 0, web: 0 },
    activity: { work: 0, meeting: 0, idle: 0 },
    bars
  };

  for (const bucket of data.buckets) {
    const timestamp = bucket.hour * hourMs;
    if (timestamp < start || timestamp > now) continue;
    const index = range === 'day'
      ? Math.min(5, Math.floor(new Date(timestamp).getHours() / 4))
      : Math.min(binCount - 1, Math.max(0, Math.floor((localDaySerial(timestamp) - localDaySerial(start)) / (range === 'week' ? 1 : 6))));
    bars[index].keyboard += bucket.keyboard;
    bars[index].pointer += bucket.pointer;
    snapshot.input.keyboard += bucket.keyboard;
    snapshot.input.pointer += bucket.pointer;
    snapshot.workVisual.code += bucket.workVisualMs.code;
    snapshot.workVisual.document += bucket.workVisualMs.document;
    snapshot.workVisual.web += bucket.workVisualMs.web;
    snapshot.activity.work += bucket.activityMs.work;
    snapshot.activity.meeting += bucket.activityMs.meeting;
    snapshot.activity.idle += bucket.activityMs.idle + bucket.activityMs.leisure + bucket.activityMs.rest;
  }
  return snapshot;
}

export function currentStatistics(range: StatisticsRange, now = Date.now()): StatisticsSnapshot {
  return aggregateStatistics(loadStatistics(), range, now);
}

export function currentStatisticsBundle(now = Date.now()) {
  return {
    day: currentStatistics('day', now),
    week: currentStatistics('week', now),
    month: currentStatistics('month', now)
  };
}
