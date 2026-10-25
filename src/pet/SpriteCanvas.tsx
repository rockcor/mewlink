import { useLayoutEffect, useRef, useState, type HTMLAttributes } from 'react';
import type { PetSkin } from '../domain/types';
import { petSkinFilters } from './skins';
import { frameFromPosition, SOURCE_FRAME_HEIGHT as H, SOURCE_FRAME_WIDTH as W, spriteAssetFor, spriteSheets } from './spriteAssets';
import { spriteClock } from './frameClock';

interface Props extends HTMLAttributes<HTMLSpanElement> {
  skin: PetSkin; senderSkin?: PetSkin; paused: boolean;
  onLoopBoundary?: () => boolean;
  onPlaybackEnd?: () => void;
}
const PAD = 64;

// Paint at source-frame boundaries, not 60 fps, using a monotonic canvas clock.
// Work stays input-driven. Only the current frame occupies a GPU surface.
export function SpriteCanvas({ skin, senderSkin, paused, className = '', onLoopBoundary, onPlaybackEnd, ...props }: Props) {
  const element = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const senderCanvas = useRef<HTMLCanvasElement>(null);
  const propCanvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const callbacks = useRef({ onLoopBoundary, onPlaybackEnd });
  callbacks.current = { onLoopBoundary, onPlaybackEnd };
  const clockState = useRef<{ key: string; start: number; duration: number; cycle: number } | undefined>(undefined);
  const asset = spriteAssetFor(className);
  useLayoutEffect(() => {
    const node = element.current;
    const surface = canvas.current;
    const senderSurface = senderCanvas.current;
    const propSurface = propCanvas.current;
    if (!node || !surface) return;
    if (paused) {
      clockState.current = undefined;
      // Setting dimensions releases the backing surface, not just its contents.
      surface.width = surface.height = 1;
      if (senderSurface) senderSurface.width = senderSurface.height = 1;
      if (propSurface) propSurface.width = propSurface.height = 1;
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
      // A layered sheet has a row per layer: the pup, then in a hug the
      // visitor (in the sender's colours), then a blanket (in its own).
      const layered = sheet.layers >= 2;
      const dualSkin = Boolean(senderSkin && senderSurface && layered);
      const senderContext = dualSkin ? senderSurface!.getContext('2d') : null;
      if (dualSkin && !senderContext) throw new Error('Secondary canvas unavailable');
      const plainRow = dualSkin ? 2 : 1;
      const propContext = layered && sheet.layers > plainRow && propSurface ? propSurface.getContext('2d') : null;
      if (propSurface) {
        propSurface.width = propContext ? surface.width : 1;
        propSurface.height = propContext ? surface.height : 1;
        propSurface.style.filter = `drop-shadow(0 ${shadow[0]}px ${shadow[1]}px rgba(86,45,67,${shadow[2]}))`;
      }
      if (dualSkin) {
        senderSurface!.width = surface.width;
        senderSurface!.height = surface.height;
        senderSurface!.style.filter = `${petSkinFilters[senderSkin!]} drop-shadow(0 ${shadow[0]}px ${shadow[1]}px rgba(86,45,67,${shadow[2]}))`;
      }
      // Current-frame canvases also work on WebKit without Canvas.filter.
      if (layered) surface.style.filter = `${petSkinFilters[skin]} drop-shadow(0 ${shadow[0]}px ${shadow[1]}px rgba(86,45,67,${shadow[2]}))`;
      // Older WKWebView versions retain colors using a small-canvas CSS fallback.
      if (!layered) surface.style.filter = nativeFilter ? 'none' : `${petSkinFilters[skin]} drop-shadow(0 ${shadow[0]}px ${shadow[1]}px rgba(86,45,67,${shadow[2]}))`;
      let previousFrame = -1;
      // A tucked-in pup is its sleeping loop with a blanket over it: it breathes on without a restart.
      const clockAsset = asset.startsWith('rest-tucked-') ? (className.split(/\s+/).includes('idle') ? 'idle' : 'rest') : asset;
      const loop = ['idle', 'meeting', 'rest'].includes(clockAsset) && !className.includes('transition-source-frame');
      const finite = className.includes('activity-transition') || className.includes('interaction-sprite') || className.includes('hug-visit');
      const clockKey = `${clockAsset}:${loop ? 'loop' : finite ? 'once' : 'still'}`;
      const paint = () => {
        if (cancelled) return;
        const style = getComputedStyle(node);
        const cssDuration = Number.parseFloat(style.animationDuration) * 1000 || 0;
        const reduced = cssDuration <= 1 || style.animationName === 'none';
        const duration = reduced && loop ? 1000 : Math.max(1, cssDuration);
        const now = performance.now();
        let state = clockState.current;
        if (!state || state.key !== clockKey) state = clockState.current = { key: clockKey, start: now, duration, cycle: 0 };
        if (duration !== state.duration) {
          // Speed changes preserve phase; changing skin never rewinds the body.
          state.start = now - (now - state.start) * duration / state.duration;
          state.duration = duration;
        }
        const clock = spriteClock(now - state.start, duration, sheet.frames, loop);
        let stopAtBoundary = false;
        if (loop && clock.cycle > state.cycle) {
          state.cycle = clock.cycle;
          stopAtBoundary = callbacks.current.onLoopBoundary?.() ?? false;
        }
        const frame = stopAtBoundary ? sheet.frames - 1
          : reduced ? (finite ? sheet.frames - 1 : frameFromPosition(style.backgroundPositionX, sheet.frames))
          : loop || finite ? clock.frame : frameFromPosition(style.backgroundPositionX, sheet.frames);
        if (frame !== previousFrame) {
          context.clearRect(0, 0, surface.width, surface.height);
          if (layered) {
            if (nativeFilter) context.filter = 'none';
            context.drawImage(sheet.image, frame * W, 0, W, H, PAD, PAD, W, H);
            if (senderContext) {
              senderContext.clearRect(0, 0, surface.width, surface.height);
              senderContext.drawImage(sheet.image, frame * W, H, W, H, PAD, PAD, W, H);
            }
            if (propContext) {
              propContext.clearRect(0, 0, surface.width, surface.height);
              propContext.drawImage(sheet.image, frame * W, plainRow * H, W, H, PAD, PAD, W, H);
            }
          } else {
            if (nativeFilter) context.filter = filter;
            context.drawImage(sheet.image, frame * W, 0, W, H, PAD, PAD, W, H);
          }
          previousFrame = frame;
          node.dataset.frame = String(frame);
        }
        if (finite && (reduced || clock.complete)) { callbacks.current.onPlaybackEnd?.(); return; }
        if (stopAtBoundary || !(loop || finite)) return;
        // Reduced motion still reconciles new remote states, without animating.
        timer = window.setTimeout(paint, reduced ? 1000 : clock.nextMs);
      };
      paint();
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; window.clearTimeout(timer); lease.release(); };
  }, [asset, className, paused, skin, senderSkin]);
  return <span {...props} ref={element} data-sprite={asset} className={`${className} ${failed ? '' : 'canvas-sprite'}`}
    onAnimationIteration={event => {
      props.onAnimationIteration?.(event);
      if (failed) callbacks.current.onLoopBoundary?.();
    }}
    onAnimationEnd={event => {
      props.onAnimationEnd?.(event);
      if (failed) callbacks.current.onPlaybackEnd?.();
    }}>
    <canvas ref={canvas} aria-hidden="true" style={{ display: failed ? 'none' : undefined }} />
    {senderSkin && <canvas ref={senderCanvas} aria-hidden="true" style={{ display: failed ? 'none' : undefined }} />}
    {(senderSkin || asset.startsWith('rest-tucked-')) && <canvas ref={propCanvas} aria-hidden="true" style={{ display: failed ? 'none' : undefined }} />}
  </span>;
}
