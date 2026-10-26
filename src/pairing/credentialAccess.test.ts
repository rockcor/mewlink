import { describe, expect, it } from 'vitest';
import { credentialAccessRequired } from './credentialAccess';
import { RatchetError, isRejectedMessage } from '../crypto/ratchet';
import { SecureStorageError } from './secureStore';

describe('credential authorization failures', () => {
  it('survives Tauri, ratchet and pairing error boundaries', () => {
    const code = 'secure_storage_authorization_required';
    for (const error of [code, new Error(code), new RatchetError(code), new SecureStorageError(code)]) {
      expect(credentialAccessRequired(error)).toBe(true);
    }
  });
  it('does not label other failures as a permission denial or skip an encrypted message', () => {
    for (const error of [undefined, {}, 'network_error', new Error('ratchet_rollback_or_corruption'), new SecureStorageError()]) {
      expect(credentialAccessRequired(error)).toBe(false);
    }
    expect(isRejectedMessage(new RatchetError('secure_storage_authorization_required'))).toBe(false);
  });
});
