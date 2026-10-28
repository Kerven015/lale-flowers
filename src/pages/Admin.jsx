// Admin panel: overview, orders, flowers, messages, customers, discounts, settings, log.
// Everything is saved on the server; the login is checked by the server.
import { useCallback, useEffect, useRef, useState } from 'react'
import PageHead from '../components/PageHead'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import Icon from '../components/Icons'
import { api, errorMessage } from '../api'
import { readJSON, writeJSON } from '../utils/storage'
import { fill } from '../utils/productHelpers'
import { TEXT } from './admin/texts'
import { playChime, unlockSound } from './admin/sound'
import AdminOrders from './admin/AdminOrders'
import AdminProducts from './admin/AdminProducts'
import { AdminCustomers, AdminMessages } from './admin/AdminInbox'
import { AdminDiscounts, AdminSettings } from './admin/AdminShop'
import AdminDashboard from './admin/AdminDashboard'
import AdminLog from './admin/AdminLog'

const POLL_MS = 15_000
const TABS = [
  ['dashboard', 'tabDashboard', 'grid'],
  ['orders', 'tabOrders', 'orders'],
  ['products', 'tabProducts', 'flower'],
  ['messages', 'tabMessages', 'inbox'],
  ['customers', 'tabCustomers', 'users'],
  ['discounts', 'tabDiscounts', 'percent'],
  ['settings', 'tabSettings', 'settings'],
  ['log', 'tabLog', 'list'],
]

export function LoginForm({ L, onDone }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // two-step login: the password was right, now the code from the phone
  const [ticket, setTicket] = useState(null)

  async function onSubmit(e) {
    e.preventDefault()
    if (busy) return
    unlockSound() // allows the new-order sound later
    const f = e.target.elements
    setBusy(true)
    setError('')
    try {
      const data = await api('/api/admin/login', { method: 'POST', body: { username: f.username.value.trim(), password: f.password.value } })
      if (data.twoStep) setTicket(data.ticket)
      else onDone(data.admin)
    } catch (err) {
      setError(err.code === 'invalid_credentials' ? L.badLogin : errorMessage(t, err))
      f.password.value = ''
      f.password.focus()
    } finally {
      setBusy(false)
    }
  }

  async function onCode(e) {
    e.preventDefault()
    if (busy) return
    const f = e.target.elements
    setBusy(true)
    setError('')
    try {
      const data = await api('/api/admin/login/code', { method: 'POST', body: { ticket, code: f.code.value } })
      if (data.backupCodesLeft !== undefined && data.backupCodesLeft <= 2) toast(fill(L.tsLowCodes, { n: data.backupCodesLeft }), 'error')
      onDone(data.admin)
    } catch (err) {
      if (err.code === 'login_expired') { setTicket(null); setError(L.codeExpired); return }
      setError(err.code === 'invalid_code' ? L.codeWrong : errorMessage(t, err))
      f.code.value = ''
      f.code.focus()
    } finally {
      setBusy(false)
    }
  }

  if (ticket) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <h1 className="with-ico"><Icon name="lock" size={24} />{L.codeTitle}</h1>
          <p className="auth-sub">{L.codeHint}</p>
          <form onSubmit={onCode} noValidate>
            <div className="form-field">
              <label htmlFor="adm-code">{L.tsCodeOrBackup}</label>
              <input id="adm-code" className="field adm-code-input" name="code" inputMode="text" autoComplete="one-time-code" maxLength={20} required autoFocus />
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? L.loginBusy : L.codeBtn}</button>
            <button className="btn btn-outline btn-block" type="button" style={{ marginTop: 10 }} onClick={() => { setTicket(null); setError('') }}>{L.codeBack}</button>
          </form>
        </div>
      </div>
    )
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

// Ends the admin login on the server, also while the page is closing
// (keepalive lets the request finish after the tab is gone).
function endAdminLogin() {
  try {
    fetch('/api/admin/logout', { method: 'POST', headers: { 'X-Lale': '1' }, credentials: 'same-origin', keepalive: true }).catch(() => {})
  } catch {}
}

export default function Admin() {
  const { lang, t } = useI18n()
  const L = TEXT[lang] || TEXT.ru
  const { toast } = useToast()
  const [auth, setAuth] = useState('checking') // checking | out | in
  const [admin, setAdmin] = useState(null)
  const [tab, setTab] = useState(() => {
    try { return sessionStorage.getItem('lale_admin_tab') || 'dashboard' } catch { return 'dashboard' }
  })
  const [summary, setSummary] = useState(null)
  const [ordersVersion, setOrdersVersion] = useState(0)
  const [sound, setSound] = useState(() => readJSON('lale_admin_sound', true) !== false)
  const lastOrder = useRef(null)
  const soundRef = useRef(sound)
  soundRef.current = sound

  // Every visit asks for the login again: opening the panel (a new tab, the
  // address typed in, a reload) first ends any earlier admin login, and
  // leaving the panel or closing the tab ends it on the server straight away.
  useEffect(() => {
    let alive = true
    api('/api/admin/logout', { method: 'POST' }).catch(() => {}).finally(() => { if (alive) setAuth('out') })
    window.addEventListener('pagehide', endAdminLogin)
    return () => {
      alive = false
      window.removeEventListener('pagehide', endAdminLogin)
      endAdminLogin()
    }
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

  const badge = (key) => (key === 'orders' ? summary?.newOrders : key === 'messages' ? summary?.unreadMessages : key === 'products' ? summary?.lowStock : 0)

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
            {tab === 'dashboard' && <AdminDashboard L={L} call={call} onOpenTab={pickTab} />}
            {tab === 'orders' && <AdminOrders L={L} call={call} summary={summary} version={ordersVersion} onChanged={loadSummary} />}
            {tab === 'products' && <AdminProducts L={L} onSessionLost={sessionLost} />}
            {tab === 'messages' && <AdminMessages L={L} call={call} onChanged={loadSummary} />}
            {tab === 'customers' && <AdminCustomers L={L} call={call} />}
            {tab === 'discounts' && <AdminDiscounts L={L} call={call} />}
            {tab === 'settings' && <AdminSettings L={L} call={call} />}
            {tab === 'log' && <AdminLog L={L} call={call} />}
          </div>
        </div>
      </section>
    </>
  )
}
