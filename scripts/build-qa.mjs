#!/usr/bin/env node
// Builds "MewLink QA" (pnpm build:qa): its own identifier, keychain items and
// data (src-tauri/tauri.qa.conf.json), so testing never reads or advances the
// real pairing, and no release update ever replaces it.
//
// On macOS it is signed with the same self-signed certificate as releases.
// Keychain access follows the code signature, so every QA build is "the same
// app" to the keychain and never asks for the password again. The private key
// stays in ~/.mewlink-signing (never in the repository) and is imported into a
// keychain used only for signing; macOS has to trust the certificate once.
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, X509Certificate } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { matchesStableCertificate, SELF_SIGNED_CERTIFICATE, SELF_SIGNED_IDENTITY } from './macos-signing.mjs';

const root = resolve(import.meta.dirname, '..');
const QA_CONFIG = 'src-tauri/tauri.qa.conf.json';
const QA_IDENTIFIER = JSON.parse(readFileSync(join(root, QA_CONFIG), 'utf8')).identifier;
const secrets = join(homedir(), '.mewlink-signing');
const keychain = join(homedir(), 'Library', 'Keychains', 'mewlink-signing.keychain-db');
const keychainPasswordFile = join(secrets, 'signing-keychain-password.txt');

// Secrets only ever go to `security` as arguments, never to the console.
const security = (...args) => execFileSync('security', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const fail = message => { console.error(`\n${message}\n`); process.exit(1); };

function prepareSigningKeychain() {
  const p12 = join(secrets, 'mewlink-codesign.p12');
  const p12PasswordFile = join(secrets, 'password.txt');
  if (!existsSync(p12) || !existsSync(p12PasswordFile)) {
    fail(`MewLink QA is signed with the release certificate, but ${p12} or its password.txt is missing.`);
  }
  if (!existsSync(keychainPasswordFile)) {
    writeFileSync(keychainPasswordFile, randomBytes(24).toString('base64url'), { mode: 0o600 });
  }
  chmodSync(keychainPasswordFile, 0o600);
  const password = readFileSync(keychainPasswordFile, 'utf8').trim();
  if (!existsSync(keychain)) {
    security('create-keychain', '-p', password, keychain);
    // Stays unlocked for a build (6 h), then locks itself.
    security('set-keychain-settings', '-lut', '21600', keychain);
  }
  security('unlock-keychain', '-p', password, keychain);
  // The identity, trusted or not yet (no -v): import it once.
  if (!security('find-identity', '-p', 'codesigning', keychain).includes(`"${SELF_SIGNED_IDENTITY}"`)) {
    security('import', p12, '-k', keychain, '-P', readFileSync(p12PasswordFile, 'utf8').trim(), '-T', '/usr/bin/codesign');
    // codesign may use the key without a prompt.
    security('set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-s', '-k', password, keychain);
  }
  // codesign and Tauri look for the identity in the user's keychain search list.
  const listed = security('list-keychains', '-d', 'user').split('\n').map(line => line.trim().replace(/^"|"$/g, '')).filter(Boolean);
  if (!listed.includes(keychain)) security('list-keychains', '-d', 'user', '-s', ...listed, keychain);
  if (!security('find-identity', '-v', '-p', 'codesigning', keychain).includes(`"${SELF_SIGNED_IDENTITY}"`)) {
    fail([
      'One-time setup: macOS has to trust the MewLink signing certificate for code signing.',
      'Run this once (it asks for your login password), then run pnpm build:qa again:',
      '',
      `  security add-trusted-cert -r trustRoot -p codeSign -k "${keychain}" ${SELF_SIGNED_CERTIFICATE}`,
    ].join('\n'));
  }
}

function verifySignature(app) {
  const leaf = new X509Certificate(readFileSync(join(root, SELF_SIGNED_CERTIFICATE))).fingerprint.replaceAll(':', '').toLowerCase();
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  const requirement = execFileSync('codesign', ['-d', '-r-', app], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (!matchesStableCertificate(requirement, leaf, QA_IDENTIFIER)) {
    fail(`MewLink QA is not signed with the stable certificate (expected leaf ${leaf}, identifier ${QA_IDENTIFIER}):\n${requirement}`);
  }
  console.log(`Signed with the stable MewLink certificate (leaf ${leaf}) as ${QA_IDENTIFIER}.`);
}

const mac = process.platform === 'darwin';
if (mac) prepareSigningKeychain();
const tauri = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tauri.cmd' : 'tauri');
const build = spawnSync(tauri, ['build', '--config', QA_CONFIG], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, VITE_MEWLINK_FLAVOR: 'qa', ...(mac ? { APPLE_SIGNING_IDENTITY: SELF_SIGNED_IDENTITY } : {}) },
});
if (build.status !== 0) process.exit(build.status ?? 1);
if (mac) {
  const app = join(root, 'src-tauri', 'target', 'release', 'bundle', 'macos', 'MewLink QA.app');
  verifySignature(app);
  console.log(`\nMewLink QA is ready: ${app}`);
}
