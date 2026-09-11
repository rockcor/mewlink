import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityKind, WorkVisual } from '../domain/types';
import { preloadSprite, spriteSheets } from './spriteAssets';

export interface ActivityTransition {
  from: ActivityKind;
  to: ActivityKind;
  fromWorkVisual: WorkVisual;
  toWorkVisual: WorkVisual;
  key: number;
}

export const transitionAssetName = ({ from, to, fromWorkVisual, toWorkVisual }: Omit<ActivityTransition, 'key'>) => {
  if (from === 'work' && fromWorkVisual !== 'code') return `transition-work-${fromWorkVisual}-${to}`;
  if (to === 'work' && toWorkVisual !== 'code') return `transition-${from}-work-${toWorkVisual}`;
  return `transition-${from}-${to}`;
};

interface ActivityPlaybackOptions {
  desiredActivity: ActivityKind;
  desiredWorkVisual: WorkVisual;
  initialActivity: ActivityKind;
  initialWorkVisual: WorkVisual;
  workHandsSettled: boolean;
  transitionDurationMs: number;
  paused?: boolean;
}

export function useActivityPlayback({
  desiredActivity,
  desiredWorkVisual,
  initialActivity,
  initialWorkVisual,
  workHandsSettled,
  transitionDurationMs,
  paused = false,
}: ActivityPlaybackOptions) {
  const [displayedActivity, setDisplayedActivity] = useState(initialActivity);
  const [displayedWorkVisual, setDisplayedWorkVisual] = useState(initialWorkVisual);
  const [transition, setTransition] = useState<ActivityTransition>();
  const [assetRevision, setAssetRevision] = useState(0);
  const displayedActivityRef = useRef(initialActivity);
  const displayedWorkVisualRef = useRef(initialWorkVisual);
  const desiredActivityRef = useRef(desiredActivity);
  const desiredWorkVisualRef = useRef(desiredWorkVisual);
  const transitionRef = useRef<ActivityTransition | undefined>(undefined);
  const workHandsSettledRef = useRef(workHandsSettled);
  const sequenceRef = useRef(0);

  desiredActivityRef.current = desiredActivity;
  desiredWorkVisualRef.current = desiredWorkVisual;
  workHandsSettledRef.current = workHandsSettled;

  const pendingDescriptor = useCallback((): Omit<ActivityTransition, 'key'> | undefined => {
    const from = displayedActivityRef.current;
    const to = desiredActivityRef.current;
    if (from === to) return undefined;
    return {
      from,
      to,
      fromWorkVisual: displayedWorkVisualRef.current,
      toWorkVisual: desiredWorkVisualRef.current,
    };
  }, []);

  const beginTransition = useCallback((atLoopBoundary: boolean) => {
    if (paused || transitionRef.current) return;
    const descriptor = pendingDescriptor();
    if (!descriptor) return;
    if (descriptor.from === 'work') {
      if (!workHandsSettledRef.current) return;
    } else if (!atLoopBoundary) {
      return;
    }
    if (!spriteSheets.has(transitionAssetName(descriptor))) return;
    const next = { ...descriptor, key: ++sequenceRef.current };
    transitionRef.current = next;
    setTransition(next);
  }, [paused, pendingDescriptor]);

  useEffect(() => {
    if (paused) return;
    if (!transitionRef.current && desiredActivity === displayedActivity) {
      displayedWorkVisualRef.current = desiredWorkVisual;
      setDisplayedWorkVisual(desiredWorkVisual);
      return;
    }
    const descriptor = pendingDescriptor();
    if (!descriptor) return;
    let cancelled = false;
    void preloadSprite(transitionAssetName(descriptor)).then(() => {
      if (!cancelled) setAssetRevision(current => current + 1);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [desiredActivity, desiredWorkVisual, displayedActivity, paused, pendingDescriptor]);

  useEffect(() => {
    if (displayedActivity === 'work') beginTransition(false);
  }, [assetRevision, beginTransition, displayedActivity, desiredActivity, workHandsSettled]);

  const handleLoopBoundary = useCallback(() => beginTransition(true), [beginTransition]);

  const completeTransition = useCallback((key: number) => {
    const active = transitionRef.current;
    if (!active || active.key !== key) return;
    transitionRef.current = undefined;
    displayedActivityRef.current = active.to;
    displayedWorkVisualRef.current = active.toWorkVisual;
    setDisplayedActivity(active.to);
    setDisplayedWorkVisual(active.toWorkVisual);
    setTransition(undefined);
  }, []);

  useEffect(() => {
    if (!transition || paused) return;
    const timer = window.setTimeout(
      () => completeTransition(transition.key),
      Math.max(0, transitionDurationMs) + 80,
    );
    return () => window.clearTimeout(timer);
  }, [completeTransition, paused, transition, transitionDurationMs]);

  return {
    displayedActivity,
    displayedWorkVisual,
    transition,
    handleLoopBoundary,
    completeTransition,
  };
}
