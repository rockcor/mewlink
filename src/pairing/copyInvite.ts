import { copyText } from '../platform/clipboard';
import { normalizePairingCode, pairingInviteSecondsLeft, type PairingState } from './pairing';

export async function copyPairingInvite(
  state: PairingState | undefined,
  write: (text: string) => Promise<void> = copyText,
  now = Date.now(),
): Promise<void> {
  if (!state || state.partnerDeviceId || pairingInviteSecondsLeft(state, now) === 0 || !state.inviteCode) {
    throw new Error('No active pairing code');
  }
  await write(normalizePairingCode(state.inviteCode));
}
