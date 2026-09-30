import type { ActivityKind, CupStyle } from './domain/types';
import type { Language } from './settings/preferences';

interface AppCopy {
  interactionQueued: string;
  stopReplay: string;
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
  secureStorageError: string;
  revocationPending: string;
  ratchetUpgrade: string;
  ratchetVerify: string;
  ratchetStorageError: string;
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
  panelError: string;
  historyError: string;
  myPet: (status: string) => string;
  partnerPet: (status: string) => string;
}

export const appCopy: Record<Language, AppCopy> = {
  zh: {
    secureStorageError: '无法访问安全存储，连接已暂停。请允许访问系统钥匙串后重新打开应用。',
    revocationPending: '已停止本机收发，等待联网完成解绑。完成前暂不能建立新连接。',
    ratchetUpgrade: '请双方更新后解除旧绑定，重新生成配对码。旧连接的收发已暂停。',
    ratchetVerify: '请通过电话或当面核对双方号码，完全一致后再确认。确认前不分享活动与互动。',
    ratchetStorageError: '安全会话暂不可用，收发已暂停。请重新打开应用；若仍有问题，请双方重新绑定。',
    historyError: '回放记录未完成，请检查剩余空间后重新打开 MewLink',
    interactionQueued: '已保存，联网后送出', stopReplay: '结束回放',
    panelError: '窗口未能展开，请重新打开设置',
    cups: { ceramic: { label: '樱粉陶瓷杯', shortLabel: '陶瓷杯' }, tumbler: { label: '天空随行杯', shortLabel: '随行杯' }, bottle: { label: '薄荷运动瓶', shortLabel: '运动瓶' } },
    status: { work: '工作中', meeting: '在开会', leisure: '休闲娱乐', idle: '暂时离开', rest: '休息中' },
    updateUnchecked: '尚未检查更新', updateChecking: '正在检查…', updateAvailable: version => `发现新版本 ${version}`, updateCurrent: version => `已是最新版 ${version}`, updateDownloading: percent => percent === undefined ? '正在下载新版本…' : `正在下载新版本 ${percent}%`, updateInstalling: '正在安装，完成后会自动重启…', updateInstallError: '更新没有完成，请重新检查后再试', updateError: '暂时无法检查，请稍后再试',
    connected: '已连接，可以互相发送拥抱和喝水', waitingForInvite: '等待对方输入配对码', connectionRetry: '暂时无法连接，稍后会自动重试',
    incomingHug: 'TA 送来一个拥抱', incomingWater: 'TA 提醒你喝水', creatingInvite: '正在生成配对码…', createInviteError: '暂时无法生成，请稍后再试', connecting: '正在用配对码连接…', connectError: '配对码无效、已过期或暂时无法连接',
    inviteCopied: '配对码已复制，请私下发给对方', inviteCopyError: '复制失败，请手动记下配对码', disconnected: '已解除连接', pairFirst: '先连接 TA，才能送出互动', hugSent: '拥抱已送出', cupSent: name => `${name}已送出`, sendError: '暂时没有送出去', cupChanged: name => `已换成${name}`,
    feedbackSending: '正在发送…', feedbackShared: '谢谢，已发送到官网评论区', feedbackError: '暂时没有发送成功，请稍后再试',
    petZone: 'MewLink 双人桌面宠物', soloPetZone: 'MewLink 桌面宠物', partnerWaiting: '等待同步', actionsAria: '给 TA 一个小动作', hug: '拥抱', water: '喝水', changeCup: '换杯', replay: '回放', statistics: '统计', settings: '设置', myPet: status => `我的宠物：${status}`, partnerPet: status => `TA 的宠物：${status}`,
  },
  'zh-Hant': {
    secureStorageError: '無法存取安全儲存，連線已暫停。請允許存取系統鑰匙圈後重新開啟應用程式。',
    revocationPending: '已停止本機收發，等待連網完成解除綁定。完成前暫不能建立新連線。',
    ratchetUpgrade: '請雙方更新後解除舊綁定，重新產生配對碼。舊連線的收發已暫停。',
    ratchetVerify: '請透過電話或當面核對雙方號碼，完全一致後再確認。確認前不分享活動與互動。',
    ratchetStorageError: '安全會話暫不可用，收發已暫停。請重新開啟應用程式；若仍有問題，請雙方重新綁定。',
    historyError: '回放記錄未完成，請檢查剩餘空間後重新開啟 MewLink',
    interactionQueued: '已儲存，連線後送出', stopReplay: '結束回放',
    panelError: '視窗未能展開，請重新開啟設定',
    cups: { ceramic: { label: '櫻粉陶瓷杯', shortLabel: '陶瓷杯' }, tumbler: { label: '天空隨行杯', shortLabel: '隨行杯' }, bottle: { label: '薄荷運動瓶', shortLabel: '運動瓶' } },
    status: { work: '工作中', meeting: '在開會', leisure: '休閒娛樂', idle: '暫時離開', rest: '休息中' },
    updateUnchecked: '尚未檢查更新', updateChecking: '正在檢查…', updateAvailable: version => `發現新版本 ${version}`, updateCurrent: version => `已是最新版 ${version}`, updateDownloading: percent => percent === undefined ? '正在下載新版本…' : `正在下載新版本 ${percent}%`, updateInstalling: '正在安裝，完成後會自動重新啟動…', updateInstallError: '更新未完成，請重新檢查後再試', updateError: '暫時無法檢查，請稍後再試',
    connected: '已連線，可以互相傳送擁抱和喝水', waitingForInvite: '等待對方輸入配對碼', connectionRetry: '暫時無法連線，稍後會自動重試',
    incomingHug: 'TA 送來一個擁抱', incomingWater: 'TA 提醒你喝水', creatingInvite: '正在產生配對碼…', createInviteError: '暫時無法產生，請稍後再試', connecting: '正在用配對碼連線…', connectError: '配對碼無效、已過期或暫時無法連線',
    inviteCopied: '配對碼已複製，請私下傳給對方', inviteCopyError: '複製失敗，請手動記下配對碼', disconnected: '已解除連線', pairFirst: '先連線 TA，才能送出互動', hugSent: '擁抱已送出', cupSent: name => `${name}已送出`, sendError: '暫時無法送出', cupChanged: name => `已換成${name}`,
    feedbackSending: '正在傳送…', feedbackShared: '謝謝，已傳送至官網留言區', feedbackError: '暫時未能傳送成功，請稍後再試',
    petZone: 'MewLink 雙人桌面寵物', soloPetZone: 'MewLink 桌面寵物', partnerWaiting: '等待同步', actionsAria: '給 TA 一個小動作', hug: '擁抱', water: '喝水', changeCup: '換杯', replay: '回放', statistics: '統計', settings: '設定', myPet: status => `我的寵物：${status}`, partnerPet: status => `TA 的寵物：${status}`,
  },
  en: {
    secureStorageError: 'Secure storage is unavailable. Connections are paused. Allow system credential access and reopen the app.',
    revocationPending: 'Sending and receiving stopped here. Unpairing will finish when online; new connections are paused until then.',
    ratchetUpgrade: 'Both people need to update, unpair and create a new code. The old connection is paused.',
    ratchetVerify: 'Compare both numbers in person or on a call. Confirm only if they match exactly. No activity or interactions are shared before confirmation.',
    ratchetStorageError: 'The secure session is unavailable; communication is paused. Reopen the app. If this persists, both people need to pair again.',
    historyError: 'Replay could not be saved or loaded. Check free space and reopen MewLink.',
    interactionQueued: 'Saved — will send when connected', stopReplay: 'End replay',
    panelError: 'The window could not expand. Please reopen settings.',
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
