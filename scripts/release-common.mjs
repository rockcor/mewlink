import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const requiredTargets = ['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64'];
export const repository = 'rockcor/mewlink';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function assertVersions(root, tag) {
  const version = JSON.parse(readFileSync(`${root}/package.json`, 'utf8')).version;
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const config = JSON.parse(readFileSync(`${root}/src-tauri/tauri.conf.json`, 'utf8'));
  const cargo = readFileSync(`${root}/src-tauri/Cargo.toml`, 'utf8').match(/^version = "([^"]+)"/m)?.[1];
  const lock = readFileSync(`${root}/src-tauri/Cargo.lock`, 'utf8').match(/name = "mewlink"\r?\nversion = "([^"]+)"/)?.[1];
  assert.equal(config.version, version, 'Tauri and package versions differ');
  assert.equal(cargo, version, 'Rust and package versions differ');
  assert.equal(lock, version, 'Rust lockfile version differs');
  if (tag) assert.equal(tag, `v${version}`, 'Tag must match the version built on both platforms');
  assert.equal(config.identifier, 'app.mewlink.desktop', 'Keep the in-place upgrade identity');
  assert.equal(config.bundle.createUpdaterArtifacts, true);
  return version;
}

export function combineBuilds(builds, commit) {
  assert.equal(builds.length, 2, 'Both builds are required');
  const mac = builds.find(build => build.platform === 'macos');
  const windows = builds.find(build => build.platform === 'windows');
  assert.ok(mac && windows, 'One macOS and one Windows build are required');
  assert.equal(mac.version, windows.version, 'Mixed platform versions are forbidden');
  for (const build of builds) {
    assert.equal(build.commit, commit, 'Both builds must use the same source commit');
    assert.match(build.version, /^\d+\.\d+\.\d+$/);
    for (const file of build.files) {
      assert.ok(!file.name.includes('/') && !file.name.includes('\\'));
      assert.ok(file.name.startsWith(`MewLink_${build.version}_`));
      assert.match(file.sha256, /^[0-9a-f]{64}$/);
    }
  }
  return { version: mac.version, mac, windows };
}
