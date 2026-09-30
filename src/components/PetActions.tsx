import { appCopy } from '../i18n';
import type { CupStyle } from '../domain/types';
import type { Language } from '../platform/language';
import { CupIcon } from './CupIcon';
import { PixelIcon } from './PixelIcon';

interface Props {
  language: Language;
  connected: boolean;
  canReplay: boolean;
  replaying?: boolean;
  cupStyle: CupStyle;
  onSettings: () => void;
  onStatistics: () => void;
  onHug: () => void;
  onWater: () => void;
  onReplay: () => void;
}

export function PetActions({ language, connected, canReplay, replaying, cupStyle, onSettings, onStatistics, onHug, onWater, onReplay }: Props) {
  const text = appCopy[language];
  return <div className="quick-actions" role="group" aria-label={text.actionsAria}>
    <button className="settings-action" type="button" onClick={onSettings}><PixelIcon name="settings" />{text.settings}</button>
    <button className="statistics-action" type="button" onClick={onStatistics}><PixelIcon name="statistics" />{text.statistics}</button>
    {connected && <>
      <button type="button" onClick={onHug}><PixelIcon name="hug" />{text.hug}</button>
      <button type="button" onClick={onWater}><CupIcon style={cupStyle} />{text.water}</button>
      {canReplay && <button className="replay-action" type="button" aria-pressed={Boolean(replaying)} onClick={onReplay}><PixelIcon name="replay" />{replaying ? text.stopReplay : text.replay}</button>}
    </>}
  </div>;
}
