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
    notes: "macOS/Windows 同步更新至 0.3.44。TA 的回放提示仅随悬停菜单出现，不再一直显示。小狗显示器上的音箱会随浏览器或播放器的影音跳动，并通过活动心跳同步给 TA；播放时小狗留在桌前，无输入超过 2 分钟计为休闲。macOS 14.2+ 使用 Core Audio 进程输出状态，Windows 使用 WASAPI 会话峰值；只同步是否播放的一位状态，不采集声音、曲目或网页内容。钥匙串仍使用静默检查及设置中的手动授权恢复；自签名更新后可能需要手动授权，不能保证跨更新永久免密码。测试版未经独立安全审计；macOS 使用固定自签名证书但未公证，Windows 未进行 Authenticode 签名。 / macOS and Windows share version 0.3.44. TA’s replay notice now appears only with the hover menu. A speaker on the pup’s monitor bounces while browser or media-player audio plays, and the activity heartbeat shares this with TA. The pup stays at its desk while sound plays; after two minutes without input, that time counts as leisure. Detection uses Core Audio per-process output state on macOS 14.2+ and WASAPI session peak meters on Windows. Only a playing/not-playing bit is shared, without capturing audio, track details or page content. Keychain checks remain silent with explicit recovery in settings; self-signed updates may still require manual authorization, and password-free upgrades are not guaranteed. Beta, not independently audited; macOS is stable self-signed but unnotarized, and Windows is not Authenticode-signed.",
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
