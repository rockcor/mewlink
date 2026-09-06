import type { ActivityKind, CupStyle } from './domain/types';
import type { Language } from './settings/preferences';

interface AppCopy {
  cups: Record<CupStyle, { label: string; shortLabel: string }>;
  status: Record<ActivityKind, string>;
  updateUnchecked: string;
  updateChecking: string;
  updateAvailable: (version: string) => string;
  updateCurrent: (version: string) => string;
  updateError: string;
  connected: string;
  waitingForInvite: string;
  connectionRetry: string;
  shortcut: string;
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
  feedbackTitle: string;
  feedbackShared: string;
  feedbackCopied: string;
  feedbackCopy: string;
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
  drag: string;
  myPet: (status: string) => string;
  partnerPet: (status: string) => string;
  soloShortcut: string;
}

export const appCopy: Record<Language, AppCopy> = {
  zh: {
    cups: { ceramic: { label: '樱粉陶瓷杯', shortLabel: '陶瓷杯' }, tumbler: { label: '天空随行杯', shortLabel: '随行杯' }, bottle: { label: '薄荷运动瓶', shortLabel: '运动瓶' } },
    status: { work: '工作中', meeting: '在开会', leisure: '休闲娱乐', idle: '暂时离开', rest: '休息中' },
    updateUnchecked: '尚未检查更新', updateChecking: '正在检查…', updateAvailable: version => `发现新版本 ${version}`, updateCurrent: version => `已是最新版 ${version}`, updateError: '暂时无法检查，请稍后再试',
    connected: '已连接，可以互相发送拥抱和喝水', waitingForInvite: '等待 TA 粘贴邀请码', connectionRetry: '暂时无法连接，稍后会自动重试', shortcut: '单击拥抱 · 双击喝水',
    incomingHug: 'TA 送来一个拥抱', incomingWater: 'TA 提醒你喝水', creatingInvite: '正在生成邀请码…', createInviteError: '暂时无法生成，请稍后再试', connecting: '正在连接…', connectError: '邀请码无效、已过期或暂时无法连接',
    inviteCopied: '邀请码已复制，请私下发给 TA', inviteCopyError: '复制失败，请手动选择邀请码', disconnected: '已解除连接', pairFirst: '先连接 TA，才能送出互动', hugSent: '拥抱已送出', cupSent: name => `${name}已送出`, sendError: '暂时没有送出去', cupChanged: name => `已换成${name}`,
    feedbackTitle: 'MewLink 反馈', feedbackShared: '谢谢，反馈已分享', feedbackCopied: '反馈已复制，可以粘贴发送', feedbackCopy: '请复制上面的反馈内容', feedbackError: '暂时无法打开分享，请稍后再试',
    petZone: 'MewLink 双人桌面宠物', soloPetZone: 'MewLink 桌面宠物', partnerWaiting: '等待同步', actionsAria: '给 TA 一个小动作', hug: '拥抱', water: '喝水', changeCup: '换杯', replay: '回放', statistics: '统计', settings: '设置', drag: '按住自己的宠物拖动位置', myPet: status => `我的宠物：${status}。按住可拖动位置`, partnerPet: status => `TA 的宠物：${status}。单击发送拥抱，双击提醒喝水`, soloShortcut: '按住宠物拖动 · 悬停打开设置',
  },
  en: {
    cups: { ceramic: { label: 'Blush ceramic mug', shortLabel: 'Ceramic' }, tumbler: { label: 'Sky tumbler', shortLabel: 'Tumbler' }, bottle: { label: 'Mint sports bottle', shortLabel: 'Bottle' } },
    status: { work: 'Working', meeting: 'In a meeting', leisure: 'Taking a break', idle: 'Away for a moment', rest: 'Resting' },
    updateUnchecked: 'Updates not checked yet', updateChecking: 'Checking…', updateAvailable: version => `Version ${version} is ready`, updateCurrent: version => `Up to date · ${version}`, updateError: 'Unable to check right now. Try again later.',
    connected: 'Connected — you can send hugs and water', waitingForInvite: 'Waiting for your partner to paste the invite', connectionRetry: 'Unable to connect right now. Retrying automatically.', shortcut: 'Click to hug · Double-click for water',
    incomingHug: 'Your partner sent a hug', incomingWater: 'Your partner reminded you to drink water', creatingInvite: 'Creating an invite…', createInviteError: 'Unable to create an invite. Try again later.', connecting: 'Connecting…', connectError: 'The invite is invalid, expired, or unavailable right now',
    inviteCopied: 'Invite copied — send it privately to your partner', inviteCopyError: 'Copy failed. Select the invite manually.', disconnected: 'Disconnected', pairFirst: 'Connect your partner before sending an interaction', hugSent: 'Hug sent', cupSent: name => `${name} sent`, sendError: 'Unable to send right now', cupChanged: name => `Changed to ${name}`,
    feedbackTitle: 'MewLink feedback', feedbackShared: 'Thank you — feedback shared', feedbackCopied: 'Feedback copied and ready to paste', feedbackCopy: 'Copy the feedback above to share it', feedbackError: 'Unable to open sharing right now. Try again later.',
    petZone: 'MewLink desktop companions', soloPetZone: 'MewLink desktop companion', partnerWaiting: 'Waiting to sync', actionsAria: 'Send your partner a small gesture', hug: 'Hug', water: 'Water', changeCup: 'Cup', replay: 'Replay', statistics: 'Stats', settings: 'Settings', drag: 'Hold your companion to move it', myPet: status => `Your companion: ${status}. Hold to move it.`, partnerPet: status => `Partner companion: ${status}. Click to hug, double-click to remind them to drink water.`, soloShortcut: 'Hold to move · Hover for Settings',
  },
};
