// Admin panel: orders, flowers, messages, customers, newsletter.
// Everything is saved on the server; the login is checked by the server.
import { useCallback, useEffect, useRef, useState } from 'react'
import PageHead from '../components/PageHead'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import Icon from '../components/Icons'
import { api, errorMessage } from '../api'
import { readJSON, writeJSON } from '../utils/storage'
import { TEXT } from './admin/texts'
import { playChime, unlockSound } from './admin/sound'
import AdminOrders from './admin/AdminOrders'
import AdminProducts from './admin/AdminProducts'
import { AdminCustomers, AdminMessages, AdminSubscribers } from './admin/AdminInbox'
import { AdminDiscounts, AdminSettings } from './admin/AdminShop'

const POLL_MS = 15_000
const TABS = [
  ['orders', 'tabOrders', 'orders'],
  ['products', 'tabProducts', 'flower'],
  ['messages', 'tabMessages', 'inbox'],
  ['customers', 'tabCustomers', 'users'],
  ['subscribers', 'tabSubscribers', 'mail'],
  ['discounts', 'tabDiscounts', 'percent'],
  ['settings', 'tabSettings', 'settings'],
]

function LoginForm({ L, onDone }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    if (busy) return
    unlockSound() // allows the new-order sound later
    const f = e.target
    setBusy(true)
    setError('')
    try {
      const data = await api('/api/admin/login', { method: 'POST', body: { username: f.username.value.trim(), password: f.password.value } })
      onDone(data.admin)
    } catch (err) {
      setError(err.code === 'invalid_credentials' ? L.badLogin : errorMessage(t, err))
      f.password.value = ''
      f.password.focus()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="with-ico"><Icon name="lock" size={24} />{L.login}</h1>
        <form onSubmit={onSubmit} noValidate>
          <div className="form-field">
            <label htmlFor="adm-user">{L.user}</label>
            <input id="adm-user" className="field" name="username" autoComplete="username" required autoFocus />
          </div>
          <div className="form-field">
            <label htmlFor="adm-pass">{L.pass}</label>
            <input id="adm-pass" className="field" name="password" type="password" autoComplete="current-password" required />
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? L.loginBusy : L.enter}</button>
        </form>
      </div>
    </div>
  )
}

export default function Admin() {
  const { lang, t } = useI18n()
  const L = TEXT[lang] || TEXT.ru
  const { toast } = useToast()
  const [auth, setAuth] = useState('checking') // checking | out | in
  const [admin, setAdmin] = useState(null)
  const [tab, setTab] = useState(() => {
    try { return sessionStorage.getItem('lale_admin_tab') || 'orders' } catch { return 'orders' }
  })
  const [summary, setSummary] = useState(null)
  const [ordersVersion, setOrdersVersion] = useState(0)
  const [sound, setSound] = useState(() => readJSON('lale_admin_sound', true) !== false)
  const lastOrder = useRef(null)
  const soundRef = useRef(sound)
  soundRef.current = sound

  // still logged in from before? (the cookie lasts until the browser closes)
  useEffect(() => {
    api('/api/admin/me')
      .then((d) => { setAdmin(d.admin); setAuth(d.admin ? 'in' : 'out') })
      .catch(() => setAuth('out'))
  }, [])

  // The server says the login has ended (12 hours, or logged out elsewhere).
  const authRef = useRef(auth)
  authRef.current = auth
  const sessionLost = useCallback(() => {
    if (authRef.current === 'in') toast(L.sessionExpired, 'error')
    setAuth('out')
  }, [toast, L])

  // api() for the admin tabs: an expired login sends you back to the login form
  const call = useCallback(async (path, opts) => {
    try {
      return await api(path, opts)
    } catch (err) {
      if (err.status === 401) sessionLost()
      throw err
    }
  }, [sessionLost])

  const loadSummary = useCallback(async () => {
    try {
      const s = await call('/api/admin/summary')
      setSummary(s)
      if (lastOrder.current !== null && s.lastOrderId > lastOrder.current) {
        // a new order came in
        if (soundRef.current) playChime()
        toast(L.ordNewToast)
        setOrdersVersion((v) => v + 1)
      }
      lastOrder.current = s.lastOrderId
    } catch {}
  }, [call, toast, L])

  useEffect(() => {
    if (auth !== 'in') return undefined
    lastOrder.current = null
    loadSummary()
    const id = setInterval(loadSummary, POLL_MS)
    return () => clearInterval(id)
  }, [auth, loadSummary])

  // "(2) Admin panel" in the browser tab while new orders wait
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, '')
    document.title = summary?.newOrders ? `(${summary.newOrders}) ${base}` : base
    return () => { document.title = document.title.replace(/^\(\d+\)\s*/, '') }
  }, [summary?.newOrders])

  function pickTab(key) {
    setTab(key)
    try { sessionStorage.setItem('lale_admin_tab', key) } catch {}
  }

  async function onLogout() {
    try { await api('/api/admin/logout', { method: 'POST' }) } catch {}
    setAuth('out')
    setSummary(null)
  }

  if (auth === 'checking') {
    return <section className="section"><div className="container"><p className="muted" role="status">{t('loading.wait')}</p></div></section>
  }
  if (auth === 'out') {
    return <LoginForm L={L} onDone={(a) => { setAdmin(a); setAuth('in') }} />
  }

  const badge = (key) => (key === 'orders' ? summary?.newOrders : key === 'messages' ? summary?.unreadMessages : 0)

  return (
    <>
      <PageHead title={L.title} sub={L.sub} crumbs={[{ label: L.title }]} />
      <section className="section adm-section">
        <div className="container">
          <div className="adm-top">
            <nav className="adm-tabs" role="tablist" aria-label={L.title}>
              {TABS.map(([key, label, icon]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  className={`adm-tab${tab === key ? ' active' : ''}`}
                  onClick={() => pickTab(key)}
                >
                  <Icon name={icon} size={17} />
                  <span>{L[label]}</span>
                  {badge(key) ? <span className="adm-count">{badge(key)}</span> : null}
                </button>
              ))}
            </nav>
            <div className="adm-top-actions">
              <button
                type="button"
                className="icon-btn adm-sound"
                aria-pressed={sound}
                aria-label={sound ? L.soundOn : L.soundOff}
                title={sound ? L.soundOn : L.soundOff}
                onClick={() => { unlockSound(); writeJSON('lale_admin_sound', !sound); setSound(!sound) }}
              >
                <Icon name={sound ? 'bell' : 'bellOff'} size={19} />
              </button>
              {admin?.username && <span className="muted adm-who">{admin.username}</span>}
              <button className="btn btn-outline btn-sm" type="button" onClick={onLogout}><Icon name="logout" size={16} />{L.logout}</button>
            </div>
          </div>

          <div role="tabpanel">
            {tab === 'orders' && <AdminOrders L={L} call={call} summary={summary} version={ordersVersion} onChanged={loadSummary} />}
            {tab === 'products' && <AdminProducts L={L} onSessionLost={sessionLost} />}
            {tab === 'messages' && <AdminMessages L={L} call={call} onChanged={loadSummary} />}
            {tab === 'customers' && <AdminCustomers L={L} call={call} />}
            {tab === 'subscribers' && <AdminSubscribers L={L} call={call} />}
            {tab === 'discounts' && <AdminDiscounts L={L} call={call} />}
            {tab === 'settings' && <AdminSettings L={L} call={call} />}
          </div>
        </div>
      </section>
    </>
  )
}
