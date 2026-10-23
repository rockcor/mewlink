// System notifications. In the app, tauri-plugin-notification provides
// window.Notification and shows them through the system; in a browser they
// are skipped.

const available = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window && typeof window.Notification === 'function';

/** Ask for permission early (from a click), so the reminder can show later. */
export async function allowNotifications(): Promise<boolean> {
  if (!available()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return await Notification.requestPermission() === 'granted';
  } catch {
    return false;
  }
}

export async function notify(title: string, body: string) {
  if (!(await allowNotifications())) return;
  try {
    new Notification(title, { body });
  } catch {
    // A reminder that cannot be shown should never break the pet.
  }
}
