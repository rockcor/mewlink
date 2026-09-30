import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingSigningInputs } from '../scripts/check-release-signing.mjs';

test('macOS release requires Apple notarization and separate updater credentials', () => {
  assert.equal(missingSigningInputs('darwin', {}).length, 7);
  assert.ok(missingSigningInputs('darwin', { TAURI_SIGNING_PRIVATE_KEY: 'test' }).includes('APPLE_CERTIFICATE'));
});
test('ad-hoc and store certificates are not direct-distribution identities', () => {
  for (const identity of ['-', 'Apple Distribution: Test', 'Apple Development: Test']) {
    assert.ok(missingSigningInputs('darwin', { APPLE_SIGNING_IDENTITY: identity }).some(v => v.includes('must be Developer ID')));
  }
});
test('complete direct-distribution credentials satisfy the preflight, not proof of notarization', () => {
  const env = Object.fromEntries(['TAURI_SIGNING_PRIVATE_KEY', 'APPLE_CERTIFICATE', 'APPLE_CERTIFICATE_PASSWORD',
    'APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID'].map(k => [k, 'test-only']));
  env.APPLE_SIGNING_IDENTITY = 'Developer ID Application: Test (TEST123456)';
  assert.deepEqual(missingSigningInputs('darwin', env), []);
});
test('Windows updater still requires its own signing key', () => {
  assert.deepEqual(missingSigningInputs('win32', {}), ['TAURI_SIGNING_PRIVATE_KEY']);
  assert.deepEqual(missingSigningInputs('win32', { TAURI_SIGNING_PRIVATE_KEY: 'test' }), []);
});
