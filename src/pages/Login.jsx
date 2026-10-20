import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import { errorMessage } from '../api'
import FormField from '../components/FormField'
import { GoogleButton } from '../components/GoogleSignIn'
import { useFinishSignIn } from '../components/PendingCart'
import { checkFields, clearError, focusFirstError } from '../utils/formCheck'
import { useAuth } from '../store/hooks'
import { hasPendingAdd } from '../store/cartSlice'

const LOGO = '/images/lale%20gulleri.jpg'

export default function Login() {
  const { t } = useI18n()
  const { login, user } = useAuth()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null) // ApiError from the server
  const [errors, setErrors] = useState({}) // field -> translation key

  // came here from "Add to basket": the flower is added after signing in
  const [forBasket] = useState(hasPendingAdd)
  const finish = useFinishSignIn()

  // signed in (now or already) -> back to the flower, or to the profile
  useEffect(() => {
    if (user) finish()
  }, [user, finish])

  async function onSubmit(e) {
    e.preventDefault()
    if (busy) return
    const f = e.target
    setError(null)
    const errs = checkFields(f, { email: { required: true, email: true }, password: { required: true } })
    setErrors(errs)
    if (Object.keys(errs).length) { focusFirstError(f, errs); return }
    setBusy(true)
    const result = await login(f.email.value.trim(), f.password.value, f.remember.checked)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      f.password.value = ''
      f.password.focus()
      return
    }
    toast(t('auth.okLogin'))
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <img className="auth-logo" src={LOGO} alt="Lale Gülleri" />
        <h1>{t('auth.loginTitle')}</h1>
        <p className="auth-sub">{t('auth.loginSub')}</p>
        {forBasket && <p className="auth-notice" role="status">{t('cart.signInToAdd')}</p>}

        <form onSubmit={onSubmit} onInput={clearError(setErrors)} noValidate>
          <FormField id="login-email" label={t('auth.email')} error={errors.email} style={{ textAlign: 'left' }} name="email" type="email" autoComplete="email" maxLength={254} />
          <FormField id="login-pass" label={t('auth.password')} error={errors.password} style={{ textAlign: 'left' }} name="password" type="password" autoComplete="current-password" maxLength={200} />
          <label className="check" style={{ margin: '12px 0 18px' }}>
            <input type="checkbox" name="remember" />
            <span>{t('auth.remember')}</span>
          </label>
          {error && <p className="form-error" role="alert">{errorMessage(t, error)}</p>}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy} aria-busy={busy}>
            {busy ? t('form.sending') : t('auth.loginBtn')}
          </button>
        </form>
        <GoogleButton />

        <p className="auth-hint muted">{t('auth.forgotText')}</p>
        <p className="auth-foot">
          {t('auth.noAccount')} <Link to="/register">{t('auth.create')}</Link>
        </p>
      </div>
    </div>
  )
}
