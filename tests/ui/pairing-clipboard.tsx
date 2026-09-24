// No relay, real pairing, saved settings, clipboard reads, or automatic updates.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsPanel } from '../../src/components/SettingsPanel';
import { copyPairingInvite } from '../../src/pairing/copyInvite';
import type { PairingState } from '../../src/pairing/pairing';
import { defaultPreferences, type Preferences } from '../../src/settings/preferences';
import { isTauri } from '@tauri-apps/api/core';
import '../../src/styles.css';
import '../../src/settings-panel.css';

const noop = () => undefined;
export function Fixture() {
  const [preferences, setPreferences] = useState<Preferences>(() => ({ ...defaultPreferences(), language: 'zh' }));
  const [open, setOpen] = useState(true);
  const [fail, setFail] = useState(false);
  const [delay, setDelay] = useState(false);
  const [poll, setPoll] = useState(0);
  const [pairing, setPairing] = useState<PairingState>(() => ({
    version: 1, relationshipId: 'clipboard-fixture', relationshipKey: '', relayToken: '', keyId: '',
    deviceId: 'fixture', inviteExpiresAt: Date.now() + 900_000, inviteCode: '2345-6789',
    nextSequence: 0, relayCursor: 0, receivedSequences: {},
  }));
  useEffect(() => {
    const timer = setInterval(() => setPoll(value => value + 1), 2500);
    return () => clearInterval(timer);
  }, []);
  return <main style={{ background: '#fff4e0', minHeight: '100vh', padding: 24 }}>
    <h1>Clipboard check · {isTauri() ? 'native' : 'browser'}</h1>
    <button onClick={() => setOpen(true)}>Open settings</button>
    <label><input type="checkbox" checked={fail} onChange={event => setFail(event.target.checked)}/>Simulate clipboard failure</label>
    <label><input type="checkbox" checked={delay} onChange={event => setDelay(event.target.checked)}/>Delay result</label>
    <button onClick={() => setPairing(current => ({ ...current, inviteExpiresAt: Date.now() - 1 }))}>Expire code</button>
    <label>Paste check<input aria-label="Paste check" /></label>
    {open && <SettingsPanel preferences={preferences} onChange={next => setPreferences(next)}
      localUtcOffsetMinutes={0} cupStyle="ceramic" onCupStyleChange={noop}
      updateState={{ kind: 'current', message: 'Isolated clipboard test' }}
      feedback="" feedbackNickname="" feedbackSending={false} feedbackStatus=""
      pairing={pairing} pairingStatus={`Waiting · refresh ${poll}`} pairingBusy={false}
      inviteCode={pairing.inviteCode ?? ''} joinCode="" safetyCode=""
      onCheckUpdate={noop} onInstallUpdate={noop} onFeedbackChange={noop}
      onFeedbackNicknameChange={noop} onShareFeedback={noop}
      onCreatePairing={() => setPairing(current => ({ ...current, inviteExpiresAt: Date.now() + 900_000, inviteCode: 'ABCD-EFGH' }))}
      onCopyInvite={async () => {
        if (fail) throw new Error('Simulated failure');
        // Invoke immediately, while the browser has the user's click activation.
        await Promise.all([
          copyPairingInvite(pairing),
          ...(delay ? [new Promise(resolve => setTimeout(resolve, 3000))] : []),
        ]);
      }}
      onJoinCodeChange={noop} onJoinPairing={noop} onDisconnect={() => setOpen(false)} onClose={() => setOpen(false)} />}
  </main>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<Fixture />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
