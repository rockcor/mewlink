import { beforeEach, describe, expect, it, vi } from 'vitest';

const created: Array<{ text: string; checked: boolean; action: () => void }> = [];
const popup = vi.fn(async () => undefined);
vi.mock('@tauri-apps/api/menu', () => ({
  CheckMenuItem: { new: vi.fn(async (options: { text: string; checked: boolean; action: () => void }) => { created.push(options); return options; }) },
  Menu: { new: vi.fn(async () => ({ popup })) },
}));

const { showLayerMenu } = await import('./petMenu');

beforeEach(() => { created.length = 0; popup.mockClear(); });

describe('the pets’ right-click menu', () => {
  it('offers both window layers with the current one checked, and applies the one picked', async () => {
    const pick = vi.fn();
    await showLayerMenu('bottom', { top: '置于顶层', bottom: '置于底层' }, pick);
    expect(created.map(({ text, checked }) => [text, checked])).toEqual([['置于顶层', false], ['置于底层', true]]);
    expect(popup).toHaveBeenCalledOnce();
    created[0].action();
    expect(pick).toHaveBeenCalledWith('top');
  });
});
