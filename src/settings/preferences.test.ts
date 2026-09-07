import { describe, expect, it } from 'vitest';
import { animationDurationScale, effectiveUtcOffsetMinutes, formatUtcOffset, loadPreferences, normalizePetScalePercent, normalizeReplayRetentionHours, savePreferences, scalePetWithPinch } from './preferences';

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
    savePreferences({ autoUpdate: false, replayEnabled: false, replaySaveDirectory: '/tmp/mewlink-replays', replayRetentionHours: 36, statisticsVisibility: 'partner', timezoneMode: 'manual', manualUtcOffsetMinutes: 330, animationSpeed: 'natural', selfPetScalePercent: 85, partnerPetScalePercent: 95, selfPetSkin: 'sixtySix', blanketStyle: 'night', language: 'en' }, storage);
    const saved = loadPreferences(storage);
    expect(effectiveUtcOffsetMinutes(saved)).toBe(330);
    expect(saved.autoUpdate).toBe(false);
    expect(saved.replayEnabled).toBe(false);
    expect(saved.replaySaveDirectory).toBe('/tmp/mewlink-replays');
    expect(saved.replayRetentionHours).toBe(36);
    expect(saved.statisticsVisibility).toBe('partner');
    expect(saved.selfPetScalePercent).toBe(85);
    expect(saved.partnerPetScalePercent).toBe(95);
    expect(saved.selfPetSkin).toBe('sixtySix');
    expect(saved.blanketStyle).toBe('night');
    expect(saved.language).toBe('en');
    expect(formatUtcOffset(saved.manualUtcOffsetMinutes)).toBe('UTC+05:30');
  });

  it('enables asynchronous replay for existing installations', () => {
    const saved = loadPreferences(memoryStorage(JSON.stringify({ autoUpdate: true })));
    expect(saved.replayEnabled).toBe(true);
    expect(saved.statisticsVisibility).toBe('private');
  });

  it('lets people turn automatic timezone detection off', () => {
    const storage = memoryStorage();
    savePreferences({ autoUpdate: true, replayEnabled: true, replaySaveDirectory: '', replayRetentionHours: 24, statisticsVisibility: 'private', timezoneMode: 'off', manualUtcOffsetMinutes: 0, animationSpeed: 'calm', selfPetScalePercent: 100, partnerPetScalePercent: 100, selfPetSkin: 'cream', blanketStyle: 'blush', language: 'zh' }, storage);
    expect(loadPreferences(storage).timezoneMode).toBe('off');
  });

  it('keeps pet scaling inside the supported visual range', () => {
    expect(normalizePetScalePercent(82)).toBe(80);
    expect(normalizePetScalePercent(30)).toBe(70);
    expect(normalizePetScalePercent(140)).toBe(110);
  });

  it('scales the pointed companion with a trackpad pinch', () => {
    expect(scalePetWithPinch(90, -2)).toBe(95);
    expect(scalePetWithPinch(90, 2)).toBe(85);
    expect(scalePetWithPinch(110, -2)).toBe(110);
  });

  it('migrates the previous shared pet size to both companions', () => {
    const saved = loadPreferences(memoryStorage(JSON.stringify({ petScalePercent: 80 })));
    expect(saved.selfPetScalePercent).toBe(80);
    expect(saved.partnerPetScalePercent).toBe(80);
  });

  it('keeps replay retention on supported 12-hour steps', () => {
    expect(normalizeReplayRetentionHours(12)).toBe(12);
    expect(normalizeReplayRetentionHours(31)).toBe(36);
    expect(normalizeReplayRetentionHours(90)).toBe(48);
  });

  it('falls back safely when stored data is malformed', () => {
    expect(loadPreferences(memoryStorage('{bad')).animationSpeed).toBe('calm');
  });
});
