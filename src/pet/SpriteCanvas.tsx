import { useLayoutEffect, useRef, useState, type HTMLAttributes } from 'react';
import type { PetSkin } from '../domain/types';
import { petSkinFilters } from './skins';
import { frameFromPosition, SOURCE_FRAME_HEIGHT as H, SOURCE_FRAME_WIDTH as W, spriteAssetFor, spriteSheets } from './spriteAssets';
import { hugFrameSamples, hugSenderContour } from './hugOwnership';
import { normalizeHugSenderPalette } from './hugPalette';

interface Props extends HTMLAttributes<HTMLSpanElement> { skin: PetSkin; senderSkin?: PetSkin; paused: boolean }
const PAD = 64;

// Keep the existing CSS clock and animation boundary events. Only rasterization
// changes: a small current-frame canvas replaces the GPU's entire strip/filter.
export function SpriteCanvas({ skin, senderSkin, paused, className = '', ...props }: Props) {
  const element = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const senderCanvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const asset = spriteAssetFor(className);
  useLayoutEffect(() => {
    const node = element.current;
    const surface = canvas.current;
    const senderSurface = senderCanvas.current;
    if (!node || !surface) return;
    if (paused) {
      // Setting dimensions releases the backing surface, not just its contents.
      surface.width = surface.height = 1;
      if (senderSurface) senderSurface.width = senderSurface.height = 1;
      return;
    }
    const lease = spriteSheets.acquire(asset);
    let cancelled = false;
    let timer: number | undefined;
    void lease.ready.then(sheet => {
      if (cancelled) return;
      if (surface.width !== W + PAD * 2) surface.width = W + PAD * 2;
      if (surface.height !== H + PAD * 2) surface.height = H + PAD * 2;
      const context = surface.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas unavailable');
      setFailed(false);
      const ratio = W / (node.clientWidth || 230);
      const shadow = className.includes('interaction-sprite') ? [14, 12, .18] : [13, 10, .16];
      const filter = `${petSkinFilters[skin]} drop-shadow(0 ${shadow[0] * ratio}px ${shadow[1] * ratio}px rgba(86,45,67,${shadow[2]}))`;
      const nativeFilter = 'filter' in context;
      const dualSkin = Boolean(senderSkin && senderSurface && asset.startsWith('hug-'));
      const senderContext = dualSkin ? senderSurface!.getContext('2d', { willReadFrequently: asset === 'hug-idle' }) : null;
      if (dualSkin && !senderContext) throw new Error('Secondary canvas unavailable');
      if (dualSkin) {
        senderSurface!.width = surface.width;
        senderSurface!.height = surface.height;
        // Current-frame canvases also work on WebKit without Canvas.filter.
        surface.style.filter = petSkinFilters[skin];
        senderSurface!.style.filter = petSkinFilters[senderSkin!];
      }
      // Older WKWebView versions retain colors using a small-canvas CSS fallback.
      if (!dualSkin) surface.style.filter = nativeFilter ? 'none' : `${petSkinFilters[skin]} drop-shadow(0 ${shadow[0]}px ${shadow[1]}px rgba(86,45,67,${shadow[2]}))`;
      let previousFrame = -1;
      const paint = () => {
        if (cancelled) return;
        const style = getComputedStyle(node);
        const frame = frameFromPosition(style.backgroundPositionX, sheet.frames);
        if (frame !== previousFrame) {
          context.clearRect(0, 0, surface.width, surface.height);
          if (dualSkin && senderContext) {
            senderContext.clearRect(0, 0, surface.width, surface.height);
            for (const sample of hugFrameSamples(frame)) {
              const path = new Path2D();
              const contour = hugSenderContour(asset, sample.frame);
              path.moveTo(contour[0][0] + PAD, PAD);
              for (const [x, y] of contour) path.lineTo(x + PAD, y + PAD);
              path.lineTo(W + PAD, H + PAD);
              path.lineTo(W + PAD, PAD);
              path.closePath();
              // Receiver owns the complement, including its overlapping hands.
              const receiverPath = new Path2D();
              receiverPath.rect(0, 0, surface.width, surface.height);
              receiverPath.addPath(path);
              if (nativeFilter) context.filter = 'none';
              context.save();
              context.globalAlpha = sample.weight;
              context.globalCompositeOperation = 'lighter';
              context.clip(receiverPath, 'evenodd');
              context.drawImage(sheet.image, sample.frame * W, 0, W, H, PAD, PAD, W, H);
              context.restore();
              senderContext.save();
              senderContext.globalAlpha = sample.weight;
              senderContext.globalCompositeOperation = 'lighter';
              senderContext.clip(path);
              senderContext.drawImage(sheet.image, sample.frame * W, 0, W, H, PAD, PAD, W, H);
              senderContext.restore();
            }
            if (asset === 'hug-idle') {
              const pixels = senderContext.getImageData(PAD, PAD, W, H);
              normalizeHugSenderPalette(pixels.data);
              senderContext.putImageData(pixels, PAD, PAD);
            }
          } else {
            if (nativeFilter) context.filter = filter;
            context.drawImage(sheet.image, frame * W, 0, W, H, PAD, PAD, W, H);
          }
          previousFrame = frame;
        }
        const animation = node.getAnimations().find(item => item.playState === 'running');
        if (!animation) return;
        const duration = Number(animation.effect?.getTiming().duration) || 0;
        const time = Number(animation.currentTime) || 0;
        const interval = duration / sheet.frames;
        // Wake at an actual frame boundary, never at the display refresh rate.
        if (interval > 0) timer = window.setTimeout(paint, Math.max(8, interval - time % interval + 2));
      };
      paint();
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; window.clearTimeout(timer); lease.release(); };
  }, [asset, className, paused, skin, senderSkin]);
  return <span {...props} ref={element} className={`${className} ${failed ? '' : 'canvas-sprite'}`}>
    <canvas ref={canvas} aria-hidden="true" style={{ display: failed ? 'none' : undefined }} />
    {senderSkin && <canvas ref={senderCanvas} aria-hidden="true" style={{ display: failed ? 'none' : undefined }} />}
  </span>;
}
