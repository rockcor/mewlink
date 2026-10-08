import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { sessionBreaks, type ReplayDay } from '../history/days';
import { PixelIcon } from './PixelIcon';

/** "TA 的回放 · 5 小时": offered under the partner's pup instead of starting by itself. */
export function ReplayNotice({ label, onPlay }: { label: string; onPlay: () => void }) {
  return <button type="button" className="replay-notice" onPointerDown={event => event.stopPropagation()} onClick={onPlay}>
    <PixelIcon name="replay" /><span>{label}</span>
  </button>;
}

interface ScrubberProps {
  day: ReplayDay;
  /** 0..1 of the day's recorded time. */
  progress: number;
  /** Where the replay is, in the partner's own time. */
  timeLabel: string;
  positionLabel: string;
  closeLabel: string;
  onSeek: (fraction: number) => void;
  onClose: () => void;
}

/** A video-style bar for one day: breaks are marked, click or drag to jump, arrows step 5%. */
export function ReplayScrubber({ day, progress, timeLabel, positionLabel, closeLabel, onSeek, onClose }: ScrubberProps) {
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number>();
  const fractionAt = (event: PointerEvent) => {
    const box = track.current?.getBoundingClientRect();
    return box && box.width > 0 ? Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) : 0;
  };
  const shown = dragging ?? progress;
  const step = (event: KeyboardEvent) => {
    const delta = event.key === 'ArrowRight' ? 0.05 : event.key === 'ArrowLeft' ? -0.05 : 0;
    if (!delta) return;
    event.preventDefault();
    onSeek(Math.min(1, Math.max(0, progress + delta)));
  };
  return <div className="replay-scrubber" onPointerDown={event => event.stopPropagation()}>
    <span className="replay-time">{timeLabel}</span>
    <div ref={track} className="replay-track" role="slider" tabIndex={0} aria-label={positionLabel}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(shown * 100)} aria-valuetext={timeLabel}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); setDragging(fractionAt(event)); }}
      onPointerMove={event => { if (dragging !== undefined) setDragging(fractionAt(event)); }}
      onPointerUp={event => { if (dragging === undefined) return; setDragging(undefined); onSeek(fractionAt(event)); }}
      onPointerCancel={() => setDragging(undefined)}
      onKeyDown={step}>
      <span className="replay-fill" style={{ width: `${shown * 100}%` }} />
      {sessionBreaks(day).map(at => <i key={at} className="replay-break" style={{ left: `${at * 100}%` }} />)}
      <span className="replay-thumb" style={{ left: `${shown * 100}%` }} />
    </div>
    <button type="button" className="replay-close" aria-label={closeLabel} title={closeLabel} onClick={onClose}><PixelIcon name="close" /></button>
  </div>;
}
