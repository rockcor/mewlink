import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertVersions, combineBuilds } from '../scripts/release-common.mjs';
import { macSigning, SELF_SIGNED_CERTIFICATE } from '../scripts/macos-signing.mjs';

const commit = '1'.repeat(40);
const mac = { platform: 'macos', version: '0.3.22', commit, files: [{ name: 'MewLink_0.3.22_universal.dmg', sha256: 'a'.repeat(64) }] };
const win = { ...mac, platform: 'windows', files: [{ name: 'MewLink_0.3.22_x64-setup.exe', sha256: 'b'.repeat(64) }] };
test('all app version sources match', () => assert.match(assertVersions(process.cwd()), /^\d+\.\d+\.\d+$/));
test('Windows CRLF checkouts keep the same version', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mewlink-versions-'));
  try {
    mkdirSync(join(directory, 'src-tauri'));
    for (const file of ['package.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'src-tauri/tauri.conf.json']) {
      writeFileSync(join(directory, file), readFileSync(file, 'utf8').replace(/\r?\n/g, '\r\n'));
    }
    assert.equal(assertVersions(directory), assertVersions(process.cwd()));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test('tag mismatch blocks a release', () => assert.throws(() => assertVersions(process.cwd(), 'v999.0.0')));
test('matching platform builds combine', () => assert.equal(combineBuilds([mac, win], commit).version, '0.3.22'));
test('one missing platform cannot publish', () => assert.throws(() => combineBuilds([mac], commit)));
test('mixed versions cannot publish', () => assert.throws(() => combineBuilds([mac, { ...win, version: '0.3.21' }], commit)));
test('different commits cannot publish', () => assert.throws(() => combineBuilds([mac, { ...win, commit: '2'.repeat(40) }], commit)));
test('unsafe artifact paths cannot publish', () => assert.throws(() => combineBuilds([{ ...mac, files: [{ name: '../MewLink_0.3.22.dmg', sha256: 'a'.repeat(64) }] }, win], commit)));

// macOS signing: a published build is either a notarized Developer ID build or
// signed with the one stable self-signed certificate, never ad hoc.
const developerId = { APPLE_CERTIFICATE: 'x', APPLE_CERTIFICATE_PASSWORD: 'x', APPLE_SIGNING_IDENTITY: 'Developer ID Application: MewLink (T)', APPLE_ID: 'x', APPLE_PASSWORD: 'x', APPLE_TEAM_ID: 'T' };
const selfSignedSecrets = { MACOS_SELF_SIGNED_CERTIFICATE: 'cDEy', MACOS_SELF_SIGNED_CERTIFICATE_PASSWORD: 'pw' };
test('Developer ID credentials notarize', () => assert.deepEqual(macSigning({ ...developerId, ...selfSignedSecrets }, 'darwin'), { notarize: true, selfSigned: false }));
test('an unnotarized beta is signed with the stable self-signed certificate', () =>
  assert.deepEqual(macSigning({ MEWLINK_PUBLISH: 'true', MEWLINK_ALLOW_UNNOTARIZED: 'true', ...selfSignedSecrets }, 'darwin'), { notarize: false, selfSigned: true }));
test('an unnotarized beta cannot fall back to an ad-hoc signature', () =>
  assert.throws(() => macSigning({ MEWLINK_PUBLISH: 'true', MEWLINK_ALLOW_UNNOTARIZED: 'true' }, 'darwin'), /self-signed certificate/));
test('the self-signed certificate needs its password', () =>
  assert.throws(() => macSigning({ MACOS_SELF_SIGNED_CERTIFICATE: 'cDEy' }, 'darwin'), /PASSWORD/));
test('build-only runs may still be ad hoc, and other platforms are untouched', () => {
  assert.deepEqual(macSigning({}, 'darwin'), { notarize: false, selfSigned: false });
  assert.deepEqual(macSigning({ MEWLINK_PUBLISH: 'true' }, 'win32'), { notarize: false, selfSigned: false });
});
test('the public certificate is committed and carries no private key', () => {
  const pem = readFileSync(SELF_SIGNED_CERTIFICATE, 'utf8');
  assert.match(pem, /BEGIN CERTIFICATE/);
  assert.doesNotMatch(pem, /PRIVATE KEY/);
});

