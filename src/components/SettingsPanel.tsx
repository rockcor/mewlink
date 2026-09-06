import { open } from '@tauri-apps/plugin-dialog';
import { blanketStyles, cupStyles, petSkins, type CupStyle, type PetSkin } from '../domain/types';
import type { AnimationSpeed, Preferences } from '../settings/preferences';
import type { PairingState } from '../pairing/pairing';
import { animationSpeeds, formatUtcOffset, replayRetentionOptions } from '../settings/preferences';

export interface UpdateViewState {
  kind: 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'installing' | 'error';
  message: string;
  downloadUrl?: string;
  canInstall?: boolean;
}

interface SettingsPanelProps {
  preferences: Preferences;
  localUtcOffsetMinutes: number;
  partnerUtcOffsetMinutes?: number;
  updateState: UpdateViewState;
  feedback: string;
  feedbackStatus: string;
  pairing?: PairingState;
  pairingStatus: string;
  inviteCode: string;
  joinCode: string;
  safetyCode: string;
  cupStyle: CupStyle;
  onChange: (next: Preferences) => void;
  onCheckUpdate: () => void;
  onInstallUpdate: () => void;
  onFeedbackChange: (value: string) => void;
  onShareFeedback: () => void;
  onCreatePairing: () => void;
  onCopyInvite: () => void;
  onJoinCodeChange: (value: string) => void;
  onJoinPairing: () => void;
  onDisconnect: () => void;
  onCupStyleChange: (style: CupStyle) => void;
  onClose: () => void;
}

const copy = {
  zh: {
    settings: '设置', close: '关闭设置', language: '语言', languageNote: '选择应用显示语言',
    connect: '连接 TA', connectNote: '可单独使用；连接后两只宠物会同时出现', connected: '已连接', waiting: '等待中',
    createInvite: '生成邀请码', or: '或', pasteInvite: '粘贴 TA 发来的邀请码', invite: '邀请码', connectAction: '连接', myInvite: '我的邀请码', copyInvite: '复制邀请码', cancel: '取消',
    petsConnected: '两只宠物已经连在一起', compareNumber: '请和 TA 核对下方号码', disconnect: '解除绑定', safetyNumber: '核对号码',
    replay: '时差重放', replayNote: '两人连接后自动识别时差，上线时重放错过的片刻',
    recording: '回放录像', recordingNote: '只保存宠物回放，不录制真实屏幕', saveLocation: '保存位置', chooseFolder: '选择', defaultFolder: '应用默认文件夹', retention: '保留时长', hours: (hours: number) => `${hours} 小时`, chooseFolderTitle: '选择回放录像保存位置',
    update: '自动更新', updateNote: '启动时检查，新版本可直接安装并重启', goUpdate: '前往更新', installNow: '立即更新', checkNow: '立即检查',
    timezone: '时区', timezoneNote: '自动识别双方时差，可随时关闭', auto: '自动', manual: '手动', off: '关闭', me: '你', partnerPending: 'TA · 连接后识别', step: '每格 15 分钟', hideClocks: '重放中不显示双方时间', manualAria: '手动时区 UTC 偏移',
    petSize: '宠物大小', petSizeNote: '两只宠物可分别调整，也可右键宠物修改', selfPet: '我的宠物', partnerPet: 'TA 的宠物', petSizeAria: '宠物大小',
    petColor: '宠物配色', petColorNote: '选择自己的颜色；连接后会同步显示', petColorAria: '我的宠物配色', skins: { cream: '奶油', peach: '蜜桃', mint: '薄荷', sky: '晴空', lavender: '丁香' },
    props: '互动道具', propsNote: '只有水杯和被子可以更换', cup: '水杯', blanket: '被子', blankets: { blush: '樱粉', night: '星夜', mint: '薄荷' },
    speed: '动画速度', speedNote: '默认采用更从容的节奏', speedAria: '动画速度', speeds: { calm: '舒缓', natural: '自然', lively: '活泼' },
    feedback: '意见反馈', feedbackNote: '告诉我们哪里还不够自然', feedbackPlaceholder: '写下你的感受或建议…', feedbackAria: '反馈内容', sendFeedback: '发送反馈',
  },
  en: {
    settings: 'Settings', close: 'Close settings', language: 'Language', languageNote: 'Choose the language used in the app',
    connect: 'Connect your partner', connectNote: 'Use it solo, or pair to show both companions together', connected: 'Connected', waiting: 'Waiting',
    createInvite: 'Create invite', or: 'or', pasteInvite: "Paste your partner's invite", invite: 'Invite code', connectAction: 'Connect', myInvite: 'My invite', copyInvite: 'Copy invite', cancel: 'Cancel',
    petsConnected: 'Your two companions are connected', compareNumber: 'Compare the number below with your partner', disconnect: 'Unpair', safetyNumber: 'Safety number',
    replay: 'Time-zone replay', replayNote: 'Detects your time difference and replays moments you missed',
    recording: 'Replay recordings', recordingNote: 'Saves companion replays, never your real screen', saveLocation: 'Save location', chooseFolder: 'Choose', defaultFolder: 'App default folder', retention: 'Keep for', hours: (hours: number) => `${hours}h`, chooseFolderTitle: 'Choose where to save replay recordings',
    update: 'Automatic updates', updateNote: 'Check at launch, install in place, then restart', goUpdate: 'Get update', installNow: 'Install now', checkNow: 'Check now',
    timezone: 'Time zone', timezoneNote: 'Detect your time difference automatically or turn it off', auto: 'Auto', manual: 'Manual', off: 'Off', me: 'You', partnerPending: 'Partner · after pairing', step: '15-minute steps', hideClocks: 'Hide both local times during replay', manualAria: 'Manual UTC offset',
    petSize: 'Companion size', petSizeNote: 'Adjust each companion here or by right-clicking it', selfPet: 'Mine', partnerPet: 'Partner', petSizeAria: 'Companion size',
    petColor: 'Companion color', petColorNote: 'Choose yours; it appears for your partner after pairing', petColorAria: 'My companion color', skins: { cream: 'Cream', peach: 'Peach', mint: 'Mint', sky: 'Sky', lavender: 'Lilac' },
    props: 'Interaction props', propsNote: 'Only mugs and blankets can be changed', cup: 'Mug', blanket: 'Blanket', blankets: { blush: 'Blush', night: 'Night', mint: 'Mint' },
    speed: 'Animation speed', speedNote: 'A calmer pace is selected by default', speedAria: 'Animation speed', speeds: { calm: 'Calm', natural: 'Natural', lively: 'Lively' },
    feedback: 'Feedback', feedbackNote: 'Tell us what could feel more natural', feedbackPlaceholder: 'Share a thought or suggestion…', feedbackAria: 'Feedback message', sendFeedback: 'Send feedback',
  },
} as const;

export function SettingsPanel({
  preferences,
  localUtcOffsetMinutes,
  partnerUtcOffsetMinutes,
  updateState,
  feedback,
  feedbackStatus,
  pairing,
  pairingStatus,
  inviteCode,
  joinCode,
  safetyCode,
  cupStyle,
  onChange,
  onCheckUpdate,
  onInstallUpdate,
  onFeedbackChange,
  onShareFeedback,
  onCreatePairing,
  onCopyInvite,
  onJoinCodeChange,
  onJoinPairing,
  onDisconnect,
  onCupStyleChange,
  onClose
}: SettingsPanelProps) {
  const text = copy[preferences.language];
  const speedLabels: Record<AnimationSpeed, string> = text.speeds;
  const skinLabels: Record<PetSkin, string> = text.skins;
  const patchPreferences = (patch: Partial<Preferences>) => onChange({ ...preferences, ...patch });
  const directoryLabel = preferences.replaySaveDirectory
    ? preferences.replaySaveDirectory.split(/[\\/]/).filter(Boolean).pop() ?? preferences.replaySaveDirectory
    : text.defaultFolder;
  const chooseReplayDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: text.chooseFolderTitle,
        ...(preferences.replaySaveDirectory ? { defaultPath: preferences.replaySaveDirectory } : {})
      });
      if (typeof selected === 'string') patchPreferences({ replaySaveDirectory: selected });
    } catch {
      // The browser preview cannot open the native folder chooser.
    }
  };

  return (
    <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" lang={preferences.language === 'zh' ? 'zh-CN' : 'en'}>
      <header className="settings-header">
        <div><small>MewLink</small><h2 id="settings-title">{text.settings}</h2></div>
        <button type="button" className="settings-close" onClick={onClose} aria-label={text.close}>×</button>
      </header>

      <div className="settings-scroll">
        <article className="setting-row language-setting">
          <div><b>{text.language}</b><small>{text.languageNote}</small></div>
          <div className="mini-tabs" role="group" aria-label={text.language}>
            <button type="button" className={preferences.language === 'zh' ? 'selected' : ''} onClick={() => patchPreferences({ language: 'zh' })}>中文</button>
            <button type="button" className={preferences.language === 'en' ? 'selected' : ''} onClick={() => patchPreferences({ language: 'en' })}>English</button>
          </div>
        </article>

        <article className="setting-block pairing-block">
          <div className="setting-title">
            <div><b>{text.connect}</b><small>{text.connectNote}</small></div>
            {pairing && <span className={`pairing-badge ${pairing.partnerDeviceId ? 'connected' : ''}`}>{pairing.partnerDeviceId ? text.connected : text.waiting}</span>}
          </div>
          {!pairing && <>
            <button type="button" className="pairing-primary" onClick={onCreatePairing}>{text.createInvite}</button>
            <div className="pairing-divider"><span>{text.or}</span></div>
            <textarea className="pairing-code-input" value={joinCode} onChange={event => onJoinCodeChange(event.target.value)} placeholder={text.pasteInvite} aria-label={text.invite}/>
            <button type="button" className="pairing-secondary" onClick={onJoinPairing} disabled={!joinCode.trim()}>{text.connectAction}</button>
          </>}
          {pairing && !pairing.partnerDeviceId && <>
            <textarea className="pairing-code-input invite-code" value={inviteCode} readOnly aria-label={text.myInvite}/>
            <div className="pairing-actions"><button type="button" className="pairing-primary" onClick={onCopyInvite}>{text.copyInvite}</button><button type="button" className="pairing-quiet" onClick={onDisconnect}>{text.cancel}</button></div>
          </>}
          {pairing?.partnerDeviceId && <div className="pairing-connected"><span className="pairing-heart" aria-hidden="true">♥</span><div><b>{text.petsConnected}</b><small>{text.compareNumber}</small></div><button type="button" className="pairing-quiet" onClick={onDisconnect}>{text.disconnect}</button></div>}
          {pairing && safetyCode && <div className="safety-code"><small>{text.safetyNumber}</small><b>{safetyCode}</b></div>}
          {pairingStatus && <p className="pairing-status" role="status">{pairingStatus}</p>}
        </article>

        <article className="setting-row replay-setting">
          <div><b>{text.replay}</b><small>{text.replayNote}</small></div>
          <button type="button" className={`switch ${preferences.replayEnabled ? 'on' : ''}`} role="switch" aria-checked={preferences.replayEnabled} onClick={() => patchPreferences({ replayEnabled: !preferences.replayEnabled })}><span /></button>
        </article>

        <article className="setting-block recording-setting">
          <div className="setting-title"><div><b>{text.recording}</b><small>{text.recordingNote}</small></div></div>
          <div className="recording-location">
            <span><small>{text.saveLocation}</small><b title={preferences.replaySaveDirectory || undefined}>{directoryLabel}</b></span>
            <button type="button" onClick={() => { void chooseReplayDirectory(); }}>{text.chooseFolder}</button>
          </div>
          <div className="recording-retention">
            <small>{text.retention}</small>
            <div className="mini-tabs" role="group" aria-label={text.retention}>
              {replayRetentionOptions.map(hours => <button key={hours} type="button" className={preferences.replayRetentionHours === hours ? 'selected' : ''} onClick={() => patchPreferences({ replayRetentionHours: hours })}>{text.hours(hours)}</button>)}
            </div>
          </div>
        </article>

        <article className="setting-row">
          <div><b>{text.update}</b><small>{text.updateNote}</small></div>
          <button type="button" className={`switch ${preferences.autoUpdate ? 'on' : ''}`} role="switch" aria-checked={preferences.autoUpdate} onClick={() => patchPreferences({ autoUpdate: !preferences.autoUpdate })}><span /></button>
        </article>
        <div className="update-line"><span className={`update-dot ${updateState.kind}`}/><small>{updateState.message}</small>{updateState.canInstall ? <button type="button" onClick={onInstallUpdate} disabled={updateState.kind !== 'available'}>{text.installNow}</button> : updateState.downloadUrl ? <a href={updateState.downloadUrl} target="_blank" rel="noreferrer">{text.goUpdate}</a> : <button type="button" onClick={onCheckUpdate} disabled={updateState.kind === 'checking' || updateState.kind === 'downloading' || updateState.kind === 'installing'}>{text.checkNow}</button>}</div>

        <article className="setting-block">
          <div className="setting-title"><div><b>{text.timezone}</b><small>{text.timezoneNote}</small></div><div className="mini-tabs"><button type="button" className={preferences.timezoneMode === 'auto' ? 'selected' : ''} onClick={() => patchPreferences({ timezoneMode: 'auto' })}>{text.auto}</button><button type="button" className={preferences.timezoneMode === 'manual' ? 'selected' : ''} onClick={() => patchPreferences({ timezoneMode: 'manual' })}>{text.manual}</button><button type="button" className={preferences.timezoneMode === 'off' ? 'selected' : ''} onClick={() => patchPreferences({ timezoneMode: 'off' })}>{text.off}</button></div></div>
          {preferences.timezoneMode === 'auto' && <div className="timezone-detected"><span>{formatUtcOffset(localUtcOffsetMinutes)}</span><i>↔</i><span>{partnerUtcOffsetMinutes === undefined ? text.partnerPending : formatUtcOffset(partnerUtcOffsetMinutes)}</span></div>}
          {preferences.timezoneMode === 'manual' && <label className="timezone-slider"><span>{formatUtcOffset(preferences.manualUtcOffsetMinutes)}</span><input type="range" min="-720" max="840" step="15" value={preferences.manualUtcOffsetMinutes} onChange={event => patchPreferences({ manualUtcOffsetMinutes: Number(event.target.value) })} aria-label={text.manualAria}/><small>{text.step}</small></label>}
          {preferences.timezoneMode === 'off' && <div className="timezone-detected timezone-off"><span>{text.hideClocks}</span></div>}
        </article>

        <article className="setting-block">
          <div className="setting-title"><div><b>{text.petSize}</b><small>{text.petSizeNote}</small></div></div>
          <label className="pet-size-slider named"><span>{text.selfPet}</span><input type="range" min="70" max="110" step="5" value={preferences.selfPetScalePercent} onChange={event => patchPreferences({ selfPetScalePercent: Number(event.target.value) })} aria-label={`${text.selfPet} ${text.petSizeAria}`}/><output>{preferences.selfPetScalePercent}%</output></label>
          <label className="pet-size-slider named"><span>{text.partnerPet}</span><input type="range" min="70" max="110" step="5" value={preferences.partnerPetScalePercent} onChange={event => patchPreferences({ partnerPetScalePercent: Number(event.target.value) })} aria-label={`${text.partnerPet} ${text.petSizeAria}`}/><output>{preferences.partnerPetScalePercent}%</output></label>
        </article>

        <article className="setting-block pet-color-setting">
          <div className="setting-title"><div><b>{text.petColor}</b><small>{text.petColorNote}</small></div></div>
          <div className="pet-color-options" role="radiogroup" aria-label={text.petColorAria}>
            {petSkins.map(skin => <button
              key={skin}
              type="button"
              className={preferences.selfPetSkin === skin ? 'selected' : ''}
              role="radio"
              aria-checked={preferences.selfPetSkin === skin}
              onClick={() => patchPreferences({ selfPetSkin: skin })}
              title={skinLabels[skin]}
            ><span className={`pet-color-swatch ${skin}`} aria-hidden="true"/><small>{skinLabels[skin]}</small></button>)}
          </div>
        </article>

        <article className="setting-block">
          <div className="setting-title"><div><b>{text.props}</b><small>{text.propsNote}</small></div></div>
          <div className="prop-picker"><b>{text.cup}</b><div className="mini-tabs">{cupStyles.map(style => <button key={style} type="button" className={cupStyle === style ? 'selected' : ''} onClick={() => onCupStyleChange(style)}>{style === 'ceramic' ? '☕' : style === 'tumbler' ? '🥤' : '▣'}</button>)}</div></div>
          <div className="prop-picker"><b>{text.blanket}</b><div className="mini-tabs">{blanketStyles.map(style => <button key={style} type="button" className={preferences.blanketStyle === style ? 'selected' : ''} onClick={() => patchPreferences({ blanketStyle: style })}>{text.blankets[style]}</button>)}</div></div>
        </article>

        <article className="setting-block">
          <div className="setting-title"><div><b>{text.speed}</b><small>{text.speedNote}</small></div></div>
          <div className="speed-options" aria-label={text.speedAria}>{animationSpeeds.map(speed => <button key={speed} type="button" className={preferences.animationSpeed === speed ? 'selected' : ''} onClick={() => patchPreferences({ animationSpeed: speed })}>{speedLabels[speed]}</button>)}</div>
        </article>

        <article className="setting-block feedback-block">
          <div className="setting-title"><div><b>{text.feedback}</b><small>{text.feedbackNote}</small></div></div>
          <textarea value={feedback} maxLength={800} onChange={event => onFeedbackChange(event.target.value)} placeholder={text.feedbackPlaceholder} aria-label={text.feedbackAria}/>
          <div className="feedback-footer"><small>{feedbackStatus || `${feedback.length}/800`}</small><button type="button" onClick={onShareFeedback} disabled={!feedback.trim()}>{text.sendFeedback}</button></div>
        </article>
      </div>
    </section>
  );
}
