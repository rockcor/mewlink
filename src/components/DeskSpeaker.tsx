import type { CSSProperties } from 'react';
import layout from '../pet/speaker.json';

// Its box in the pup's 384x256 frame (art/aseprite/rig/speaker.py): frame 0
// at rest, then the loop it plays while sound does.
const box = {
  left: `${layout.x / 384 * 100}%`,
  top: `${layout.y / 256 * 100}%`,
  width: `${layout.width / 384 * 100}%`,
  height: `${layout.height / 256 * 100}%`,
  backgroundSize: `${layout.frames * 100}% 100%`,
  '--speaker-loop': `${layout.frameMs * (layout.frames - 1)}ms`,
} as CSSProperties;

/** The speaker on top of the pup's monitor: still, or bouncing while a video or music plays. */
export function DeskSpeaker({ playing }: { playing: boolean }) {
  return <span className="speaker-frame" aria-hidden="true">
    <i className={`desk-speaker ${playing ? 'playing' : ''}`} style={box} />
  </span>;
}
