import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { matchesStableCertificate } from '../scripts/macos-signing.mjs';

const release = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const qa = JSON.parse(readFileSync('src-tauri/tauri.qa.conf.json', 'utf8'));
const script = readFileSync('scripts/build-qa.mjs', 'utf8');

test('MewLink QA is a separate app: own identifier, keychain items and data', () => {
  assert.equal(release.identifier, 'app.mewlink.desktop');
  assert.notEqual(qa.identifier, release.identifier);
  assert.ok(qa.identifier.startsWith(`${release.identifier}.`));
  assert.equal(qa.productName, 'MewLink QA');
  // Keychain items follow the identifier (secure_storage::keychain_service).
  assert.match(readFileSync('src-tauri/src/secure_storage.rs', 'utf8'), /format!\("\{identifier\}\.\{item\}"\)/);
  assert.match(readFileSync('src-tauri/src/ratchet/store.rs', 'utf8'), /credentials::read\(crate::credentials::Item::Ratchet\)/);
  assert.match(readFileSync('src-tauri/src/secure_storage.rs', 'utf8'), /credentials::read\(crate::credentials::Item::Pairing\)/);
  const credentials = readFileSync('src-tauri/src/credentials.rs', 'utf8');
  assert.match(credentials, /Self::Ratchet => \("ratchet", "anchor-v1"\)/);
  assert.match(credentials, /Self::Pairing => \("pairing", "pairing-v2"\)/);
  assert.match(credentials, /secure_storage::keychain_service\(service\)/);
});

test('MewLink QA is never updated to a release, and needs no updater key', () => {
  assert.equal(qa.bundle.createUpdaterArtifacts, false);
  assert.match(script, /VITE_MEWLINK_FLAVOR: 'qa'/);
  assert.match(readFileSync('src/services/update.ts', 'utf8'), /if \(QA_BUILD\)/);
});

test('MewLink QA is signed with the stable release certificate and checked', () => {
  assert.match(script, /APPLE_SIGNING_IDENTITY: SELF_SIGNED_IDENTITY/);
  assert.match(script, /matchesStableCertificate\(requirement, leaf, QA_IDENTIFIER\)/);
  // The private key never enters the repository or the console.
  assert.match(script, /\.mewlink-signing/);
  assert.doesNotMatch(script, /console\.log\([^)]*password/i);
});

test('stable QA signing accepts either self-signed pin spelling and rejects the wrong app or certificate', () => {
  const fingerprint = '5ac616a38776a2ecde5de86badb90f6d1773d204';
  const identifier = 'app.mewlink.desktop.qa';
  for (const kind of ['leaf', 'root']) {
    const requirement = `designated => identifier "${identifier}" and certificate ${kind} = H"${fingerprint}"`;
    assert.equal(matchesStableCertificate(requirement + '\n', fingerprint, identifier), true);
    assert.equal(matchesStableCertificate(requirement, '0'.repeat(40), identifier), false);
    assert.equal(matchesStableCertificate(requirement, fingerprint, 'app.mewlink.desktop'), false);
    assert.equal(matchesStableCertificate(requirement + ' or true', fingerprint, identifier), false);
  }
  assert.equal(matchesStableCertificate('designated => cdhash H"123"', fingerprint, identifier), false);
});
