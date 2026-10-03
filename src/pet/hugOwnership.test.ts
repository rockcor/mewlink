import { describe, expect, it } from 'vitest';
import { hugFrameSamples, hugPoseForFrame, hugSenderContour, hugSkins } from './hugOwnership';

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
      for (let frame = 0; frame < 24; frame++) {
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
  it('maps every frame of the 24-frame strips to its authored pose', () => {
    expect([0, 3, 4, 7, 8, 17, 18, 23].map(frame => hugPoseForFrame('hug-work', frame))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect([0, 3, 4, 8, 9, 17, 18, 23].map(frame => hugPoseForFrame('hug-rest-mint', frame))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(hugPoseForFrame('hug-idle', 99)).toBe(3);
  });
  it('colors each frame on its own, without blending neighbouring frames', () => {
    for (let frame = 0; frame < 24; frame++) expect(hugFrameSamples(frame)).toEqual([{ frame, weight: 1 }]);
  });
});
