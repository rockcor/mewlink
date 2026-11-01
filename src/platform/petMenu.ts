import { CheckMenuItem, Menu, MenuItem, PredefinedMenuItem } from '@tauri-apps/api/menu';
import type { WindowLayer } from '../settings/preferences';
import { windowLayers } from '../settings/preferences';

interface Labels { layers: Record<WindowLayer, string>; clickThrough: string }
interface Actions { layer: (layer: WindowLayer) => void; clickThrough: () => void }

/**
 * The pets' right-click menu: keep the window above or below other windows,
 * the current one checked (the same choice as in settings), and click-through
 * mode. A native menu, so it can reach past the small pet window.
 */
export async function showPetMenu(current: WindowLayer, labels: Labels, actions: Actions) {
  const layers = await Promise.all(windowLayers.map(layer => CheckMenuItem.new({
    text: labels.layers[layer],
    checked: layer === current,
    action: () => actions.layer(layer),
  })));
  const items = [...layers, await PredefinedMenuItem.new({ item: 'Separator' }),
    await MenuItem.new({ text: labels.clickThrough, action: actions.clickThrough })];
  const menu = await Menu.new({ items });
  await menu.popup();
}
