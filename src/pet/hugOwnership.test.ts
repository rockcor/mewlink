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
      for (let frame = 0; frame < 40; frame++) {
        for (const [x, y] of hugSenderContour(asset, frame)) {
          expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(384);
          expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(256);
        }
      }
    }
  });
  it('splits vertically while the visitor hops in, so the resting receiver keeps its own color', () => {
    const [[x0, y0], [x1, y1]] = hugSenderContour('hug-work', 0);
    expect(x0).toBe(x1); expect([y0, y1]).toEqual([0, 256]);
    expect(x0).toBeGreaterThan(300);
  });
  it('maps the hug frames to their authored poses, between the walk in and the walk out', () => {
    expect([8, 11, 12, 15, 16, 25, 26, 31].map(frame => hugPoseForFrame('hug-work', frame))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(hugPoseForFrame('hug-rest-mint', 8)).toBe(1);
    expect(hugPoseForFrame('hug-idle', 99)).toBe(3);
  });
  it('colors each frame on its own, without blending neighbouring frames', () => {
    for (let frame = 0; frame < 40; frame++) expect(hugFrameSamples(frame)).toEqual([{ frame, weight: 1 }]);
  });
});
