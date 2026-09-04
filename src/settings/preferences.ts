import { localUtcOffsetMinutes, normalizeUtcOffsetMinutes } from '../platform/clock';

export const animationSpeeds = ['calm', 'natural', 'lively'] as const;
export type AnimationSpeed = (typeof animationSpeeds)[number];
export type TimezoneMode = 'auto' | 'manual' | 'off';
export const languages = ['zh', 'en'] as const;
export type Language = (typeof languages)[number];

export interface Preferences {
  autoUpdate: boolean;
  replayEnabled: boolean;
  timezoneMode: TimezoneMode;
  manualUtcOffsetMinutes: number;
  animationSpeed: AnimationSpeed;
  petScalePercent: number;
  language: Language;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const STORAGE_KEY = 'mewlink.preferences.v1';

function systemLanguage(): Language {
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function defaultPreferences(): Preferences {
  return {
    autoUpdate: true,
    replayEnabled: true,
    timezoneMode: 'auto',
    manualUtcOffsetMinutes: localUtcOffsetMinutes(),
    animationSpeed: 'calm',
    petScalePercent: 100,
    language: systemLanguage()
  };
}

export function normalizePetScalePercent(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(70, Math.round(value / 5) * 5));
}

export function loadPreferences(storage?: StorageLike): Preferences {
  const defaults = defaultPreferences();
  const source = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  if (!source) return defaults;

  try {
    const parsed: unknown = JSON.parse(source.getItem(STORAGE_KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return defaults;
    const value = parsed as Partial<Preferences>;
    return {
      autoUpdate: typeof value.autoUpdate === 'boolean' ? value.autoUpdate : defaults.autoUpdate,
      replayEnabled: typeof value.replayEnabled === 'boolean' ? value.replayEnabled : defaults.replayEnabled,
      timezoneMode: value.timezoneMode === 'manual' || value.timezoneMode === 'off' ? value.timezoneMode : 'auto',
      manualUtcOffsetMinutes: typeof value.manualUtcOffsetMinutes === 'number'
        ? normalizeUtcOffsetMinutes(value.manualUtcOffsetMinutes)
        : defaults.manualUtcOffsetMinutes,
      animationSpeed: animationSpeeds.includes(value.animationSpeed as AnimationSpeed)
        ? value.animationSpeed as AnimationSpeed
        : defaults.animationSpeed,
      petScalePercent: typeof value.petScalePercent === 'number'
        ? normalizePetScalePercent(value.petScalePercent)
        : defaults.petScalePercent,
      language: languages.includes(value.language as Language) ? value.language as Language : defaults.language
    };
  } catch {
    return defaults;
  }
}

export function savePreferences(preferences: Preferences, storage?: StorageLike) {
  const destination = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  destination?.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

export function effectiveUtcOffsetMinutes(preferences: Preferences, now = new Date()): number {
  return preferences.timezoneMode === 'manual'
    ? normalizeUtcOffsetMinutes(preferences.manualUtcOffsetMinutes)
    : localUtcOffsetMinutes(now);
}

export function animationDurationScale(speed: AnimationSpeed): number {
  return { calm: 1, natural: 0.78, lively: 0.58 }[speed];
}

export function formatUtcOffset(offsetMinutes: number): string {
  const normalized = normalizeUtcOffsetMinutes(offsetMinutes);
  const sign = normalized < 0 ? '−' : '+';
  const absolute = Math.abs(normalized);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const minutes = String(absolute % 60).padStart(2, '0');
  return `UTC${sign}${hours}:${minutes}`;
}
