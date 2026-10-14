// Product page: description under the photo gallery. Shows the site language,
// falls back to another language per field, and hides itself when empty.
// Structured fields (composition, size, care) become tabs.
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../contexts/I18nContext'
import { hasDetails, sanitizeHtml } from '../utils/richText'

export default function ProductDescription({ details, idPrefix = 'pd', className = '' }) {
  const { t } = useI18n()
  const tabs = useMemo(() => {
    if (!hasDetails(details)) return []
    return [
      details.html && { key: 'desc', label: t('pd.title') },
      details.composition && { key: 'composition', label: t('product.composition') },
      details.size && { key: 'size', label: t('product.size') },
      details.care && { key: 'care', label: t('pd.care') },
    ].filter(Boolean)
  }, [details, t])
  const [active, setActive] = useState(tabs[0]?.key)

  // keep a valid tab when the content changes (e.g. live preview)
  useEffect(() => {
    if (!tabs.some((x) => x.key === active)) setActive(tabs[0]?.key)
  }, [tabs, active])

  if (!tabs.length) return null
  const current = tabs.find((x) => x.key === active) || tabs[0]
  const html = current.key === 'desc' ? sanitizeHtml(details.html) : ''

  function onKey(e, i) {
    let j = i
    if (e.key === 'ArrowRight') j = (i + 1) % tabs.length
    else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length
    else return
    e.preventDefault()
    setActive(tabs[j].key)
    document.getElementById(`${idPrefix}-tab-${tabs[j].key}`)?.focus()
  }

  return (
    <section className={`pd ${className}`.trim()} aria-labelledby={`${idPrefix}-title`}>
      <h2 className="pd-title" id={`${idPrefix}-title`}>{t('pd.title')}</h2>
      {tabs.length > 1 && (
        <div className="pd-tabs" role="tablist" aria-label={t('pd.title')}>
          {tabs.map((x, i) => (
            <button
              key={x.key}
              id={`${idPrefix}-tab-${x.key}`}
              type="button"
              role="tab"
              aria-selected={x.key === current.key}
              aria-controls={`${idPrefix}-panel`}
              tabIndex={x.key === current.key ? 0 : -1}
              className={x.key === current.key ? 'active' : ''}
              onClick={() => setActive(x.key)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {x.label}
            </button>
          ))}
        </div>
      )}
      <div
        className="pd-panel"
        id={`${idPrefix}-panel`}
        role={tabs.length > 1 ? 'tabpanel' : undefined}
        aria-labelledby={tabs.length > 1 ? `${idPrefix}-tab-${current.key}` : undefined}
        key={current.key}
      >
        {current.key === 'desc'
          ? <div className="pd-rich" dangerouslySetInnerHTML={{ __html: html }} />
          : <p className="pd-text">{details[current.key]}</p>}
      </div>
    </section>
  )
}
