import { describe, expect, it } from 'vitest';
import { transitionAssetName } from './activityPlayback';

describe('activity transition assets', () => {
  it('selects the directed transitions between the visible activity types', () => {
    expect(transitionAssetName({ from: 'work', to: 'meeting', fromWorkVisual: 'code', toWorkVisual: 'code' })).toBe('transition-work-meeting');
    expect(transitionAssetName({ from: 'meeting', to: 'work', fromWorkVisual: 'code', toWorkVisual: 'code' })).toBe('transition-meeting-work');
    expect(transitionAssetName({ from: 'meeting', to: 'idle', fromWorkVisual: 'code', toWorkVisual: 'code' })).toBe('transition-meeting-idle');
    expect(transitionAssetName({ from: 'idle', to: 'meeting', fromWorkVisual: 'code', toWorkVisual: 'code' })).toBe('transition-idle-meeting');
  });

  it('keeps the visible work screen when leaving or entering work', () => {
    expect(transitionAssetName({ from: 'work', to: 'meeting', fromWorkVisual: 'document', toWorkVisual: 'code' })).toBe('transition-work-document-meeting');
    expect(transitionAssetName({ from: 'work', to: 'idle', fromWorkVisual: 'web', toWorkVisual: 'code' })).toBe('transition-work-web-idle');
    expect(transitionAssetName({ from: 'meeting', to: 'work', fromWorkVisual: 'code', toWorkVisual: 'document' })).toBe('transition-meeting-work-document');
    expect(transitionAssetName({ from: 'idle', to: 'work', fromWorkVisual: 'code', toWorkVisual: 'web' })).toBe('transition-idle-work-web');
    expect(transitionAssetName({ from: 'work', to: 'meeting', fromWorkVisual: 'ai', toWorkVisual: 'code' })).toBe('transition-work-ai-meeting');
    expect(transitionAssetName({ from: 'rest', to: 'work', fromWorkVisual: 'code', toWorkVisual: 'ai' })).toBe('transition-rest-work-ai');
    expect(transitionAssetName({ from: 'work', to: 'idle', fromWorkVisual: 'mewlink', toWorkVisual: 'code' })).toBe('transition-work-mewlink-idle');
    expect(transitionAssetName({ from: 'meeting', to: 'work', fromWorkVisual: 'code', toWorkVisual: 'mewlink' })).toBe('transition-meeting-work-mewlink');
  });
});
