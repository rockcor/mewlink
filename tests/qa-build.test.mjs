import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
  assert.match(readFileSync('src-tauri/src/ratchet/store.rs', 'utf8'), /keychain_service\("ratchet"\)/);
});

test('MewLink QA is never updated to a release, and needs no updater key', () => {
  assert.equal(qa.bundle.createUpdaterArtifacts, false);
  assert.match(script, /VITE_MEWLINK_FLAVOR: 'qa'/);
  assert.match(readFileSync('src/services/update.ts', 'utf8'), /if \(QA_BUILD\)/);
});

test('MewLink QA is signed with the stable release certificate and checked', () => {
  assert.match(script, /APPLE_SIGNING_IDENTITY: SELF_SIGNED_IDENTITY/);
  assert.match(script, /certificate leaf = h"/);
  // The private key never enters the repository or the console.
  assert.match(script, /\.mewlink-signing/);
  assert.doesNotMatch(script, /console\.log\([^)]*password/i);
});
