import { describe, expect, it, vi } from 'vitest';
import { createAutostartController } from './autostart';

function fakeSystem(initial = false) {
  let enabled = initial;
  return {
    isEnabled: vi.fn(async () => enabled),
    enable: vi.fn(async () => { enabled = true; }),
    disable: vi.fn(async () => { enabled = false; }),
    externalChange: (value: boolean) => { enabled = value; },
  };
}

describe('system launch-at-login switch', () => {
  it('does not pretend that the browser preview can register autostart', async () => {
    const controller = createAutostartController();
    await controller.refresh();
    await controller.setEnabled(true);
    expect(controller.getSnapshot()).toEqual({ phase: 'unsupported' });
  });
  it('reads actual system settings without enabling anything on load', async () => {
    const system = fakeSystem();
    const controller = createAutostartController(system);
    await controller.refresh();
    expect(controller.getSnapshot()).toEqual({ enabled: false, phase: 'ready' });
    system.externalChange(true);
    await controller.refresh();
    expect(controller.getSnapshot()).toEqual({ enabled: true, phase: 'ready' });
    expect(system.enable).not.toHaveBeenCalled();
    expect(system.disable).not.toHaveBeenCalled();
  });
  it('enables and disables the native entry and verifies the result', async () => {
    const system = fakeSystem();
    const controller = createAutostartController(system);
    await controller.setEnabled(true);
    expect(system.enable).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toEqual({ enabled: true, phase: 'ready' });
    await controller.setEnabled(false);
    expect(system.disable).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toEqual({ enabled: false, phase: 'ready' });
    expect(system.isEnabled).toHaveBeenCalledTimes(2);
  });
  it('shows the true state after a rejected change instead of optimistic success', async () => {
    const system = fakeSystem();
    system.enable.mockRejectedValueOnce(new Error('permission denied'));
    const controller = createAutostartController(system);
    await controller.setEnabled(true);
    expect(controller.getSnapshot()).toEqual({ enabled: false, phase: 'error', error: 'write' });
    await controller.setEnabled(true);
    expect(controller.getSnapshot()).toEqual({ enabled: true, phase: 'ready' });
  });
  it('reports a write failure when the system does not keep the requested setting', async () => {
    const system = fakeSystem();
    system.enable.mockResolvedValueOnce(undefined);
    const controller = createAutostartController(system);
    await controller.setEnabled(true);
    expect(controller.getSnapshot()).toEqual({ enabled: false, phase: 'error', error: 'write' });
  });
  it('recovers from a failed read without turning unknown into off', async () => {
    const system = fakeSystem(true);
    system.isEnabled.mockRejectedValueOnce(new Error('unavailable'));
    const controller = createAutostartController(system);
    await controller.refresh();
    expect(controller.getSnapshot()).toEqual({ phase: 'error', error: 'read' });
    await controller.refresh();
    expect(controller.getSnapshot()).toEqual({ enabled: true, phase: 'ready' });
  });
  it('serializes rapid changes and refreshes when settings are reopened', async () => {
    const system = fakeSystem();
    let finish!: () => void;
    system.enable.mockImplementationOnce(() => new Promise<void>(resolve => { finish = () => { system.externalChange(true); resolve(); }; }));
    const controller = createAutostartController(system);
    const enable = controller.setEnabled(true);
    await Promise.resolve();
    expect(controller.getSnapshot().phase).toBe('saving');
    const refresh = controller.refresh();
    const disable = controller.setEnabled(false);
    expect(system.disable).not.toHaveBeenCalled();
    expect(system.isEnabled).not.toHaveBeenCalled();
    finish();
    await Promise.all([enable, refresh, disable]);
    expect(controller.getSnapshot()).toEqual({ enabled: false, phase: 'ready' });
  });
  it('removes UI subscriptions when the panel is closed', async () => {
    const controller = createAutostartController(fakeSystem());
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    await controller.refresh();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    await controller.setEnabled(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
