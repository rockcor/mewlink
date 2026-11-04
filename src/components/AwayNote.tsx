import type { CSSProperties } from 'react';
import { awayLayout as layout, WORDS_AT } from '../pet/away';

// Boxes of the pup's 384x256 frame (art/aseprite/rig/away.py).
const box = ({ x, y, width, height }: { x: number; y: number; width: number; height: number }) => ({
  left: `${x / 384 * 100}%`, top: `${y / 256 * 100}%`, width: `${width / 384 * 100}%`, height: `${height / 256 * 100}%`,
}) as CSSProperties;

/** The words on an away pup's sticky note, in the viewer's language, and a visitor's paw print under them. */
export function AwayNote({ words, arriving, paw }: { words: string; arriving: boolean; paw: boolean }) {
  return <span className={`away-note ${arriving ? 'arriving' : ''}`} style={{ '--words-at': WORDS_AT } as CSSProperties} aria-hidden="true">
    <span className="away-words" style={box(layout.words)}>{words}</span>
    {paw && <i className="away-paw" style={box(layout.paw)} />}
  </span>;
}
