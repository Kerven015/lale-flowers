// Admin: activity log — who did what and when (sign-ins, flowers, stock,
// orders, customers, settings, discount codes). Read-only.
import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import Icon from '../../components/Icons'
import { orderDate } from '../../components/OrderStatus'

// short readable details for the common actions
function detailText(e, L) {
  const d = e.details || {}
  if (e.action === 'order.status') return `${L[`st_${d.from}`] || d.from} → ${L[`st_${d.to}`] || d.to}`
  if (e.action === 'stock.adjust') return `${d.change > 0 ? '+' : ''}${d.change} (${L[`reason_${d.reason}`] || d.reason}) → ${d.stock}${d.note ? ` · ${d.note}` : ''}`
  if (e.action === 'product.update' && d.changed) {
    const parts = Object.entries(d.changed).map(([k, [a, b]]) => `${k}: ${a ?? '—'} → ${b ?? '—'}`)
    return [d.name, ...parts].filter(Boolean).join(' · ')
  }
  if (e.action === 'settings.update') return (d.changed || []).join(', ')
  if (d.name) return d.name
  if (d.email) return d.email
  return ''
}

export default function AdminLog({ L, call }) {
  const { lang, t } = useI18n()
  const [entries, setEntries] = useState(null)
  const [more, setMore] = useState(false)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (before) => {
    setBusy(true)
    setFailed(false)
    try {
      const data = await call(`/api/admin/log${before ? `?before=${before}` : ''}`)
      setEntries((list) => (before ? [...(list || []), ...data.entries] : data.entries))
      setMore(data.more)
    } catch { setFailed(true) } finally { setBusy(false) }
  }, [call])
  useEffect(() => { load() }, [load])

  if (failed && !entries) {
    return (
      <div className="empty-state" role="alert">
        <h3>{L.loadFailed}</h3>
        <button type="button" className="btn btn-primary" onClick={() => load()}>{L.retry}</button>
      </div>
    )
  }
  if (!entries) return <p className="muted" role="status">{t('loading.wait')}</p>
  if (!entries.length) return <div className="empty-state"><div className="es-icon"><Icon name="list" size={32} /></div><h3>{L.logEmpty}</h3></div>

  return (
    <div className="adm-list">
      <p className="muted" style={{ margin: 0 }}>{L.logHint}</p>
      <div className="dash-table-wrap summary" style={{ position: 'static' }}>
        <table className="dash-table adm-log">
          <thead><tr><th>{L.logWhen}</th><th>{L.logWho}</th><th>{L.logWhat}</th><th>{L.logDetails}</th></tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className={e.action === 'admin.login_failed' ? 'is-warn' : ''}>
                <td>{orderDate(e.createdAt, lang, true)}</td>
                <td>{e.admin || '—'}<small className="muted"> {e.ip}</small></td>
                <td>{L[`log_${e.action.replace('.', '_')}`] || e.action}<small className="muted"> {e.target}</small></td>
                <td>{detailText(e, L)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more && (
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => load(entries.at(-1).id)}>{L.loadMore}</button>
      )}
    </div>
  )
}
