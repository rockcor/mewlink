import { describe, expect, it } from 'vitest';
import { frameFromPosition, spriteAssetFor } from './spriteAssets';

describe('current-frame rendering keeps the Aseprite rig', () => {
  it('resolves screens, eyes, transitions and custom interaction items', () => {
    expect(spriteAssetFor('pet-sprite work work-ai input-both input-stressed')).toBe('work-ai-stress');
    expect(spriteAssetFor('pet-sprite work work-web transition-source-frame')).toBe('work-web');
    expect(spriteAssetFor('pet-sprite activity-transition transition-work-ai-rest')).toBe('transition-work-ai-rest');
    expect(spriteAssetFor('interaction-sprite water-work cup-tumbler')).toBe('water-work-tumbler');
    expect(spriteAssetFor('interaction-sprite hug-rest blanket-night')).toBe('hug-rest-night');
    expect(spriteAssetFor('pet-sprite partner-sprite rest')).toBe('rest');
  });
  it('uses exactly the CSS frame, including both transition endpoints', () => {
    expect(frameFromPosition('0px', 13)).toBe(0);
    expect(frameFromPosition('100%', 13)).toBe(12);
    for (let frame = 0; frame < 13; frame++) expect(frameFromPosition(`${frame / 12 * 100}%`, 13)).toBe(frame);
    expect(frameFromPosition('33.333333%', 4)).toBe(1);
    expect(frameFromPosition('66.666667%', 4)).toBe(2);
  });
});
