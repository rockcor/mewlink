import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertVersions, sha256 } from './release-common.mjs';

const [platform, target] = process.argv.slice(2);
assert.ok(['macos', 'windows'].includes(platform));
assert.ok(['universal-apple-darwin', 'x86_64-pc-windows-msvc'].includes(target));
const version = assertVersions(process.cwd());
const bundle = join('src-tauri', 'target', target, 'release', 'bundle');
const entries = readdirSync(bundle, { recursive: true });
const output = 'release-assets';
mkdirSync(output, { recursive: true });
const specs = platform === 'macos'
  ? [['.dmg', `MewLink_${version}_universal.dmg`], ['.app.tar.gz', `MewLink_${version}_universal.app.tar.gz`], ['.app.tar.gz.sig', `MewLink_${version}_universal.app.tar.gz.sig`]]
  : [['-setup.exe', `MewLink_${version}_x64-setup.exe`], ['-setup.exe.sig', `MewLink_${version}_x64-setup.exe.sig`]];
const files = specs.map(([suffix, name]) => {
  const matches = entries.filter(entry => entry.endsWith(suffix));
  assert.equal(matches.length, 1, `Expected exactly one ${suffix}`);
  const source = join(bundle, matches[0]);
  copyFileSync(source, join(output, name));
  return { name, sha256: sha256(readFileSync(source)) };
});
assert.match(process.env.GITHUB_SHA ?? '', /^[0-9a-f]{40}$/);
writeFileSync(join(output, `build-${platform}.json`), JSON.stringify({
  version, platform, commit: process.env.GITHUB_SHA, files,
  notarized: platform === 'macos' && process.env.MEWLINK_NOTARIZED === 'true',
}, null, 2));
