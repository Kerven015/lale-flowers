import { useDelivery } from '../contexts/DeliveryContext'
import { useI18n } from '../contexts/I18nContext'
import { CITIES, CITY_SHORTCUTS } from '../data/navigation'
import Icon from './Icons'

export default function ShipPicker() {
  const { t } = useI18n()
  const { city, setCity, sameDayCity } = useDelivery()
  return (
    <div className="ship-picker">
      <div className="ship-label">
        <span className="ship-ico"><Icon name="pin" size={20} /></span>
        <div>
          <strong>{t('ship.title')}</strong>
          <small>{t('ship.hint')}</small>
        </div>
      </div>
      <div className="ship-controls">
        <div className="ship-chips" role="group" aria-label={t('ship.title')}>
          {CITY_SHORTCUTS.map((c) => (
            <button key={c} type="button" className={`chip${city === c ? ' active' : ''}`} onClick={() => setCity(c)}>
              {t(`city.${c}`)}
            </button>
          ))}
        </div>
        <select className="field ship-select" value={city} onChange={(e) => setCity(e.target.value)} aria-label={t('ship.allCities')}>
          {CITIES.map((c) => <option key={c} value={c}>{t(`city.${c}`)}</option>)}
        </select>
        <span className={`ship-status${sameDayCity ? ' ok' : ''}`}>
          <Icon name="truck" size={15} /> {sameDayCity ? t('ship.sameDay') : t('ship.nextDay')}
        </span>
      </div>
    </div>
  )
}
