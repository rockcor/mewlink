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
    notes: 'macOS/Windows 同步更新至 0.3.30。自动更新在启动时及每 6 小时检查；启动后的前三分钟内（即使正在使用电脑），或空闲/离开电脑时，可自动安装并重启。番茄钟可调时长，到点发送系统通知并统计完成数；退出后到点也会在下次打开时补记。新安装的宠物透明度默认为 50%，鼠标移上去恢复不透明；防止同时打开两个实例，并刷新开机启动路径。回放自动使用本机加密存储，无需选择文件夹，核对安全号码前不再显示误导性错误。本次双端实际配对验收尚未完成；反馈邮件服务尚未上线。测试版未经独立安全审计；macOS 沿用固定自签名证书但未公证，Windows 未进行 Authenticode 签名。 / macOS and Windows share version 0.3.30. Updates are checked at startup and every six hours. They may install and restart the app during the first three minutes after launch, even while you are using the computer, or when you are idle or away. Pomodoro duration is adjustable, with a system notification and completed-session count; sessions that finish while the app is closed are counted on next launch. New installations default to 50% pet opacity, becoming opaque on hover. Prevents duplicate instances and refreshes the login-start path. Replay uses encrypted local storage without a folder chooser and avoids misleading errors before safety-number verification. Paired two-device acceptance testing is still pending; feedback email delivery is not yet available. Beta, not independently audited; macOS uses the stable self-signed certificate but is unnotarized, and Windows is not Authenticode-signed.',
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
