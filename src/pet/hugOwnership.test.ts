import { describe, expect, it } from 'vitest';
import { hugFrameSamples, hugSenderContour, hugSkins } from './hugOwnership';

describe('hug ownership', () => {
  it('retains Shell in either role without recoloring the other pet', () => {
    expect(hugSkins('self', 'shell', 'sky')).toEqual({ receiver: 'shell', sender: 'sky' });
    expect(hugSkins('partner', 'shell', 'sky')).toEqual({ receiver: 'sky', sender: 'shell' });
  });
  it('keeps the receiver and sender colors distinct in both directions', () => {
    expect(hugSkins('self', 'mint', 'sky')).toEqual({ receiver: 'mint', sender: 'sky' });
    expect(hugSkins('partner', 'mint', 'sky')).toEqual({ receiver: 'sky', sender: 'mint' });
  });
  it('provides bounded per-frame contours, including interpolated frames', () => {
    for (const asset of ['hug-work', 'hug-meeting', 'hug-idle', 'hug-leisure', 'hug-rest-blush', 'hug-rest-night', 'hug-rest-mint']) {
      for (let frame = 0; frame < 8; frame++) {
        for (const [x, y] of hugSenderContour(asset, frame)) {
          expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(384);
          expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(256);
        }
      }
    }
  });
  it('does not color the receiver as the absent sender in the initial resting frame', () => {
    expect(hugSenderContour('hug-rest-blush', 0).every(([x]) => x === 384)).toBe(true);
  });
  it('blends independently colored key poses without a moving ownership boundary', () => {
    expect(hugFrameSamples(1)).toEqual([{ frame: 0, weight: .5 }, { frame: 2, weight: .5 }]);
    expect(hugFrameSamples(7)).toEqual([{ frame: 6, weight: 1 }]);
    for (let frame = 0; frame < 8; frame++) {
      expect(hugFrameSamples(frame).reduce((sum, sample) => sum + sample.weight, 0)).toBe(1);
      expect(hugFrameSamples(frame).every(sample => sample.frame % 2 === 0)).toBe(true);
    }
  });
});
