import { invoke } from '@tauri-apps/api/core';
import type { Pulse } from './protocol';

export interface LiveStatus { ownEpoch: number | null; peerEpoch: number | null; peerEnabled: boolean }
export interface PulseFrame { t: 'pulse'; e: number; s: number; c: string }

export class LiveError extends Error {
  constructor(readonly code: string) { super(code); }
}

/** Live keys never leave the native process: JavaScript only sees epochs, sealed frames and opened counts. */
export interface LivePort {
  status(relationshipId: string): Promise<LiveStatus>;
  /** Returns the frame as JSON text, ready to send. Fails with `secure_input` while a password field has focus. */
  seal(relationshipId: string, deviceId: string, pulse: Pulse): Promise<string>;
  open(relationshipId: string, senderDeviceId: string, frame: PulseFrame): Promise<Pulse>;
}

const call = async <T>(operation: string, relationshipId: string, input: unknown = null): Promise<T> => {
  try { return await invoke<T>('live_command', { operation, relationshipId, input }); }
  catch (error) { throw new LiveError(typeof error === 'string' ? error : 'live_unavailable'); }
};

export const nativeLive: LivePort = {
  status: relationshipId => call('status', relationshipId),
  seal: (relationshipId, deviceId, pulse) => call('seal', relationshipId, { deviceId, pulse }),
  open: (relationshipId, senderDeviceId, frame) => call('open', relationshipId, { senderDeviceId, frame }),
};
