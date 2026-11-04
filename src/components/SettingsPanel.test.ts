import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SettingsPanel } from './SettingsPanel';
import { loadPreferences } from '../settings/preferences';

vi.mock('./PanelFrame', () => ({ PanelFrame: ({ children }: { children: ReactNode }) => children }));
vi.mock('./AutostartSetting', () => ({ AutostartSetting: () => null }));
const noop = () => undefined;
const props: Parameters<typeof SettingsPanel>[0] = {
  preferences: { ...loadPreferences(), language: 'en' }, localUtcOffsetMinutes: 0,
  updateState: { kind: 'idle', message: '' }, feedback: '', feedbackNickname: '',
  feedbackSending: false, feedbackStatus: '', pairingStatus: '', pairingBusy: true,
  credentialLocked: true, storageAuthorizing: false, inviteCode: '', joinCode: '', safetyCode: '',
  livePhase: 'off', cupStyle: 'ceramic', onChange: noop, onCheckUpdate: noop,
  onInstallUpdate: noop, onFeedbackChange: noop, onFeedbackNicknameChange: noop,
  onShareFeedback: noop, onCreatePairing: noop, onCopyInvite: async () => undefined,
  onJoinCodeChange: noop, onJoinPairing: noop, onDisconnect: noop, onConfirmPairing: noop,
  onCupStyleChange: noop, onClose: noop, onAuthorizeStorage: noop,
};

describe('Keychain recovery in settings', () => {
  it('keeps recovery enabled when pairing is blocked and hides new pairing controls', () => {
    const html = renderToStaticMarkup(createElement(SettingsPanel, props));
    const button = html.match(/<button[^>]*>Authorize Keychain<\/button>/)?.[0];
    expect(button).toBeDefined();
    expect(button).not.toContain('disabled');
    expect(html).not.toContain('Create pairing code');
  });
  it('blocks duplicate authorization requests while the system operation is pending', () => {
    const html = renderToStaticMarkup(createElement(SettingsPanel, { ...props, storageAuthorizing: true }));
    expect(html.match(/<button[^>]*>Authorize Keychain<\/button>/)?.[0]).toContain('disabled');
  });
  it('shows no recovery action after a successful restore', () => {
    const html = renderToStaticMarkup(createElement(SettingsPanel, { ...props, credentialLocked: false }));
    expect(html).not.toContain('>Authorize Keychain</button>');
  });
});


describe('inactivity setting', () => {
  it('shows the saved minutes with a one-to-thirty-minute control', () => {
    const html = renderToStaticMarkup(createElement(SettingsPanel, {
      ...props, preferences: { ...props.preferences, inactivityMinutes: 30 },
    }));
    const slider = html.match(/<input[^>]*aria-label="Inactivity timeout in minutes"[^>]*>/)?.[0];
    expect(slider).toBeDefined();
    expect(slider).toContain('min="1"');
    expect(slider).toContain('max="30"');
    expect(slider).toContain('value="30"');
    expect(html).toContain('30 min');
  });
});
