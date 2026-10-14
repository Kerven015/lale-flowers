import { useI18n } from '../contexts/I18nContext'
import Icon from './Icons'

const ITEMS = [
  ['truck', 'badge.fast'],
  ['smile', 'badge.guarantee'],
  ['shield', 'badge.secure'],
  ['tag', 'badge.prices'],
]

export default function TrustRow() {
  const { t } = useI18n()
  return (
    <ul className="trust-row">
      {ITEMS.map(([icon, key]) => (
        <li key={key}><Icon name={icon} size={22} /><span>{t(key)}</span></li>
      ))}
    </ul>
  )
}
