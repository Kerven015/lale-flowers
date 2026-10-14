import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHead from '../components/PageHead'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import Icon from '../components/Icons'
import { StatusPill, lineName, orderDate } from '../components/OrderStatus'
import { formatPrice } from '../utils/productHelpers'
import { api, errorMessage } from '../api'
import FormField from '../components/FormField'
import { checkFields, clearError, focusFirstError, keysFromServer } from '../utils/formCheck'
import { useAuth } from '../store/hooks'

function MyOrders() {
  const { t, lang } = useI18n()
  const [orders, setOrders] = useState(null) // null = loading
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    api('/api/account/orders')
      .then((d) => { if (alive) setOrders(d.orders) })
      .catch(() => { if (alive) { setFailed(true); setOrders([]) } })
    return () => { alive = false }
  }, [])

  return (
    <div className="summary" style={{ position: 'static', marginBottom: 20 }}>
      <h3>{t('profile.orders')}</h3>
      {orders === null && <p className="muted" role="status">{t('loading.wait')}</p>}
      {failed && <p className="muted" role="alert">{t('err.network')}</p>}
      {orders && !failed && !orders.length && <p className="muted">{t('profile.noOrders')}</p>}
      {orders?.map((o) => (
        <Link className="my-order" key={o.code} to={`/track?code=${encodeURIComponent(o.code)}`}>
          <div className="my-order-top">
            <strong>{o.code}</strong>
            <StatusPill status={o.status} />
          </div>
          <div className="my-order-items muted">{o.items.map((i) => `${lineName(i, lang)} × ${i.qty}`).join(', ')}</div>
          <div className="my-order-bottom">
            <span className="muted">{orderDate(o.createdAt, lang)}</span>
            <span className="cr-price">{formatPrice(o.total)}</span>
          </div>
        </Link>
      ))}
    </div>
  )
}

function PasswordForm() {
  const { t } = useI18n()
  const { changePassword } = useAuth()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({}) // field -> translation key
  const [error, setError] = useState(null) // ApiError from the server

  async function onSubmit(e) {
    e.preventDefault()
    if (busy) return
    const f = e.target
    setError(null)
    const errs = checkFields(f, { current: { required: true }, next: { required: true, min: 6 } })
    setErrors(errs)
    if (Object.keys(errs).length) { focusFirstError(f, errs); return }
    setBusy(true)
    const r = await changePassword(f.current.value, f.next.value)
    setBusy(false)
    if (!r.ok) {
      if (r.error.code === 'invalid_credentials') { setErrors({ current: 'auth.errCurrent' }); f.current.focus() }
      else if (r.error.data?.fields) setErrors(keysFromServer(r.error.data.fields))
      else setError(r.error)
      return
    }
    f.reset()
    toast(t('profile.passChanged'))
  }

  return (
    <form onSubmit={onSubmit} onInput={clearError(setErrors)} className="profile-pass" noValidate>
      <h4>{t('profile.password')}</h4>
      <FormField id="pf-current" name="current" label={t('profile.currentPass')} error={errors.current} style={{ marginBottom: 12 }} type="password" autoComplete="current-password" maxLength={200} />
      <FormField id="pf-next" name="next" label={t('profile.newPass')} error={errors.next} style={{ marginBottom: 12 }} type="password" autoComplete="new-password" maxLength={200} />
      {error && <p className="form-error" role="alert">{errorMessage(t, error)}</p>}
      <button className="btn btn-outline btn-block" type="submit" disabled={busy} aria-busy={busy}>{busy ? t('form.sending') : t('profile.password')}</button>
    </form>
  )
}

export default function Profile() {
  const { t } = useI18n()
  const { user, ready, logout, updateProfile } = useAuth()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})

  if (!ready) {
    return (
      <>
        <PageHead title={t('profile.title')} sub={t('profile.sub')} crumbs={[{ label: t('profile.title') }]} />
        <section className="section"><div className="container"><p className="muted" role="status">{t('loading.wait')}</p></div></section>
      </>
    )
  }

  if (!user) {
    return (
      <>
        <PageHead title={t('profile.title')} sub={t('profile.sub')} crumbs={[{ label: t('profile.title') }]} />
        <section className="section">
          <div className="container">
            <div className="empty-state">
              <div className="es-icon"><Icon name="user" size={32} /></div>
              <h3>{t('profile.guest')}</h3>
              <p>{t('profile.guestText')}</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link className="btn btn-primary" to="/login">{t('profile.goLogin')}</Link>
                <Link className="btn btn-outline" to="/register">{t('profile.goRegister')}</Link>
              </div>
            </div>
          </div>
        </section>
      </>
    )
  }

  async function save(e) {
    e.preventDefault()
    if (busy) return
    const f = e.target
    const errs = checkFields(f, { first: { required: true }, phone: { phone: true } })
    setErrors(errs)
    if (Object.keys(errs).length) { focusFirstError(f, errs); return }
    setBusy(true)
    const result = await updateProfile({
      first: f.first.value.trim(),
      last: f.last.value.trim(),
      phone: f.phone.value.trim(),
    })
    setBusy(false)
    if (result.ok) { toast(t('profile.saved')); return }
    const fields = result.error.data?.fields
    if (fields) setErrors(keysFromServer(fields))
    else toast(errorMessage(t, result.error), 'error')
  }

  return (
    <>
      <PageHead title={t('profile.title')} sub={t('profile.sub')} crumbs={[{ label: t('profile.title') }]} />
      <section className="section">
        <div className="container">
          <div className="grid-2">
            <div className="summary" style={{ position: 'static' }}>
              <div className="profile-head" style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
                <div className="avatar">{((user.first?.[0] || 'U') + (user.last?.[0] || '')).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <strong>{user.first} {user.last}</strong>
                  <div className="muted" style={{ overflowWrap: 'anywhere' }}>{user.email}</div>
                </div>
              </div>
              <form key={user.id} onSubmit={save} onInput={clearError(setErrors)} noValidate>
                <FormField id="pf-first" name="first" label={t('auth.first')} error={errors.first} style={{ marginBottom: 12 }} defaultValue={user.first} maxLength={80} autoComplete="given-name" />
                <FormField id="pf-last" name="last" label={t('auth.last')} error={errors.last} style={{ marginBottom: 12 }} defaultValue={user.last} maxLength={80} autoComplete="family-name" />
                <FormField id="pf-email" label={t('auth.email')} style={{ marginBottom: 12 }} value={user.email} disabled readOnly />
                <FormField id="pf-phone" name="phone" label={t('auth.phone')} error={errors.phone} style={{ marginBottom: 16 }} type="tel" defaultValue={user.phone} maxLength={30} autoComplete="tel" />
                <button className="btn btn-primary btn-block" type="submit" disabled={busy} aria-busy={busy}>{busy ? t('form.sending') : t('profile.save')}</button>
              </form>
              <PasswordForm />
              <button
                type="button"
                className="btn btn-outline btn-block"
                style={{ marginTop: 24, color: 'var(--red)', borderColor: 'var(--red)' }}
                onClick={async () => { await logout(); toast(t('auth.logoutOk')) }}
              >
                {t('auth.logout')}
              </button>
            </div>
            <div>
              <MyOrders />
              <div className="summary" style={{ position: 'static' }}>
                <h3>{t('profile.favs')}</h3>
                <Link className="btn btn-outline btn-block" to="/favorites" style={{ marginBottom: 10 }}><Icon name="heart" size={18} />{t('fav.title')}</Link>
                <Link className="btn btn-outline btn-block" to="/cart" style={{ marginBottom: 10 }}><Icon name="cart" size={18} />{t('cart.title')}</Link>
                <Link className="btn btn-outline btn-block" to="/catalog"><Icon name="flower" size={18} />{t('nav.catalog')}</Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
