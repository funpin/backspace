import { useTranslation } from 'react-i18next';
import { INTERFACE_SCALES, useInterfaceScaleStore } from '../../../stores/interfaceScaleStore';
import { useUIStore } from '../../../stores/uiStore';
import { Button } from '../../ui/Button';

export function InterfaceScaleSection() {
  const { t } = useTranslation('settings');
  const scale = useInterfaceScaleStore(state => state.scale);
  const setScale = useInterfaceScaleStore(state => state.setScale);
  const changeScale = (value: number) => {
    const wasMobile = useUIStore.getState().isMobile;
    setScale(value);
    const ui = useUIStore.getState();
    // Keep this panel reachable when scaling crosses the responsive breakpoint.
    if (ui.isMobile !== wasMobile) {
      if (ui.isMobile) {
        ui.closeModal();
        ui.pushMobileScreen('settings-appearance');
      } else {
        ui.openModal('userSettings', { tab: 'appearance' });
      }
    }
  };
  return (
    <div className="border-t border-border-hard pt-4">
      <label htmlFor="interface-scale" className="block text-xs font-medium text-txt-secondary mb-1.5">
        {t('interfaceScale.label')}
      </label>
      <p id="interface-scale-description" className="text-xs text-txt-tertiary mb-2">{t('interfaceScale.description')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <select id="interface-scale" aria-describedby="interface-scale-description" value={scale}
          onChange={event => changeScale(Number(event.target.value))} className="input-standard flex-1 min-w-0">
          {INTERFACE_SCALES.map(value => <option key={value} value={value}>{value}%</option>)}
        </select>
        <Button variant="secondary" onClick={() => changeScale(100)} disabled={scale === 100}>
          {t('interfaceScale.reset')}
        </Button>
      </div>
    </div>
  );
}
