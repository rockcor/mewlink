import type { ActivityKind, CupStyle } from './domain/types';
import type { Language } from './settings/preferences';

interface AppCopy {
  cups: Record<CupStyle, { label: string; shortLabel: string }>;
  status: Record<ActivityKind, string>;
  updateUnchecked: string;
  updateChecking: string;
  updateAvailable: (version: string) => string;
  updateCurrent: (version: string) => string;
  updateDownloading: (percent?: number) => string;
  updateInstalling: string;
  updateInstallError: string;
  updateError: string;
  connected: string;
  waitingForInvite: string;
  connectionRetry: string;
  incomingHug: string;
  incomingWater: string;
  creatingInvite: string;
  createInviteError: string;
  connecting: string;
  connectError: string;
  inviteCopied: string;
  inviteCopyError: string;
  disconnected: string;
  pairFirst: string;
  hugSent: string;
  cupSent: (name: string) => string;
  sendError: string;
  cupChanged: (name: string) => string;
  feedbackSending: string;
  feedbackShared: string;
  feedbackError: string;
  petZone: string;
  soloPetZone: string;
  partnerWaiting: string;
  actionsAria: string;
  hug: string;
  water: string;
  changeCup: string;
  replay: string;
  statistics: string;
  settings: string;
  myPet: (status: string) => string;
  partnerPet: (status: string) => string;
}

export const appCopy: Record<Language, AppCopy> = {
  zh: {
    cups: { ceramic: { label: '樱粉陶瓷杯', shortLabel: '陶瓷杯' }, tumbler: { label: '天空随行杯', shortLabel: '随行杯' }, bottle: { label: '薄荷运动瓶', shortLabel: '运动瓶' } },
    status: { work: '工作中', meeting: '在开会', leisure: '休闲娱乐', idle: '暂时离开', rest: '休息中' },
    updateUnchecked: '尚未检查更新', updateChecking: '正在检查…', updateAvailable: version => `发现新版本 ${version}`, updateCurrent: version => `已是最新版 ${version}`, updateDownloading: percent => percent === undefined ? '正在下载新版本…' : `正在下载新版本 ${percent}%`, updateInstalling: '正在安装，完成后会自动重启…', updateInstallError: '更新没有完成，请重新检查后再试', updateError: '暂时无法检查，请稍后再试',
    connected: '已连接，可以互相发送拥抱和喝水', waitingForInvite: '等待对方输入配对码', connectionRetry: '暂时无法连接，稍后会自动重试',
    incomingHug: 'TA 送来一个拥抱', incomingWater: 'TA 提醒你喝水', creatingInvite: '正在生成配对码…', createInviteError: '暂时无法生成，请稍后再试', connecting: '正在用配对码连接…', connectError: '配对码无效、已过期或暂时无法连接',
    inviteCopied: '配对码已复制，请私下发给对方', inviteCopyError: '复制失败，请手动记下配对码', disconnected: '已解除连接', pairFirst: '先连接 TA，才能送出互动', hugSent: '拥抱已送出', cupSent: name => `${name}已送出`, sendError: '暂时没有送出去', cupChanged: name => `已换成${name}`,
    feedbackSending: '正在发送…', feedbackShared: '谢谢，已发送到官网评论区', feedbackError: '暂时没有发送成功，请稍后再试',
    petZone: 'MewLink 双人桌面宠物', soloPetZone: 'MewLink 桌面宠物', partnerWaiting: '等待同步', actionsAria: '给 TA 一个小动作', hug: '拥抱', water: '喝水', changeCup: '换杯', replay: '回放', statistics: '统计', settings: '设置', myPet: status => `我的宠物：${status}`, partnerPet: status => `TA 的宠物：${status}`,
  },
  en: {
    cups: { ceramic: { label: 'Blush ceramic mug', shortLabel: 'Ceramic' }, tumbler: { label: 'Sky tumbler', shortLabel: 'Tumbler' }, bottle: { label: 'Mint sports bottle', shortLabel: 'Bottle' } },
    status: { work: 'Working', meeting: 'In a meeting', leisure: 'Taking a break', idle: 'Away for a moment', rest: 'Resting' },
    updateUnchecked: 'Updates not checked yet', updateChecking: 'Checking…', updateAvailable: version => `Version ${version} is ready`, updateCurrent: version => `Up to date · ${version}`, updateDownloading: percent => percent === undefined ? 'Downloading the update…' : `Downloading the update · ${percent}%`, updateInstalling: 'Installing, then MewLink will restart…', updateInstallError: 'The update did not finish. Check again and retry.', updateError: 'Unable to check right now. Try again later.',
    connected: 'Connected — you can send hugs and water', waitingForInvite: 'Waiting for the other person to enter the pairing code', connectionRetry: 'Unable to connect right now. Retrying automatically.',
    incomingHug: 'Your friend sent a hug', incomingWater: 'Your friend reminded you to drink water', creatingInvite: 'Creating a pairing code…', createInviteError: 'Unable to create a pairing code. Try again later.', connecting: 'Connecting with the pairing code…', connectError: 'The pairing code is invalid, expired, or unavailable right now',
    inviteCopied: 'Pairing code copied — send it privately', inviteCopyError: 'Copy failed. Note the pairing code manually.', disconnected: 'Disconnected', pairFirst: 'Connect someone before sending an interaction', hugSent: 'Hug sent', cupSent: name => `${name} sent`, sendError: 'Unable to send right now', cupChanged: name => `Changed to ${name}`,
    feedbackSending: 'Sending…', feedbackShared: 'Thank you — posted to the website comments', feedbackError: 'Unable to send right now. Try again later.',
    petZone: 'MewLink desktop companions', soloPetZone: 'MewLink desktop companion', partnerWaiting: 'Waiting to sync', actionsAria: 'Send your partner a small gesture', hug: 'Hug', water: 'Water', changeCup: 'Cup', replay: 'Replay', statistics: 'Stats', settings: 'Settings', myPet: status => `Your companion: ${status}`, partnerPet: status => `Partner companion: ${status}`,
  },
};
