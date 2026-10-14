// Admin: contact-form messages, customers (with "new password") and newsletter
// sign-ups.
import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import { useToast } from '../../contexts/ToastContext'
import { orderDate } from '../../components/OrderStatus'
import Icon from '../../components/Icons'

// Loads a list from the server; returns [list, setList, state, reload]
function useList(call, path, key) {
  const [list, setList] = useState([])
  const [state, setState] = useState('loading')
  const reload = useCallback(async () => {
    try {
      const data = await call(path)
      setList(data[key])
      setState('ready')
    } catch {
      setState('error')
    }
  }, [call, path, key])
  useEffect(() => { reload() }, [reload])
  return [list, setList, state, reload]
}

function ListState({ state, empty, L, onRetry, icon }) {
  const { t } = useI18n()
  if (state === 'loading') return <p className="muted" role="status">{t('loading.wait')}</p>
  if (state === 'error') {
    return (
      <div className="empty-state" role="alert">
        <h3>{L.loadFailed}</h3>
        <button type="button" className="btn btn-primary" onClick={onRetry}>{L.retry}</button>
      </div>
    )
  }
  if (empty) return <div className="empty-state"><div className="es-icon"><Icon name={icon} size={32} /></div><h3>{empty}</h3></div>
  return null
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // older browsers / plain http: fall back to a hidden text box
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try { ok = document.execCommand('copy') } catch {}
    ta.remove()
    return ok
  }
}

// ---- messages ---------------------------------------------------------------------
export function AdminMessages({ L, call, onChanged }) {
  const { lang } = useI18n()
  const { toast } = useToast()
  const [list, setList, state, reload] = useList(call, '/api/admin/messages', 'messages')

  async function setRead(m, read) {
    try {
      await call(`/api/admin/messages/${m.id}`, { method: 'PATCH', body: { read } })
      setList((l) => l.map((x) => (x.id === m.id ? { ...x, read } : x)))
      onChanged()
    } catch { toast(L.loadFailed, 'error') }
  }

  async function remove(m) {
    if (!window.confirm(L.msgDeleteConfirm)) return
    try {
      await call(`/api/admin/messages/${m.id}`, { method: 'DELETE' })
      setList((l) => l.filter((x) => x.id !== m.id))
      onChanged()
    } catch { toast(L.loadFailed, 'error') }
  }

  return (
    <div className="adm-list">
      <ListState state={state} empty={state === 'ready' && !list.length ? L.msgEmpty : ''} L={L} onRetry={reload} icon="inbox" />
      {list.map((m) => (
        <article key={m.id} className={`adm-card-row adm-msg${m.read ? '' : ' is-new'}`}>
          <header className="adm-order-head">
            <div>
              <strong>{m.name}</strong>
              <span className="muted adm-order-time">{orderDate(m.createdAt, lang, true)}</span>
            </div>
            {!m.read && <span className="status-pill status-new">{L.msgNew}</span>}
          </header>
          <div className="adm-msg-contacts">
            <a className="adm-order-link" href={`mailto:${m.email}`} onClick={() => !m.read && setRead(m, true)}><Icon name="mail" size={15} />{m.email}</a>
            {m.phone && <a className="adm-order-link" href={`tel:${m.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" size={15} />{m.phone}</a>}
          </div>
          <p className="adm-msg-text">{m.message}</p>
          <div className="adm-order-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setRead(m, !m.read)}>
              <Icon name="check" size={16} />{m.read ? L.msgUnread : L.msgRead}
            </button>
            <a className="btn btn-outline btn-sm" href={`mailto:${m.email}`} onClick={() => !m.read && setRead(m, true)}><Icon name="mail" size={16} />{L.msgReply}</a>
            <button type="button" className="btn btn-outline btn-sm adm-order-cancel" onClick={() => remove(m)}>
              <Icon name="trash" size={16} />{L.msgDelete}
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

// ---- customers -------------------------------------------------------------------------
export function AdminCustomers({ L, call }) {
  const { lang } = useI18n()
  const { toast } = useToast()
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(null) // { id, password }
  useEffect(() => {
    const id = setTimeout(() => setQuery(q.trim()), 350)
    return () => clearTimeout(id)
  }, [q])
  const [list, setList, state, reload] = useList(call, `/api/admin/customers${query ? `?q=${encodeURIComponent(query)}` : ''}`, 'customers')

  async function reset(c) {
    if (!window.confirm(L.cusResetConfirm)) return
    try {
      const data = await call(`/api/admin/customers/${c.id}/password`, { method: 'POST' })
      setShown({ id: c.id, password: data.password })
    } catch { toast(L.loadFailed, 'error') }
  }

  async function remove(c) {
    if (!window.confirm(L.cusDeleteConfirm.replace('{name}', `${c.first} ${c.last}`.trim()).replace('{email}', c.email))) return
    try {
      await call(`/api/admin/customers/${c.id}`, { method: 'DELETE' })
      setList((l) => l.filter((x) => x.id !== c.id))
      if (shown?.id === c.id) setShown(null)
      toast(L.cusDeleted)
    } catch { toast(L.loadFailed, 'error') }
  }

  return (
    <div className="adm-list">
      <div className="adm-search">
        <Icon name="search" size={18} />
        <input className="field" type="search" value={q} placeholder={L.cusSearch} aria-label={L.cusSearch} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ListState state={state} empty={state === 'ready' && !list.length ? L.cusEmpty : ''} L={L} onRetry={reload} icon="users" />
      {list.map((c) => (
        <article key={c.id} className="adm-card-row adm-customer">
          <div className="adm-customer-main">
            <strong>{c.first} {c.last}</strong>
            <a className="adm-order-link" href={`mailto:${c.email}`}><Icon name="mail" size={15} />{c.email}</a>
            {c.phone && <a className="adm-order-link" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" size={15} />{c.phone}</a>}
            <small className="muted">{L.cusOrders.replace('{n}', c.orders)} · {L.cusSince.replace('{d}', orderDate(c.createdAt, lang))}</small>
          </div>
          <div className="adm-customer-side">
            <div className="adm-customer-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => reset(c)}><Icon name="key" size={16} />{L.cusReset}</button>
              <button type="button" className="btn btn-outline btn-sm adm-cus-delete" onClick={() => remove(c)} aria-label={`${L.cusDelete} – ${c.email}`}>
                <Icon name="trash" size={16} />{L.cusDelete}
              </button>
            </div>
            {shown?.id === c.id && (
              <div className="adm-temp-pass" role="status">
                <small>{L.cusResetDone}</small>
                <code>{shown.password}</code>
                <button type="button" className="btn btn-primary btn-sm" onClick={async () => toast((await copyText(shown.password)) ? L.copied : L.loadFailed)}>
                  <Icon name="copy" size={16} />{L.copy}
                </button>
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}

// ---- newsletter -----------------------------------------------------------------------
export function AdminSubscribers({ L, call }) {
  const { lang } = useI18n()
  const { toast } = useToast()
  const [list, setList, state, reload] = useList(call, '/api/admin/subscribers', 'subscribers')

  async function remove(s) {
    if (!window.confirm(L.subDeleteConfirm)) return
    try {
      await call(`/api/admin/subscribers/${s.id}`, { method: 'DELETE' })
      setList((l) => l.filter((x) => x.id !== s.id))
    } catch { toast(L.loadFailed, 'error') }
  }

  return (
    <div className="adm-list">
      {state === 'ready' && list.length > 0 && (
        <div className="adm-toolbar">
          <strong>{L.subCount.replace('{n}', list.length)}</strong>
          <button type="button" className="btn btn-outline btn-sm" onClick={async () => toast((await copyText(list.map((s) => s.email).join(', '))) ? L.copied : L.loadFailed)}>
            <Icon name="copy" size={16} />{L.subCopyAll}
          </button>
        </div>
      )}
      <ListState state={state} empty={state === 'ready' && !list.length ? L.subEmpty : ''} L={L} onRetry={reload} icon="mail" />
      {list.length > 0 && (
        <ul className="adm-subs">
          {list.map((s) => (
            <li key={s.id}>
              <a href={`mailto:${s.email}`}>{s.email}</a>
              <span className="muted">{orderDate(s.createdAt, lang)}</span>
              <button type="button" className="adm-act adm-del" aria-label={`${L.msgDelete} – ${s.email}`} title={L.msgDelete} onClick={() => remove(s)}>
                <Icon name="trash" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
