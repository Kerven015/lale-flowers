import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
import { useAuth, useCart, useProducts, useSettings } from '../store/hooks'
import { returnAfterSignIn } from '../store/cartSlice'
import { fill } from '../utils/productHelpers'

// why a discount code was refused -> message key
const CODE_ERRORS = {
  not_found: 'disc.notFound', expired: 'disc.expired', not_started: 'disc.notStarted', used_up: 'disc.usedUp',
  min_total: 'disc.minTotal', first_order: 'disc.firstOrder', login: 'disc.login',
}

// form input name -> field name used by the server
const FIELDS = { coFirst: 'first', coLast: 'last', coPhone: 'phone', coEmail: 'email', coCity: 'city', coAddress: 'address', coNotes: 'notes' }

export default function Checkout() {
  const { t, lang } = useI18n()
  const { orderable: cart, soldOut, subtotal, delivery, clear, remove, setQty } = useCart()
  const { ordersOpen } = useSettings()
  const { city } = useDelivery()
  const { get, name, loading, reload } = useProducts()
  const { user, refresh } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [deliveryType, setDeliveryType] = useState('delivery')
  const [payment, setPayment] = useState('card')
  // delivery time: as soon as possible, or a chosen day + time slot
  const [calendar, setCalendar] = useState(null) // { enabled, days: [{ date, slots: [{ slot, open }] }] }
  const [when, setWhen] = useState('asap')
  const [day, setDay] = useState('')
  const [slot, setSlot] = useState('')
  const [card, setCard] = useState('') // greeting card text
  const loadCalendar = async () => {
    try { setCalendar(await api('/api/delivery/slots')) } catch { setCalendar(null) }
  }
  useEffect(() => { loadCalendar() }, [])
  const dayInfo = calendar?.days?.find((d) => d.date === day)
  const [order, setOrder] = useState(null) // the placed order (from the server)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({}) // server field name -> translation key
  const placeRef = useRef(null)
  // Discount code: typed -> "Apply" checks it with the server.
  const [codeInput, setCodeInput] = useState('')
  const [code, setCode] = useState('') // the applied code
  const [codeError, setCodeError] = useState('')
  // The server's price for this basket (delivery, code, first-order discount).
  const [quote, setQuote] = useState(null)
  const basketKey = cart.map((i) => `${i.id}x${i.qty}`).join(',')
  useEffect(() => {
    if (!cart.length) { setQuote(null); return undefined }
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const data = await api('/api/orders/quote', {
          method: 'POST', signal: ctrl.signal,
          body: { items: cart.map((i) => ({ id: i.id, qty: i.qty })), deliveryType, discountCode: code },
        })
        setQuote(data.quote)
      } catch (err) {
        if (err?.name === 'AbortError') return
        const why = err.data?.fields?.discountCode
        if (why) { // the code stopped working (e.g. basket now below its minimum)
          setCode('')
          setCodeError(fill(t(CODE_ERRORS[why] || 'disc.notFound'), { min: err.data?.minTotal ?? '' }))
        } else {
          setQuote(null) // offline etc.: show the shop's own estimate
        }
      }
    }, 250)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [basketKey, deliveryType, code, user?.id]) // basketKey stands for the basket contents

  async function applyCode() {
    const c = codeInput.trim()
    setCodeError('')
    if (!c) { setCode(''); return }
    try {
      const data = await api('/api/orders/quote', {
        method: 'POST',
        body: { items: cart.map((i) => ({ id: i.id, qty: i.qty })), deliveryType, discountCode: c },
      })
      setQuote(data.quote)
      setCode(c)
      if (data.quote.discountSource !== 'code') setCodeError(t('disc.notBetter'))
      else toast(t('disc.applied'))
    } catch (err) {
      const why = err.data?.fields?.discountCode
      setCodeError(why ? fill(t(CODE_ERRORS[why] || 'disc.notFound'), { min: err.data?.minTotal ?? '' }) : errorMessage(t, err))
    }
  }

  // Picking up from the shop is free (see the Delivery page).
  const fee = quote ? quote.deliveryFee : deliveryType === 'pickup' ? 0 : delivery
  const discount = quote?.discount || 0
  const grand = quote ? quote.total : subtotal + fee
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

  // Orders need a login: sign in, then come back here (the basket stays).
  function signInFirst() {
    returnAfterSignIn('/checkout') // the sign-in page says why
    navigate('/login')
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (busy) return
    if (!user) { signInFirst(); return }
    if (!cart.length) { toast(t('checkout.emptyCart'), 'error'); return }
    if (!ordersOpen) { toast(t('checkout.closed'), 'error'); return }
    if (when === 'scheduled' && (!day || !slot)) {
      setErrors({ deliverySlot: 'when.pick' })
      toast(t('when.pick'), 'error')
      return
    }
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
          discountCode: code,
          deliveryDate: when === 'scheduled' ? day : '',
          deliverySlot: when === 'scheduled' ? slot : '',
          cardMessage: card.trim(),
        },
      })
      // ordered flowers leave the basket; sold-out ones (not ordered) stay
      if (soldOut.length) cart.forEach((i) => remove(i.id))
      else clear()
      setOrder(data.order)
    } catch (err) {
      if (err.code === 'login_required') {
        // the login ended (e.g. after 30 days): the page still thought it was signed in
        await refresh()
        signInFirst()
        return
      }
      if (err.code === 'validation' && err.data?.fields) {
        const fe = keysFromServer(err.data.fields)
        setErrors(fe)
        focusFirst(form, fe)
      }
      if (err.code === 'unavailable') reload() // sold-out / removed flowers drop out of the basket
      if (err.code === 'slot_full' || err.data?.fields?.deliverySlot || err.data?.fields?.deliveryDate) {
        // the chosen time is taken / no longer possible: fresh choices
        setSlot('')
        setErrors((er) => ({ ...er, deliverySlot: err.code === 'slot_full' ? 'when.full' : 'when.gone' }))
        loadCalendar()
      }
      if (err.code === 'not_enough_stock') {
        // fewer left than in the basket: the basket shrinks to what is left
        for (const it of err.data?.items || []) if (it.left > 0) setQty(it.id, it.left)
        reload()
      }
      const why = err.data?.fields?.discountCode
      if (why) { setCode(''); setCodeError(fill(t(CODE_ERRORS[why] || 'disc.notFound'), { min: err.data?.minTotal ?? '' })) }
      toast(err.code === 'not_enough_stock' ? t('stock.notEnough')
        : err.code === 'too_many_open_orders' ? fill(t('checkout.tooManyOpen'), { max: err.data?.max ?? '' })
        : err.code === 'slot_full' ? t('when.full')
        : err.data?.fields?.deliverySlot || err.data?.fields?.deliveryDate ? t('when.gone')
        : errorMessage(t, err), 'error')
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

              {calendar?.enabled && calendar.days.length > 0 && (
                <>
                  <h3 style={{ marginTop: 30 }}>{t('when.title')}</h3>
                  <div className="form-grid">
                    <label className={`radio-card${when === 'asap' ? ' active' : ''}`}>
                      <input type="radio" name="when" checked={when === 'asap'} onChange={() => setWhen('asap')} />
                      <div><div className="rc-title with-ico"><Icon name="zap" size={18} />{t('when.asap')}</div><div className="rc-sub">{t('when.asapSub')}</div></div>
                    </label>
                    <label className={`radio-card${when === 'scheduled' ? ' active' : ''}`}>
                      <input type="radio" name="when" checked={when === 'scheduled'} onChange={() => { setWhen('scheduled'); if (!day) setDay(calendar.days[0].date) }} />
                      <div><div className="rc-title with-ico"><Icon name="clock" size={18} />{t('when.pickTitle')}</div><div className="rc-sub">{t('when.pickSub')}</div></div>
                    </label>
                  </div>
                  {when === 'scheduled' && (
                    <div className="when-picker">
                      <div className="form-field">
                        <label htmlFor="coDay">{t('when.day')}</label>
                        <select id="coDay" className="field" value={day} onChange={(e) => { setDay(e.target.value); setSlot(''); setErrors((er) => ({ ...er, deliverySlot: undefined })) }}>
                          {calendar.days.map((d) => (
                            <option key={d.date} value={d.date}>
                              {new Date(`${d.date}T00:00:00Z`).toLocaleDateString(lang === 'tm' ? 'tk' : lang, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-field">
                        <span className="when-label" id="coSlot-label">{t('when.slot')}</span>
                        <div className="chips" role="radiogroup" aria-labelledby="coSlot-label">
                          {(dayInfo?.slots || []).map((s) => (
                            <button
                              key={s.slot} type="button" role="radio" aria-checked={slot === s.slot} disabled={!s.open}
                              className={`chip${slot === s.slot ? ' active' : ''}`}
                              title={s.open ? undefined : t('when.slotTaken')}
                              onClick={() => { setSlot(s.slot); setErrors((er) => ({ ...er, deliverySlot: undefined })) }}
                            >
                              {s.slot}
                            </button>
                          ))}
                        </div>
                        {errors.deliverySlot && <small className="field-error" role="alert">{t(errors.deliverySlot)}</small>}
                      </div>
                    </div>
                  )}
                </>
              )}

              <h3 style={{ marginTop: 30 }}>{t('gift.title')}</h3>
              <div className="form-field full">
                <label htmlFor="coCard">{t('gift.label')}</label>
                <textarea id="coCard" className="field" rows={3} maxLength={300} placeholder={t('gift.ph')} value={card} onChange={(e) => setCard(e.target.value)} />
                <small className="muted">{card.length}/300 · {t('gift.hint')}</small>
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
              {!ordersOpen && <p className="form-error" role="alert" style={{ marginTop: 24 }}>{t('checkout.closed')}</p>}
              <button ref={placeRef} className="btn btn-primary btn-block btn-lg" type="submit" style={{ marginTop: 28 }} disabled={busy || !cart.length || !ordersOpen} aria-busy={busy}>
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
                  {discount > 0 && (
                    <div className="summary-row discount-row">
                      <span>{quote.discountSource === 'code' ? fill(t('disc.rowCode'), { code: quote.discountCode }) : fill(t('disc.rowFirst'), { n: quote.firstOrderPercent })}</span>
                      <span>−{formatPrice(discount)}</span>
                    </div>
                  )}
                  <div className="summary-row"><span>{t('cart.delivery')}</span><span>{fee === 0 ? t('cart.free') : formatPrice(fee)}</span></div>
                  <div className="summary-row total"><span>{t('cart.grand')}</span><span><RollingNumber value={grand} suffix=" TMT" /></span></div>
                  <div className="discount-box">
                    <label htmlFor="coCode">{t('disc.label')}</label>
                    <div className="discount-input">
                      <input
                        id="coCode"
                        className={`field${codeError ? ' is-invalid' : ''}`}
                        value={codeInput}
                        maxLength={30}
                        autoComplete="off"
                        autoCapitalize="characters"
                        placeholder="SPRING10"
                        aria-invalid={!!codeError}
                        aria-describedby={codeError ? 'coCode-err' : undefined}
                        onChange={(e) => { setCodeInput(e.target.value); setCodeError('') }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCode() } }}
                      />
                      <button type="button" className="btn btn-outline" onClick={applyCode}>{t('disc.apply')}</button>
                    </div>
                    {codeError && <small id="coCode-err" className="field-error" role="alert">{codeError}</small>}
                    {code && !codeError && quote?.discountSource === 'code' && (
                      <button type="button" className="link-btn" onClick={() => { setCode(''); setCodeInput('') }}>{t('disc.remove')}</button>
                    )}
                  </div>
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
              {order.discount > 0 && <p><strong>{t('disc.saved')}</strong>: {formatPrice(order.discount)}</p>}
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
