import { CheckMenuItem, Menu } from '@tauri-apps/api/menu';
import type { WindowLayer } from '../settings/preferences';
import { windowLayers } from '../settings/preferences';

/**
 * The pets' right-click menu: keep the window above or below other windows,
 * the current one checked (the same choice as in settings). A native menu, so
 * it can reach past the small pet window.
 */
export async function showLayerMenu(current: WindowLayer, labels: Record<WindowLayer, string>, onPick: (layer: WindowLayer) => void) {
  const items = await Promise.all(windowLayers.map(layer => CheckMenuItem.new({
    text: labels[layer],
    checked: layer === current,
    action: () => onPick(layer),
  })));
  const menu = await Menu.new({ items });
  await menu.popup();
}
