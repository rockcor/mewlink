import { useEffect, useRef, type ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { languageTags, type Language } from '../platform/language';

interface Props {
  title: string;
  closeLabel: string;
  language: Language;
  onClose: () => void;
  children: ReactNode;
  navigation?: ReactNode;
  className?: string;
  contentKey?: string;
}

export function PanelFrame({ title, closeLabel, language, onClose, children, navigation, className = '', contentKey }: Props) {
  const panel = useRef<HTMLElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = 0; }, [contentKey]);
  useEffect(() => {
    const previous = document.activeElement;
    close.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])
        .filter(item => item.getClientRects().length > 0 && !item.closest('[hidden]'));
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return <section ref={panel} className={`settings-panel pixel-panel ${className}`} role="dialog" aria-modal="true" aria-labelledby="panel-title" lang={languageTags[language]}>
    <header className="settings-header" onPointerDown={event => {
      if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
      if ('__TAURI_INTERNALS__' in window) void getCurrentWindow().startDragging().catch(() => undefined);
    }}>
      <span className="settings-mascot" aria-hidden="true" />
      <div><small>MewLink</small><h2 id="panel-title">{title}</h2></div>
      <button ref={close} type="button" className="settings-close" onClick={onClose} aria-label={closeLabel}>×</button>
    </header>
    {navigation}
    <div ref={scroll} className="settings-scroll">{children}</div>
    <span className="settings-resize" aria-hidden="true" onPointerDown={event => {
      if (event.button !== 0 || !('__TAURI_INTERNALS__' in window)) return;
      event.preventDefault();
      void getCurrentWindow().startResizeDragging('SouthEast').catch(() => undefined);
    }} />
  </section>;
}
