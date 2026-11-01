import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertVersions, combineBuilds, macSigningLabel, repository, sha256 } from './release-common.mjs';

const directory = process.argv[2] ?? 'release-assets';
const version = assertVersions(process.cwd());
const builds = ['macos', 'windows'].map(platform => JSON.parse(readFileSync(join(directory, `build-${platform}.json`), 'utf8')));
const { mac, windows } = combineBuilds(builds, process.env.GITHUB_SHA);
assert.equal(mac.version, version);
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const publicKey = Buffer.from(config.plugins.updater.pubkey, 'base64').toString('utf8').trim().split('\n')[1];
assert.ok(publicKey);
for (const build of builds) for (const file of build.files) {
  assert.equal(sha256(readFileSync(join(directory, file.name))), file.sha256, `Artifact changed: ${file.name}`);
}
const temporary = mkdtempSync(join(tmpdir(), 'mewlink-signatures-'));
function verifiedUpdate(name) {
  const signature = readFileSync(join(directory, `${name}.sig`), 'utf8').trim();
  const decoded = Buffer.from(signature, 'base64').toString('utf8');
  assert.ok(decoded.startsWith('untrusted comment:'));
  const signaturePath = join(temporary, `${name}.minisig`);
  writeFileSync(signaturePath, decoded);
  execFileSync('minisign', ['-Vm', join(directory, name), '-P', publicKey, '-x', signaturePath], { stdio: 'inherit' });
  return { signature, url: `https://github.com/${repository}/releases/download/v${version}/${name}` };
}
try {
  const macUpdate = verifiedUpdate(`MewLink_${version}_universal.app.tar.gz`);
  const winUpdate = verifiedUpdate(`MewLink_${version}_x64-setup.exe`);
  const macDownload = { url: `https://github.com/${repository}/releases/download/v${version}/MewLink_${version}_universal.dmg`, format: 'dmg' };
  const manifest = {
    schema: 1, version, source: process.env.GITHUB_SHA,
    notes: 'macOS/Windows 同步更新至 0.3.43。小狗右键菜单新增穿透模式：小狗淡出显示，窗口的左键和右键点击都会传给下方窗口。macOS 点击 Dock 图标即可退出；再次打开 MewLink 也会恢复操作，不会启动第二个实例。保留按可见像素响应的悬停菜单、紧凑窗口和起身工作无重影修复。钥匙串仍使用静默检查及设置中的手动授权恢复；自签名更新后可能需要手动授权，不能保证跨更新永久免密码。测试版未经独立安全审计；macOS 使用固定自签名证书但未公证，Windows 未进行 Authenticode 签名。 / macOS and Windows share version 0.3.43. The pets\' right-click menu now offers click-through mode: the pets fade, and every left and right click passes to the windows underneath. Click the Dock icon on macOS, or open MewLink again, to restore pet controls without starting a second instance. Includes pixel-based hover menus, compact windows and the fix for sleeping-pup ghosts during activity transitions. Keychain checks remain silent with explicit recovery in settings; self-signed updates may still require manual authorization, and password-free upgrades are not guaranteed. Beta, not independently audited; macOS is stable self-signed but unnotarized, and Windows is not Authenticode-signed.',
    pub_date: new Date().toISOString(),
    platforms: { 'darwin-aarch64': macUpdate, 'darwin-x86_64': macUpdate, 'windows-x86_64': winUpdate },
    downloads: { 'darwin-aarch64': macDownload, 'darwin-x86_64': macDownload, 'windows-x86_64': { url: winUpdate.url, format: 'exe' } },
    signing: { updater: 'minisign-verified', macOS: macSigningLabel(mac), windows: 'not-authenticode-signed' },
  };
  writeFileSync(join(directory, 'latest.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(join(directory, 'SHA256SUMS'), [...mac.files, ...windows.files].map(file => `${file.sha256}  ${file.name}`).join('\n') + '\n');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
