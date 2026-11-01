import { beforeEach, describe, expect, it, vi } from 'vitest';

const created: Array<{ text?: string; checked?: boolean; item?: string; action?: () => void }> = [];
const popup = vi.fn(async () => undefined);
vi.mock('@tauri-apps/api/menu', () => {
  const item = { new: vi.fn(async (options: (typeof created)[number]) => { created.push(options); return options; }) };
  return { CheckMenuItem: item, MenuItem: item, PredefinedMenuItem: item, Menu: { new: vi.fn(async () => ({ popup })) } };
});

const { showPetMenu } = await import('./petMenu');

beforeEach(() => { created.length = 0; popup.mockClear(); });
const actions = () => ({ layer: vi.fn(), clickThrough: vi.fn() });

describe('the pets’ right-click menu', () => {
  it('offers both window layers with the current one checked, and applies the one picked', async () => {
    const pick = actions();
    await showPetMenu('bottom', { layers: { top: '置于顶层', bottom: '置于底层' }, clickThrough: '穿透模式' }, pick);
    expect(created.slice(0, 2).map(({ text, checked }) => [text, checked])).toEqual([['置于顶层', false], ['置于底层', true]]);
    expect(popup).toHaveBeenCalledOnce();
    created[0].action!();
    expect(pick.layer).toHaveBeenCalledWith('top');
  });
  it('can switch from top to bottom and keeps the supplied language', async () => {
    const pick = actions();
    await showPetMenu('top', { layers: { top: 'Keep on top', bottom: 'Keep below' }, clickThrough: 'Click-through mode' }, pick);
    expect(created.slice(0, 2).map(({ text, checked }) => [text, checked])).toEqual([['Keep on top', true], ['Keep below', false]]);
    created[1].action!();
    expect(pick.layer).toHaveBeenCalledWith('bottom');
  });
  it('ends with click-through mode, apart from the layers', async () => {
    const pick = actions();
    await showPetMenu('top', { layers: { top: '置于顶层', bottom: '置于底层' }, clickThrough: '穿透模式' }, pick);
    expect(created.slice(2).map(({ text, item }) => text ?? item)).toEqual(['Separator', '穿透模式']);
    created[3].action!();
    expect(pick.clickThrough).toHaveBeenCalledOnce();
    expect(pick.layer).not.toHaveBeenCalled();
  });
});
