import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { inputProbe, type InputSignal } from './activity';

export function acceptInput(previous: InputSignal | undefined, next: InputSignal): boolean {
  if (!previous) return true;
  // A bootstrap response can arrive after a more recent native event.
  if (next.keyboardSequence < previous.keyboardSequence || next.pointerSequence < previous.pointerSequence
    || next.pointerClickSequence < previous.pointerClickSequence) return false;
  return next.keyboardSequence !== previous.keyboardSequence || next.pointerSequence !== previous.pointerSequence
    || next.pointerClickSequence !== previous.pointerClickSequence;
}

export function watchInput(onSignal: (signal: InputSignal) => void): () => void {
  let stopped = false;
  let previous: InputSignal | undefined;
  let dispose: (() => void) | undefined;
  const deliver = (signal: InputSignal) => {
    if (stopped || !acceptInput(previous, signal)) return;
    previous = signal;
    onSignal(signal);
  };
  if ('__TAURI_INTERNALS__' in window) {
    void listen<InputSignal>('mewlink-input', event => deliver(event.payload)).then(unlisten => {
      if (stopped) { unlisten(); return; }
      dispose = unlisten;
      return invoke<InputSignal>('input_signal').then(deliver);
    }).catch(() => undefined);
  } else {
    const sample = () => { void inputProbe.sample().then(deliver); };
    const events = ['keydown', 'pointerdown', 'pointermove', 'wheel'];
    events.forEach(name => window.addEventListener(name, sample, { passive: true }));
    dispose = () => events.forEach(name => window.removeEventListener(name, sample));
    sample();
  }
  return () => { stopped = true; dispose?.(); };
}
