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
    notes: 'macOS/Windows 同步更新至 0.3.35。合入 macOS 钥匙串防连续弹窗补丁：读写先静默检查，每个项目每次启动最多一次交互授权尝试；取消、拒绝或后续失去权限时暂停连接，后台重试不再重复唤起密码框。原配对保留，现有项目原地更新，不删除密钥、不降低钥匙串权限，也不回退到明文存储；ratchet 的密钥轮换、持久化回读和回滚校验不变。需要重试时请重新打开 MewLink，并在系统提示中选择“始终允许”。保留走访拥抱、被子留在睡着的小狗身上及新功能云朵等改动。限制：自签名版本升级后仍可能需要首次授权，系统也可能分别核对不同权限，本版不是完全免密码；Windows 安全存储行为不变。测试版未经独立安全审计；macOS 使用固定自签名证书但未公证，Windows 未进行 Authenticode 签名。 / macOS and Windows share version 0.3.35. Keychain operations probe silently first, with at most one interactive authorization attempt per item per app run. Cancellation, denial, or later loss of access pauses connections, so background retries cannot repeatedly open password dialogs. Existing pairing and item access controls are preserved: no key deletion, weaker permissions, or plaintext fallback. Ratchet key rotation, durable read-back and rollback checks remain unchanged. Reopen MewLink and choose Always Allow to retry. Includes walk-over hugs, retained blankets for sleeping pups, and the versioned news cloud. Limitation: self-signed updates can still need initial authorization, and macOS may check separate permissions; this is not a promise of zero password prompts. Windows credential storage is unchanged. Beta, not independently audited; macOS is stable self-signed but unnotarized, and Windows is not Authenticode-signed.',
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
