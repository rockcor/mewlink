import { useEffect, useId, useSyncExternalStore } from 'react';
import { getAutostartController } from '../platform/autostart';
import type { Language } from '../settings/preferences';

const copy = {
  zh: { label: '开机启动', note: '登录电脑后自动启动 MewLink', checking: '正在读取系统设置…', saving: '正在保存…', readError: '暂时无法读取，请重试', writeError: '未能完成修改，请检查系统设置后重试', unsupported: '仅桌面应用可设置', retry: '重试' },
  'zh-Hant': { label: '開機啟動', note: '登入電腦後自動啟動 MewLink', checking: '正在讀取系統設定…', saving: '正在儲存…', readError: '暫時無法讀取，請重試', writeError: '未能完成修改，請檢查系統設定後重試', unsupported: '僅桌面應用程式可設定', retry: '重試' },
  en: { label: 'Launch at login', note: 'Start MewLink when you sign in to your computer', checking: 'Reading system settings…', saving: 'Saving…', readError: 'Could not read the setting. Please retry.', writeError: 'Could not finish the change. Check system settings and retry.', unsupported: 'Available in the desktop app only', retry: 'Retry' },
} as const;

export function AutostartSetting({ language, controller = getAutostartController() }: {
  language: Language;
  controller?: ReturnType<typeof getAutostartController>;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const text = copy[language];
  const descriptionId = useId();
  useEffect(() => {
    const refresh = () => { void controller.refresh(); };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [controller]);
  const busy = state.phase === 'checking' || state.phase === 'saving';
  const status = state.phase === 'error' ? (state.error === 'read' ? text.readError : text.writeError)
    : state.phase === 'unsupported' ? text.unsupported : busy ? text[state.phase as 'checking' | 'saving'] : '';
  return <article className="setting-block autostart-setting">
    <div className="setting-title">
      <div><b>{text.label}</b><small id={descriptionId}>{text.note}</small></div>
      <button type="button" role="switch" className={`switch ${state.enabled ? 'on' : ''}`}
        aria-label={text.label} aria-describedby={descriptionId} aria-checked={state.enabled === true} aria-busy={busy}
        disabled={busy || state.enabled === undefined || state.phase === 'unsupported'}
        onClick={() => { void controller.setEnabled(!state.enabled); }}><span /></button>
    </div>
    {status && <div className="autostart-status" role="status"><small>{status}</small>
      {state.phase === 'error' && <button type="button" onClick={() => { void controller.refresh(); }}>{text.retry}</button>}
    </div>}
  </article>;
}
