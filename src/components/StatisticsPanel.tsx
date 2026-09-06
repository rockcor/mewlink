import { useEffect, useState, type CSSProperties } from 'react';
import type { StatisticsSnapshot, StatisticsVisibility } from '../domain/types';
import type { Language } from '../settings/preferences';
import { currentStatistics, statisticsRanges, type StatisticsRange } from '../statistics/statistics';

interface StatisticsPanelProps {
  language: Language;
  connected: boolean;
  visibility: StatisticsVisibility;
  partnerSnapshots?: { day: StatisticsSnapshot; week: StatisticsSnapshot; month: StatisticsSnapshot };
  onVisibilityChange: (visibility: StatisticsVisibility) => void;
  onClose: () => void;
}

const copy = {
  zh: {
    title: '统计', close: '关闭统计', ranges: { day: '日', week: '周', month: '月' },
    input: '键盘与点击', keyboard: '键盘敲击', pointer: '鼠标 / 触控板点击', times: '次',
    workVisual: '三类工作时间', code: '代码', document: '文档', web: '网页',
    activity: '时间分布', work: '工作', meeting: '会议', idle: '空闲',
    noData: '开始使用后，这里会出现你的节奏', partnerNoData: 'TA 尚未分享统计',
    mine: '我的', partner: 'TA 的', visibility: '谁可以看', private: '仅自己', shared: '对 TA 可见',
    shareAfterPairing: '连接后会自动分享汇总', weekdays: ['日', '一', '二', '三', '四', '五', '六']
  },
  en: {
    title: 'Statistics', close: 'Close statistics', ranges: { day: 'Day', week: 'Week', month: 'Month' },
    input: 'Keyboard & clicks', keyboard: 'Keystrokes', pointer: 'Mouse / trackpad clicks', times: '',
    workVisual: 'Work time by view', code: 'Code', document: 'Documents', web: 'Web',
    activity: 'Time split', work: 'Work', meeting: 'Meetings', idle: 'Free',
    noData: 'Your rhythm will appear here as you use MewLink', partnerNoData: 'Your partner has not shared statistics',
    mine: 'Mine', partner: "Partner's", visibility: 'Who can see', private: 'Only me', shared: 'Visible to partner',
    shareAfterPairing: 'Your summary will share after pairing', weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  }
} as const;

function emptySnapshot(range: StatisticsRange): StatisticsSnapshot {
  const count = range === 'day' ? 6 : range === 'week' ? 7 : 5;
  return {
    input: { keyboard: 0, pointer: 0 },
    workVisual: { code: 0, document: 0, web: 0 },
    activity: { work: 0, meeting: 0, idle: 0 },
    bars: Array.from({ length: count }, (_, index) => ({ label: String(index), keyboard: 0, pointer: 0 }))
  };
}

function durationLabel(milliseconds: number, language: Language): string {
  if (milliseconds <= 0) return language === 'zh' ? '0 分钟' : '0 min';
  if (milliseconds < 60_000) return language === 'zh' ? '<1 分钟' : '<1 min';
  const minutes = Math.round(milliseconds / 60_000);
  if (minutes < 60) return language === 'zh' ? `${minutes} 分钟` : `${minutes} min`;
  const hours = milliseconds / 3_600_000;
  const value = hours >= 10 ? Math.round(hours).toString() : hours.toFixed(1);
  return language === 'zh' ? `${value} 小时` : `${value} hr`;
}

function InputBars({ bars, range, language }: { bars: ReturnType<typeof currentStatistics>['bars']; range: StatisticsRange; language: Language }) {
  const text = copy[language];
  const maximum = Math.max(1, ...bars.flatMap(bar => [bar.keyboard, bar.pointer]));
  return <div className="statistics-bars" aria-label={text.input}>
    {bars.map((bar, index) => {
      const label = range === 'week' ? text.weekdays[Number(bar.label)] : bar.label;
      return <div className="statistics-bar-group" key={`${label}-${index}`}>
        <div className="statistics-bar-pair">
          <i className="keyboard-bar" style={{ height: `${bar.keyboard ? Math.max(5, bar.keyboard / maximum * 100) : 2}%` }} />
          <i className="pointer-bar" style={{ height: `${bar.pointer ? Math.max(5, bar.pointer / maximum * 100) : 2}%` }} />
        </div>
        <small>{label}</small>
      </div>;
    })}
  </div>;
}

function PieChart({ values, colors, label, center }: { values: number[]; colors: string[]; label: string; center: string }) {
  const total = values.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  const stops = total > 0 ? values.map((value, index) => {
    const start = cursor;
    cursor += value / total * 100;
    return `${colors[index]} ${start}% ${cursor}%`;
  }).join(', ') : '#eadfe4 0 100%';
  return <div className="statistics-pie" role="img" aria-label={label} style={{ '--pie-fill': `conic-gradient(${stops})` } as CSSProperties}><b>{center}</b></div>;
}

export function StatisticsPanel({ language, connected, visibility, partnerSnapshots, onVisibilityChange, onClose }: StatisticsPanelProps) {
  const text = copy[language];
  const [range, setRange] = useState<StatisticsRange>('day');
  const [owner, setOwner] = useState<'self' | 'partner'>('self');
  const [, setRevision] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setRevision(value => value + 1), 2_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!connected) setOwner('self');
  }, [connected]);
  const snapshot = owner === 'self' ? currentStatistics(range) : partnerSnapshots?.[range] ?? emptySnapshot(range);
  const hasData = snapshot.input.keyboard + snapshot.input.pointer
    + Object.values(snapshot.workVisual).reduce((sum, value) => sum + value, 0)
    + Object.values(snapshot.activity).reduce((sum, value) => sum + value, 0) > 0;
  const workValues = [snapshot.workVisual.code, snapshot.workVisual.document, snapshot.workVisual.web];
  const activityValues = [snapshot.activity.work, snapshot.activity.meeting, snapshot.activity.idle];

  return <section className="settings-panel statistics-panel" role="dialog" aria-modal="true" aria-labelledby="statistics-title" lang={language === 'zh' ? 'zh-CN' : 'en'}>
    <header className="settings-header statistics-header">
      <div><small>MewLink</small><h2 id="statistics-title">{text.title}</h2></div>
      <div className="statistics-header-actions">
        <div className="mini-tabs statistics-range" role="group" aria-label={text.title}>
          {statisticsRanges.map(option => <button key={option} type="button" className={range === option ? 'selected' : ''} onClick={() => setRange(option)}>{text.ranges[option]}</button>)}
        </div>
        <button type="button" className="settings-close" onClick={onClose} aria-label={text.close}>×</button>
      </div>
    </header>

    <div className="settings-scroll statistics-scroll">
      <div className="statistics-controls">
        <div className="mini-tabs statistics-owner" role="group" aria-label={text.title}>
          <button type="button" className={owner === 'self' ? 'selected' : ''} onClick={() => setOwner('self')}>{text.mine}</button>
          {connected && <button type="button" className={owner === 'partner' ? 'selected' : ''} onClick={() => setOwner('partner')}>{text.partner}</button>}
        </div>
        <div className="statistics-visibility-row">
          <span>{text.visibility}</span>
          <div className="mini-tabs statistics-visibility" role="group" aria-label={text.visibility}>
            <button type="button" className={visibility === 'private' ? 'selected' : ''} onClick={() => onVisibilityChange('private')}>{text.private}</button>
            <button type="button" className={visibility === 'partner' ? 'selected' : ''} onClick={() => onVisibilityChange('partner')}>{text.shared}</button>
          </div>
        </div>
        {!connected && visibility === 'partner' && <small className="statistics-share-note">{text.shareAfterPairing}</small>}
      </div>
      {!hasData && <div className="statistics-empty"><span>⌁</span><p>{owner === 'partner' ? text.partnerNoData : text.noData}</p></div>}
      <article className="statistics-card input-card">
        <div className="statistics-card-title"><b>{text.input}</b><div className="statistics-legend"><span className="keyboard-dot">{text.keyboard}</span><span className="pointer-dot">{text.pointer}</span></div></div>
        <div className="input-totals"><strong>{snapshot.input.keyboard.toLocaleString()}<small>{text.times}</small></strong><i /><strong>{snapshot.input.pointer.toLocaleString()}<small>{text.times}</small></strong></div>
        <InputBars bars={snapshot.bars} range={range} language={language} />
      </article>

      <div className="statistics-pie-grid">
        <article className="statistics-card pie-card">
          <b>{text.workVisual}</b>
          <div className="pie-card-body">
            <PieChart values={workValues} colors={['#874e79', '#e18aa7', '#72b7bd']} label={text.workVisual} center={durationLabel(workValues.reduce((sum, value) => sum + value, 0), language)} />
            <div className="pie-legend"><span className="code-dot"><b>{text.code}</b><small>{durationLabel(snapshot.workVisual.code, language)}</small></span><span className="document-dot"><b>{text.document}</b><small>{durationLabel(snapshot.workVisual.document, language)}</small></span><span className="web-dot"><b>{text.web}</b><small>{durationLabel(snapshot.workVisual.web, language)}</small></span></div>
          </div>
        </article>
        <article className="statistics-card pie-card">
          <b>{text.activity}</b>
          <div className="pie-card-body">
            <PieChart values={activityValues} colors={['#d96f98', '#7e72c7', '#e0b36e']} label={text.activity} center={durationLabel(activityValues.reduce((sum, value) => sum + value, 0), language)} />
            <div className="pie-legend"><span className="work-dot"><b>{text.work}</b><small>{durationLabel(snapshot.activity.work, language)}</small></span><span className="meeting-dot"><b>{text.meeting}</b><small>{durationLabel(snapshot.activity.meeting, language)}</small></span><span className="idle-dot"><b>{text.idle}</b><small>{durationLabel(snapshot.activity.idle, language)}</small></span></div>
          </div>
        </article>
      </div>
    </div>
  </section>;
}
