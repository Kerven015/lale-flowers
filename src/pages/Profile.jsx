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

// Google's "G" (shown next to "Signed in with Google")
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

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
            <span className="muted">
              {orderDate(o.createdAt, lang)}
              {o.deliveryDate && ` · ${t('when.title')}: ${new Date(`${o.deliveryDate}T00:00:00Z`).toLocaleDateString(lang === 'tm' ? 'tk' : lang, { day: 'numeric', month: 'short', timeZone: 'UTC' })} ${o.deliverySlot}`}
            </span>
            <span className="cr-price">{formatPrice(o.total)}</span>
          </div>
        </Link>
      ))}
    </div>
  )
}

// Accounts made with Google have no password yet: "Set a password" then
// needs no current password.
function PasswordForm() {
  const { t } = useI18n()
  const { user, changePassword } = useAuth()
  const first = !user.hasPassword
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({}) // field -> translation key
  const [error, setError] = useState(null) // ApiError from the server

  async function onSubmit(e) {
    e.preventDefault()
    if (busy) return
    const f = e.target
    setError(null)
    const errs = checkFields(f, first ? { next: { required: true, min: 6 } } : { current: { required: true }, next: { required: true, min: 6 } })
    setErrors(errs)
    if (Object.keys(errs).length) { focusFirstError(f, errs); return }
    setBusy(true)
    const r = await changePassword(first ? '' : f.current.value, f.next.value)
    setBusy(false)
    if (!r.ok) {
      if (r.error.code === 'invalid_credentials') { setErrors({ current: 'auth.errCurrent' }); f.current.focus() }
      else if (r.error.data?.fields) setErrors(keysFromServer(r.error.data.fields))
      else setError(r.error)
      return
    }
    f.reset()
    toast(t(first ? 'profile.passSet' : 'profile.passChanged'))
  }

  const title = t(first ? 'profile.setPassword' : 'profile.password')
  return (
    <form key={first ? 'set' : 'change'} onSubmit={onSubmit} onInput={clearError(setErrors)} className="profile-pass" noValidate>
      <h4>{title}</h4>
      {first && <p className="muted profile-note">{t('profile.setPasswordHint')}</p>}
      {/* the email lets the browser save the new password for the right account */}
      <input type="email" name="username" autoComplete="username" value={user.email} readOnly hidden />
      {!first && <FormField id="pf-current" name="current" label={t('profile.currentPass')} error={errors.current} style={{ marginBottom: 12 }} type="password" autoComplete="current-password" maxLength={200} />}
      <FormField id="pf-next" name="next" label={t('profile.newPass')} error={errors.next} style={{ marginBottom: 12 }} type="password" autoComplete="new-password" maxLength={200} />
      {error && <p className="form-error" role="alert">{errorMessage(t, error)}</p>}
      <button className="btn btn-outline btn-block" type="submit" disabled={busy} aria-busy={busy}>{busy ? t('form.sending') : title}</button>
    </form>
  )
}

// New email: needs the password (Google-only accounts set one first).
function EmailForm() {
  const { t } = useI18n()
  const { user, changeEmail } = useAuth()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({}) // field -> translation key
  const [error, setError] = useState(null) // ApiError from the server

  if (!user.hasPassword) {
    return (
      <div className="profile-pass">
        <h4>{t('profile.changeEmail')}</h4>
        <p className="muted profile-note">{t('profile.needPassword')}</p>
      </div>
    )
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (busy) return
    const f = e.target
    setError(null)
    const errs = checkFields(f, { email: { required: true, email: true }, password: { required: true } })
    setErrors(errs)
    if (Object.keys(errs).length) { focusFirstError(f, errs); return }
    setBusy(true)
    const r = await changeEmail(f.email.value.trim(), f.password.value)
    setBusy(false)
    if (!r.ok) {
      if (r.error.code === 'invalid_credentials') { setErrors({ password: 'auth.errCurrent' }); f.password.focus() }
      else if (r.error.code === 'email_taken') { setErrors({ email: 'auth.errExists' }); f.email.focus() }
      else if (r.error.data?.fields) setErrors(keysFromServer(r.error.data.fields))
      else setError(r.error)
      return
    }
    f.reset()
    toast(t('profile.emailChanged'))
  }

  return (
    <form onSubmit={onSubmit} onInput={clearError(setErrors)} className="profile-pass" noValidate>
      <h4>{t('profile.changeEmail')}</h4>
      <FormField id="pf-new-email" name="email" label={t('profile.newEmail')} error={errors.email} style={{ marginBottom: 12 }} type="email" autoComplete="email" maxLength={254} />
      <FormField id="pf-email-pass" name="password" label={t('profile.currentPass')} error={errors.password} style={{ marginBottom: 12 }} type="password" autoComplete="current-password" maxLength={200} />
      {error && <p className="form-error" role="alert">{errorMessage(t, error)}</p>}
      <button className="btn btn-outline btn-block" type="submit" disabled={busy} aria-busy={busy}>{busy ? t('form.sending') : t('profile.changeEmail')}</button>
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
                  {user.google && <div className="google-badge"><GoogleMark />{t('profile.withGoogle')}</div>}
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
              <EmailForm />
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
