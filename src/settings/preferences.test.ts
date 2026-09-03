import { describe, expect, it } from 'vitest';
import { animationDurationScale, effectiveUtcOffsetMinutes, formatUtcOffset, loadPreferences, savePreferences } from './preferences';

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; }
  };
}

describe('desktop preferences', () => {
  it('defaults to the slower calm animation', () => {
    expect(loadPreferences(memoryStorage()).animationSpeed).toBe('calm');
    expect(animationDurationScale('calm')).toBeGreaterThan(animationDurationScale('lively'));
  });

  it('persists replay, manual timezone, and update preferences', () => {
    const storage = memoryStorage();
    savePreferences({ autoUpdate: false, replayEnabled: false, timezoneMode: 'manual', manualUtcOffsetMinutes: 330, animationSpeed: 'natural' }, storage);
    const saved = loadPreferences(storage);
    expect(effectiveUtcOffsetMinutes(saved)).toBe(330);
    expect(saved.autoUpdate).toBe(false);
    expect(saved.replayEnabled).toBe(false);
    expect(formatUtcOffset(saved.manualUtcOffsetMinutes)).toBe('UTC+05:30');
  });

  it('enables asynchronous replay for existing installations', () => {
    const saved = loadPreferences(memoryStorage(JSON.stringify({ autoUpdate: true })));
    expect(saved.replayEnabled).toBe(true);
  });

  it('falls back safely when stored data is malformed', () => {
    expect(loadPreferences(memoryStorage('{bad')).animationSpeed).toBe('calm');
  });
});
