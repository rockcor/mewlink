import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { PetActions } from './PetActions';

const noop = () => undefined;
const props = { language: 'en' as const, connected: true, canReplay: true, cupStyle: 'ceramic' as const,
  onSettings: noop, onStatistics: noop, onHug: noop, onWater: noop, onReplay: noop, onPomodoro: noop };

describe('compact pet menu', () => {
  it('puts Settings first, keeps care actions, and has no mug cycling button', () => {
    const html = renderToStaticMarkup(createElement(PetActions, props));
    expect(html.match(/<button/g)).toHaveLength(6);
    expect(html.indexOf('settings-action')).toBeLessThan(html.indexOf('statistics-action'));
    expect(html).toContain('data-icon="hug"');
    expect(html).toContain('data-icon="ceramic"');
    expect(html).not.toContain('cup-switch');
    expect(html).not.toContain('Change mug');
  });
  it('keeps Settings and Statistics accessible when unpaired', () => {
    const html = renderToStaticMarkup(createElement(PetActions, { ...props, connected: false }));
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(html).toContain('settings-action');
    expect(html).not.toContain('replay-action');
  });
  it('starts a pomodoro alone or paired; the button just says Pomodoro', () => {
    const idle = renderToStaticMarkup(createElement(PetActions, { ...props, connected: false, pomodoroMinutes: 40 }));
    expect(idle).toContain('data-icon="tomato"');
    expect(idle).toContain('aria-pressed="false"');
    expect(idle).toContain('Start a 40-minute pomodoro');
    expect(idle).toMatch(/<\/span>Pomodoro<\/button>/);
    const running = renderToStaticMarkup(createElement(PetActions, { ...props, pomodoroRunning: true, pomodoroMinutes: 18 }));
    expect(running).toMatch(/<\/span>Pomodoro<\/button>/);
    expect(running).not.toContain('18 min</');
    expect(running).toContain('End pomodoro (18 min left)');
    expect(running).toContain('aria-pressed="true"');
  });
});
