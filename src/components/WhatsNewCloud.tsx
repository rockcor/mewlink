import { useLayoutEffect, useRef, useState } from 'react';

interface Props { title: string; text: string; label: string; onClose: () => void }

// The cloud is drawn in an SVG inside the button's own box, puffs, outline and
// shadow included. (Drawn with CSS drop-shadow filters, the outline lay
// outside the box, and the transparent macOS webview left it behind as a white
// border once the cloud was closed.)
const PUFFS = [{ x: 0.22, r: 11, ry: 10, top: -8 }, { x: 0.48, r: 15, ry: 12, top: -11 }];
const ABOVE = 12;
const BELOW = 3;

function cloudShapes(width: number, height: number) {
  const radius = Math.min(16, height / 2);
  return <>
    <rect x={0} y={ABOVE} width={width} height={height} rx={radius} />
    {PUFFS.map(({ x, r, ry, top }) => <ellipse key={x} cx={width * x + r} cy={ABOVE + top + ry} rx={r} ry={ry} />)}
  </>;
}

/** What an update brings (its version and the news), in a cloud under the pets; a click closes it for good. */
export function WhatsNewCloud({ title, text, label, onClose }: Props) {
  const button = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>();
  useLayoutEffect(() => {
    const node = button.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setSize({ width: node.offsetWidth, height: node.offsetHeight }));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <button ref={button} type="button" className="whats-new" aria-label={`${label}: ${title} ${text}`} title={label}
    onPointerDown={event => event.stopPropagation()} onClick={onClose}>
    {size && <svg className="whats-new-cloud" aria-hidden="true" width={size.width + 2} height={size.height + ABOVE + BELOW + 1}
      viewBox={`-1 0 ${size.width + 2} ${size.height + ABOVE + BELOW + 1}`}>
      {/* A soft step of shadow under it, the outline of the whole shape, then the cloud over the inner lines. */}
      <g className="whats-new-shadow" transform={`translate(0 ${BELOW})`}>{cloudShapes(size.width, size.height)}</g>
      <g className="whats-new-outline">{cloudShapes(size.width, size.height)}</g>
      <g className="whats-new-fill">{cloudShapes(size.width, size.height)}</g>
    </svg>}
    <strong>{title}</strong>
    <span>{text}</span>
  </button>;
}
