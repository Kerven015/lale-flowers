import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import { errorMessage } from '../api'
import FormField from '../components/FormField'
import { checkFields, clearError, focusFirstError, keysFromServer } from '../utils/formCheck'
import { useAuth } from '../store/hooks'

const LOGO = '/images/lale%20gulleri.jpg'

export default function Register() {
  const { t } = useI18n()
  const { register, user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null) // ApiError from the server
  const [fieldErrors, setFieldErrors] = useState({}) // field -> translation key

  useEffect(() => {
    if (user && !busy) navigate('/profile', { replace: true })
  }, [user, busy, navigate])

  async function onSubmit(e) {
    e.preventDefault()
    if (busy) return
    const f = e.target
    setError(null)
    const errs = checkFields(f, {
      first: { required: true }, last: { required: true }, email: { required: true, email: true },
      phone: { required: true, phone: true }, password: { required: true, min: 6 }, confirm: { required: true }, agree: { required: true },
    })
    if (!errs.confirm && !errs.password && f.password.value !== f.confirm.value) errs.confirm = 'auth.errMatch'
    setFieldErrors(errs)
    if (Object.keys(errs).length) { focusFirstError(f, errs); return }
    setBusy(true)
    const result = await register({
      first: f.first.value.trim(),
      last: f.last.value.trim(),
      email: f.email.value.trim(),
      phone: f.phone.value.trim(),
      password: f.password.value,
    })
    setBusy(false)
    if (!result.ok) {
      const fields = result.error.data?.fields
      if (fields) {
        const errs2 = keysFromServer(fields)
        setFieldErrors(errs2)
        focusFirstError(f, errs2)
      } else {
        setError(result.error)
      }
      return
    }
    toast(t('auth.okRegister'))
    navigate('/profile')
  }

  const field = (name, label, props = {}) => (
    <FormField id={`reg-${name}`} name={name} label={label} error={fieldErrors[name]} {...props} />
  )

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ width: 'min(100%, 560px)' }}>
        <img className="auth-logo" src={LOGO} alt="Lale Gülleri" />
        <h1>{t('auth.registerTitle')}</h1>
        <p className="auth-sub">{t('auth.registerSub')}</p>
        <form onSubmit={onSubmit} onInput={clearError(setFieldErrors)} onChange={clearError(setFieldErrors)} noValidate>
          <div className="form-grid">
            {field('first', t('auth.first'), { autoComplete: 'given-name', maxLength: 80 })}
            {field('last', t('auth.last'), { autoComplete: 'family-name', maxLength: 80 })}
            {field('email', t('auth.email'), { type: 'email', autoComplete: 'email', maxLength: 254 })}
            {field('phone', t('auth.phone'), { type: 'tel', autoComplete: 'tel', maxLength: 30, placeholder: '+993 6X XXXXXX' })}
            {field('password', t('auth.password'), { type: 'password', autoComplete: 'new-password', maxLength: 200 })}
            {field('confirm', t('auth.confirm'), { type: 'password', autoComplete: 'new-password', maxLength: 200 })}
          </div>
          <label className="check" style={{ margin: '18px 0 6px' }}>
            <input type="checkbox" name="agree" aria-invalid={fieldErrors.agree ? true : undefined} aria-describedby={fieldErrors.agree ? 'reg-agree-err' : undefined} />
            <span>{t('auth.agree')}</span>
          </label>
          {fieldErrors.agree && <small id="reg-agree-err" className="field-error" style={{ display: 'block', marginBottom: 12 }}>{t(fieldErrors.agree)}</small>}
          {error && <p className="form-error" role="alert">{errorMessage(t, error)}</p>}
          <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy} aria-busy={busy}>
            {busy ? t('form.sending') : t('auth.registerBtn')}
          </button>
        </form>
        <p className="auth-foot">
          {t('auth.haveAccount')} <Link to="/login">{t('auth.loginLink')}</Link>
        </p>
      </div>
    </div>
  )
}
