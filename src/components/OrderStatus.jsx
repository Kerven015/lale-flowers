import { useI18n } from '../contexts/I18nContext'

export const ORDER_STEPS = ['new', 'confirmed', 'preparing', 'delivering', 'done']

// Coloured label with the order's status (Täze, Ýolda, Gowşuryldy ...).
export function StatusPill({ status }) {
  const { t } = useI18n()
  return <span className={`status-pill status-${status}`}>{t(`status.${status}`)}</span>
}

// The steps of an order (new -> ... -> delivered) with the current one marked.
export function StatusSteps({ status }) {
  const { t } = useI18n()
  if (status === 'cancelled') return <StatusPill status="cancelled" />
  const at = ORDER_STEPS.indexOf(status)
  return (
    <ol className="status-steps" aria-label={t('track.status')}>
      {ORDER_STEPS.map((s, i) => (
        <li key={s} className={i < at ? 'done' : i === at ? 'current' : ''} aria-current={i === at ? 'step' : undefined}>
          <span className="dot" aria-hidden="true" />
          <span className="label">{t(`status.${s}`)}</span>
        </li>
      ))}
    </ol>
  )
}

// Product name of an order line in the site language (names are saved with the order).
export const lineName = (item, lang) => item.names?.[lang] || item.names?.tm || item.names?.ru || '—'

// Turkmen month names: many browsers have no Turkmen date format and would
// show English ("Oct 14, 2026") instead.
const TM_MONTHS = ['ýanwar', 'fewral', 'mart', 'aprel', 'maý', 'iýun', 'iýul', 'awgust', 'sentýabr', 'oktýabr', 'noýabr', 'dekabr']
const pad = (n) => String(n).padStart(2, '0')

export function orderDate(iso, lang, withTime = false) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  if (lang === 'tm') {
    const date = `${d.getDate()} ${TM_MONTHS[d.getMonth()]} ${d.getFullYear()}`
    return withTime ? `${date}, ${pad(d.getHours())}:${pad(d.getMinutes())}` : date
  }
  const locale = { ru: 'ru', tr: 'tr' }[lang] || undefined
  try {
    return withTime
      ? d.toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
      : d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return d.toLocaleDateString()
  }
}
