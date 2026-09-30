import { isTauri } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

/** Write only. Copying a code never needs permission to read the clipboard. */
export async function copyText(value: string): Promise<void> {
  if (!value.trim()) throw new Error('Nothing to copy');
  if (isTauri()) {
    // WKWebView/WebView2 do not consistently grant the browser Clipboard API.
    // Do not hide a native write failure behind a browser success message.
    await writeText(value);
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // Browser preview: try the selection-based copy while handling the click.
  }
  copySelection(value);
}

function copySelection(value: string) {
  const active = document.activeElement as HTMLElement | null;
  const selection = document.getSelection();
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange())
    : [];
  const fieldSelection = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
    ? { start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection }
    : undefined;
  const field = document.createElement('textarea');
  field.value = value;
  field.readOnly = true;
  field.tabIndex = -1;
  field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    if (!document.execCommand('copy')) throw new Error('Clipboard unavailable');
  } finally {
    field.remove();
    active?.focus({ preventScroll: true });
    if (fieldSelection && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)
      && fieldSelection.start !== null && fieldSelection.end !== null) {
      active.setSelectionRange(fieldSelection.start, fieldSelection.end, fieldSelection.direction ?? undefined);
    } else if (selection) {
      selection.removeAllRanges();
      ranges.forEach(range => selection.addRange(range));
    }
  }
}
