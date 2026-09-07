import { describe, expect, it } from 'vitest';
import { transitionAssetName } from './activityPlayback';

describe('activity transition assets', () => {
  it('selects all six directed transitions between the three visible activity types', () => {
    expect(transitionAssetName({ from: 'work', to: 'meeting', fromWorkVisual: 'code', toWorkVisual: 'code' })).toBe('transition-work-meeting');
    expect(transitionAssetName({ from: 'meeting', to: 'work', fromWorkVisual: 'code', toWorkVisual: 'code' })).toBe('transition-meeting-work');
    expect(transitionAssetName({ from: 'work', to: 'leisure', fromWorkVisual: 'code', toWorkVisual: 'code' })).toBe('transition-work-leisure');
    expect(transitionAssetName({ from: 'leisure', to: 'work', fromWorkVisual: 'code', toWorkVisual: 'code' })).toBe('transition-leisure-work');
    expect(transitionAssetName({ from: 'meeting', to: 'leisure', fromWorkVisual: 'code', toWorkVisual: 'code' })).toBe('transition-meeting-leisure');
    expect(transitionAssetName({ from: 'leisure', to: 'meeting', fromWorkVisual: 'code', toWorkVisual: 'code' })).toBe('transition-leisure-meeting');
  });

  it('keeps the visible work screen when leaving or entering work', () => {
    expect(transitionAssetName({ from: 'work', to: 'meeting', fromWorkVisual: 'document', toWorkVisual: 'code' })).toBe('transition-work-document-meeting');
    expect(transitionAssetName({ from: 'work', to: 'leisure', fromWorkVisual: 'web', toWorkVisual: 'code' })).toBe('transition-work-web-leisure');
    expect(transitionAssetName({ from: 'meeting', to: 'work', fromWorkVisual: 'code', toWorkVisual: 'document' })).toBe('transition-meeting-work-document');
    expect(transitionAssetName({ from: 'leisure', to: 'work', fromWorkVisual: 'code', toWorkVisual: 'web' })).toBe('transition-leisure-work-web');
    expect(transitionAssetName({ from: 'work', to: 'meeting', fromWorkVisual: 'ai', toWorkVisual: 'code' })).toBe('transition-work-ai-meeting');
    expect(transitionAssetName({ from: 'rest', to: 'work', fromWorkVisual: 'code', toWorkVisual: 'ai' })).toBe('transition-rest-work-ai');
    expect(transitionAssetName({ from: 'work', to: 'idle', fromWorkVisual: 'mewlink', toWorkVisual: 'code' })).toBe('transition-work-mewlink-idle');
    expect(transitionAssetName({ from: 'meeting', to: 'work', fromWorkVisual: 'code', toWorkVisual: 'mewlink' })).toBe('transition-meeting-work-mewlink');
  });
});
