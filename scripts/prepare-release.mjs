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
    notes: 'macOS/Windows 同步更新至 0.3.37。开会时小狗留在自己的桌前戴上耳机，屏幕切换为通话画面；进入和离开会议都保持原位。会议中的递水、拥抱和空桌也沿用同一张桌子。键盘焦点改为小标记，右键菜单关闭后不再留下大光圈。GitHub README 已换上新版动图。保留钥匙串防连续弹窗修复；自签名升级后仍可能需要首次授权。测试版未经独立安全审计；macOS 使用固定自签名证书但未公证，Windows 未进行 Authenticode 签名。 / macOS and Windows share version 0.3.37. Meetings now happen at your pup\'s own desk: a headset comes on and its screen joins the call, with transitions in place. Cups, hugs and the empty meeting desk keep that same layout. Keyboard focus uses a small mark, and closing the right-click menu leaves no large ring. The GitHub README now shows the current animations. Includes the bounded Keychain authorization fix; self-signed upgrades may still need initial authorization. Beta, not independently audited; macOS is stable self-signed but unnotarized, and Windows is not Authenticode-signed.',
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
