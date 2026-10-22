// Admin: incoming orders. New ones arrive by themselves (the panel checks
// every few seconds), with a sound.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import { useToast } from '../../contexts/ToastContext'
import { StatusPill, lineName, orderDate } from '../../components/OrderStatus'
import { formatPrice } from '../../utils/productHelpers'
import Icon from '../../components/Icons'
import { useProducts } from '../../store/hooks'

const FILTERS = [
  ['new', 'fNew'],
  ['active', 'fActive'],
  ['done', 'fDone'],
  ['cancelled', 'fCancelled'],
  ['all', 'fAll'],
]
const NEXT = { new: 'confirmed', confirmed: 'preparing', preparing: 'delivering', delivering: 'done' }
const STATUSES = ['new', 'confirmed', 'preparing', 'delivering', 'done', 'cancelled']
const PAGE = 30

// Same rules as the server (server/src/routes/admin.js canMove): forward only,
// cancel before "done", a cancelled order comes back as "new", "done" is final.
const FLOW = ['new', 'confirmed', 'preparing', 'delivering', 'done']
export function canMove(from, to) {
  if (from === to || from === 'done') return false
  if (from === 'cancelled') return to === 'new'
  if (to === 'cancelled') return true
  return FLOW.indexOf(to) > FLOW.indexOf(from)
}

// shop day 'YYYY-MM-DD' (Ashgabat), and n days later
const shopDay = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86400000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ashgabat' }).format(d)
}

function OrderCard({ order, L, onChange }) {
  const { t, lang } = useI18n()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(order.adminNote || '')
  useEffect(() => { setNote(order.adminNote || '') }, [order.adminNote])
  const c = order.customer
  const next = NEXT[order.status]

  async function update(patch) {
    setBusy(true)
    try { await onChange(order.id, patch) } finally { setBusy(false) }
  }

  return (
    <article className={`adm-order${order.status === 'new' ? ' is-new' : ''}`} aria-labelledby={`ord-${order.id}`}>
      <header className="adm-order-head">
        <div>
          <strong id={`ord-${order.id}`} className="order-code">{order.code}</strong>
          <span className="muted adm-order-time">{orderDate(order.createdAt, lang, true)}</span>
        </div>
        <StatusPill status={order.status} />
      </header>

      <div className="adm-order-grid">
        <div>
          <div className="adm-order-name">
            {c.first} {c.last}
            {order.registered && <span className="adm-tag">{L.ordRegistered}</span>}
          </div>
          <a className="adm-order-link" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" size={15} />{c.phone}</a>
          <a className="adm-order-link" href={`mailto:${c.email}`}><Icon name="mail" size={15} />{c.email}</a>
        </div>
        <div>
          <div className="adm-order-line with-ico">
            <Icon name={order.deliveryType === 'pickup' ? 'store' : 'truck'} size={16} />
            {order.deliveryType === 'pickup' ? L.ordPickup : L.ordDelivery}
          </div>
          {order.deliveryType === 'delivery' && <div className="adm-order-address">{[c.city, c.address].filter(Boolean).join(', ')}</div>}
          <div className={`adm-order-line with-ico${order.deliveryDate ? ' adm-when' : ' muted'}`}>
            <Icon name="clock" size={16} />
            {order.deliveryDate
              ? `${new Date(`${order.deliveryDate}T00:00:00Z`).toLocaleDateString(lang === 'tm' ? 'tk' : lang, { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' })} · ${order.deliverySlot}`
              : L.ordAsap}
          </div>
          <div className="adm-order-line with-ico muted">
            <Icon name={order.payment === 'card' ? 'card' : 'cash'} size={16} />
            {order.payment === 'card' ? L.ordPayCard : L.ordPayCash} · {L.ordLang}: {order.lang.toUpperCase()}
          </div>
        </div>
      </div>

      <ul className="adm-order-items">
        {order.items.map((i, k) => (
          <li key={k}><span>{lineName(i, lang)} × {i.qty}</span><span>{formatPrice(i.price * i.qty)}</span></li>
        ))}
        {order.discount > 0 && (
          <li className="muted"><span>{order.discountCode ? L.ordDiscountCode.replace('{code}', order.discountCode) : L.ordDiscountFirst}</span><span>−{formatPrice(order.discount)}</span></li>
        )}
        <li className="muted"><span>{L.ordDeliveryFee}</span><span>{order.deliveryFee ? formatPrice(order.deliveryFee) : L.ordFree}</span></li>
        <li className="adm-order-total"><span>{L.ordTotal}</span><span>{formatPrice(order.total)}</span></li>
      </ul>

      {order.cardMessage && (
        <blockquote className="adm-order-notes adm-card-msg"><small>{L.ordCardMessage}</small>{order.cardMessage}</blockquote>
      )}
      {order.notes && (
        <blockquote className="adm-order-notes"><small>{L.ordNotes}</small>{order.notes}</blockquote>
      )}

      <label className="adm-order-note">
        <small>{L.ordAdminNote}</small>
        <textarea
          className="field"
          rows={2}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => { if (note !== (order.adminNote || '')) update({ adminNote: note }) }}
        />
      </label>

      <div className="adm-order-actions">
        {next && (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => update({ status: next, from: order.status })}>
            <Icon name="check" size={16} />{L.ordNext.replace('{s}', t(`status.${next}`))}
          </button>
        )}
        <select
          className="field adm-order-select"
          aria-label={L.ordStatus}
          value={order.status}
          disabled={busy}
          onChange={(e) => update({ status: e.target.value, from: order.status })}
        >
          {/* only the moves that are allowed from here */}
          {STATUSES.filter((s) => s === order.status || canMove(order.status, s)).map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </select>
        {order.status !== 'cancelled' && order.status !== 'done' && (
          <button
            type="button"
            className="btn btn-outline btn-sm adm-order-cancel"
            disabled={busy}
            onClick={() => { if (window.confirm(L.ordCancelConfirm)) update({ status: 'cancelled', from: order.status }) }}
          >
            {L.ordCancel}
          </button>
        )}
        <a className="btn btn-outline btn-sm" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" size={16} />{L.ordCall}</a>
      </div>
    </article>
  )
}

export default function AdminOrders({ L, call, summary, version, onChanged }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const { reload: reloadProducts } = useProducts()
  const [filter, setFilter] = useState('new')
  const [day, setDay] = useState('') // '' = any delivery day
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [orders, setOrders] = useState([])
  const [total, setTotal] = useState(0)
  const [state, setState] = useState('loading') // loading | ready | error
  const [more, setMore] = useState(false)
  const req = useRef(0)

  // wait until typing stops before searching
  useEffect(() => {
    const id = setTimeout(() => setQuery(q.trim()), 350)
    return () => clearTimeout(id)
  }, [q])

  const load = useCallback(async (offset = 0) => {
    const mine = ++req.current
    if (offset === 0) setState((s) => (s === 'ready' ? 'ready' : 'loading'))
    else setMore(true)
    try {
      const data = await call(`/api/admin/orders?status=${filter}&limit=${PAGE}&offset=${offset}${query ? `&q=${encodeURIComponent(query)}` : ''}${day ? `&day=${day}` : ''}`)
      if (mine !== req.current) return
      setOrders((list) => (offset ? [...list, ...data.orders] : data.orders))
      setTotal(data.total)
      setState('ready')
    } catch {
      if (mine === req.current) setState('error')
    } finally {
      setMore(false)
    }
  }, [call, filter, query, day])

  useEffect(() => { load(0) }, [load, version])

  const change = useCallback(async (id, patch) => {
    try {
      const data = await call(`/api/admin/orders/${id}`, { method: 'PATCH', body: patch })
      setOrders((list) => list.map((o) => (o.id === id ? data.order : o)))
      if (patch.status) {
        toast(L.ordUpdated)
        reloadProducts() // cancelling / restoring changes the flowers left
      }
      onChanged()
    } catch (err) {
      if (err?.code === 'status_changed' || err?.code === 'bad_status_change') {
        toast(L.ordChanged, 'error') // someone else changed it: show the fresh state
        load(0)
      } else {
        toast(err?.code === 'not_enough_stock' ? L.ordNoStock : L.loadFailed, 'error')
      }
    }
  }, [call, toast, L, onChanged, reloadProducts, load])

  const count = (key) => (key === 'new' ? summary?.newOrders : key === 'active' ? summary?.activeOrders : null)

  return (
    <div className="adm-orders">
      <div className="adm-toolbar">
        <div className="chips adm-filter" role="tablist" aria-label={L.ordStatus}>
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={`chip${filter === key ? ' active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {L[label]}{count(key) ? <span className="adm-count">{count(key)}</span> : null}
            </button>
          ))}
        </div>
        <div className="adm-search adm-search-sm">
          <Icon name="search" size={18} />
          <input className="field" type="search" value={q} placeholder={L.ordSearch} aria-label={L.ordSearch} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="chips adm-filter" role="group" aria-label={L.ordDeliveryDay}>
          {[['', L.ordAnyDay], [shopDay(0), L.ordToday], [shopDay(1), L.ordTomorrow]].map(([d, label]) => (
            <button key={label} type="button" className={`chip${day === d ? ' active' : ''}`} aria-pressed={day === d} onClick={() => setDay(d)}>{label}</button>
          ))}
          <input className="field adm-day-pick" type="date" aria-label={L.ordDeliveryDay} value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => { load(0); onChanged() }}>
          <Icon name="refresh" size={16} />{L.refresh}
        </button>
      </div>

      {state === 'loading' && <p className="muted" role="status">{t('loading.wait')}</p>}
      {state === 'error' && (
        <div className="empty-state" role="alert">
          <h3>{L.loadFailed}</h3>
          <button type="button" className="btn btn-primary" onClick={() => load(0)}>{L.retry}</button>
        </div>
      )}
      {state === 'ready' && !orders.length && (
        <div className="empty-state"><div className="es-icon"><Icon name="orders" size={32} /></div><h3>{L.ordEmpty}</h3></div>
      )}
      <div className="adm-order-list">
        {orders.map((o) => <OrderCard key={o.id} order={o} L={L} onChange={change} />)}
      </div>
      {state === 'ready' && orders.length < total && (
        <button type="button" className="btn btn-outline btn-block" style={{ marginTop: 16 }} disabled={more} onClick={() => load(orders.length)}>
          {L.loadMore} ({total - orders.length})
        </button>
      )}
    </div>
  )
}
