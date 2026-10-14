import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHead from '../components/PageHead'
import { useDelivery } from '../contexts/DeliveryContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import { formatPrice } from '../utils/productHelpers'
import Icon from '../components/Icons'
import { useMagnetic } from '../motion/motion'
import RollingNumber from '../motion/RollingNumber'
import { api, errorMessage } from '../api'
import { checkFields, keysFromServer } from '../utils/formCheck'
import { useAuth, useCart, useProducts } from '../store/hooks'

// form input name -> field name used by the server
const FIELDS = { coFirst: 'first', coLast: 'last', coPhone: 'phone', coEmail: 'email', coCity: 'city', coAddress: 'address', coNotes: 'notes' }

export default function Checkout() {
  const { t, lang } = useI18n()
  const { orderable: cart, soldOut, subtotal, delivery, clear, remove } = useCart()
  const { city } = useDelivery()
  const { get, name, loading, reload } = useProducts()
  const { user } = useAuth()
  const { toast } = useToast()
  const [deliveryType, setDeliveryType] = useState('delivery')
  const [payment, setPayment] = useState('card')
  const [order, setOrder] = useState(null) // the placed order (from the server)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({}) // server field name -> translation key
  const placeRef = useRef(null)
  // Picking up from the shop is free (see the Delivery page).
  const fee = deliveryType === 'pickup' ? 0 : delivery
  const grand = subtotal + fee
  useMagnetic(placeRef, undefined, [order, cart.length])

  // "Order placed" window: keyboard focus goes into it, Esc closes it
  const doneRef = useRef(null)
  useEffect(() => {
    if (!order) return undefined
    doneRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') setOrder(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [order])

  async function onSubmit(e) {
    e.preventDefault()
    if (busy) return
    if (!cart.length) { toast(t('checkout.emptyCart'), 'error'); return }
    const form = e.target
    const value = (n) => (form[n] ? form[n].value.trim() : '')

    // quick check in the browser first (the server checks everything again)
    const delivering = deliveryType === 'delivery'
    const byInput = checkFields(form, {
      coFirst: { required: true }, coLast: { required: true }, coPhone: { required: true, phone: true },
      coEmail: { required: true, email: true }, coCity: { required: delivering }, coAddress: { required: delivering },
    })
    const missing = Object.fromEntries(Object.entries(byInput).map(([n, key]) => [FIELDS[n], key]))
    if (Object.keys(missing).length) {
      setErrors(missing)
      focusFirst(form, missing)
      toast(t('err.validation'), 'error')
      return
    }

    setBusy(true)
    setErrors({})
    try {
      const data = await api('/api/orders', {
        method: 'POST',
        body: {
          items: cart.map((i) => ({ id: i.id, qty: i.qty })),
          customer: Object.fromEntries(Object.entries(FIELDS).map(([n, f]) => [f, value(n)])),
          deliveryType,
          payment,
          lang,
        },
      })
      // ordered flowers leave the basket; sold-out ones (not ordered) stay
      if (soldOut.length) cart.forEach((i) => remove(i.id))
      else clear()
      setOrder(data.order)
    } catch (err) {
      if (err.code === 'validation' && err.data?.fields) {
        const fe = keysFromServer(err.data.fields)
        setErrors(fe)
        focusFirst(form, fe)
      }
      if (err.code === 'unavailable') reload() // sold-out / removed flowers drop out of the basket
      toast(errorMessage(t, err), 'error')
    } finally {
      setBusy(false)
    }
  }

  // a field stops being red as soon as it is edited
  function onEdit(e) {
    const f = FIELDS[e.target.name]
    if (f && errors[f]) setErrors((er) => ({ ...er, [f]: undefined }))
  }

  function focusFirst(form, errs) {
    const n = Object.keys(FIELDS).find((k) => errs[FIELDS[k]])
    if (n && form[n]) form[n].focus()
  }

  const input = (n, label, props = {}) => {
    const f = FIELDS[n]
    return (
      <div className={`form-field${props.full ? ' full' : ''}`}>
        <label htmlFor={n}>{label}</label>
        {props.textarea ? (
          <textarea className="field" id={n} name={n} maxLength={1000} />
        ) : (
          <input
            className={`field${errors[f] ? ' is-invalid' : ''}`}
            id={n}
            name={n}
            aria-invalid={!!errors[f]}
            aria-describedby={errors[f] ? `${n}-err` : undefined}
            {...props.attrs}
          />
        )}
        {errors[f] && <small id={`${n}-err`} className="field-error">{t(errors[f])}</small>}
      </div>
    )
  }

  return (
    <>
      <PageHead
        title={t('checkout.title')}
        sub={t('checkout.sub')}
        crumbs={[{ label: t('cart.title'), to: '/cart' }, { label: t('checkout.title') }]}
      />
      <section className="section">
        <div className="container">
          {loading && !order ? (
            <p className="muted" role="status" aria-live="polite">{t('loading.products')}</p>
          ) : !cart.length && !order ? (
            <div className="empty-state">
              <div className="es-icon"><Icon name="cart" size={32} /></div>
              <h3>{t('cart.empty')}</h3>
              <p>{t('checkout.emptyCart')}</p>
              <Link className="btn btn-primary" to="/catalog">{t('cart.emptyBtn')}</Link>
            </div>
          ) : (
          <div className="cart-layout">
            <form id="checkoutForm" key={user?.id || 'guest'} className="summary" style={{ position: 'static' }} onSubmit={onSubmit} onInput={onEdit} noValidate>
              <h3>{t('checkout.contact')}</h3>
              <div className="form-grid">
                {input('coFirst', t('checkout.first'), { attrs: { required: true, maxLength: 80, autoComplete: 'given-name', defaultValue: user?.first || '' } })}
                {input('coLast', t('checkout.last'), { attrs: { required: true, maxLength: 80, autoComplete: 'family-name', defaultValue: user?.last || '' } })}
                {input('coPhone', t('checkout.phone'), { attrs: { required: true, type: 'tel', maxLength: 30, autoComplete: 'tel', placeholder: '+993 6X XXXXXX', defaultValue: user?.phone || '' } })}
                {input('coEmail', t('checkout.email'), { attrs: { required: true, type: 'email', maxLength: 254, autoComplete: 'email', defaultValue: user?.email || '' } })}
              </div>

              <h3 style={{ marginTop: 30 }}>{t('checkout.delivery')}</h3>
              <div className="form-grid">
                <label className={`radio-card${deliveryType === 'delivery' ? ' active' : ''}`}>
                  <input type="radio" name="delivery" checked={deliveryType === 'delivery'} onChange={() => setDeliveryType('delivery')} />
                  <div><div className="rc-title with-ico"><Icon name="truck" size={18} />{t('checkout.deliveryHome')}</div><div className="rc-sub">{t('checkout.deliveryHomeSub')}</div></div>
                </label>
                <label className={`radio-card${deliveryType === 'pickup' ? ' active' : ''}`}>
                  <input type="radio" name="delivery" checked={deliveryType === 'pickup'} onChange={() => setDeliveryType('pickup')} />
                  <div><div className="rc-title with-ico"><Icon name="store" size={18} />{t('checkout.pickup')}</div><div className="rc-sub">{t('checkout.pickupSub')}</div></div>
                </label>
              </div>
              <div className="form-grid" style={{ marginTop: 18 }}>
                {/* city + address only matter for delivery */}
                {deliveryType === 'delivery' && input('coCity', t('checkout.city'), { attrs: { required: true, maxLength: 80, autoComplete: 'address-level2', defaultValue: t(`city.${city}`) } })}
                {deliveryType === 'delivery' && input('coAddress', t('checkout.address'), { attrs: { required: true, maxLength: 300, autoComplete: 'street-address' } })}
                {input('coNotes', t('checkout.notes'), { full: true, textarea: true })}
              </div>

              <h3 style={{ marginTop: 30 }}>{t('checkout.payment')}</h3>
              <div className="form-grid">
                <label className={`radio-card${payment === 'card' ? ' active' : ''}`}>
                  <input type="radio" name="payment" checked={payment === 'card'} onChange={() => setPayment('card')} />
                  <div><div className="rc-title with-ico"><Icon name="card" size={18} />{t('checkout.card')}</div><div className="rc-sub">{t('checkout.cardSub')}</div></div>
                </label>
                <label className={`radio-card${payment === 'cash' ? ' active' : ''}`}>
                  <input type="radio" name="payment" checked={payment === 'cash'} onChange={() => setPayment('cash')} />
                  <div><div className="rc-title with-ico"><Icon name="cash" size={18} />{t('checkout.cash')}</div><div className="rc-sub">{t('checkout.cashSub')}</div></div>
                </label>
              </div>
              <button ref={placeRef} className="btn btn-primary btn-block btn-lg" type="submit" style={{ marginTop: 28 }} disabled={busy || !cart.length} aria-busy={busy}>
                {busy ? t('form.sending') : t('checkout.place')}
              </button>
            </form>

            <aside className="summary">
              <h3>{t('checkout.summary')}</h3>
              {soldOut.length > 0 && <p className="form-error" role="status">{t('cart.soldOutNote')}</p>}
              {!cart.length ? <p className="muted">{t('checkout.emptyCart')}</p> : (
                <>
                  {cart.map((item) => {
                    const p = get(item.id)
                    if (!p) return null
                    return (
                      <div className="summary-row" key={p.id}>
                        <span>{name(p)} × {item.qty}</span>
                        <span>{formatPrice(p.price * item.qty)}</span>
                      </div>
                    )
                  })}
                  <div className="summary-row total"><span>{t('cart.subtotal')}</span><span><RollingNumber value={subtotal} suffix=" TMT" /></span></div>
                  <div className="summary-row"><span>{t('cart.delivery')}</span><span>{fee === 0 ? t('cart.free') : formatPrice(fee)}</span></div>
                  <div className="summary-row total"><span>{t('cart.grand')}</span><span><RollingNumber value={grand} suffix=" TMT" /></span></div>
                </>
              )}
            </aside>
          </div>
          )}
        </div>
      </section>

      <div className={`modal${order ? ' show' : ''}`} onClick={() => setOrder(null)}>
        <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="order-done-title" aria-hidden={!order} ref={doneRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
          <div className="m-icon"><Icon name="check" size={34} /></div>
          <h3 id="order-done-title">{t('checkout.success')}</h3>
          <p className="muted">{t('checkout.successText')}</p>
          {order && (
            <>
              <p><strong>{t('checkout.orderNo')}</strong>: <span className="order-code">{order.code}</span></p>
              <p><strong>{t('cart.grand')}</strong>: {formatPrice(order.total)}</p>
            </>
          )}
          <Link className="btn btn-primary btn-block" to={order ? `/track?code=${encodeURIComponent(order.code)}` : '/track'}>{t('top.track')}</Link>
          <Link className="btn btn-outline btn-block" to="/" style={{ marginTop: 10 }}>{t('checkout.back')}</Link>
        </div>
      </div>
    </>
  )
}
