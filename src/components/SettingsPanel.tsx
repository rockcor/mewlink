import type { AnimationSpeed, Preferences } from '../settings/preferences';
import { animationSpeeds, formatUtcOffset } from '../settings/preferences';

export interface UpdateViewState {
  kind: 'idle' | 'checking' | 'current' | 'available' | 'error';
  message: string;
  downloadUrl?: string;
}

interface SettingsPanelProps {
  preferences: Preferences;
  localUtcOffsetMinutes: number;
  partnerUtcOffsetMinutes?: number;
  updateState: UpdateViewState;
  feedback: string;
  feedbackStatus: string;
  onChange: (next: Preferences) => void;
  onCheckUpdate: () => void;
  onFeedbackChange: (value: string) => void;
  onShareFeedback: () => void;
  onClose: () => void;
}

const speedLabels: Record<AnimationSpeed, string> = {
  calm: '舒缓',
  natural: '自然',
  lively: '活泼'
};

export function SettingsPanel({
  preferences,
  localUtcOffsetMinutes,
  partnerUtcOffsetMinutes,
  updateState,
  feedback,
  feedbackStatus,
  onChange,
  onCheckUpdate,
  onFeedbackChange,
  onShareFeedback,
  onClose
}: SettingsPanelProps) {
  const patchPreferences = (patch: Partial<Preferences>) => onChange({ ...preferences, ...patch });

  return (
    <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header className="settings-header">
        <div><small>MewLink</small><h2 id="settings-title">设置</h2></div>
        <button type="button" className="settings-close" onClick={onClose} aria-label="关闭设置">×</button>
      </header>

      <div className="settings-scroll">
        <article className="setting-row replay-setting">
          <div><b>时差重放</b><small>两人连接后自动识别时差，上线时重放错过的片刻</small></div>
          <button
            type="button"
            className={`switch ${preferences.replayEnabled ? 'on' : ''}`}
            role="switch"
            aria-checked={preferences.replayEnabled}
            onClick={() => patchPreferences({ replayEnabled: !preferences.replayEnabled })}
          ><span /></button>
        </article>

        <article className="setting-row">
          <div><b>自动更新</b><small>启动时检查，有新版本就提醒你</small></div>
          <button
            type="button"
            className={`switch ${preferences.autoUpdate ? 'on' : ''}`}
            role="switch"
            aria-checked={preferences.autoUpdate}
            onClick={() => patchPreferences({ autoUpdate: !preferences.autoUpdate })}
          ><span /></button>
        </article>
        <div className="update-line">
          <span className={`update-dot ${updateState.kind}`} />
          <small>{updateState.message}</small>
          {updateState.downloadUrl
            ? <a href={updateState.downloadUrl} target="_blank" rel="noreferrer">前往更新</a>
            : <button type="button" onClick={onCheckUpdate} disabled={updateState.kind === 'checking'}>立即检查</button>}
        </div>

        <article className="setting-block">
          <div className="setting-title"><div><b>时区</b><small>自动识别双方时差，可随时关闭</small></div><div className="mini-tabs"><button type="button" className={preferences.timezoneMode === 'auto' ? 'selected' : ''} onClick={() => patchPreferences({ timezoneMode: 'auto' })}>自动</button><button type="button" className={preferences.timezoneMode === 'manual' ? 'selected' : ''} onClick={() => patchPreferences({ timezoneMode: 'manual' })}>手动</button><button type="button" className={preferences.timezoneMode === 'off' ? 'selected' : ''} onClick={() => patchPreferences({ timezoneMode: 'off' })}>关闭</button></div></div>
          {preferences.timezoneMode === 'auto' && <div className="timezone-detected"><span>你 · {formatUtcOffset(localUtcOffsetMinutes)}</span><i>↔</i><span>{partnerUtcOffsetMinutes === undefined ? 'TA · 连接后识别' : `TA · ${formatUtcOffset(partnerUtcOffsetMinutes)}`}</span></div>}
          {preferences.timezoneMode === 'manual' && <label className="timezone-slider"><span>{formatUtcOffset(preferences.manualUtcOffsetMinutes)}</span><input type="range" min="-720" max="840" step="15" value={preferences.manualUtcOffsetMinutes} onChange={event => patchPreferences({ manualUtcOffsetMinutes: Number(event.target.value) })} aria-label="手动时区 UTC 偏移"/><small>每格 15 分钟</small></label>}
          {preferences.timezoneMode === 'off' && <div className="timezone-detected timezone-off"><span>重放中不显示双方时间</span></div>}
        </article>

        <article className="setting-block">
          <div className="setting-title"><div><b>动画速度</b><small>默认采用更从容的节奏</small></div></div>
          <div className="speed-options" aria-label="动画速度">
            {animationSpeeds.map(speed => <button key={speed} type="button" className={preferences.animationSpeed === speed ? 'selected' : ''} onClick={() => patchPreferences({ animationSpeed: speed })}>{speedLabels[speed]}</button>)}
          </div>
        </article>

        <article className="setting-block feedback-block">
          <div className="setting-title"><div><b>意见反馈</b><small>告诉我们哪里还不够自然</small></div></div>
          <textarea value={feedback} maxLength={800} onChange={event => onFeedbackChange(event.target.value)} placeholder="写下你的感受或建议…" aria-label="反馈内容" />
          <div className="feedback-footer"><small>{feedbackStatus || `${feedback.length}/800`}</small><button type="button" onClick={onShareFeedback} disabled={!feedback.trim()}>发送反馈</button></div>
        </article>
      </div>
    </section>
  );
}
