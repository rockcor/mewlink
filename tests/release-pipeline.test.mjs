import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertVersions, combineBuilds } from '../scripts/release-common.mjs';

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
