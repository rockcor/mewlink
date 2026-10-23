/** What an update brings, in a cloud under the pets; a click closes it for good. */
export function WhatsNewCloud({ text, label, onClose }: { text: string; label: string; onClose: () => void }) {
  return <button type="button" className="whats-new" aria-label={`${label}: ${text}`} title={label}
    onPointerDown={event => event.stopPropagation()} onClick={onClose}>
    <span>{text}</span>
  </button>;
}
